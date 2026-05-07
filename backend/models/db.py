"""
models/db.py
SQLAlchemy ORM models — mirror of infra/init.sql.
The DB schema is the source of truth; models must stay in sync.
"""

import os
from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, Column, String, BigInteger, Text,
    DateTime, JSON, UniqueConstraint, CheckConstraint, Index, Integer, Float, Boolean, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://crpf:crpf_secret@localhost:5432/crpf_ingestion")

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

    # Three-tier classifier output
    doc_type              = Column(String(32), nullable=False, default="unknown")
    classification_status = Column(String(32), nullable=False, default="pending_content_review")
    bidder_id             = Column(Text)
    tender_id             = Column(Text)

    # Vault
    vault_path            = Column(Text, nullable=False)

    # Submission metadata
    submitted_by_role     = Column(String(32))
    submitted_at          = Column(DateTime(timezone=True), default=utcnow)

    # Virus scan
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
        return f"<Document hash={self.document_hash[:12]}... type={self.doc_type} status={self.classification_status}>"


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

class ExtractedCriteria(Base):
    __tablename__ = "extracted_criteria"

    id = Column(Integer, primary_key=True, index=True)
    # Links this data point to the specific file in the vault
    document_hash = Column(String, index=True) 
    
    # The specific rule being checked (e.g., C-01 for Turnover)
    criterion_id = Column(String) 
    
    # The actual result found by the AI
    extracted_value = Column(String) 
    
    # JSON string containing [x, y, width, height] for the UI highlight
    bbox_coordinates = Column(Text) 
    
    # Probability score from the OCR/LLM
    confidence_score = Column(Float)
    
    # For Audit: The specific text snippet the AI looked at
    context_snippet = Column(Text)
    
    # Human accountability: Did an officer change this value?
    is_verified = Column(Boolean, default=False)