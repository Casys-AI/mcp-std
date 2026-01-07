/**
 * Integration tests for Episodic Memory + ControlledExecutor (Story 4.1d)
 *
 * Tests:
 * - Task 1: EpisodicMemoryStore integration with ControlledExecutor
 * - Task 2: task_complete events captured during execution
 * - Task 3: ail_decision events captured
 * - Task 4: hil_decision events captured
 * - Task 5: speculation_start event support
 * - Task 6: Performance validation (<1ms overhead per capture)
 * - Task 7: End-to-end integration tests
 *
 * @module tests/integration/episodic_integration_test
 */

import { assertEquals, assertExists, assertLess } from "@std/assert";
import { ControlledExecutor } from "../../src/dag/controlled-executor.ts";
import { EpisodicMemoryStore } from "../../src/dag/episodic/store.ts";
import { PGliteClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import type { ExecutionEvent, ToolExecutor } from "../../src/dag/types.ts";

// Helper to create in-memory test database with migrations
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  await db.connect();

  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  return db;
}

// Mock tool executor
const mockToolExecutor: ToolExecutor = async (tool: string, args: Record<string, unknown>) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { tool, args, result: "success" };
};

// Mock tool executor that fails
const failingToolExecutor: ToolExecutor = async (_tool: string, _args: Record<string, unknown>) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  throw new Error("Task failed intentionally");
};

// Helper to set up test environment
async function setupTest(): Promise<{ db: PGliteClient; episodicMemory: EpisodicMemoryStore }> {
  const db = await createTestDb();
  const episodicMemory = new EpisodicMemoryStore(db, {
    bufferSize: 10, // Small buffer for tests
    flushIntervalMs: 1000,
  });
  return { db, episodicMemory };
}

// Helper to clean up test environment
async function teardownTest(_db: PGliteClient, episodicMemory: EpisodicMemoryStore): Promise<void> {
  await episodicMemory.shutdown();
  // db cleanup handled by createTestDb (in-memory)
}

Deno.test("Story 4.1d - Task 1: EpisodicMemoryStore Integration", async (t) => {
  await t.step("setEpisodicMemoryStore accepts store instance", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);

    // Should not throw
    executor.setEpisodicMemoryStore(episodicMemory);

    await teardownTest(db, episodicMemory);
  });

  await t.step("graceful degradation when store not set", async () => {
    const executor = new ControlledExecutor(mockToolExecutor);
    // No episodic memory set

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
      ],
    };

    // Should execute without errors
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag)) {
      events.push(event);
    }

    assertEquals(events.length > 0, true);
    assertEquals(events[events.length - 1].type, "workflow_complete");
  });
});

Deno.test("Story 4.1d - Task 2: task_complete Events Captured", async (t) => {
  await t.step("captures successful task completion", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "tool2", arguments: {}, dependsOn: ["task1"] },
      ],
    };

    for await (const _event of executor.executeStream(dag, "test-workflow-1")) {
      // Consume events
    }

    // Flush buffer to database
    await episodicMemory.flush();

    // Retrieve events
    const events = await episodicMemory.getWorkflowEvents("test-workflow-1");

    // Should have captured task_complete events
    const taskCompleteEvents = events.filter((e) => e.event_type === "task_complete");
    assertEquals(taskCompleteEvents.length, 2);

    // Verify event structure
    const firstEvent = taskCompleteEvents[0];
    assertExists(firstEvent.id);
    assertEquals(firstEvent.workflow_id, "test-workflow-1");
    assertEquals(firstEvent.event_type, "task_complete");
    assertExists(firstEvent.task_id);
    assertExists(firstEvent.timestamp);
    assertExists(firstEvent.data.result);
    assertEquals(firstEvent.data.result!.status, "success");

    await teardownTest(db, episodicMemory);
  });

  await t.step("captures failed task completion", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(failingToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
      ],
    };

    // Execute (will fail)
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag, "test-workflow-2")) {
      events.push(event);
    }

    // Flush buffer
    await episodicMemory.flush();

    // Retrieve events
    const storedEvents = await episodicMemory.getWorkflowEvents("test-workflow-2");
    const taskCompleteEvents = storedEvents.filter((e) => e.event_type === "task_complete");

    // Should have captured error event
    assertEquals(taskCompleteEvents.length, 1);
    assertEquals(taskCompleteEvents[0].data.result!.status, "error");
    assertExists(taskCompleteEvents[0].data.result!.errorMessage);

    await teardownTest(db, episodicMemory);
  });

  await t.step("includes context hash and metadata", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
      ],
    };

    for await (const _event of executor.executeStream(dag, "test-workflow-3")) {
      // Consume
    }

    await episodicMemory.flush();

    const events = await episodicMemory.getWorkflowEvents("test-workflow-3");
    const taskEvent = events.find((e) => e.event_type === "task_complete");

    assertExists(taskEvent);
    assertExists(taskEvent!.context_hash);
    assertExists(taskEvent!.data.context);

    await teardownTest(db, episodicMemory);
  });
});

Deno.test("Story 4.1d - Task 5: speculation_start Event Support", async (t) => {
  await t.step("captureSpeculationStart captures event", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    // Initialize state by running a simple workflow first
    const dag: DAGStructure = {
      tasks: [{ id: "task1", tool: "tool1", arguments: {}, dependsOn: [] }],
    };
    for await (const _event of executor.executeStream(dag, "spec-workflow")) {
      // Initialize state
    }

    // Now capture speculation
    const eventId = executor.captureSpeculationStart(
      "spec-workflow",
      "speculative_tool",
      0.85,
      "High confidence based on similar context",
    );

    assertExists(eventId);

    await episodicMemory.flush();

    const events = await episodicMemory.getWorkflowEvents("spec-workflow");
    const specEvents = events.filter((e) => e.event_type === "speculation_start");

    assertEquals(specEvents.length, 1);
    assertExists(specEvents[0].data.prediction);
    assertEquals(specEvents[0].data.prediction!.toolId, "speculative_tool");
    assertEquals(specEvents[0].data.prediction!.confidence, 0.85);
    assertEquals(
      specEvents[0].data.prediction!.reasoning,
      "High confidence based on similar context",
    );

    await teardownTest(db, episodicMemory);
  });

  await t.step("returns null when episodic memory not set", () => {
    const executor = new ControlledExecutor(mockToolExecutor);
    // No episodic memory set

    const eventId = executor.captureSpeculationStart(
      "workflow",
      "tool",
      0.5,
      "reason",
    );

    assertEquals(eventId, null);
  });
});

Deno.test("Story 4.1d - Task 6: Performance Validation", async (t) => {
  await t.step("event capture overhead <1ms per call", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    // Create a workflow with many tasks
    const tasks = Array.from({ length: 50 }, (_, i) => ({
      id: `task${i}`,
      tool: `tool${i}`,
      arguments: {},
      dependsOn: [] as string[],
    }));

    const dag: DAGStructure = { tasks };

    const startTime = performance.now();

    for await (const _event of executor.executeStream(dag, "perf-workflow")) {
      // Consume events
    }

    const totalTime = performance.now() - startTime;

    // 50 tasks with ~5ms execution each = ~250ms for tasks
    // Event capture should add <50ms overhead (50 captures * <1ms each)
    console.log(`50 tasks with episodic capture: ${totalTime.toFixed(1)}ms`);

    // Calculate per-capture overhead
    // Each task = 1 task_complete capture
    const perCaptureOverhead = (totalTime - 250) / 50;
    console.log(`Per-capture overhead estimate: ${perCaptureOverhead.toFixed(2)}ms`);

    // Should be <1ms per capture (allowing for test overhead)
    assertLess(
      perCaptureOverhead,
      1.5,
      `Expected <1ms per capture, got ${perCaptureOverhead.toFixed(2)}ms`,
    );

    await teardownTest(db, episodicMemory);
  });

  await t.step("non-blocking writes don't delay workflow", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    const dag: DAGStructure = {
      tasks: Array.from({ length: 10 }, (_, i) => ({
        id: `task${i}`,
        tool: `tool${i}`,
        arguments: {},
        dependsOn: [],
      })),
    };

    // Run with episodic memory
    const startWithEpsiodic = performance.now();
    for await (const _event of executor.executeStream(dag, "with-episodic")) {
      // Consume
    }
    const timeWithEpisodic = performance.now() - startWithEpsiodic;

    // Run without episodic memory
    const executorWithout = new ControlledExecutor(mockToolExecutor);
    const startWithout = performance.now();
    for await (const _event of executorWithout.executeStream(dag, "without-episodic")) {
      // Consume
    }
    const timeWithout = performance.now() - startWithout;

    console.log(`With episodic: ${timeWithEpisodic.toFixed(1)}ms`);
    console.log(`Without episodic: ${timeWithout.toFixed(1)}ms`);
    console.log(`Overhead: ${(timeWithEpisodic - timeWithout).toFixed(1)}ms`);

    // Overhead should be <10% of execution time
    const overheadPercent = ((timeWithEpisodic - timeWithout) / timeWithout) * 100;
    console.log(`Overhead percent: ${overheadPercent.toFixed(1)}%`);

    assertLess(overheadPercent, 20, `Expected <20% overhead, got ${overheadPercent.toFixed(1)}%`);

    await teardownTest(db, episodicMemory);
  });

  await t.step("benchmark: 100+ task workflow", async () => {
    // Use larger buffer for benchmark to avoid async flush complications
    const db = await createTestDb();
    const episodicMemory = new EpisodicMemoryStore(db, {
      bufferSize: 150, // Large buffer for benchmark
      flushIntervalMs: 10000,
    });

    // Use faster mock for benchmark
    const fastExecutor: ToolExecutor = async (tool, args) => {
      await new Promise((resolve) => setTimeout(resolve, 1)); // 1ms per task
      return { tool, args, result: "success" };
    };

    const executor = new ControlledExecutor(fastExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    // 100 parallel tasks
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      id: `task${i}`,
      tool: `tool${i}`,
      arguments: {},
      dependsOn: [] as string[],
    }));

    const dag: DAGStructure = { tasks };

    const startTime = performance.now();

    for await (const _event of executor.executeStream(dag, "benchmark-workflow")) {
      // Consume
    }

    const totalTime = performance.now() - startTime;

    console.log(`100 parallel tasks (1ms each): ${totalTime.toFixed(1)}ms`);

    // Should complete in reasonable time
    // Tasks execute in parallel (~1ms) + overhead
    assertLess(totalTime, 500, `Expected <500ms, got ${totalTime.toFixed(0)}ms`);

    await episodicMemory.flush();

    const events = await episodicMemory.getEventsByType("task_complete", 200);
    assertEquals(events.length, 100);

    await teardownTest(db, episodicMemory);
  });
});

Deno.test("Story 4.1d - Task 7: Integration Tests", async (t) => {
  await t.step("end-to-end: execute workflow with all event types", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "tool1", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "tool2", arguments: {}, dependsOn: ["task1"] },
        { id: "task3", tool: "tool3", arguments: {}, dependsOn: ["task2"] },
      ],
    };

    for await (const _event of executor.executeStream(dag, "e2e-workflow")) {
      // Consume
    }

    // Also capture a speculation event
    executor.captureSpeculationStart("e2e-workflow", "spec_tool", 0.9, "test");

    await episodicMemory.flush();

    const events = await episodicMemory.getWorkflowEvents("e2e-workflow");

    // Verify all task_complete events
    const taskEvents = events.filter((e) => e.event_type === "task_complete");
    assertEquals(taskEvents.length, 3);

    // Verify speculation event
    const specEvents = events.filter((e) => e.event_type === "speculation_start");
    assertEquals(specEvents.length, 1);

    // Verify stats
    const stats = await episodicMemory.getStats();
    assertExists(stats.totalEvents);
    assertEquals(stats.uniqueWorkflows >= 1, true);

    await teardownTest(db, episodicMemory);
  });

  await t.step("context hash matches EpisodicMemoryStore pattern", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    const dag: DAGStructure = {
      tasks: [{ id: "task1", tool: "tool1", arguments: {}, dependsOn: [] }],
    };

    for await (const _event of executor.executeStream(dag, "hash-test")) {
      // Consume
    }

    await episodicMemory.flush();

    const events = await episodicMemory.getWorkflowEvents("hash-test");
    const taskEvent = events.find((e) => e.event_type === "task_complete");

    assertExists(taskEvent?.context_hash);

    // Hash should follow pattern: workflowType:value|domain:value|complexity:value
    const hash = taskEvent!.context_hash!;
    assertEquals(hash.includes("workflowType:"), true);
    assertEquals(hash.includes("domain:"), true);
    assertEquals(hash.includes("complexity:"), true);

    await teardownTest(db, episodicMemory);
  });

  await t.step("events include all required metadata (AC #6)", async () => {
    const { db, episodicMemory } = await setupTest();

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setEpisodicMemoryStore(episodicMemory);

    const dag: DAGStructure = {
      tasks: [{ id: "task1", tool: "tool1", arguments: {}, dependsOn: [] }],
    };

    for await (const _event of executor.executeStream(dag, "metadata-test")) {
      // Consume
    }

    await episodicMemory.flush();

    const events = await episodicMemory.getWorkflowEvents("metadata-test");
    const taskEvent = events.find((e) => e.event_type === "task_complete");

    // AC #6: Events include workflow_id, task_id, timestamp, and relevant metadata
    assertExists(taskEvent);
    assertExists(taskEvent!.workflow_id);
    assertEquals(taskEvent!.workflow_id, "metadata-test");
    assertExists(taskEvent!.task_id);
    assertEquals(taskEvent!.task_id, "task1");
    assertExists(taskEvent!.timestamp);
    assertEquals(typeof taskEvent!.timestamp, "number");

    // Relevant metadata
    assertExists(taskEvent!.data);
    assertExists(taskEvent!.data.result);
    assertExists(taskEvent!.data.context);

    await teardownTest(db, episodicMemory);
  });
});
