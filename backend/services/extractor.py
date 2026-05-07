# """
# services/extractor.py — Layer 2 Document Processing Engine

# Pipeline for each uploaded document:
#   1. Locate the file in the evidence vault
#   2. Convert PDF pages → images (pdf2image)
#   3. Run docTR OCR → extract text + bounding boxes per word
#   4. Send structured text to local Ollama (phi3) with a strict JSON prompt
#   5. Parse the LLM response and write one ExtractedCriteria row per finding
#   6. Update Document.classification_status to 'confirmed' if pending

#  BUG FIXES vs the plan document:
#   ① Session lifetime:  We do NOT accept a Session from the request.
#      Background tasks run AFTER the request session closes.
#      We create a fresh session from SessionLocal() inside this function.
#   ② docTR warmup:  The model is loaded once at module import time.
#      First call after restart may be slow (20–60s CPU). Subsequent calls
#      are fast because the model stays in memory.
#   ③ Ollama API:  Using the correct attribute access for ollama>=0.4.0:
#      response.message.content  (NOT response['message']['content'])
# """

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Vault root (same env var used by vault.py) ──────────────────────────────
VAULT_ROOT   = Path(os.getenv("VAULT_PATH", "/evidence_vault"))
OLLAMA_HOST  = os.getenv("OLLAMA_HOST", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3")

# ── Load docTR model ONCE at module import time ──────────────────────────────
# This runs when FastAPI starts, not on the first upload.
# On CPU this takes ~20 seconds. On GPU it takes ~2 seconds.
# It prevents a timeout on the very first document uploaded after restart.
logger.info("Loading docTR OCR model (this takes ~20s on CPU)...")
try:
    from doctr.io import DocumentFile
    from doctr.models import ocr_predictor
    # db_mobilenet_v3_large = fast detector, good on low-DPI Indian scans
    # crnn_vgg16_bn         = accurate text recogniser
    _OCR_MODEL = ocr_predictor(
        det_arch="db_mobilenet_v3_large",
        reco_arch="crnn_vgg16_bn",
        pretrained=True,
    )
    logger.info("docTR model loaded successfully.")
    _DOCTR_AVAILABLE = True
except Exception as e:
    logger.warning(f"docTR failed to load: {e}. OCR extraction will be skipped.")
    _DOCTR_AVAILABLE = False
    _OCR_MODEL = None


# ── Ollama client (lazy import — only fails if package missing) ─────────────
try:
    import ollama as _ollama_lib
    _OLLAMA_AVAILABLE = True
except ImportError:
    logger.warning("ollama package not installed. LLM extraction will be skipped.")
    _OLLAMA_AVAILABLE = False
    _ollama_lib = None


# ── Criteria we try to extract from every document ──────────────────────────
# Each entry tells the LLM what to look for and what JSON key to return.
# Extend this list as you add more criteria.
CRITERIA_PROMPTS = [
    {
        "criterion_id": "C-01",
        "description":  "Annual turnover in INR for any financial year",
        "json_key":     "annual_turnover",
        "example":      "7,25,00,000",
    },
    {
        "criterion_id": "C-03",
        "description":  "GSTIN number (15-character alphanumeric)",
        "json_key":     "gstin",
        "example":      "22AABCA1234N1Z5",
    },
    {
        "criterion_id": "C-08",
        "description":  "EMD amount or Earnest Money Deposit amount in INR",
        "json_key":     "emd_amount",
        "example":      "10,00,000",
    },
    {
        "criterion_id": "C-09",
        "description":  "PF (Provident Fund) establishment code or EPFO code",
        "json_key":     "pf_code",
        "example":      "MH/BOM/123456",
    },
]


def _run_ocr(vault_file_path: Path) -> tuple[str, list[dict]]:
    """
    Runs docTR OCR on a PDF file.

    Returns:
        full_text:  All words joined as a single string (for LLM context).
        word_boxes: List of {"word": str, "page": int, "x0": float, "y0": float,
                             "x1": float, "y1": float} for each detected word.

    Coordinates are normalised 0.0–1.0 (docTR convention).
    Multiply by image dimensions to get pixel coordinates.
    """
    if not _DOCTR_AVAILABLE:
        return "", []

    suffix = vault_file_path.suffix.lower()
    if suffix == ".pdf":
        doc = DocumentFile.from_pdf(str(vault_file_path))
    elif suffix in {".jpg", ".jpeg", ".png", ".tiff", ".tif"}:
        doc = DocumentFile.from_images([str(vault_file_path)])
    else:
        logger.warning(f"Unsupported file type for OCR: {suffix}")
        return "", []

    result = _OCR_MODEL(doc)

    full_text = ""
    word_boxes = []

    for page_idx, page in enumerate(result.pages):
        for block in page.blocks:
            for line in block.lines:
                for word in line.words:
                    full_text += word.value + " "
                    # geometry is ((x0, y0), (x1, y1)) in 0-1 normalised coords
                    (x0, y0), (x1, y1) = word.geometry
                    word_boxes.append({
                        "word": word.value,
                        "page": page_idx + 1,          # 1-indexed for humans
                        "x0":   round(x0, 4),
                        "y0":   round(y0, 4),
                        "x1":   round(x1, 4),
                        "y1":   round(y1, 4),
                    })

    return full_text.strip(), word_boxes


def _find_word_bbox(word_boxes: list[dict], value: str) -> dict | None:
    """
    Finds the bounding box of the first word in word_boxes whose text
    closely matches `value` (case-insensitive, strips commas/spaces).

    Returns a bbox dict or None if not found.
    This is a simple heuristic — good enough for the prototype demo.
    In production, use a sliding-window approach over multi-word values.
    """
    clean_value = value.replace(",", "").replace(" ", "").lower()
    for wb in word_boxes:
        clean_word = wb["word"].replace(",", "").replace(" ", "").lower()
        if clean_word and clean_word in clean_value:
            return {
                "page": wb["page"],
                "x0":   wb["x0"],
                "y0":   wb["y0"],
                "x1":   wb["x1"],
                "y1":   wb["y1"],
            }
    return None


def _extract_via_llm(full_text: str, criterion: dict) -> tuple[str | None, float]:
    """
    Sends the OCR text to the local Ollama phi3 model with a strict JSON prompt.

    Returns:
        (extracted_value, confidence_score)
        extracted_value is None if the LLM could not find the criterion.

    BUG FIX ③: Uses response.message.content (ollama>=0.4.0 object API),
    NOT response['message']['content'] (old dict API from 0.1.x).
    """
    if not _OLLAMA_AVAILABLE:
        return None, 0.0

    system_prompt = f"""You are a CRPF government procurement AI assistant.
Extract ONLY the following field from the provided document text:
  Field: {criterion['description']}
  
Return ONLY a valid JSON object with exactly two keys, nothing else:
  {{"value": "<extracted value or null if not found>", "confidence": <float 0.0 to 1.0>}}
  
Example output: {{"value": "{criterion['example']}", "confidence": 0.95}}
If the field is not present in the text, return: {{"value": null, "confidence": 0.0}}
Do NOT include markdown, explanation, or any text outside the JSON object."""

    # Truncate text to prevent context window overflow on phi3
    # phi3 has a ~4096 token context. 3000 chars ≈ 750 tokens, safe margin.
    truncated_text = full_text[:3000] if len(full_text) > 3000 else full_text

    try:
        client = _ollama_lib.Client(host=OLLAMA_HOST)
        response = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": truncated_text},
            ],
            options={"temperature": 0.0},  # deterministic output for audit
        )

        # ── BUG FIX ③: correct attribute access for ollama>=0.4.0 ──────
        raw_content = response.message.content.strip()

        # Strip markdown fences if model adds them despite instructions
        if raw_content.startswith("```"):
            raw_content = raw_content.split("```")[1]
            if raw_content.startswith("json"):
                raw_content = raw_content[4:]
            raw_content = raw_content.strip()

        parsed = json.loads(raw_content)
        value      = parsed.get("value")
        confidence = float(parsed.get("confidence", 0.0))

        if value is None or str(value).strip().lower() in {"null", "none", ""}:
            return None, 0.0

        return str(value).strip(), confidence

    except json.JSONDecodeError as e:
        logger.warning(f"LLM returned non-JSON for {criterion['criterion_id']}: {e}")
        return None, 0.0
    except Exception as e:
        logger.error(f"Ollama call failed for {criterion['criterion_id']}: {e}")
        return None, 0.0


def process_document_ai(session_factory, vault_path: str, document_hash: str) -> None:
    """
    Background task — Layer 2 extraction pipeline.

    Called by ingest.py AFTER the document is safely vaulted and committed.

    Args:
        session_factory:  The SessionLocal factory from get_db_for_background().
                          NOT a Session object — we create our own session here.
                          This is BUG FIX ①.
        vault_path:       Relative path inside vault, e.g. "TENDER_034/abc123.pdf"
        document_hash:    SHA-256 hex of the document.

    The function creates its own DB session, does all work, commits, and
    closes the session before returning — independent of the HTTP request lifecycle.
    """
    # ── BUG FIX ①: create a fresh session owned entirely by this task ────
    db = session_factory()

    try:
        logger.info(f"[Layer 2] Starting extraction for {document_hash[:16]}...")

        # ── Locate file in vault ─────────────────────────────────────────
        full_path = VAULT_ROOT / vault_path
        if not full_path.exists():
            logger.error(f"[Layer 2] Vault file not found: {full_path}")
            return

        # ── OCR pass ─────────────────────────────────────────────────────
        logger.info(f"[Layer 2] Running docTR OCR on {full_path.name}...")
        full_text, word_boxes = _run_ocr(full_path)

        if not full_text:
            logger.warning(f"[Layer 2] OCR produced no text for {document_hash[:16]}. "
                           "File may be image-only or unsupported format.")
            # Still continue — LLM will return null for all criteria
            # which is the correct honest result for an unreadable document.

        logger.info(f"[Layer 2] OCR complete. {len(word_boxes)} words extracted.")

        # ── LLM extraction pass — one call per criterion ──────────────────
        extracted_count = 0
        for criterion in CRITERIA_PROMPTS:
            logger.info(f"[Layer 2] Extracting {criterion['criterion_id']}...")

            value, confidence = _extract_via_llm(full_text, criterion)

            if value is None:
                logger.info(f"[Layer 2] {criterion['criterion_id']}: not found in document.")
                continue

            # Find the bounding box for this value in the word list
            bbox = _find_word_bbox(word_boxes, value)
            bbox_json = json.dumps(bbox) if bbox else None

            # Build context snippet — 200 chars around the value for audit
            idx = full_text.lower().find(value.replace(",", "").lower()[:8])
            if idx >= 0:
                start = max(0, idx - 100)
                end   = min(len(full_text), idx + 100)
                snippet = full_text[start:end].strip()
            else:
                snippet = full_text[:200]

            # Write to DB
            from models.db import ExtractedCriteria
            record = ExtractedCriteria(
                document_hash    = document_hash,
                criterion_id     = criterion["criterion_id"],
                extracted_value  = value,
                bbox_coordinates = bbox_json,
                confidence_score = confidence,
                context_snippet  = snippet,
                extraction_method= "llm",
                ai_model_version = f"doctr-0.7+{OLLAMA_MODEL}",
                page_number      = bbox["page"] if bbox else None,
            )
            db.add(record)
            extracted_count += 1
            logger.info(
                f"[Layer 2] {criterion['criterion_id']} extracted: "
                f"'{value}' (conf={confidence:.2f})"
            )

        # ── Update document classification status ─────────────────────────
        # If Layer 1 left this as pending_content_review, Layer 2 now
        # confirms it based on OCR content.
        from models.db import Document
        doc = db.query(Document).filter(
            Document.document_hash == document_hash
        ).first()

        if doc and doc.classification_status == "pending_content_review":
            doc.classification_status = "confirmed"
            logger.info(f"[Layer 2] Classification confirmed for {document_hash[:16]}")

        db.commit()
        logger.info(
            f"[Layer 2] Extraction complete for {document_hash[:16]}. "
            f"{extracted_count} criteria extracted."
        )

    except Exception as e:
        logger.error(f"[Layer 2] Extraction failed for {document_hash[:16]}: {e}", exc_info=True)
        db.rollback()
    finally:
        # Always close — this session belongs to us alone
        db.close()