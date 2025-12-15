/**
 * Unit tests for CheckpointManager
 *
 * Tests:
 * - CRUD operations (save, load, getLatest, prune)
 * - State serialization/deserialization round-trip
 * - Performance benchmarks (<50ms save target)
 * - Error handling (corrupted state, missing checkpoints)
 * - Retention policy (5 most recent)
 *
 * Target: >80% code coverage
 *
 * @module tests/unit/dag/checkpoint_manager_test
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { CheckpointManager } from "../../../src/dag/checkpoint-manager.ts";
import { createInitialState, updateState } from "../../../src/dag/state.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

/**
 * Setup in-memory test database with checkpoint schema
 */
async function setupTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(":memory:");
  await db.connect();

  // Run all migrations
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());

  return db;
}

Deno.test("CheckpointManager - CRUD Operations", async (t) => {
  let db: PGliteClient;
  let manager: CheckpointManager;

  // Setup
  try {
    db = await setupTestDb();
    manager = new CheckpointManager(db);
  } finally {
    // Cleanup is handled in each substep
  }

  await t.step("saveCheckpoint succeeds with valid state", async () => {
    const workflow_id = "test-workflow-1";
    const layer = 0;
    const state = createInitialState(workflow_id);

    const checkpoint = await manager.saveCheckpoint(workflow_id, layer, state);

    // Verify checkpoint structure
    assertExists(checkpoint.id);
    assertEquals(checkpoint.workflowId, workflow_id);
    assertEquals(checkpoint.layer, layer);
    assertExists(checkpoint.timestamp);
    assertEquals(checkpoint.state.workflowId, workflow_id);
  });

  await t.step("loadCheckpoint by ID returns correct state", async () => {
    const workflow_id = "test-workflow-2";
    const layer = 1;
    const state = updateState(createInitialState(workflow_id), {
      currentLayer: 1,
      messages: [{ role: "user", content: "Test", timestamp: Date.now() }],
    });

    // Save checkpoint
    const saved = await manager.saveCheckpoint(workflow_id, layer, state);

    // Load checkpoint
    const loaded = await manager.loadCheckpoint(saved.id);

    // Verify loaded state matches saved
    assertExists(loaded);
    assertEquals(loaded.id, saved.id);
    assertEquals(loaded.workflowId, workflow_id);
    assertEquals(loaded.layer, layer);
    assertEquals(loaded.state.messages.length, 1);
    assertEquals(loaded.state.messages[0].content, "Test");
  });

  await t.step("loadCheckpoint returns null for non-existent ID", async () => {
    const loaded = await manager.loadCheckpoint("non-existent-uuid");
    assertEquals(loaded, null);
  });

  await t.step("getLatestCheckpoint returns most recent", async () => {
    const workflow_id = "test-workflow-3";

    // Save multiple checkpoints
    const state1 = createInitialState(workflow_id);
    await manager.saveCheckpoint(workflow_id, 0, state1);

    // Wait 10ms to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    const state2 = updateState(state1, { currentLayer: 1 });
    await manager.saveCheckpoint(workflow_id, 1, state2);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const state3 = updateState(state2, { currentLayer: 2 });
    const checkpoint3 = await manager.saveCheckpoint(workflow_id, 2, state3);

    // Get latest
    const latest = await manager.getLatestCheckpoint(workflow_id);

    // Verify it's the most recent (layer 2)
    assertExists(latest);
    assertEquals(latest.id, checkpoint3.id);
    assertEquals(latest.layer, 2);
  });

  await t.step("getLatestCheckpoint returns null for non-existent workflow", async () => {
    const latest = await manager.getLatestCheckpoint("non-existent-workflow");
    assertEquals(latest, null);
  });

  // Cleanup
  await db.close();
});

Deno.test("CheckpointManager - State Serialization Round-Trip", async (t) => {
  let db: PGliteClient;
  let manager: CheckpointManager;

  try {
    db = await setupTestDb();
    manager = new CheckpointManager(db);
  } finally {
    // Cleanup in substep
  }

  await t.step("complex state serializes and deserializes correctly", async () => {
    const workflow_id = "test-workflow-complex";
    const layer = 3;

    // Create complex state with all fields populated
    let state = createInitialState(workflow_id);
    state = updateState(state, {
      currentLayer: 3,
      messages: [
        { role: "system", content: "System prompt", timestamp: 1 },
        { role: "user", content: "User input", timestamp: 2 },
        { role: "assistant", content: "Assistant response", timestamp: 3 },
      ],
      tasks: [
        { taskId: "task1", status: "success", output: { result: "data" }, executionTimeMs: 100 },
        { taskId: "task2", status: "error", error: "Task failed", executionTimeMs: 50 },
      ],
      decisions: [
        {
          type: "AIL",
          timestamp: 4,
          description: "Auto-decision",
          outcome: "approved",
          confidence: 0.95,
        },
      ],
      context: {
        user_id: "user-123",
        session_id: "session-456",
        nested: { key: "value" },
      },
    });

    // Save and load
    const saved = await manager.saveCheckpoint(workflow_id, layer, state);
    const loaded = await manager.loadCheckpoint(saved.id);

    // Verify all fields preserved
    assertExists(loaded);
    assertEquals(loaded.state.workflowId, workflow_id);
    assertEquals(loaded.state.currentLayer, 3);
    assertEquals(loaded.state.messages.length, 3);
    assertEquals(loaded.state.tasks.length, 2);
    assertEquals(loaded.state.decisions.length, 1);
    assertEquals(loaded.state.context.user_id, "user-123");
    assertEquals((loaded.state.context.nested as any).key, "value");
  });

  await db.close();
});

Deno.test("CheckpointManager - Pruning", async (t) => {
  let db: PGliteClient;
  let manager: CheckpointManager;

  try {
    db = await setupTestDb();
    manager = new CheckpointManager(db);
  } finally {
    // Cleanup in substep
  }

  await t.step("pruneCheckpoints keeps N most recent", async () => {
    const workflow_id = "test-workflow-prune";

    // Create 8 checkpoints
    for (let i = 0; i < 8; i++) {
      const state = updateState(createInitialState(workflow_id), {
        currentLayer: i,
      });
      await manager.saveCheckpoint(workflow_id, i, state);
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Prune to keep 5 most recent
    const deleted = await manager.pruneCheckpoints(workflow_id, 5);

    // Verify 3 deleted (8 - 5 = 3)
    assertEquals(deleted, 3);

    // Verify latest checkpoint still exists (layer 7)
    const latest = await manager.getLatestCheckpoint(workflow_id);
    assertExists(latest);
    assertEquals(latest.layer, 7);
  });

  await t.step("pruneCheckpoints with no old checkpoints returns 0", async () => {
    const workflow_id = "test-workflow-prune-2";

    // Create only 3 checkpoints
    for (let i = 0; i < 3; i++) {
      const state = updateState(createInitialState(workflow_id), {
        currentLayer: i,
      });
      await manager.saveCheckpoint(workflow_id, i, state);
    }

    // Prune to keep 5 (but only 3 exist)
    const deleted = await manager.pruneCheckpoints(workflow_id, 5);

    // Verify nothing deleted
    assertEquals(deleted, 0);
  });

  await db.close();
});

Deno.test("CheckpointManager - Error Handling", async (t) => {
  let db: PGliteClient;
  let manager: CheckpointManager;

  try {
    db = await setupTestDb();
    manager = new CheckpointManager(db);
  } finally {
    // Cleanup in substep
  }

  await t.step("loadCheckpoint rejects corrupted state (missing field)", async () => {
    const workflow_id = "test-workflow-corrupted";
    const corruptedStateJson = JSON.stringify({
      workflow_id: workflow_id,
      // Missing current_layer, messages, tasks, decisions, context
    });

    // Insert corrupted checkpoint directly (bypass validation)
    await db.query(
      `INSERT INTO workflow_checkpoint (id, workflow_id, timestamp, layer, state)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), workflow_id, new Date(), 0, corruptedStateJson],
    );

    // Attempt to load should throw
    const checkpoints = await db.query(
      `SELECT id FROM workflow_checkpoint WHERE workflow_id = $1`,
      [workflow_id],
    );
    const corruptedId = checkpoints[0].id as string;

    await assertRejects(
      async () => {
        await manager.loadCheckpoint(corruptedId);
      },
      Error,
      "State missing required field",
    );
  });

  await t.step("loadCheckpoint rejects invalid workflow_id", async () => {
    const workflow_id = "test-workflow-invalid";
    const invalidStateJson = JSON.stringify({
      workflow_id: "", // Empty workflow_id
      current_layer: 0,
      messages: [],
      tasks: [],
      decisions: [],
      context: {},
    });

    await db.query(
      `INSERT INTO workflow_checkpoint (id, workflow_id, timestamp, layer, state)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), workflow_id, new Date(), 0, invalidStateJson],
    );

    const checkpoints = await db.query(
      `SELECT id FROM workflow_checkpoint WHERE workflow_id = $1`,
      [workflow_id],
    );
    const invalidId = checkpoints[0].id as string;

    await assertRejects(
      async () => {
        await manager.loadCheckpoint(invalidId);
      },
      Error,
      "workflow_id must be non-empty string",
    );
  });

  await db.close();
});

Deno.test("CheckpointManager - Performance", async (t) => {
  let db: PGliteClient;
  let manager: CheckpointManager;

  try {
    db = await setupTestDb();
    manager = new CheckpointManager(db);
  } finally {
    // Cleanup in substep
  }

  await t.step("checkpoint save <50ms P95 (benchmark)", async () => {
    const workflow_id = "test-workflow-perf";
    const iterations = 100;
    const latencies: number[] = [];

    // Run 100 checkpoint saves
    for (let i = 0; i < iterations; i++) {
      const state = updateState(createInitialState(workflow_id), {
        currentLayer: i,
      });

      const startTime = performance.now();
      await manager.saveCheckpoint(workflow_id, i, state);
      const elapsedMs = performance.now() - startTime;

      latencies.push(elapsedMs);
    }

    // Calculate P95 latency
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(iterations * 0.95);
    const p95Latency = latencies[p95Index];

    console.log(`\nCheckpoint save performance (${iterations} iterations):`);
    console.log(`  Min: ${latencies[0].toFixed(2)}ms`);
    console.log(`  Median: ${latencies[Math.floor(iterations / 2)].toFixed(2)}ms`);
    console.log(`  P95: ${p95Latency.toFixed(2)}ms`);
    console.log(`  Max: ${latencies[iterations - 1].toFixed(2)}ms`);

    // Assert P95 < 50ms target
    // Note: In-memory PGlite should be very fast; adjust if running on slow CI
    assertEquals(
      p95Latency < 50,
      true,
      `P95 latency ${p95Latency.toFixed(2)}ms exceeds 50ms target`,
    );
  });

  await db.close();
});
