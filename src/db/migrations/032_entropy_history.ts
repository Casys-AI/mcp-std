/**
 * Migration 032: Entropy History Table
 *
 * Creates a table to persist entropy metrics over time for trend analysis.
 * Supports both structural (Von Neumann) and semantic entropy tracking.
 *
 * @see arxiv:2503.18852 - Structural + Semantic dual entropy
 * @see Chen & Rajapakse 2020 - Tensor Entropy for Hypergraphs
 */

import type { DbClient } from "../types.ts";
import * as log from "@std/log";

const MIGRATION_NAME = "032_entropy_history";

export async function up(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Creating entropy_history table...`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS entropy_history (
      id SERIAL PRIMARY KEY,

      -- Timestamp for trend analysis
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      -- Structural entropy metrics (Von Neumann / Laplacian-based)
      von_neumann_entropy REAL NOT NULL,
      structural_entropy REAL NOT NULL,
      normalized_entropy REAL NOT NULL,

      -- Semantic entropy metrics (embedding diversity)
      semantic_entropy REAL,
      semantic_diversity REAL,
      avg_cosine_similarity REAL,

      -- Combined dual entropy
      dual_entropy REAL,

      -- Health classification at this point
      health_status TEXT NOT NULL CHECK (health_status IN ('rigid', 'healthy', 'chaotic')),

      -- Size-adjusted thresholds used
      threshold_low REAL NOT NULL,
      threshold_high REAL NOT NULL,

      -- Graph statistics for context
      node_count INTEGER NOT NULL,
      edge_count INTEGER NOT NULL,
      hyperedge_count INTEGER NOT NULL DEFAULT 0,

      -- Entropy by hyperedge order (JSON: {"2": 0.5, "3": 0.7, ...})
      entropy_by_order JSONB,

      -- Optional user context
      user_id TEXT,

      -- Computation metadata
      compute_time_ms REAL
    );

    -- Index for time-series queries
    CREATE INDEX IF NOT EXISTS idx_entropy_history_recorded_at
    ON entropy_history(recorded_at DESC);

    -- Index for per-user trends
    CREATE INDEX IF NOT EXISTS idx_entropy_history_user_time
    ON entropy_history(user_id, recorded_at DESC)
    WHERE user_id IS NOT NULL;

    -- Index for health status filtering
    CREATE INDEX IF NOT EXISTS idx_entropy_history_health
    ON entropy_history(health_status, recorded_at DESC);
  `);

  log.info(`[${MIGRATION_NAME}] Created entropy_history table with indexes`);
}

export async function down(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Dropping entropy_history table...`);

  await db.exec(`
    DROP INDEX IF EXISTS idx_entropy_history_health;
    DROP INDEX IF EXISTS idx_entropy_history_user_time;
    DROP INDEX IF EXISTS idx_entropy_history_recorded_at;
    DROP TABLE IF EXISTS entropy_history;
  `);

  log.info(`[${MIGRATION_NAME}] Dropped entropy_history table`);
}
