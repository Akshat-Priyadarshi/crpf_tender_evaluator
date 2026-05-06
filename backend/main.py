"""
main.py — CRPF Tender Evaluation Platform — Layer 1 Ingestion API
"""

import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from models.db import get_db
from routers.ingest import router as ingest_router
from services.audit import verify_chain

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

app = FastAPI(
    title="CRPF Tender Evaluation — Layer 1 Secure Ingestion",
    description=(
        "Receives procurement documents, virus-scans them, fingerprints them with SHA-256, "
        "classifies them, seals them in a role-access-controlled vault, and records every "
        "action in a hash-chained audit ledger. Every verdict is subject to officer sign-off."
    ),
    version="1.0.0",
)

# CORS — allow Next.js frontend (localhost:3000 in dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Layer 1 router
app.include_router(ingest_router)


@app.get("/", tags=["Health"])
def health_check():
    """Basic liveness check."""
    return {
        "status": "Layer 1 Ingestion API is LIVE",
        "platform": "CRPF Tender Evaluation Platform",
        "layer": "Layer 1 — Secure Ingestion",
    }


@app.get("/api/v1/audit/verify", tags=["Audit"])
def verify_audit_chain(db: Session = Depends(get_db)):
    """
    Walks the entire audit ledger and verifies the hash chain is unbroken.
    Use this endpoint during CVC audit or to demonstrate tamper-evidence to judges.
    """
    return verify_chain(db)