"""
main.py — CRPF Tender Evaluation Platform
"""

import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from models.db import get_db
from services.audit import verify_chain

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

# ── App must be created BEFORE any include_router calls ──────────────────────
app = FastAPI(
    title="CRPF Tender Evaluation — Secure Ingestion & Evaluation Platform",
    description=(
        "Receives procurement documents, virus-scans them, fingerprints them with SHA-256, "
        "classifies them, seals them in a role-access-controlled vault, and records every "
        "action in a hash-chained audit ledger. Every verdict is subject to officer sign-off."
    ),
    version="2.0.0",
)

# CORS — allow Next.js frontend (localhost:3000 in dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers — registered AFTER app is created ─────────────────────────────
from routers.ingest import router as ingest_router
from routers.extracted import router as extracted_router
from routers.evaluate_ingest import router as evaluate_ingest_router
from routers.jobs import router as jobs_router

app.include_router(ingest_router)
app.include_router(extracted_router)
app.include_router(evaluate_ingest_router)
app.include_router(jobs_router)


@app.get("/", tags=["Health"])
def health_check():
    return {
        "status": "CRPF Tender Evaluation API is LIVE",
        "platform": "CRPF Tender Evaluation Platform",
        "layers_active": ["Layer 1 — Secure Ingestion", "Layer 3 — Evaluation Ingest"],
        "endpoints": {
            "single_file_ingest":   "POST /api/v1/ingest",
            "two_file_evaluate":    "POST /api/v1/ingest/evaluate",
            "list_jobs":            "GET  /api/v1/evaluate/jobs",
            "get_job":              "GET  /api/v1/evaluate/jobs/{job_id}",
            "update_job_status":    "PATCH /api/v1/evaluate/jobs/{job_id}/status",
            "extracted_criteria":   "GET  /api/v1/extracted/{document_hash}",
            "audit_verify":         "GET  /api/v1/audit/verify",
        }
    }


@app.get("/api/v1/audit/verify", tags=["Audit"])
def verify_audit_chain(db: Session = Depends(get_db)):
    """
    Walks the entire audit ledger and verifies the hash chain is unbroken.
    """
    return verify_chain(db)