"""
services/classifier.py

Responsibility: Classify a document as tender / bid / corrigendum / unknown.
Implements the three-tier strategy agreed in the engineering rationale:

  Tier 1 — Regex fast check on filename + portal metadata
            (catches obvious CPPP/GeM portal naming conventions)
  Tier 2 — Heuristic fallback for generic filenames
            (looks for keyword signals in the metadata payload)
  Tier 3 — PENDING_CONTENT_REVIEW
            (filename is useless; Layer 2 OCR will finalise classification)

Design decisions:
- Filenames are UNTRUSTED bidder input. We never classify solely on filename.
- A file named 'CA_Cert.pdf' is NOT confirmed as a CA certificate here.
- Classification status is either 'confirmed' or 'pending_content_review'.
- 'pending_content_review' documents are vaulted normally — they are NOT rejected.
  Layer 2 will lock in the final classification when OCR runs.
- Paranoia over speed: uncertain = pending, never a guess passed as confirmed.
"""

import re
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Tier 1: Portal metadata regex patterns
# These match naming conventions from CPPP, GeM,
# and NIC e-procurement portals.
# ─────────────────────────────────────────────

TENDER_PATTERNS = [
    r"TENDER[_\-\s]?\d+",           # TENDER_2026001, TENDER-2026001
    r"NIT[_\-\s]?\d+",              # NIT_001, NIT-2026
    r"RFP[_\-\s]?\d+",              # RFP_2026
    r"EOI[_\-\s]?\d+",              # EOI_001
    r"NOTICE[_\-\s]?INVITING",      # NOTICE_INVITING_TENDER
    r"ENQUIRY[_\-\s]?\d+",          # ENQUIRY_2026
]

CORRIGENDUM_PATTERNS = [
    r"CORRIGENDUM",                  # CORRIGENDUM_2
    r"ADDENDUM",                     # ADDENDUM_1
    r"AMENDMENT",                    # AMENDMENT_3
    r"ERRATUM",
]

BID_PATTERNS = [
    r"BID[_\-\s]?\d+",              # BID_987654
    r"PROPOSAL[_\-\s]?\d+",         # PROPOSAL_001
    r"QUOTATION[_\-\s]?\d+",        # QUOTATION_2026
    r"OFFER[_\-\s]?\d+",            # OFFER_101
    r"SUBMISSION[_\-\s]?\d+",       # SUBMISSION_001
]

# ─────────────────────────────────────────────
# Tier 2: Keyword heuristics
# Soft signals — increase confidence but do NOT confirm alone.
# ─────────────────────────────────────────────

TENDER_KEYWORDS = [
    "tender", "nit", "rfp", "eoi", "notice inviting",
    "eligibility criteria", "scope of work", "bid document",
]

CORRIGENDUM_KEYWORDS = [
    "corrigendum", "addendum", "amendment", "erratum", "modification",
]

BID_KEYWORDS = [
    "balance sheet", "turnover", "chartered accountant", "ca certificate",
    "audited", "gst registration", "pan card", "epfo", "esic",
    "power of attorney", "affidavit", "experience certificate",
    "completion certificate", "work order", "iso certificate",
    "bank solvency", "bid bond", "earnest money",
]

# Generic filenames that are meaningless for classification
GENERIC_FILENAME_PATTERNS = [
    r"^doc\d*\.",
    r"^scan[_\-]?\d*\.",
    r"^image[_\-]?\d*\.",
    r"^whatsapp[_\-]?image",
    r"^file[_\-]?\d*\.",
    r"^upload[_\-]?\d*\.",
    r"^\d+\.",                       # purely numeric filename like 001.pdf
    r"^untitled",
    r"^new[_\-]?document",
    r"^copy[_\-]?of",
]


@dataclass
class ClassificationResult:
    doc_type:             str            # 'tender' | 'bid' | 'corrigendum' | 'unknown'
    classification_status: str           # 'confirmed' | 'pending_content_review'
    bidder_id:            Optional[str]  # extracted from metadata if available
    tender_id:            Optional[str]  # extracted from metadata if available
    confidence_tier:      int            # 1 = regex, 2 = heuristic, 3 = pending
    reason:               str            # human-readable explanation for audit


def _match_patterns(text: str, patterns: list[str]) -> bool:
    """Case-insensitive regex match against a list of patterns."""
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def _is_generic_filename(filename: str) -> bool:
    """Returns True if the filename carries no meaningful classification signal."""
    basename = filename.rsplit(".", 1)[0]   # strip extension
    return _match_patterns(basename, GENERIC_FILENAME_PATTERNS)


def _keyword_doc_type(text: str) -> Optional[str]:
    """
    Tier 2: looks for keyword signals in combined filename + metadata text.
    Returns doc_type string or None if no clear signal.
    """
    text_lower = text.lower()

    # Count keyword hits per category
    tender_hits      = sum(1 for kw in TENDER_KEYWORDS if kw in text_lower)
    corrigendum_hits = sum(1 for kw in CORRIGENDUM_KEYWORDS if kw in text_lower)
    bid_hits         = sum(1 for kw in BID_KEYWORDS if kw in text_lower)

    scores = {
        "tender":      tender_hits,
        "corrigendum": corrigendum_hits,
        "bid":         bid_hits,
    }

    best_type  = max(scores, key=scores.get)
    best_score = scores[best_type]

    # Require at least 2 keyword hits to make a heuristic call
    if best_score >= 2:
        return best_type

    return None


def classify(
    filename: str,
    metadata: Optional[dict] = None,
) -> ClassificationResult:
    """
    Three-tier document classifier.

    Args:
        filename: Original filename from the upload. UNTRUSTED.
        metadata: Optional dict from the frontend payload.
                  May include: tender_id, bidder_id, doc_type_hint,
                  portal_name, submission_timestamp.

    Returns:
        ClassificationResult with doc_type, status, and IDs.
    """
    metadata = metadata or {}

    # Extract any portal-provided hints (these are trusted if present,
    # because they come from the e-procurement portal wrapper, not the bidder)
    portal_tender_id = metadata.get("tender_id")
    portal_bidder_id = metadata.get("bidder_id")
    portal_doc_hint  = metadata.get("doc_type_hint", "").lower()

    # ── TIER 1: Regex on filename + portal hint ──────────────────────────
    search_text = f"{filename} {portal_doc_hint}".strip()

    if _match_patterns(search_text, CORRIGENDUM_PATTERNS):
        return ClassificationResult(
            doc_type="corrigendum",
            classification_status="confirmed",
            bidder_id=portal_bidder_id,
            tender_id=portal_tender_id,
            confidence_tier=1,
            reason=f"Tier 1 regex matched corrigendum pattern in '{filename}'"
        )

    if _match_patterns(search_text, TENDER_PATTERNS):
        return ClassificationResult(
            doc_type="tender",
            classification_status="confirmed",
            bidder_id=None,              # tenders don't have a bidder
            tender_id=portal_tender_id,
            confidence_tier=1,
            reason=f"Tier 1 regex matched tender pattern in '{filename}'"
        )

    if _match_patterns(search_text, BID_PATTERNS):
        return ClassificationResult(
            doc_type="bid",
            classification_status="confirmed",
            bidder_id=portal_bidder_id,
            tender_id=portal_tender_id,
            confidence_tier=1,
            reason=f"Tier 1 regex matched bid pattern in '{filename}'"
        )

    # ── TIER 2: Heuristic keyword check ──────────────────────────────────
    # Only run if filename is NOT generic (generic filenames have no signal)
    if not _is_generic_filename(filename):
        heuristic_type = _keyword_doc_type(search_text)
        if heuristic_type:
            logger.info(
                f"[CLASSIFIER] Tier 2 heuristic: '{filename}' → {heuristic_type} "
                f"(pending_content_review)"
            )
            return ClassificationResult(
                doc_type=heuristic_type,
                classification_status="pending_content_review",   # NOT confirmed
                bidder_id=portal_bidder_id,
                tender_id=portal_tender_id,
                confidence_tier=2,
                reason=(
                    f"Tier 2 keyword heuristic suggested '{heuristic_type}' "
                    f"from filename '{filename}'. Awaiting Layer 2 OCR confirmation."
                )
            )

    # ── TIER 3: Pending — hand off to Layer 2 ────────────────────────────
    logger.info(
        f"[CLASSIFIER] Tier 3: '{filename}' is unclassifiable at ingestion. "
        f"Flagged PENDING_CONTENT_REVIEW for Layer 2 OCR."
    )
    return ClassificationResult(
        doc_type="unknown",
        classification_status="pending_content_review",
        bidder_id=portal_bidder_id,
        tender_id=portal_tender_id,
        confidence_tier=3,
        reason=(
            f"Tier 3: filename '{filename}' carries no classification signal. "
            f"Document vaulted safely. Layer 2 OCR will lock in classification."
        )
    )