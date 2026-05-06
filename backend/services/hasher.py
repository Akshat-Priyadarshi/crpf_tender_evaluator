"""
services/hasher.py

Responsibility: Compute SHA-256 of file bytes and check for duplicates.

Design decisions:
- Hash is computed from raw bytes in memory — filename is irrelevant.
- Dedup check queries the documents table before any disk write.
- Returns a typed result so the router can distinguish new vs duplicate cleanly.
"""

import hashlib
import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session
from models.db import Document

logger = logging.getLogger(__name__)


@dataclass
class HashResult:
    document_hash: str
    is_duplicate:  bool
    existing_doc:  Document | None = None   # populated if duplicate


def compute_sha256(file_bytes: bytes) -> str:
    """
    Computes the SHA-256 hex digest of raw file bytes.
    This hash is the document's identity for all downstream layers.
    """
    return hashlib.sha256(file_bytes).hexdigest()


def check_and_hash(file_bytes: bytes, db: Session) -> HashResult:
    """
    Computes SHA-256 of file_bytes and checks if this document
    already exists in the database.

    Args:
        file_bytes: Raw file content in memory.
        db:         Active SQLAlchemy session.

    Returns:
        HashResult with the hash and whether it is a duplicate.
    """
    document_hash = compute_sha256(file_bytes)
    logger.info(f"[HASH] SHA-256 computed: {document_hash[:16]}...")

    existing = db.query(Document).filter(
        Document.document_hash == document_hash
    ).first()

    if existing:
        logger.info(
            f"[HASH] Duplicate detected — hash {document_hash[:16]}... "
            f"already ingested as '{existing.original_filename}'"
        )
        return HashResult(
            document_hash=document_hash,
            is_duplicate=True,
            existing_doc=existing
        )

    logger.info(f"[HASH] New document — hash {document_hash[:16]}... proceeding.")
    return HashResult(
        document_hash=document_hash,
        is_duplicate=False
    )