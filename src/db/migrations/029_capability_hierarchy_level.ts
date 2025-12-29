/**
 * Migration 029: Capability Hierarchy Level (Story 10.1)
 *
 * Adds `hierarchy_level` column to workflow_pattern for tracking
 * capability nesting depth.
 *
 * Level meanings:
 * - 0: Leaf capability (uses only MCP tools, no nested capabilities)
 * - 1: Contains level-0 capabilities
 * - 2: Contains level-1 capabilities
 * - N: Contains level-(N-1) capabilities
 *
 * This enables proper compound node visualization where capabilities
 * can contain other capabilities recursively.
 *
 * @module db/migrations/029_capability_hierarchy_level
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createCapabilityHierarchyLevelMigration(): Migration {
  return {
    version: 29,
    name: "capability_hierarchy_level",
    up: async (db: DbClient) => {
      log.info("Migration 029: Adding hierarchy_level to workflow_pattern...");

      // ============================================
      // 1. Add hierarchy_level column
      // ============================================
      await db.exec(`
        ALTER TABLE workflow_pattern
        ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0
      `);
      log.info("  ✓ Added hierarchy_level column (default 0)");

      // ============================================
      // 2. Create index for filtering by level
      // ============================================
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_workflow_pattern_hierarchy_level
        ON workflow_pattern(hierarchy_level)
        WHERE hierarchy_level > 0
      `);
      log.info("  ✓ Created index on hierarchy_level");

      // ============================================
      // 3. Update existing capabilities based on contains edges
      // ============================================
      // Recursive CTE to calculate max depth for each capability
      await db.exec(`
        WITH RECURSIVE capability_depth AS (
          -- Base case: capabilities with no children (leaf nodes)
          SELECT
            wp.pattern_id,
            0 as depth
          FROM workflow_pattern wp
          WHERE wp.code_hash IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM capability_dependency cd
              WHERE cd.from_capability_id = wp.pattern_id
                AND cd.edge_type = 'contains'
            )

          UNION ALL

          -- Recursive case: parent depth = max(child depth) + 1
          SELECT
            cd.from_capability_id as pattern_id,
            cap_depth.depth + 1 as depth
          FROM capability_dependency cd
          JOIN capability_depth cap_depth ON cd.to_capability_id = cap_depth.pattern_id
          WHERE cd.edge_type = 'contains'
        ),
        max_depths AS (
          SELECT pattern_id, MAX(depth) as max_depth
          FROM capability_depth
          GROUP BY pattern_id
        )
        UPDATE workflow_pattern wp
        SET hierarchy_level = md.max_depth
        FROM max_depths md
        WHERE wp.pattern_id = md.pattern_id
          AND md.max_depth > 0
      `);
      log.info("  ✓ Updated hierarchy_level for existing capabilities");

      log.info("✓ Migration 029 complete: Capability hierarchy level");
    },
    down: async (db: DbClient) => {
      await db.exec("DROP INDEX IF EXISTS idx_workflow_pattern_hierarchy_level");
      await db.exec("ALTER TABLE workflow_pattern DROP COLUMN IF EXISTS hierarchy_level");
      log.info("Migration 029 rolled back");
    },
  };
}
