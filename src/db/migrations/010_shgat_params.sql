-- Migration 010: SHGAT Parameters Persistence
-- Story 10.7b: Save/load SHGAT weights between server restarts
--
-- Design decisions (2025-12-23):
-- - One row per user_id (UPSERT pattern)
-- - params JSONB stores exportParams() output
-- - Multi-tenant ready

CREATE TABLE IF NOT EXISTS shgat_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'local' UNIQUE,
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by user_id
CREATE INDEX IF NOT EXISTS idx_shgat_params_user_id ON shgat_params(user_id);

-- Comment for documentation
COMMENT ON TABLE shgat_params IS 'Persisted SHGAT attention weights for capability matching (Story 10.7b)';
