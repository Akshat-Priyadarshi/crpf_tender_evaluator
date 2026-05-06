-- ============================================================
-- CRPF Tender Evaluation Platform — Layer 1 Schema
-- Append-only design: no UPDATE or DELETE on audit tables
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ────────────────────────────────────────────────────────────
-- TABLE 1: documents
-- Every successfully ingested document lives here.
-- The document_hash (SHA-256) is the primary identity —
-- NOT the filename. Filenames are untrusted bidder input.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_hash       VARCHAR(64)  NOT NULL UNIQUE,   -- SHA-256 hex
    original_filename   TEXT         NOT NULL,
    file_size_bytes     BIGINT       NOT NULL,
    mime_type           TEXT,

    -- Three-tier classifier output (see classifier.py)
    doc_type            VARCHAR(32)  NOT NULL            -- 'tender' | 'bid' | 'corrigendum' | 'unknown'
                        DEFAULT 'unknown',
    classification_status VARCHAR(32) NOT NULL           -- 'confirmed' | 'pending_content_review'
                        DEFAULT 'pending_content_review',
    bidder_id           TEXT,                            -- NULL for tenders
    tender_id           TEXT,

    -- Vault location (relative path inside /evidence_vault)
    vault_path          TEXT         NOT NULL,

    -- Submission metadata
    submitted_by_role   VARCHAR(32),                     -- RBAC role of uploader
    submitted_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Virus scan result (always recorded)
    virus_scan_result   VARCHAR(16)  NOT NULL,           -- 'clean' | 'infected' | 'error'
    virus_scan_engine   TEXT         NOT NULL DEFAULT 'ClamAV',

    CONSTRAINT valid_doc_type CHECK (
        doc_type IN ('tender', 'bid', 'corrigendum', 'unknown')
    ),
    CONSTRAINT valid_class_status CHECK (
        classification_status IN ('confirmed', 'pending_content_review')
    ),
    CONSTRAINT valid_scan_result CHECK (
        virus_scan_result IN ('clean', 'infected', 'error')
    )
);

CREATE INDEX idx_documents_hash      ON documents(document_hash);
CREATE INDEX idx_documents_tender    ON documents(tender_id);
CREATE INDEX idx_documents_bidder    ON documents(bidder_id);
CREATE INDEX idx_documents_doc_type  ON documents(doc_type);


-- ────────────────────────────────────────────────────────────
-- TABLE 2: audit_ledger
-- Hash-chained, append-only audit trail.
-- Every action on every document is recorded here.
-- previous_entry_hash creates the chain — you cannot
-- alter a past row without breaking every row after it.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_ledger (
    id                  BIGSERIAL    PRIMARY KEY,        -- monotonic sequence
    entry_uuid          UUID         NOT NULL DEFAULT gen_random_uuid(),

    -- Chain link: SHA-256 of the previous row's entry_uuid + action + timestamp
    -- First row stores 'GENESIS' as a known anchor
    previous_entry_hash VARCHAR(64)  NOT NULL,

    -- What happened
    action              VARCHAR(64)  NOT NULL,           -- see ACTION CONSTANTS below
    document_hash       VARCHAR(64),                     -- NULL for non-doc actions
    original_filename   TEXT,
    actor_role          VARCHAR(32),
    actor_id            TEXT,                            -- user/session identifier

    -- Detail payload (JSON for flexibility)
    detail              JSONB,

    occurred_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ACTION CONSTANTS (enforced by application, documented here):
-- FILE_RECEIVED       — multipart POST arrived
-- VIRUS_SCAN_STARTED  — scan begun
-- VIRUS_SCAN_CLEAN    — ClamAV returned clean
-- VIRUS_SCAN_INFECTED — ClamAV found virus; file rejected
-- HASH_COMPUTED       — SHA-256 computed
-- DUPLICATE_DETECTED  — hash already exists; skipped
-- CLASSIFIED          — classifier ran (confirmed or pending)
-- VAULT_WRITTEN       — file sealed to evidence vault
-- FILE_INGESTED       — full pipeline complete; 201 returned
-- VAULT_ACCESS        — someone read a file from the vault

-- Prevent any DELETE or UPDATE on this table via a rule
CREATE RULE no_delete_audit AS ON DELETE TO audit_ledger DO INSTEAD NOTHING;
CREATE RULE no_update_audit AS ON UPDATE TO audit_ledger DO INSTEAD NOTHING;

-- Seed the genesis row (anchor for the hash chain)
INSERT INTO audit_ledger (previous_entry_hash, action, detail)
VALUES (
    'GENESIS',
    'LEDGER_INITIALISED',
    '{"note": "Hash chain anchor. This row is the root of the audit trail."}'
);

CREATE INDEX idx_audit_doc_hash  ON audit_ledger(document_hash);
CREATE INDEX idx_audit_action    ON audit_ledger(action);
CREATE INDEX idx_audit_occurred  ON audit_ledger(occurred_at);


-- ────────────────────────────────────────────────────────────
-- TABLE 3: vault_access
-- RBAC: which roles can access which tender's documents.
-- Evaluators see only their assigned tender scope.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_access (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id       TEXT        NOT NULL,
    role            VARCHAR(32) NOT NULL,   -- 'officer' | 'evaluator' | 'admin'
    granted_by      TEXT,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,            -- NULL = no expiry

    CONSTRAINT valid_role CHECK (role IN ('officer', 'evaluator', 'admin')),
    UNIQUE (tender_id, role)
);

-- Seed: admin role has access to all tenders (wildcard)
INSERT INTO vault_access (tender_id, role, granted_by)
VALUES ('*', 'admin', 'system_init');

CREATE INDEX idx_vault_access_tender ON vault_access(tender_id);
CREATE INDEX idx_vault_access_role   ON vault_access(role);