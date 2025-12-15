-- Migration 007: Episodic Memory & Adaptive Thresholds Persistence
-- Created: 2025-11-25
-- Purpose: Enable episodic memory storage and adaptive threshold persistence (ADR-008 Phase 1)
-- Story: 4.1a Schema PGlite (Epic 4 Phase 1)

-- ============================================================================
-- Table 1: episodic_events
-- Stores workflow execution events for contextual learning retrieval
-- Hybrid schema: typed columns for fast queries + JSONB for flexible data
-- ============================================================================

CREATE TABLE IF NOT EXISTS episodic_events (
  -- Primary identifier: UUID v4
  id TEXT PRIMARY KEY,

  -- Workflow grouping: Links events to specific workflow instances
  workflow_id TEXT NOT NULL,

  -- Event type: Typed for fast filtering
  event_type TEXT NOT NULL,

  -- Task reference: Optional, for task-level events
  task_id TEXT,

  -- Timestamp: For ordering and pruning
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Context hash: For fast exact-match retrieval (MVP strategy per ADR-008)
  context_hash TEXT,

  -- Flexible event data: JSONB for event-specific payload
  -- Contains: prediction, result, decision, context depending on event_type
  data JSONB NOT NULL,

  -- Validation constraints
  CONSTRAINT chk_event_type CHECK (
    event_type IN ('speculation_start', 'task_complete', 'ail_decision', 'hil_decision', 'workflow_start', 'workflow_complete')
  )
);

-- Index for workflow event retrieval (common query pattern)
CREATE INDEX IF NOT EXISTS idx_episodic_workflow
  ON episodic_events(workflow_id);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_episodic_type
  ON episodic_events(event_type);

-- Index for temporal queries and pruning
CREATE INDEX IF NOT EXISTS idx_episodic_timestamp
  ON episodic_events(timestamp DESC);

-- Index for context-based retrieval (hash matching per ADR-008)
CREATE INDEX IF NOT EXISTS idx_episodic_context_hash
  ON episodic_events(context_hash);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_episodic_data
  ON episodic_events USING GIN (data);

-- ============================================================================
-- Table 2: adaptive_thresholds
-- Persists learned thresholds per context (survives server restarts)
-- Extends Story 4.2 in-memory implementation with disk persistence
-- ============================================================================

CREATE TABLE IF NOT EXISTS adaptive_thresholds (
  -- Context hash: Primary key for lookup
  context_hash TEXT PRIMARY KEY,

  -- Context keys: JSONB for flexible context definition
  context_keys JSONB NOT NULL,

  -- Learned thresholds
  suggestion_threshold REAL NOT NULL DEFAULT 0.70,
  explicit_threshold REAL NOT NULL DEFAULT 0.50,

  -- Learning metrics
  success_rate REAL,
  sample_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation constraints (per ADR-008 bounds)
  CONSTRAINT chk_suggestion_threshold CHECK (suggestion_threshold >= 0.40 AND suggestion_threshold <= 0.90),
  CONSTRAINT chk_explicit_threshold CHECK (explicit_threshold >= 0.30 AND explicit_threshold <= 0.80),
  CONSTRAINT chk_success_rate CHECK (success_rate IS NULL OR (success_rate >= 0.0 AND success_rate <= 1.0))
);

-- Index for recent updates (monitoring)
CREATE INDEX IF NOT EXISTS idx_adaptive_updated
  ON adaptive_thresholds(updated_at DESC);

-- GIN index for context keys queries
CREATE INDEX IF NOT EXISTS idx_adaptive_context_keys
  ON adaptive_thresholds USING GIN (context_keys);

-- ============================================================================
-- Comments for schema documentation
-- ============================================================================

COMMENT ON TABLE episodic_events IS
  'Stores workflow execution events for episodic memory retrieval. Retention: 30 days or 10,000 events per ADR-008.';

COMMENT ON COLUMN episodic_events.context_hash IS
  'Hash of context keys (workflowType, domain, complexity) for fast exact-match retrieval.';

COMMENT ON COLUMN episodic_events.data IS
  'JSONB payload containing event-specific data: prediction, result, decision, or context.';

COMMENT ON TABLE adaptive_thresholds IS
  'Persists learned confidence thresholds per context. Extends in-memory AdaptiveThresholdManager.';

COMMENT ON COLUMN adaptive_thresholds.context_hash IS
  'Hash of context keys for lookup. Format: "workflowType:X|domain:Y|complexity:Z"';
