"""
routers/extracted.py

Read-only endpoints to retrieve Layer 2 extraction results.

These endpoints are what the frontend /evaluate page will eventually
call to replace mock data with real extracted values.

Routes:
  GET /api/v1/extracted/{document_hash}
      Returns all extracted criteria for a document.
      Used by the evidence drill-down panel (Panel 3 in /evaluate).

  GET /api/v1/extracted/{document_hash}/{criterion_id}
      Returns the single extracted value for one criterion from one document.

  GET /api/v1/documents
      Returns all ingested documents with their extraction status.
      Used by the dashboard to show real document counts.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.db import get_db, ExtractedCriteria, Document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Layer 2 — Extraction Results"])


@router.get("/extracted/{document_hash}")
def get_extracted_criteria(document_hash: str, db: Session = Depends(get_db)):
    """
    Returns all extracted criteria rows for a given document hash.

    Response shape:
    {
      "document_hash": "abc123...",
      "extraction_count": 3,
      "criteria": [
        {
          "criterion_id": "C-01",
          "extracted_value": "7,25,00,000",
          "confidence_score": 0.95,
          "bbox_coordinates": {"page": 6, "x0": 0.12, "y0": 0.41, ...},
          "context_snippet": "...REVENUE FROM OPERATIONS 7,25,00,000...",
          "extraction_method": "llm",
          "ai_model_version": "doctr-0.7+phi3",
          "page_number": 6,
          "is_human_verified": false
        }
      ]
    }
    """
    rows = db.query(ExtractedCriteria).filter(
        ExtractedCriteria.document_hash == document_hash
    ).order_by(ExtractedCriteria.criterion_id).all()

    if not rows:
        # Don't 404 — the extraction may still be running in the background.
        # Return empty with a helpful message.
        return {
            "document_hash":    document_hash,
            "extraction_count": 0,
            "status":           "pending_or_no_criteria_found",
            "message":          "No extracted criteria yet. Layer 2 may still be processing (allow 30–60s on CPU).",
            "criteria":         [],
        }

    import json
    criteria_out = []
    for row in rows:
        bbox = None
        if row.bbox_coordinates:
            try:
                bbox = json.loads(row.bbox_coordinates)
            except Exception:
                bbox = row.bbox_coordinates  # return raw if parse fails

        criteria_out.append({
            "criterion_id":     row.criterion_id,
            "extracted_value":  row.extracted_value,
            "confidence_score": row.confidence_score,
            "bbox_coordinates": bbox,
            "context_snippet":  row.context_snippet,
            "extraction_method":row.extraction_method,
            "ai_model_version": row.ai_model_version,
            "page_number":      row.page_number,
            "is_human_verified":row.is_human_verified,
            "human_override_val":row.human_override_val,
            "created_at":       str(row.created_at),
        })

    return {
        "document_hash":    document_hash,
        "extraction_count": len(criteria_out),
        "status":           "complete",
        "criteria":         criteria_out,
    }


@router.get("/extracted/{document_hash}/{criterion_id}")
def get_single_criterion(
    document_hash: str,
    criterion_id:  str,
    db: Session = Depends(get_db),
):
    """Returns the extracted value for ONE criterion from ONE document."""
    row = db.query(ExtractedCriteria).filter(
        ExtractedCriteria.document_hash == document_hash,
        ExtractedCriteria.criterion_id  == criterion_id.upper(),
    ).first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"No extraction found for {criterion_id} in document {document_hash[:16]}..."
        )

    import json
    bbox = None
    if row.bbox_coordinates:
        try:
            bbox = json.loads(row.bbox_coordinates)
        except Exception:
            bbox = row.bbox_coordinates

    return {
        "document_hash":     row.document_hash,
        "criterion_id":      row.criterion_id,
        "extracted_value":   row.extracted_value,
        "confidence_score":  row.confidence_score,
        "bbox_coordinates":  bbox,
        "context_snippet":   row.context_snippet,
        "extraction_method": row.extraction_method,
        "ai_model_version":  row.ai_model_version,
        "page_number":       row.page_number,
        "is_human_verified": row.is_human_verified,
    }


@router.get("/documents")
def list_documents(
    tender_id: Optional[str] = None,
    limit:     int            = 50,
    db:        Session        = Depends(get_db),
):
    """
    Lists all ingested documents with their extraction status.
    Used by the frontend dashboard to show real document counts.
    """
    query = db.query(Document)
    if tender_id:
        query = query.filter(Document.tender_id == tender_id)

    docs = query.order_by(Document.submitted_at.desc()).limit(limit).all()

    result = []
    for doc in docs:
        extraction_count = db.query(ExtractedCriteria).filter(
            ExtractedCriteria.document_hash == doc.document_hash
        ).count()

        result.append({
            "document_hash":         doc.document_hash,
            "original_filename":     doc.original_filename,
            "doc_type":              doc.doc_type,
            "classification_status": doc.classification_status,
            "tender_id":             doc.tender_id,
            "bidder_id":             doc.bidder_id,
            "submitted_at":          str(doc.submitted_at),
            "file_size_bytes":       doc.file_size_bytes,
            "extraction_count":      extraction_count,
        })

    return {
        "total":     len(result),
        "documents": result,
    }