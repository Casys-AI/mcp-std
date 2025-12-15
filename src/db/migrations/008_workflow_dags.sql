-- Migration 008: Workflow DAG Persistence
-- Created: 2025-11-25
-- Purpose: Store DAGs for MCP stateless continuation (Story 2.5-4)
-- Spike: docs/spikes/spike-mcp-workflow-state-persistence.md (Option C)

-- Workflow DAGs table: Stores DAG structure separately from checkpoints
-- One workflow = one DAG (no duplication across checkpoints)
CREATE TABLE IF NOT EXISTS workflow_dags (
  -- Primary identifier: workflow_id (same as in checkpoints)
  workflow_id TEXT PRIMARY KEY,

  -- DAG structure: Complete DAGStructure serialized to JSONB
  -- Contains: { intent, tasks[], metadata }
  dag JSONB NOT NULL,

  -- Intent text: For debug/observability
  intent TEXT,

  -- Created timestamp: Auto-generated for ordering
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Expiration: Auto-cleanup for stale workflows (1 hour TTL)
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

-- Index for efficient cleanup of expired DAGs
CREATE INDEX IF NOT EXISTS idx_workflow_dags_expires
  ON workflow_dags(expires_at);

-- Comments for schema documentation
COMMENT ON TABLE workflow_dags IS
  'Stores DAG structures for MCP stateless workflow continuation. TTL: 1 hour. Spike Option C.';
COMMENT ON COLUMN workflow_dags.dag IS
  'JSONB serialization of DAGStructure (intent, tasks[], metadata). Required for resumeFromCheckpoint().';
COMMENT ON COLUMN workflow_dags.expires_at IS
  'Auto-cleanup timestamp. DAGs past this time are eligible for deletion by cleanupExpiredDAGs().';
