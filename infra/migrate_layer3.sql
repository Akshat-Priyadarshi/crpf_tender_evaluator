-- migrate_layer3.sql
-- Run this ONCE against the running crpf_postgres container:
--
--   docker exec -i crpf_postgres psql -U crpf -d crpf_ingestion < infra/migrate_layer3.sql
--
-- This creates the evaluation_jobs table which stores:
--   - both extracted text strings (tender + bidder)
--   - the threshold value typed by the officer
--   - upload timestamps for both documents
--   - status so the next evaluation stage can pick it up
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evaluation_jobs (

    -- Primary key
    id                      BIGSERIAL PRIMARY KEY,

    -- Job identity
    job_id                  UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Tender document linkage
    tender_document_hash    VARCHAR(64) NOT NULL
                                REFERENCES documents(document_hash),
    tender_filename         TEXT NOT NULL,
    tender_uploaded_at      TIMESTAMPTZ NOT NULL,   -- exact timestamp from DB at ingest time
    tender_text             TEXT NOT NULL,           -- full extracted string
    tender_extraction_method VARCHAR(32) NOT NULL,   -- "pdfplumber" | "doctr_ocr" | "python_docx" | "doctr_image"

    -- Bidder document linkage
    bidder_document_hash    VARCHAR(64) NOT NULL
                                REFERENCES documents(document_hash),
    bidder_filename         TEXT NOT NULL,
    bidder_uploaded_at      TIMESTAMPTZ NOT NULL,
    bidder_text             TEXT NOT NULL,
    bidder_extraction_method VARCHAR(32) NOT NULL,

    -- Officer-supplied threshold
    threshold_value         NUMERIC(20, 4) NOT NULL,  -- supports both integer and decimal thresholds
    threshold_unit          TEXT,                      -- optional: "INR", "percent", "count" — for display

    -- Tender metadata (copied for convenience so the evaluator doesn't need a JOIN)
    tender_id               TEXT,
    bidder_id               TEXT,
    actor_role              VARCHAR(32),

    -- Job lifecycle
    -- "pending"    → row created, waiting for evaluation stage to pick up
    -- "processing" → evaluation stage has started
    -- "completed"  → evaluation stage wrote results
    -- "failed"     → evaluation stage encountered an error
    status                  VARCHAR(16) NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Error detail (filled by evaluation stage if status = 'failed')
    error_detail            TEXT
);

-- Indexes — the evaluation stage will query by status and by job_id
CREATE INDEX IF NOT EXISTS idx_eval_jobs_status    ON evaluation_jobs (status);
CREATE INDEX IF NOT EXISTS idx_eval_jobs_job_id    ON evaluation_jobs (job_id);
CREATE INDEX IF NOT EXISTS idx_eval_jobs_tender    ON evaluation_jobs (tender_id);
CREATE INDEX IF NOT EXISTS idx_eval_jobs_bidder    ON evaluation_jobs (bidder_id);
CREATE INDEX IF NOT EXISTS idx_eval_jobs_created   ON evaluation_jobs (created_at DESC);

-- Auto-update updated_at on every row change
-- (PostgreSQL does not do this automatically unlike MySQL)
CREATE OR REPLACE FUNCTION update_eval_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eval_jobs_updated_at ON evaluation_jobs;
CREATE TRIGGER trg_eval_jobs_updated_at
    BEFORE UPDATE ON evaluation_jobs
    FOR EACH ROW EXECUTE FUNCTION update_eval_jobs_updated_at();

-- Verify
SELECT 'evaluation_jobs table created successfully.' AS result;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'evaluation_jobs'
ORDER BY ordinal_position;