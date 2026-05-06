"""
services/vault.py

Responsibility: Write the file to the evidence vault and enforce RBAC.

Vault structure on disk:
  /evidence_vault/
    {tender_id}/
      {document_hash}.{ext}

  If tender_id is unknown at ingestion time, files go to:
    /evidence_vault/_unclassified/
      {document_hash}.{ext}

Design decisions:
- Files are NEVER written before the virus scan passes.
- The hash is the filename — original filename is in the DB, not on disk.
  This prevents path traversal attacks and filename spoofing.
- RBAC is enforced: a role must have vault_access for this tender_id
  (or wildcard '*') to write. Admin always has access.
- Every vault read is also logged in the audit ledger (see audit.py).
"""

import os
import logging
from pathlib import Path
from sqlalchemy.orm import Session
from models.db import VaultAccess

logger = logging.getLogger(__name__)

VAULT_ROOT = Path(os.getenv("VAULT_PATH", "/evidence_vault"))


def _check_rbac(tender_id: str, actor_role: str, db: Session) -> bool:
    """
    Returns True if actor_role is allowed to write to this tender's vault.
    Admin role always passes (wildcard '*' row seeded at init).
    """
    access = db.query(VaultAccess).filter(
        VaultAccess.role == actor_role,
        VaultAccess.tender_id.in_([tender_id, "*"])
    ).first()

    return access is not None


def _get_extension(filename: str, mime_type: str = "") -> str:
    """Extracts file extension from filename, falling back to mime_type."""
    if "." in filename:
        return filename.rsplit(".", 1)[-1].lower()[:10]   # cap at 10 chars
    mime_map = {
        "application/pdf":  "pdf",
        "image/jpeg":       "jpg",
        "image/png":        "png",
        "image/tiff":       "tiff",
    }
    return mime_map.get(mime_type, "bin")


def write_to_vault(
    file_bytes:    bytes,
    document_hash: str,
    filename:      str,
    tender_id:     str | None,
    actor_role:    str,
    mime_type:     str,
    db:            Session,
) -> str:
    """
    Writes file bytes to the evidence vault.

    Args:
        file_bytes:    Raw file content.
        document_hash: SHA-256 hex — used as the filename on disk.
        filename:      Original filename (for extension extraction only).
        tender_id:     Tender this document belongs to. None → _unclassified/.
        actor_role:    RBAC role of the uploader.
        mime_type:     MIME type for extension fallback.
        db:            Active SQLAlchemy session.

    Returns:
        Relative vault path string (stored in documents.vault_path).

    Raises:
        PermissionError: If actor_role lacks vault access for this tender.
        IOError:         If disk write fails.
    """
    # RBAC check
    effective_tender = tender_id or "_unclassified"
    if not _check_rbac(effective_tender, actor_role, db) and \
       not _check_rbac("*", actor_role, db):
        raise PermissionError(
            f"Role '{actor_role}' does not have vault access for tender '{effective_tender}'. "
            "Contact an admin to grant access."
        )

    # Build vault path
    ext = _get_extension(filename, mime_type)
    folder = VAULT_ROOT / effective_tender
    folder.mkdir(parents=True, exist_ok=True)

    vault_file = folder / f"{document_hash}.{ext}"
    relative_path = f"{effective_tender}/{document_hash}.{ext}"

    # Write file — atomic write via temp file then rename
    tmp_path = vault_file.with_suffix(".tmp")
    try:
        tmp_path.write_bytes(file_bytes)
        tmp_path.rename(vault_file)
    except Exception as exc:
        # Clean up tmp if rename failed
        if tmp_path.exists():
            tmp_path.unlink()
        raise IOError(f"Vault write failed for {document_hash}: {exc}") from exc

    logger.info(
        f"[VAULT] Written: {relative_path} "
        f"({len(file_bytes)} bytes, role={actor_role})"
    )
    return relative_path