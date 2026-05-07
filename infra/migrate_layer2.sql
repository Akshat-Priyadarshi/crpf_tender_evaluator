-- =============================================================
-- Layer 2 Migration: Create extracted_criteria table
-- Run this ONCE against your running PostgreSQL container.
--
-- Command to run:
--   docker exec -i crpf_postgres psql -U crpf -d crpf_ingestion < infra/migrate_layer2.sql
-- =============================================================

-- Drop if exists (safe re-run)
DROP TABLE IF EXISTS extracted_criteria;

CREATE TABLE extracted_criteria (
    id               SERIAL PRIMARY KEY,
    document_hash    VARCHAR(64)  NOT NULL,
    criterion_id     VARCHAR(16)  NOT NULL,
    extracted_value  TEXT,
    bbox_coordinates TEXT,        -- JSON: {"page": N, "x0": N, "y0": N, "x1": N, "y1": N}
    confidence_score FLOAT,
    context_snippet  TEXT,
    extraction_method VARCHAR(32) DEFAULT 'llm',
    ai_model_version VARCHAR(64),
    page_number      INTEGER,

    -- Human-in-the-loop
    is_human_verified  BOOLEAN DEFAULT FALSE,
    human_override_val TEXT,
    human_override_at  TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_extracted_hash      ON extracted_criteria(document_hash);
CREATE INDEX idx_extracted_criterion ON extracted_criteria(criterion_id);

-- Confirm it worked
SELECT 'extracted_criteria table created successfully.' AS status;
\dt