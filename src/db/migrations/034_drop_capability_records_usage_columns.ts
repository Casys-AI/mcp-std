/**
 * Migration 034: Drop unused usage columns from capability_records
 *
 * Bug found Dec 2024: capability_records.usage_count and success_count
 * were NEVER updated. The actual counts live in workflow_pattern table.
 *
 * - updateUsage() in capability-store.ts writes to workflow_pattern
 * - All queries now JOIN with workflow_pattern to get accurate counts
 * - These columns in capability_records are redundant and always 0
 *
 * This migration removes the unused columns to avoid confusion.
 */

import type { DbClient } from "../types.ts";

export const version = 34;

export async function up(db: DbClient): Promise<void> {
  // Drop the unused columns from capability_records
  // The actual usage data is in workflow_pattern table
  await db.query(`
    ALTER TABLE capability_records
    DROP COLUMN IF EXISTS usage_count,
    DROP COLUMN IF EXISTS success_count,
    DROP COLUMN IF EXISTS total_latency_ms
  `);

  // Add comment to explain where usage data lives
  await db.query(`
    COMMENT ON TABLE capability_records IS
    'Registry for named capabilities. Usage stats live in workflow_pattern (linked via workflow_pattern_id FK).'
  `);
}

export async function down(db: DbClient): Promise<void> {
  // Restore the columns (will be 0, but maintains backward compatibility)
  await db.query(`
    ALTER TABLE capability_records
    ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_latency_ms BIGINT NOT NULL DEFAULT 0
  `);

  await db.query(`
    COMMENT ON TABLE capability_records IS NULL
  `);
}
