"""
routers/jobs.py

Read-only endpoints for EvaluationJob — used by:
  1. The frontend to poll job status after upload
  2. The next evaluation stage to fetch pending jobs and their text

Endpoints:
  GET /api/v1/evaluate/jobs              — list all jobs (paginated, filterable by status)
  GET /api/v1/evaluate/jobs/{job_id}     — full job detail including both extracted texts
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models.db import EvaluationJob, get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/evaluate", tags=["Layer 3 — Evaluation Jobs"])


@router.get("/jobs", summary="List evaluation jobs")
def list_jobs(
    status: Optional[str] = Query(None, description="Filter by status: pending/processing/completed/failed"),
    tender_id: Optional[str] = Query(None),
    bidder_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Returns a paginated list of evaluation jobs.

    The next-stage evaluation engine calls this with ?status=pending
    to find work to process.

    The frontend calls this to show the officer a list of submitted pairs.
    """
    q = db.query(EvaluationJob)

    if status:
        valid_statuses = {"pending", "processing", "completed", "failed"}
        if status not in valid_statuses:
            raise HTTPException(status_code=400,
                detail=f"Invalid status '{status}'. Must be one of: {valid_statuses}")
        q = q.filter(EvaluationJob.status == status)

    if tender_id:
        q = q.filter(EvaluationJob.tender_id == tender_id)

    if bidder_id:
        q = q.filter(EvaluationJob.bidder_id == bidder_id)

    total = q.count()
    jobs  = q.order_by(EvaluationJob.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total":  total,
        "offset": offset,
        "limit":  limit,
        "jobs": [
            {
                "job_id":            str(j.job_id),
                "tender_id":         j.tender_id,
                "bidder_id":         j.bidder_id,
                "threshold_value":   str(j.threshold_value),
                "threshold_unit":    j.threshold_unit,
                "tender_filename":   j.tender_filename,
                "bidder_filename":   j.bidder_filename,
                "tender_uploaded_at":j.tender_uploaded_at.isoformat() if j.tender_uploaded_at else None,
                "bidder_uploaded_at":j.bidder_uploaded_at.isoformat() if j.bidder_uploaded_at else None,
                "tender_chars":      len(j.tender_text) if j.tender_text else 0,
                "bidder_chars":      len(j.bidder_text) if j.bidder_text else 0,
                "tender_method":     j.tender_extraction_method,
                "bidder_method":     j.bidder_extraction_method,
                "status":            j.status,
                "created_at":        j.created_at.isoformat() if j.created_at else None,
                "error_detail":      j.error_detail,
            }
            for j in jobs
        ],
    }


@router.get("/jobs/{job_id}", summary="Get full evaluation job detail")
def get_job(job_id: UUID, db: Session = Depends(get_db)):
    """
    Returns the full EvaluationJob including both extracted text strings.

    This is what the next-stage evaluation engine calls to get:
      - tender_text      : full extracted text of the tender document
      - bidder_text      : full extracted text of the bidder document
      - threshold_value  : officer-supplied threshold
      - tender_uploaded_at / bidder_uploaded_at : timestamps

    The evaluation engine should then update status to 'processing',
    run its analysis, and update to 'completed' or 'failed'.
    """
    job = db.query(EvaluationJob).filter(EvaluationJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    return {
        "job_id":            str(job.job_id),
        "status":            job.status,

        # Tender
        "tender_document_hash":     job.tender_document_hash,
        "tender_filename":          job.tender_filename,
        "tender_uploaded_at":       job.tender_uploaded_at.isoformat() if job.tender_uploaded_at else None,
        "tender_extraction_method": job.tender_extraction_method,
        "tender_chars":             len(job.tender_text) if job.tender_text else 0,
        "tender_text":              job.tender_text,      # ← full string for evaluation engine

        # Bidder
        "bidder_document_hash":     job.bidder_document_hash,
        "bidder_filename":          job.bidder_filename,
        "bidder_uploaded_at":       job.bidder_uploaded_at.isoformat() if job.bidder_uploaded_at else None,
        "bidder_extraction_method": job.bidder_extraction_method,
        "bidder_chars":             len(job.bidder_text) if job.bidder_text else 0,
        "bidder_text":              job.bidder_text,      # ← full string for evaluation engine

        # Threshold
        "threshold_value": str(job.threshold_value),
        "threshold_unit":  job.threshold_unit,

        # Metadata
        "tender_id":  job.tender_id,
        "bidder_id":  job.bidder_id,
        "actor_role": job.actor_role,

        "created_at":   job.created_at.isoformat() if job.created_at else None,
        "updated_at":   job.updated_at.isoformat() if job.updated_at else None,
        "error_detail": job.error_detail,
    }


@router.patch("/jobs/{job_id}/status", summary="Update job status (for evaluation engine)")
def update_job_status(
    job_id: UUID,
    status: str,
    error_detail: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Called by the evaluation engine to advance job lifecycle:
      pending → processing → completed | failed

    The evaluation engine calls this:
      PATCH /api/v1/evaluate/jobs/{job_id}/status?status=processing   (when it starts)
      PATCH /api/v1/evaluate/jobs/{job_id}/status?status=completed    (when done)
      PATCH /api/v1/evaluate/jobs/{job_id}/status?status=failed&error_detail=... (on error)
    """
    valid = {"pending", "processing", "completed", "failed"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")

    job = db.query(EvaluationJob).filter(EvaluationJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    job.status = status
    if error_detail:
        job.error_detail = error_detail
    db.commit()

    return {"job_id": str(job_id), "status": status, "updated": True}