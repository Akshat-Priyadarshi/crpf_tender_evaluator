"""
routers/evaluate_ingest.py

POST /api/v1/ingest/evaluate

Accepts TWO files (tender document + bidder document) plus a threshold
value typed by the officer. For each file it:
  1. Runs the full Layer 1 pipeline (virus scan → hash → dedup → classify → vault)
  2. Extracts text using text_extractor (PDF/DOCX/image)
  3. Creates an EvaluationJob row with both texts + timestamps + threshold

The EvaluationJob row is then available for the next stage (evaluation engine)
to query via GET /api/v1/evaluate/jobs.

Why a separate endpoint instead of modifying /ingest?
  - /ingest handles ONE file with a single responsibility (Layer 1 only)
  - This endpoint handles the TWO-file paired flow with text extraction
  - Keeping them separate means /ingest keeps working exactly as before
  - The evaluation engine can be built independently against the jobs table
"""

import logging
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from sqlalchemy.orm import Session

from models.db import Document, EvaluationJob, get_db, get_db_for_background, utcnow
from services.audit import Action, log_action
from services.classifier import classify
from services.hasher import check_and_hash
from services.vault import write_to_vault
from services.virus_scanner import ScanVerdict, scan_bytes
from services.text_extractor import extract_text, ExtractionError
from services.extractor import process_document_ai

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Layer 3 — Evaluation Ingest"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


# ── Internal helper: run full Layer 1 pipeline on one file ───────────────────

def _run_layer1(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    tender_id: Optional[str],
    bidder_id: Optional[str],
    actor_role: str,
    actor_id: Optional[str],
    db: Session,
) -> Document:
    """
    Runs the complete Layer 1 pipeline for a single file.
    Returns the committed Document ORM object.
    Raises HTTPException on any failure (virus, scan error, vault error).

    Note: this function commits to the DB before returning so the Document
    row is visible to background tasks and the EvaluationJob FK constraint.
    """

    # Step 1: FILE_RECEIVED
    log_action(db=db, action=Action.FILE_RECEIVED, original_filename=filename,
               actor_role=actor_role, actor_id=actor_id,
               detail={"file_size_bytes": len(file_bytes), "mime_type": mime_type})

    # Step 2: Virus scan
    log_action(db=db, action=Action.VIRUS_SCAN_STARTED,
               original_filename=filename, actor_role=actor_role)

    scan_result = scan_bytes(file_bytes, filename)

    if scan_result.verdict == ScanVerdict.INFECTED:
        log_action(db=db, action=Action.VIRUS_SCAN_INFECTED,
                   original_filename=filename, actor_role=actor_role,
                   detail={"threat_name": scan_result.threat_name})
        db.commit()
        raise HTTPException(status_code=406, detail={
            "error": "VIRUS_DETECTED", "filename": filename,
            "threat": scan_result.threat_name,
        })

    if scan_result.verdict == ScanVerdict.ERROR:
        log_action(db=db, action=Action.VIRUS_SCAN_ERROR,
                   original_filename=filename, actor_role=actor_role,
                   detail={"error_detail": scan_result.error_detail})
        db.commit()
        raise HTTPException(status_code=406, detail={
            "error": "SCAN_ERROR", "filename": filename,
            "message": "Virus scan failed — file rejected.",
        })

    log_action(db=db, action=Action.VIRUS_SCAN_CLEAN,
               original_filename=filename, actor_role=actor_role)

    # Step 3: Hash + dedup
    hash_result = check_and_hash(file_bytes, db)
    log_action(db=db, action=Action.HASH_COMPUTED,
               document_hash=hash_result.document_hash,
               original_filename=filename, actor_role=actor_role,
               detail={"is_duplicate": hash_result.is_duplicate})

    if hash_result.is_duplicate:
        # Duplicate is fine — we reuse the existing Document row
        log_action(db=db, action=Action.DUPLICATE_DETECTED,
                   document_hash=hash_result.document_hash,
                   original_filename=filename, actor_role=actor_role)
        db.commit()
        # Return the existing document object
        existing = hash_result.existing_doc
        logger.info("Reusing existing document %s for %s", hash_result.document_hash[:12], filename)
        return existing

    # Step 4: Classify
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

    # Step 5: Vault write
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

    # Step 6: Document record
    uploaded_at = utcnow()
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
        submitted_at          = uploaded_at,
        virus_scan_result     = "clean",
        virus_scan_engine     = scan_result.engine,
    )
    db.add(doc)

    log_action(db=db, action=Action.FILE_INGESTED,
               document_hash=hash_result.document_hash,
               original_filename=filename, actor_role=actor_role,
               detail={"vault_path": vault_path, "doc_type": classification.doc_type})

    # Commit so the Document row is visible to the EvaluationJob FK and background task
    db.commit()
    db.refresh(doc)

    return doc


# ── Main endpoint ────────────────────────────────────────────────────────────

@router.post("/ingest/evaluate", status_code=201)
async def ingest_and_evaluate(
    background_tasks: BackgroundTasks,
    tender_file:     UploadFile = File(...,  description="The CRPF tender document (PDF/DOCX/image)"),
    bidder_file:     UploadFile = File(...,  description="The bidder's submission (PDF/DOCX/image)"),
    threshold_value: Decimal    = Form(...,  description="Officer-supplied evaluation threshold"),
    threshold_unit:  Optional[str] = Form(None, description="Unit label e.g. INR, percent, count"),
    tender_id:       Optional[str] = Form(None),
    bidder_id:       Optional[str] = Form(None),
    actor_role:      str           = Form("officer"),
    actor_id:        Optional[str] = Form(None),
    db:              Session       = Depends(get_db),
):
    """
    Two-file ingest + text extraction endpoint.

    Accepts:
      - tender_file      : the CRPF tender document
      - bidder_file      : the bidder's submission
      - threshold_value  : numeric threshold typed by the officer
      - threshold_unit   : optional label (INR / percent / count)
      - tender_id        : tender reference number
      - bidder_id        : bidder identifier
      - actor_role       : officer / evaluator / admin
      - actor_id         : optional officer ID for audit trail

    Returns:
      - job_id           : UUID to poll /api/v1/evaluate/jobs/{job_id}
      - tender_hash      : SHA-256 of tender document
      - bidder_hash      : SHA-256 of bidder document
      - tender_chars     : character count of extracted tender text
      - bidder_chars     : character count of extracted bidder text
      - tender_method    : extraction method used (pdfplumber / doctr_ocr / python_docx / doctr_image)
      - bidder_method    : extraction method used
      - tender_uploaded_at : ISO timestamp
      - bidder_uploaded_at : ISO timestamp
      - threshold_value  : echoed back for confirmation
      - status           : "pending" — evaluation engine picks this up next
    """

    # ── Size checks ──────────────────────────────────────────────────────────
    tender_bytes = await tender_file.read()
    bidder_bytes  = await bidder_file.read()

    if len(tender_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"Tender file too large: {len(tender_bytes)} bytes.")
    if len(bidder_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"Bidder file too large: {len(bidder_bytes)} bytes.")

    tender_filename = tender_file.filename or "tender_doc"
    bidder_filename  = bidder_file.filename or "bidder_doc"
    tender_mime = tender_file.content_type or "application/octet-stream"
    bidder_mime  = bidder_file.content_type or "application/octet-stream"

    # ── Layer 1: process both files ──────────────────────────────────────────
    logger.info("Processing tender file: %s", tender_filename)
    tender_doc = _run_layer1(
        file_bytes=tender_bytes, filename=tender_filename, mime_type=tender_mime,
        tender_id=tender_id, bidder_id=None,
        actor_role=actor_role, actor_id=actor_id, db=db,
    )

    logger.info("Processing bidder file: %s", bidder_filename)
    bidder_doc = _run_layer1(
        file_bytes=bidder_bytes, filename=bidder_filename, mime_type=bidder_mime,
        tender_id=tender_id, bidder_id=bidder_id,
        actor_role=actor_role, actor_id=actor_id, db=db,
    )

    # ── Text extraction ──────────────────────────────────────────────────────
    try:
        tender_text, tender_method = extract_text(tender_bytes, tender_mime, tender_filename)
    except ExtractionError as exc:
        raise HTTPException(status_code=422, detail=f"Tender text extraction failed: {exc}")

    try:
        bidder_text, bidder_method = extract_text(bidder_bytes, bidder_mime, bidder_filename)
    except ExtractionError as exc:
        raise HTTPException(status_code=422, detail=f"Bidder text extraction failed: {exc}")

    # ── Create EvaluationJob ─────────────────────────────────────────────────
    job = EvaluationJob(
        tender_document_hash     = tender_doc.document_hash,
        tender_filename          = tender_filename,
        tender_uploaded_at       = tender_doc.submitted_at,
        tender_text              = tender_text,
        tender_extraction_method = tender_method,

        bidder_document_hash     = bidder_doc.document_hash,
        bidder_filename          = bidder_filename,
        bidder_uploaded_at       = bidder_doc.submitted_at,
        bidder_text              = bidder_text,
        bidder_extraction_method = bidder_method,

        threshold_value = threshold_value,
        threshold_unit  = threshold_unit,

        tender_id  = tender_id,
        bidder_id  = bidder_id,
        actor_role = actor_role,

        status = "pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(
        "EvaluationJob %s created: tender=%s bidder=%s threshold=%s",
        str(job.job_id)[:8], tender_doc.document_hash[:12],
        bidder_doc.document_hash[:12], threshold_value,
    )

    # ── Schedule Layer 2 background extraction for both docs ────────────────
    # (docTR/Ollama criterion extraction — your existing extractor.py)
    db_factory = get_db_for_background()
    background_tasks.add_task(
        process_document_ai, db_factory(), tender_doc.vault_path, tender_doc.document_hash
    )
    background_tasks.add_task(
        process_document_ai, db_factory(), bidder_doc.vault_path, bidder_doc.document_hash
    )

    # ── Response ─────────────────────────────────────────────────────────────
    return {
        "status":             "pending",
        "job_id":             str(job.job_id),
        "tender_hash":        tender_doc.document_hash,
        "bidder_hash":        bidder_doc.document_hash,
        "tender_filename":    tender_filename,
        "bidder_filename":    bidder_filename,
        "tender_uploaded_at": tender_doc.submitted_at.isoformat() if tender_doc.submitted_at else None,
        "bidder_uploaded_at": bidder_doc.submitted_at.isoformat() if bidder_doc.submitted_at else None,
        "tender_chars":       len(tender_text),
        "bidder_chars":       len(bidder_text),
        "tender_method":      tender_method,
        "bidder_method":      bidder_method,
        "threshold_value":    str(threshold_value),
        "threshold_unit":     threshold_unit,
        "message": (
            f"Both documents ingested and text extracted. "
            f"EvaluationJob {str(job.job_id)[:8]}... is pending. "
            f"Poll GET /api/v1/evaluate/jobs/{job.job_id} for status."
        ),
    }