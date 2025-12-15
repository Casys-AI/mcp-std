/**
 * Integration tests for Checkpoint Persistence
 *
 * Tests:
 * - Checkpoints saved after each layer execution
 * - Checkpoint events emitted correctly
 * - Checkpoint save failure handling (execution continues)
 * - Pruning integration with saves
 *
 * @module tests/integration/dag/checkpoint_integration_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { ControlledExecutor } from "../../../src/dag/controlled-executor.ts";
import type { DAGStructure } from "../../../src/graphrag/types.ts";
import type { ExecutionEvent } from "../../../src/dag/types.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

/**
 * Setup test database with migrations
 */
async function setupTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(":memory:");
  await db.connect();
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());
  return db;
}

/**
 * Mock tool executor for testing
 */
async function mockToolExecutor(
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Simulate tool execution
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { tool, args, result: `executed ${tool}` };
}

Deno.test("Checkpoint Integration - ControlledExecutor", async (t) => {
  let db: PGliteClient;

  try {
    db = await setupTestDb();
  } finally {
    // Cleanup in substeps
  }

  await t.step("checkpoints saved after each layer execution", async () => {
    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setCheckpointManager(db, false); // Disable auto-prune for testing

    // Create 3-layer DAG
    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "tool2", arguments: {}, dependsOn: ["task1"] },
        { id: "task3", tool: "tool3", arguments: {}, dependsOn: ["task2"] },
      ],
    };

    // Execute workflow and collect events
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag, "test-workflow-1")) {
      events.push(event);
    }

    // Verify checkpoint events emitted (3 layers = 3 checkpoints)
    const checkpointEvents = events.filter((e) => e.type === "checkpoint");
    assertEquals(checkpointEvents.length, 3);

    // Verify checkpoints in database
    const checkpoints = await db.query(
      `SELECT id, workflow_id, layer FROM workflow_checkpoint
       WHERE workflow_id = $1
       ORDER BY layer ASC`,
      ["test-workflow-1"],
    );

    assertEquals(checkpoints.length, 3);
    assertEquals(checkpoints[0].layer, 0);
    assertEquals(checkpoints[1].layer, 1);
    assertEquals(checkpoints[2].layer, 2);
  });

  await t.step("checkpoint events contain valid checkpoint IDs", async () => {
    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setCheckpointManager(db, false);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
      ],
    };

    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag, "test-workflow-2")) {
      events.push(event);
    }

    const checkpointEvents = events.filter((e) => e.type === "checkpoint");
    assertEquals(checkpointEvents.length, 1);

    const checkpointEvent = checkpointEvents[0];
    if (checkpointEvent.type === "checkpoint") {
      assertExists(checkpointEvent.checkpointId);
      // Verify it's a valid UUID (basic check)
      assertEquals(checkpointEvent.checkpointId.length > 30, true);
      assertEquals(checkpointEvent.layerIndex, 0);
    }
  });

  await t.step("checkpoint save failure does not stop execution", async () => {
    // Close DB to force checkpoint save to fail
    await db.close();

    const db2 = await setupTestDb();
    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setCheckpointManager(db2, false);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
      ],
    };

    // Close DB again before execution to force failure
    await db2.close();

    // Execution should complete despite checkpoint failures
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag, "test-workflow-fail")) {
      events.push(event);
    }

    // Verify workflow completed
    const completeEvents = events.filter((e) => e.type === "workflow_complete");
    assertEquals(completeEvents.length, 1);

    // Checkpoint event should have "failed" ID
    const checkpointEvents = events.filter((e) => e.type === "checkpoint");
    assertEquals(checkpointEvents.length, 1);
    if (checkpointEvents[0].type === "checkpoint") {
      assertEquals(checkpointEvents[0].checkpointId.startsWith("failed-"), true);
    }
  });

  await t.step("pruning integration - manual pruning works", async () => {
    const db3 = await setupTestDb();
    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setCheckpointManager(db3, false); // Disable auto-prune

    // Create simple DAG
    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
      ],
    };

    // Execute 8 workflows to create 8 checkpoints
    for (let i = 0; i < 8; i++) {
      for await (const _ of executor.executeStream(dag, "test-workflow-prune")) {
        // Consume events
      }
    }

    // Verify 8 checkpoints exist
    const beforePrune = await db3.query(
      `SELECT COUNT(*) as count FROM workflow_checkpoint WHERE workflow_id = $1`,
      ["test-workflow-prune"],
    );
    assertEquals(beforePrune[0].count, 8);

    // Manual pruning (keep 5)
    const checkpointManager = (executor as any).checkpointManager;
    const deleted = await checkpointManager.pruneCheckpoints("test-workflow-prune", 5);

    assertEquals(deleted, 3);

    // Verify only 5 remain
    const afterPrune = await db3.query(
      `SELECT COUNT(*) as count FROM workflow_checkpoint WHERE workflow_id = $1`,
      ["test-workflow-prune"],
    );
    assertEquals(afterPrune[0].count, 5);

    await db3.close();
  });

  // Final cleanup
  if (db) {
    try {
      await db.close();
    } catch {
      // Already closed
    }
  }
});
