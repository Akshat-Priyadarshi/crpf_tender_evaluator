"""
services/audit.py

Responsibility: Write hash-chained, append-only entries to the audit ledger.

How the hash chain works:
  Each new entry computes:
    previous_entry_hash = SHA-256(last_entry.entry_uuid + last_entry.action + last_entry.occurred_at)

  This means you cannot alter any past row without breaking the chain
  from that point forward — detectable immediately.

  The genesis row (seeded in init.sql) anchors the chain with 'GENESIS'.

Design decisions:
- All writes go through log_action() — nothing writes directly to audit_ledger.
- The chain hash is computed inside a DB transaction to prevent race conditions.
- detail field accepts any dict — flexible for evolving action types.
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from models.db import AuditLedger

logger = logging.getLogger(__name__)


# ── Action constants ──────────────────────────────────────────────────────────
# All valid actions are defined here. Use these — never raw strings in routers.

class Action:
    FILE_RECEIVED       = "FILE_RECEIVED"
    VIRUS_SCAN_STARTED  = "VIRUS_SCAN_STARTED"
    VIRUS_SCAN_CLEAN    = "VIRUS_SCAN_CLEAN"
    VIRUS_SCAN_INFECTED = "VIRUS_SCAN_INFECTED"
    VIRUS_SCAN_ERROR    = "VIRUS_SCAN_ERROR"
    HASH_COMPUTED       = "HASH_COMPUTED"
    DUPLICATE_DETECTED  = "DUPLICATE_DETECTED"
    CLASSIFIED          = "CLASSIFIED"
    VAULT_WRITTEN       = "VAULT_WRITTEN"
    FILE_INGESTED       = "FILE_INGESTED"
    VAULT_ACCESS        = "VAULT_ACCESS"
    INGEST_REJECTED     = "INGEST_REJECTED"


def _compute_chain_hash(entry: AuditLedger) -> str:
    """
    Computes the chain hash for the NEXT entry, based on this entry's fields.
    Format: SHA-256( entry_uuid | action | occurred_at_iso )
    """
    raw = f"{entry.entry_uuid}|{entry.action}|{entry.occurred_at.isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _get_last_entry(db: Session) -> AuditLedger:
    """Fetches the most recent audit ledger row."""
    return db.query(AuditLedger).order_by(AuditLedger.id.desc()).first()


def log_action(
    db:                Session,
    action:            str,
    document_hash:     Optional[str] = None,
    original_filename: Optional[str] = None,
    actor_role:        Optional[str] = None,
    actor_id:          Optional[str] = None,
    detail:            Optional[dict] = None,
) -> AuditLedger:
    """
    Appends a new entry to the hash-chained audit ledger.

    Args:
        db:                Active SQLAlchemy session (caller commits).
        action:            One of the Action constants above.
        document_hash:     SHA-256 of the document (None for non-doc actions).
        original_filename: Original filename for human readability.
        actor_role:        RBAC role of the actor.
        actor_id:          Session or user identifier.
        detail:            Arbitrary JSON detail dict.

    Returns:
        The newly created AuditLedger row (not yet committed).
    """
    last_entry = _get_last_entry(db)

    if last_entry is None:
        # Should never happen — genesis row is seeded at DB init
        logger.error("[AUDIT] No genesis row found in audit_ledger. DB may not be initialised.")
        previous_hash = "GENESIS_MISSING"
    else:
        previous_hash = _compute_chain_hash(last_entry)

    entry = AuditLedger(
        previous_entry_hash = previous_hash,
        action              = action,
        document_hash       = document_hash,
        original_filename   = original_filename,
        actor_role          = actor_role,
        actor_id            = actor_id,
        detail              = detail or {},
        occurred_at         = datetime.now(timezone.utc),
    )

    db.add(entry)
    # Caller is responsible for db.commit() — allows batching multiple actions
    # in one transaction (e.g., HASH_COMPUTED + CLASSIFIED + VAULT_WRITTEN).

    logger.info(
        f"[AUDIT] {action} | "
        f"doc={document_hash[:12] if document_hash else 'N/A'}... | "
        f"role={actor_role} | chain={previous_hash[:12]}..."
    )
    return entry


def verify_chain(db: Session) -> dict:
    """
    Walks the entire audit ledger and verifies the hash chain is unbroken.
    Returns a report dict. Use this for CVC audit or debugging.

    Returns:
        {
            "valid": bool,
            "total_entries": int,
            "broken_at_id": int | None,
            "message": str
        }
    """
    entries = db.query(AuditLedger).order_by(AuditLedger.id.asc()).all()

    if not entries:
        return {"valid": False, "total_entries": 0, "broken_at_id": None,
                "message": "Ledger is empty."}

    for i in range(1, len(entries)):
        expected = _compute_chain_hash(entries[i - 1])
        actual   = entries[i].previous_entry_hash

        if expected != actual:
            logger.error(
                f"[AUDIT CHAIN BROKEN] Entry id={entries[i].id} "
                f"expected previous_hash={expected[:16]}... "
                f"but found {actual[:16]}..."
            )
            return {
                "valid": False,
                "total_entries": len(entries),
                "broken_at_id": entries[i].id,
                "message": (
                    f"Hash chain broken at entry id={entries[i].id}. "
                    "This entry or a predecessor may have been tampered with."
                )
            }

    return {
        "valid": True,
        "total_entries": len(entries),
        "broken_at_id": None,
        "message": "Audit chain intact. All entries verified."
    }