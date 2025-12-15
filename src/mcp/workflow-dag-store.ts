/**
 * Workflow DAG Store
 *
 * Persistence layer for DAG structures in MCP stateless workflows.
 * Story 2.5-4: MCP Control Tools & Per-Layer Validation
 *
 * Spike Decision: Option C - Separate table (not in checkpoints)
 * See: docs/spikes/spike-mcp-workflow-state-persistence.md
 *
 * Flow:
 * 1. execute(intent, per_layer_validation: true)
 *    → saveWorkflowDAG(db, workflow_id, dag, intent)
 * 2. continue(workflow_id)
 *    → getWorkflowDAG(db, workflow_id)
 *    → resumeFromCheckpoint(dag, checkpoint_id)
 * 3. Cleanup: deleteWorkflowDAG or cleanupExpiredDAGs
 *
 * @module mcp/workflow-dag-store
 */

import type { PGliteClient } from "../db/client.ts";
import type { DAGStructure } from "../graphrag/types.ts";
import * as log from "@std/log";

/**
 * Workflow DAG record from database
 */
export interface WorkflowDAGRecord {
  workflow_id: string;
  dag: DAGStructure;
  intent: string | null;
  created_at: Date;
  expires_at: Date;
}

/**
 * Save workflow DAG to database
 *
 * Called at the start of per_layer_validation workflow to persist
 * the DAG for stateless MCP continuation.
 *
 * @param db - PGlite database client
 * @param workflowId - Unique workflow identifier
 * @param dag - DAG structure to persist
 * @param intent - Original intent text (for observability)
 * @returns Promise resolving when saved
 */
export async function saveWorkflowDAG(
  db: PGliteClient,
  workflowId: string,
  dag: DAGStructure,
  intent: string = "",
): Promise<void> {
  // Use parameterized query to prevent SQL injection
  await db.query(
    `INSERT INTO workflow_dags (workflow_id, dag, intent)
     VALUES ($1, $2, $3)
     ON CONFLICT (workflow_id) DO UPDATE SET
       dag = EXCLUDED.dag,
       intent = EXCLUDED.intent,
       created_at = NOW(),
       expires_at = NOW() + INTERVAL '1 hour'`,
    [workflowId, dag, intent],
  );

  log.debug(`Saved DAG for workflow ${workflowId} (${dag.tasks.length} tasks)`);
}

/**
 * Get workflow DAG from database
 *
 * Called by continue/replan handlers to retrieve the DAG
 * for resumeFromCheckpoint().
 *
 * @param db - PGlite database client
 * @param workflowId - Workflow identifier
 * @returns DAG structure or null if not found/expired
 */
export async function getWorkflowDAG(
  db: PGliteClient,
  workflowId: string,
): Promise<DAGStructure | null> {
  const rows = await db.query(
    `SELECT dag FROM workflow_dags
     WHERE workflow_id = $1
     AND expires_at > NOW()`,
    [workflowId],
  );

  if (rows.length === 0) {
    log.debug(`DAG not found for workflow ${workflowId}`);
    return null;
  }

  const dag = rows[0].dag as DAGStructure;
  log.debug(`Retrieved DAG for workflow ${workflowId} (${dag.tasks.length} tasks)`);
  return dag;
}

/**
 * Get full workflow DAG record with metadata
 *
 * @param db - PGlite database client
 * @param workflowId - Workflow identifier
 * @returns Full record or null if not found/expired
 */
export async function getWorkflowDAGRecord(
  db: PGliteClient,
  workflowId: string,
): Promise<WorkflowDAGRecord | null> {
  const rows = await db.query(
    `SELECT workflow_id, dag, intent, created_at, expires_at FROM workflow_dags
     WHERE workflow_id = $1
     AND expires_at > NOW()`,
    [workflowId],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    workflow_id: row.workflow_id as string,
    dag: row.dag as DAGStructure,
    intent: row.intent as string | null,
    created_at: new Date(row.created_at as string),
    expires_at: new Date(row.expires_at as string),
  };
}

/**
 * Update workflow DAG (for replanning)
 *
 * @param db - PGlite database client
 * @param workflowId - Workflow identifier
 * @param dag - Updated DAG structure
 * @returns Promise resolving when updated
 * @throws Error if workflow not found
 */
export async function updateWorkflowDAG(
  db: PGliteClient,
  workflowId: string,
  dag: DAGStructure,
): Promise<void> {
  // First check if workflow exists
  const existing = await db.query(
    `SELECT workflow_id FROM workflow_dags WHERE workflow_id = $1`,
    [workflowId],
  );

  if (existing.length === 0) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  await db.query(
    `UPDATE workflow_dags
     SET dag = $1,
         expires_at = NOW() + INTERVAL '1 hour'
     WHERE workflow_id = $2`,
    [dag, workflowId],
  );

  log.debug(`Updated DAG for workflow ${workflowId}`);
}

/**
 * Delete workflow DAG from database
 *
 * Called after workflow completes or is aborted to clean up.
 *
 * @param db - PGlite database client
 * @param workflowId - Workflow identifier
 * @returns Promise resolving when deleted
 */
export async function deleteWorkflowDAG(
  db: PGliteClient,
  workflowId: string,
): Promise<void> {
  await db.query(`DELETE FROM workflow_dags WHERE workflow_id = $1`, [workflowId]);
  log.debug(`Deleted DAG for workflow ${workflowId}`);
}

/**
 * Cleanup expired DAGs from database
 *
 * Removes DAGs past their expires_at timestamp.
 * Called periodically or on-demand for housekeeping.
 *
 * @param db - PGlite database client
 * @returns Number of DAGs deleted
 */
export async function cleanupExpiredDAGs(db: PGliteClient): Promise<number> {
  // Count expired DAGs first
  const countResult = await db.query(
    `SELECT COUNT(*) as count FROM workflow_dags WHERE expires_at <= NOW()`,
  );
  const count = Number(countResult[0]?.count ?? 0);

  if (count > 0) {
    await db.exec(`DELETE FROM workflow_dags WHERE expires_at <= NOW()`);
    log.info(`Cleaned up ${count} expired workflow DAGs`);
  }

  return count;
}

/**
 * Extend workflow DAG expiration
 *
 * Called on continue/replan to extend TTL.
 *
 * @param db - PGlite database client
 * @param workflowId - Workflow identifier
 * @returns Promise resolving when extended
 */
export async function extendWorkflowDAGExpiration(
  db: PGliteClient,
  workflowId: string,
): Promise<void> {
  await db.query(
    `UPDATE workflow_dags
     SET expires_at = NOW() + INTERVAL '1 hour'
     WHERE workflow_id = $1`,
    [workflowId],
  );
  log.debug(`Extended expiration for workflow ${workflowId}`);
}
