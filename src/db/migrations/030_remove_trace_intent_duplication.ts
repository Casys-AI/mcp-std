/**
 * Migration 030: Remove Intent Duplication from execution_trace
 *
 * Story 11.x: Removes redundant intent_text and intent_embedding columns.
 *
 * Problem:
 * - execution_trace was storing intent_text and intent_embedding directly
 * - When renaming a capability, traces kept old values → training inconsistency
 * - The capability_id FK to workflow_pattern already provides access to these values
 *
 * Solution:
 * - Remove intent_text column (redundant with workflow_pattern.description)
 * - Remove intent_embedding column (redundant with workflow_pattern.intent_embedding)
 * - Queries will JOIN on workflow_pattern to get current values dynamically
 *
 * Benefits:
 * - No data duplication
 * - Renaming a capability instantly updates all associated traces
 * - Perfect consistency for SHGAT training
 *
 * @module db/migrations/030_remove_trace_intent_duplication
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createRemoveTraceIntentDuplicationMigration(): Migration {
  return {
    version: 30,
    name: "remove_trace_intent_duplication",
    up: async (db: DbClient) => {
      log.info("Migration 030: Removing intent duplication from execution_trace...");

      // 1. Drop HNSW index on intent_embedding
      await db.exec(`
        DROP INDEX IF EXISTS idx_exec_trace_intent_embedding
      `);
      log.info("  ✓ Dropped idx_exec_trace_intent_embedding index");

      // 2. Drop intent_embedding column
      await db.exec(`
        ALTER TABLE execution_trace
        DROP COLUMN IF EXISTS intent_embedding
      `);
      log.info("  ✓ Dropped intent_embedding column");

      // 3. Drop intent_text column
      await db.exec(`
        ALTER TABLE execution_trace
        DROP COLUMN IF EXISTS intent_text
      `);
      log.info("  ✓ Dropped intent_text column");

      // 4. Add comment explaining the change
      try {
        await db.exec(`
          COMMENT ON TABLE execution_trace IS
            'Execution traces for learning. Intent data retrieved via JOIN on workflow_pattern.capability_id.'
        `);
      } catch {
        // Comments are optional
      }

      log.info("✓ Migration 030 complete: intent duplication removed");
      log.info(
        "  → Use LEFT JOIN workflow_pattern ON pattern_id = capability_id to get intent data",
      );
    },
    down: async (db: DbClient) => {
      log.info("Migration 030 rollback: Restoring intent columns...");

      // 1. Restore intent_text column
      await db.exec(`
        ALTER TABLE execution_trace
        ADD COLUMN IF NOT EXISTS intent_text TEXT
      `);
      log.info("  ✓ Restored intent_text column");

      // 2. Restore intent_embedding column
      await db.exec(`
        ALTER TABLE execution_trace
        ADD COLUMN IF NOT EXISTS intent_embedding vector(1024)
      `);
      log.info("  ✓ Restored intent_embedding column");

      // 3. Restore HNSW index
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_exec_trace_intent_embedding
        ON execution_trace
        USING hnsw (intent_embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      log.info("  ✓ Restored idx_exec_trace_intent_embedding index");

      // Note: Data cannot be restored - this is a lossy rollback
      log.warn("  ⚠ Intent data was lost and cannot be restored from rollback");

      log.info("Migration 030 rollback complete");
    },
  };
}
