"""
models/db.py
SQLAlchemy ORM models — mirror of infra/init.sql + migrations.

Tables:
  1. documents           — Layer 1 ingestion record per file
  2. audit_ledger        — hash-chained tamper-evident log
  3. vault_access        — RBAC grants per tender
  4. extracted_criteria  — Layer 2 per-field extraction results
  5. evaluation_jobs     — Layer 3 two-doc jobs (tender text + bidder text + threshold)
"""

import os
from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, Column, String, BigInteger, Text,
    DateTime, JSON, UniqueConstraint, CheckConstraint, Index,
    Integer, Float, Boolean, ForeignKey, Numeric
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://crpf:crpf_secret@localhost:5432/crpf_ingestion"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_for_background() -> sessionmaker:
    """
    Returns the SessionLocal factory — NOT a session.
    Background tasks must call this and create their OWN session
    because the request-scoped session from get_db() closes before
    the background task runs, causing DetachedInstanceError.
    """
    return SessionLocal


def utcnow():
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────
# Model 1: Document
# ─────────────────────────────────────────────
class Document(Base):
    __tablename__ = "documents"

    id                    = Column(PG_UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    document_hash         = Column(String(64), nullable=False, unique=True)
    original_filename     = Column(Text, nullable=False)
    file_size_bytes       = Column(BigInteger, nullable=False)
    mime_type             = Column(Text)

    doc_type              = Column(String(32), nullable=False, default="unknown")
    classification_status = Column(String(32), nullable=False, default="pending_content_review")
    bidder_id             = Column(Text)
    tender_id             = Column(Text)

    vault_path            = Column(Text, nullable=False)

    submitted_by_role     = Column(String(32))
    submitted_at          = Column(DateTime(timezone=True), default=utcnow)

    virus_scan_result     = Column(String(16), nullable=False)
    virus_scan_engine     = Column(Text, nullable=False, default="ClamAV")

    __table_args__ = (
        CheckConstraint("doc_type IN ('tender','bid','corrigendum','unknown')", name="valid_doc_type"),
        CheckConstraint("classification_status IN ('confirmed','pending_content_review')", name="valid_class_status"),
        CheckConstraint("virus_scan_result IN ('clean','infected','error')", name="valid_scan_result"),
        Index("idx_documents_hash", "document_hash"),
        Index("idx_documents_tender", "tender_id"),
        Index("idx_documents_bidder", "bidder_id"),
    )

    def __repr__(self):
        return f"<Document hash={self.document_hash[:12]}... type={self.doc_type}>"


# ─────────────────────────────────────────────
# Model 2: AuditLedger
# ─────────────────────────────────────────────
class AuditLedger(Base):
    __tablename__ = "audit_ledger"

    id                  = Column(BigInteger, primary_key=True, autoincrement=True)
    entry_uuid          = Column(PG_UUID(as_uuid=True), nullable=False, server_default="gen_random_uuid()")
    previous_entry_hash = Column(String(64), nullable=False)

    action              = Column(String(64), nullable=False)
    document_hash       = Column(String(64))
    original_filename   = Column(Text)
    actor_role          = Column(String(32))
    actor_id            = Column(Text)
    detail              = Column(JSON)

    occurred_at         = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("idx_audit_doc_hash", "document_hash"),
        Index("idx_audit_action", "action"),
        Index("idx_audit_occurred", "occurred_at"),
    )


# ─────────────────────────────────────────────
# Model 3: VaultAccess
# ─────────────────────────────────────────────
class VaultAccess(Base):
    __tablename__ = "vault_access"

    id          = Column(PG_UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    tender_id   = Column(Text, nullable=False)
    role        = Column(String(32), nullable=False)
    granted_by  = Column(Text)
    granted_at  = Column(DateTime(timezone=True), default=utcnow)
    expires_at  = Column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("role IN ('officer','evaluator','admin')", name="valid_role"),
        UniqueConstraint("tender_id", "role", name="uq_vault_tender_role"),
        Index("idx_vault_access_tender", "tender_id"),
    )


# ─────────────────────────────────────────────
# Model 4: ExtractedCriteria  ← LAYER 2
# ─────────────────────────────────────────────
class ExtractedCriteria(Base):
    """
    Stores every data point extracted from a document by Layer 2.
    Each row = ONE extracted field from ONE document.
    """
    __tablename__ = "extracted_criteria"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    document_hash   = Column(String(64), nullable=False, index=True)
    criterion_id    = Column(String(16), nullable=False)
    extracted_value = Column(Text)

    bbox_coordinates  = Column(Text)    # JSON: {"page": N, "x0": N, "y0": N, "x1": N, "y1": N}
    confidence_score  = Column(Float)
    context_snippet   = Column(Text)
    extraction_method = Column(String(32), default="llm")
    ai_model_version  = Column(String(64))
    page_number       = Column(Integer)
    is_verified       = Column(Boolean, default=False)

    is_human_verified  = Column(Boolean, default=False)
    human_override_val = Column(Text)
    human_override_at  = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("idx_extracted_hash",      "document_hash"),
        Index("idx_extracted_criterion", "criterion_id"),
    )

    def __repr__(self):
        return (
            f"<ExtractedCriteria doc={self.document_hash[:12]}... "
            f"criterion={self.criterion_id} value={self.extracted_value!r} "
            f"conf={self.confidence_score}>"
        )


# ─────────────────────────────────────────────
# Model 5: EvaluationJob  ← LAYER 3
# ─────────────────────────────────────────────
class EvaluationJob(Base):
    """
    One row = one paired evaluation request (tender doc + bidder doc).

    This is the handoff point between ingestion/extraction (Layers 1-2)
    and the evaluation engine (Layers 3-5).

    The evaluation stage queries:
        SELECT * FROM evaluation_jobs WHERE status = 'pending'
    processes the tender_text and bidder_text against the threshold_value,
    and writes its results back (updating status to 'completed' or 'failed').
    """
    __tablename__ = "evaluation_jobs"

    id      = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id  = Column(PG_UUID(as_uuid=True), nullable=False,
                     server_default="gen_random_uuid()", unique=True)

    # Tender document
    tender_document_hash     = Column(String(64), ForeignKey("documents.document_hash"), nullable=False)
    tender_filename          = Column(Text, nullable=False)
    tender_uploaded_at       = Column(DateTime(timezone=True), nullable=False)
    tender_text              = Column(Text, nullable=False)
    tender_extraction_method = Column(String(32), nullable=False)

    # Bidder document
    bidder_document_hash     = Column(String(64), ForeignKey("documents.document_hash"), nullable=False)
    bidder_filename          = Column(Text, nullable=False)
    bidder_uploaded_at       = Column(DateTime(timezone=True), nullable=False)
    bidder_text              = Column(Text, nullable=False)
    bidder_extraction_method = Column(String(32), nullable=False)

    # Officer-supplied threshold
    threshold_value = Column(Numeric(20, 4), nullable=False)
    threshold_unit  = Column(Text)          # "INR", "percent", "count", etc.

    # Metadata copied from ingestion (avoids JOIN in evaluator)
    tender_id  = Column(Text)
    bidder_id  = Column(Text)
    actor_role = Column(String(32))

    # Lifecycle
    status       = Column(String(16), nullable=False, default="pending",
                          info={"check": "status IN ('pending','processing','completed','failed')"})
    error_detail = Column(Text)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','processing','completed','failed')",
            name="valid_eval_status"
        ),
        Index("idx_eval_jobs_status",  "status"),
        Index("idx_eval_jobs_job_id",  "job_id"),
        Index("idx_eval_jobs_tender",  "tender_id"),
        Index("idx_eval_jobs_bidder",  "bidder_id"),
        Index("idx_eval_jobs_created", "created_at"),
    )

    def __repr__(self):
        return (
            f"<EvaluationJob job_id={str(self.job_id)[:8]}... "
            f"tender={self.tender_id} bidder={self.bidder_id} "
            f"threshold={self.threshold_value} status={self.status}>"
        )