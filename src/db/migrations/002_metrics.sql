-- Migration 002: Metrics Table
-- Created: 2025-11-04
-- Purpose: Track context usage, query latency, and cache performance metrics

-- Metrics table: Store performance and usage metrics
CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL,
  value REAL NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Indexes for efficient metric queries
CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(metric_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);

-- Comments for documentation
COMMENT ON TABLE metrics IS 'Performance and usage metrics for context optimization';
COMMENT ON COLUMN metrics.metric_name IS 'Metric name: context_usage_pct, query_latency_ms, tools_loaded_count, cache_hit_rate';
COMMENT ON COLUMN metrics.value IS 'Numeric metric value';
COMMENT ON COLUMN metrics.metadata IS 'Additional context (e.g., query text, tool IDs)';
