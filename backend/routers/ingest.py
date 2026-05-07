# """
# routers/ingest.py

# The single Layer 1 endpoint: POST /api/v1/ingest

# Pipeline (in order):
#   1. Receive file → log FILE_RECEIVED
#   2. Virus scan  → CLEAN or reject with 406
#   3. SHA-256 hash + dedup check → skip if duplicate
#   4. Classify    → tier 1/2/3 result
#   5. Write to vault
#   6. Write document row to DB
#   7. Log FILE_INGESTED
#   8. Return 201 with full ingestion report

# All steps are atomic — if anything after the vault write fails,
# the document row is not committed and the vault file is cleaned up.
# """

# """
# routers/ingest.py

# The single Layer 1 endpoint: POST /api/v1/ingest

# Pipeline (in order):
#   1. Receive file → log FILE_RECEIVED
#   2. Virus scan  → CLEAN or reject with 406
#   3. SHA-256 hash + dedup check → skip if duplicate
#   4. Classify    → tier 1/2/3 result
#   5. Write to vault
#   6. Write document row to DB
#   7. Log FILE_INGESTED
#   8. Commit everything
#   9. Schedule Layer 2 background extraction
#  10. Return 201 with full ingestion report

# SESSION BUG FIX:
#   The background task receives `get_db_for_background()` — the SessionLocal
#   FACTORY, not a live session. The extractor creates its own session inside
#   the background task, which is the only safe pattern because the request
#   session (db from Depends(get_db)) closes when this function returns,
#   before the background task executes.
# """

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from sqlalchemy.orm import Session

from models.db import Document, get_db, get_db_for_background
from services.audit import Action, log_action
from services.classifier import classify
from services.hasher import check_and_hash
from services.vault import write_to_vault
from services.virus_scanner import ScanVerdict, scan_bytes
from services.extractor import process_document_ai

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Layer 1 — Secure Ingestion"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/ingest", status_code=201)
async def ingest_document(
    background_tasks: BackgroundTasks,
    file:       UploadFile = File(...),
    tender_id:  Optional[str] = Form(None),
    bidder_id:  Optional[str] = Form(None),
    actor_role: str           = Form("officer"),
    actor_id:   Optional[str] = Form(None),
    db:         Session       = Depends(get_db),
):
    filename = file.filename or "unknown"

    # ── Read file ────────────────────────────────────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large: {len(file_bytes)} bytes.")

    mime_type = file.content_type or "application/octet-stream"

    # ── Step 1: FILE_RECEIVED ────────────────────────────────────────────
    log_action(db=db, action=Action.FILE_RECEIVED, original_filename=filename,
               actor_role=actor_role, actor_id=actor_id,
               detail={"file_size_bytes": len(file_bytes), "mime_type": mime_type})

    # ── Step 2: Virus scan ───────────────────────────────────────────────
    log_action(db=db, action=Action.VIRUS_SCAN_STARTED,
               original_filename=filename, actor_role=actor_role)

    scan_result = scan_bytes(file_bytes, filename)

    if scan_result.verdict == ScanVerdict.INFECTED:
        log_action(db=db, action=Action.VIRUS_SCAN_INFECTED,
                   original_filename=filename, actor_role=actor_role,
                   detail={"threat_name": scan_result.threat_name})
        log_action(db=db, action=Action.INGEST_REJECTED,
                   original_filename=filename, actor_role=actor_role,
                   detail={"reason": "Virus detected", "threat": scan_result.threat_name})
        db.commit()
        raise HTTPException(status_code=406, detail={
            "error": "VIRUS_DETECTED", "filename": filename,
            "threat": scan_result.threat_name,
            "message": "File rejected. Threat detected by ClamAV."
        })

    if scan_result.verdict == ScanVerdict.ERROR:
        log_action(db=db, action=Action.VIRUS_SCAN_ERROR,
                   original_filename=filename, actor_role=actor_role,
                   detail={"error_detail": scan_result.error_detail})
        log_action(db=db, action=Action.INGEST_REJECTED,
                   original_filename=filename, actor_role=actor_role,
                   detail={"reason": "Virus scan error — treated as unsafe"})
        db.commit()
        raise HTTPException(status_code=406, detail={
            "error": "SCAN_ERROR", "filename": filename,
            "message": "Virus scan failed. File rejected as a precaution."
        })

    log_action(db=db, action=Action.VIRUS_SCAN_CLEAN,
               original_filename=filename, actor_role=actor_role)

    # ── Step 3: Hash + dedup ─────────────────────────────────────────────
    hash_result = check_and_hash(file_bytes, db)
    log_action(db=db, action=Action.HASH_COMPUTED,
               document_hash=hash_result.document_hash,
               original_filename=filename, actor_role=actor_role,
               detail={"is_duplicate": hash_result.is_duplicate})

    if hash_result.is_duplicate:
        log_action(db=db, action=Action.DUPLICATE_DETECTED,
                   document_hash=hash_result.document_hash,
                   original_filename=filename, actor_role=actor_role)
        db.commit()
        return {
            "status": "DUPLICATE",
            "message": "This document has already been ingested.",
            "document_hash": hash_result.document_hash,
            "original_ingestion": {
                "filename":     hash_result.existing_doc.original_filename,
                "submitted_at": str(hash_result.existing_doc.submitted_at),
                "vault_path":   hash_result.existing_doc.vault_path,
            }
        }

    # ── Step 4: Classify ─────────────────────────────────────────────────
    classification = classify(filename=filename, metadata={
        "tender_id": tender_id, "bidder_id": bidder_id, "doc_type_hint": ""
    })
    log_action(db=db, action=Action.CLASSIFIED,
               document_hash=hash_result.document_hash,
               original_filename=filename, actor_role=actor_role,
               detail={
                   "doc_type":              classification.doc_type,
                   "classification_status": classification.classification_status,
                   "confidence_tier":       classification.confidence_tier,
                   "reason":                classification.reason,
               })

    # ── Step 5: Vault write ──────────────────────────────────────────────
    try:
        vault_path = write_to_vault(
            file_bytes=file_bytes,
            document_hash=hash_result.document_hash,
            filename=filename,
            tender_id=classification.tender_id or tender_id,
            actor_role=actor_role,
            mime_type=mime_type,
            db=db,
        )
    except PermissionError as exc:
        db.commit()
        raise HTTPException(status_code=403, detail=str(exc))
    except IOError as exc:
        db.commit()
        raise HTTPException(status_code=500, detail=f"Vault write failed: {exc}")

    log_action(db=db, action=Action.VAULT_WRITTEN,
               document_hash=hash_result.document_hash,
               original_filename=filename, actor_role=actor_role,
               detail={"vault_path": vault_path})

    # ── Step 6: Document record ──────────────────────────────────────────
    doc = Document(
        document_hash         = hash_result.document_hash,
        original_filename     = filename,
        file_size_bytes       = len(file_bytes),
        mime_type             = mime_type,
        doc_type              = classification.doc_type,
        classification_status = classification.classification_status,
        bidder_id             = classification.bidder_id or bidder_id,
        tender_id             = classification.tender_id or tender_id,
        vault_path            = vault_path,
        submitted_by_role     = actor_role,
        virus_scan_result     = "clean",
        virus_scan_engine     = scan_result.engine,
    )
    db.add(doc)

    # ── Step 7: FILE_INGESTED ────────────────────────────────────────────
    log_action(db=db, action=Action.FILE_INGESTED,
               document_hash=hash_result.document_hash,
               original_filename=filename, actor_role=actor_role,
               detail={
                   "vault_path":            vault_path,
                   "doc_type":              classification.doc_type,
                   "classification_status": classification.classification_status,
                   "confidence_tier":       classification.confidence_tier,
               })

    # ── Step 8: Commit everything BEFORE scheduling background task ──────
    # This is critical: the background task needs the Document row to exist
    # in the DB before it tries to update classification_status.
    db.commit()

    # ── Step 9: Schedule Layer 2 extraction ─────────────────────────────
    # CRITICAL FIX: We pass get_db_for_background() — the SessionLocal FACTORY.
    # The extractor creates its own session inside the background task.
    # We do NOT pass `db` because that session is now closed (request ended).
    background_tasks.add_task(
        process_document_ai,
        get_db_for_background(),   # ← factory, not session
        vault_path,
        hash_result.document_hash,
    )

    # ── Step 10: Return 201 ──────────────────────────────────────────────
    return {
        "status":        "INGESTED",
        "document_hash": hash_result.document_hash,
        "filename":      filename,
        "vault_path":    vault_path,
        "classification": {
            "doc_type":              classification.doc_type,
            "classification_status": classification.classification_status,
            "confidence_tier":       classification.confidence_tier,
            "reason":                classification.reason,
            "bidder_id":             classification.bidder_id,
            "tender_id":             classification.tender_id,
        },
        "virus_scan":      "clean",
        "file_size_bytes": len(file_bytes),
        "layer2_extraction": "scheduled — check /api/v1/extracted/{document_hash} in ~60s",
    }