/**
 * User Usage Filtering (Story 9.8)
 *
 * Helpers for filtering graph metrics by user scope.
 * Filters metrics to only include tools the user has actually executed.
 *
 * @module graphrag/user-usage
 */

import type { DbClient } from "../db/types.ts";
import type { GraphSnapshot } from "./core/graph-store.ts";

// Re-export for convenience
export type { GraphSnapshot };

// Extract node and edge types from GraphSnapshot for internal use
type SnapshotNode = GraphSnapshot["nodes"][number];
type SnapshotEdge = GraphSnapshot["edges"][number];

/**
 * Scope for metrics filtering
 * - user: Only tools executed by current user
 * - system: All tools executed by any user (but still excludes never-used)
 */
export type Scope = "user" | "system";

/**
 * Get tool IDs that have been executed (base filter - excludes never-used)
 *
 * This is the core filter for Story 9.8:
 * - scope=user: Tools executed by the specific user
 * - scope=system: Tools executed by any user (but NOT tools never executed)
 *
 * @param db - Database client
 * @param scope - "user" or "system"
 * @param userId - Required when scope is "user"
 * @returns Set of tool_key values that have been executed
 *
 * @example
 * ```typescript
 * const executedIds = await getExecutedToolIds(db, "user", "user-123");
 * // Returns Set { "mcp-tool-1", "mcp-tool-2" }
 * ```
 */
export async function getExecutedToolIds(
  db: DbClient,
  scope: Scope,
  userId?: string,
): Promise<Set<string>> {
  let rows;

  if (scope === "user") {
    if (!userId) {
      // No userId provided, return empty set
      return new Set();
    }
    // Get tool_keys from task_results JSONB array for this user
    // Use subquery to ensure WHERE filter applies BEFORE jsonb_array_elements
    // (PostgreSQL can evaluate set-returning functions before WHERE otherwise)
    rows = await db.query(
      `SELECT DISTINCT elem->>'tool' AS tool_key
       FROM (
         SELECT task_results
         FROM execution_trace
         WHERE user_id = $1
           AND task_results IS NOT NULL
           AND jsonb_typeof(task_results) = 'array'
           AND jsonb_array_length(task_results) > 0
       ) filtered,
       jsonb_array_elements(filtered.task_results) AS elem`,
      [userId],
    );
  } else {
    // scope === "system" - all users but still only executed tools
    rows = await db.query(
      `SELECT DISTINCT elem->>'tool' AS tool_key
       FROM (
         SELECT task_results
         FROM execution_trace
         WHERE task_results IS NOT NULL
           AND jsonb_typeof(task_results) = 'array'
           AND jsonb_array_length(task_results) > 0
       ) filtered,
       jsonb_array_elements(filtered.task_results) AS elem`,
    );
  }

  const toolKeys = new Set<string>();
  for (const row of rows) {
    const toolKey = row.tool_key as string | null;
    if (toolKey) {
      toolKeys.add(toolKey);
    }
  }

  return toolKeys;
}

/**
 * Filter graph snapshot to only include executed tools
 *
 * Given a full graph snapshot and a set of executed tool IDs,
 * returns a filtered snapshot containing only:
 * - Nodes whose IDs are in the executed set
 * - Edges where both source and target are in the filtered nodes
 *
 * This ensures metrics (entropy, stability, diversity) are calculated
 * only on tools the user has actually interacted with.
 *
 * @param snapshot - Full graph snapshot from graphEngine.getGraphSnapshot()
 * @param executedToolIds - Set of tool IDs to include
 * @returns Filtered snapshot with only executed tools
 *
 * @example
 * ```typescript
 * const fullSnapshot = graphEngine.getGraphSnapshot();
 * const executedIds = await getExecutedToolIds(db, "user", userId);
 * const filtered = filterSnapshotByExecution(fullSnapshot, executedIds);
 * // filtered.nodes contains only nodes the user has used
 * ```
 */
export function filterSnapshotByExecution(
  snapshot: GraphSnapshot,
  executedToolIds: Set<string>,
): GraphSnapshot {
  // Filter nodes to only include executed tools
  const filteredNodes: SnapshotNode[] = snapshot.nodes.filter(
    (node) => executedToolIds.has(node.id),
  );

  // Build set of filtered node IDs for edge filtering
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

  // Filter edges to only include those where both endpoints are in filtered nodes
  const filteredEdges: SnapshotEdge[] = snapshot.edges.filter(
    (edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target),
  );

  return {
    ...snapshot,
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

/**
 * Get capabilities for current user only (AC #5)
 *
 * Returns capabilities that the user either:
 * - Created (created_by = userId)
 * - Used (appears in execution_trace.capability_id for this user)
 *
 * This is always filtered by user - no "system" scope toggle for capabilities.
 *
 * @param db - Database client
 * @param userId - User identifier
 * @returns Array of capability records
 */
export async function getUserCapabilities(
  db: DbClient,
  userId: string,
): Promise<unknown[]> {
  return db.query(
    `SELECT * FROM workflow_pattern
     WHERE created_by = $1
        OR pattern_id IN (
          SELECT DISTINCT capability_id
          FROM execution_trace
          WHERE user_id = $1 AND capability_id IS NOT NULL
        )
     ORDER BY created_at DESC`,
    [userId],
  );
}

/**
 * Check if scope filtering should be equivalent (local mode)
 *
 * In local mode (userId = "local"), "My usage" and "System" return
 * the same results because there's only one user.
 *
 * @param userId - Current user identifier
 * @returns true if in local mode (single user)
 */
export function isLocalMode(userId?: string): boolean {
  return !userId || userId === "local";
}
