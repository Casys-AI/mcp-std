-- Migration 009: Add source column to tool_dependency (Story 5.2)
-- Tracks where the dependency came from: 'user' (YAML templates) or 'learned' (execution history)

-- Add source column with default 'learned' for existing rows
ALTER TABLE tool_dependency ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'learned';

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_tool_dependency_source ON tool_dependency(source);
