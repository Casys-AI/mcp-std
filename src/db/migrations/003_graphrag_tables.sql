-- Migration 003: GraphRAG Tables for Epic 2
-- Adds tables for workflow execution history, patterns, and tool dependencies

-- ============================================
-- Workflow execution history
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_execution (
  execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at TIMESTAMP DEFAULT NOW(),
  intent_text TEXT,
  dag_structure JSONB NOT NULL,
  success BOOLEAN NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_execution_timestamp
ON workflow_execution(executed_at DESC);

-- ============================================
-- Workflow patterns (for semantic search)
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_pattern (
  pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_hash TEXT UNIQUE NOT NULL,
  dag_structure JSONB NOT NULL,
  intent_embedding vector(1024) NOT NULL,
  usage_count INTEGER DEFAULT 1,
  success_count INTEGER DEFAULT 0,
  last_used TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_intent_embedding
ON workflow_pattern USING hnsw (intent_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================
-- Tool dependencies (SIMPLE - just storage)
-- Graphology does all the graph computations
-- ============================================
CREATE TABLE IF NOT EXISTS tool_dependency (
  from_tool_id TEXT NOT NULL,
  to_tool_id TEXT NOT NULL,
  observed_count INTEGER DEFAULT 1,
  confidence_score REAL DEFAULT 0.5,
  last_observed TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (from_tool_id, to_tool_id)
);

CREATE INDEX IF NOT EXISTS idx_dependency_from
ON tool_dependency(from_tool_id);

CREATE INDEX IF NOT EXISTS idx_dependency_to
ON tool_dependency(to_tool_id);

-- ============================================
-- Adaptive threshold configuration
-- Persists learned thresholds across restarts
-- ============================================
CREATE TABLE IF NOT EXISTS adaptive_config (
  config_key TEXT PRIMARY KEY,
  config_value REAL NOT NULL,
  last_updated TIMESTAMP DEFAULT NOW(),
  total_samples INTEGER DEFAULT 0
);

-- Initialize default thresholds
INSERT INTO adaptive_config (config_key, config_value, total_samples)
VALUES
  ('threshold_speculative', 0.85, 0),
  ('threshold_suggestion', 0.70, 0),
  ('threshold_explicit', 0.70, 0)
ON CONFLICT (config_key) DO NOTHING;
