/**
 * Migration 038: Add user_id to algorithm_traces (Story 9.8 - Multi-tenant isolation)
 *
 * Adds user_id column to algorithm_traces table for filtering traces by user.
 * Enables per-user view of algorithm traces in the TracingPanel.
 *
 * @module db/migrations/038_algorithm_traces_user_id
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createAlgorithmTracesUserIdMigration(): Migration {
  return {
    version: 38,
    name: "algorithm_traces_user_id",
    up: async (db: DbClient) => {
      // Add user_id column (nullable for backward compatibility with existing traces)
      await db.exec(`
        ALTER TABLE algorithm_traces
        ADD COLUMN IF NOT EXISTS user_id TEXT
      `);

      log.info("Migration 038: user_id column added to algorithm_traces");

      // Index for filtering by user_id
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_algorithm_traces_user_id
        ON algorithm_traces(user_id)
      `);

      log.info("Migration 038: idx_algorithm_traces_user_id index created");

      log.info("✓ Migration 038 complete: algorithm_traces user_id for multi-tenant isolation");
    },

    down: async (db: DbClient) => {
      await db.exec("DROP INDEX IF EXISTS idx_algorithm_traces_user_id");
      await db.exec("ALTER TABLE algorithm_traces DROP COLUMN IF EXISTS user_id");

      log.info("Migration 038 rolled back");
    },
  };
}
