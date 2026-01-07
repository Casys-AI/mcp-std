/**
 * Unit tests for EpisodicMemoryStore
 *
 * Story: 4.1b EpisodicMemoryStore (Epic 4 Phase 1)
 *
 * @module tests/unit/learning/episodic_memory_store_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";
import { EpisodicMemoryStore } from "../../../src/dag/episodic/store.ts";
import type { EpisodicEventInput } from "../../../src/dag/episodic/types.ts";

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
 * Create a test event
 */
function createTestEvent(overrides: Partial<EpisodicEventInput> = {}): EpisodicEventInput {
  return {
    workflow_id: "test-workflow-" + crypto.randomUUID().slice(0, 8),
    event_type: "task_complete",
    timestamp: Date.now(),
    data: {
      result: { status: "success", executionTimeMs: 100 },
    },
    ...overrides,
  };
}

Deno.test("EpisodicMemoryStore - capture adds event to buffer", async () => {
  const db = await setupTestDb();
  const store = new EpisodicMemoryStore(db, { bufferSize: 100, flushIntervalMs: 60000 });

  const eventId = await store.capture(createTestEvent());

  assertExists(eventId);
  assertEquals(store.getBufferStatus().size, 1);

  await store.shutdown();
  await db.close();
});

Deno.test("EpisodicMemoryStore - flush writes events to database", async () => {
  const db = await setupTestDb();
  const store = new EpisodicMemoryStore(db, { bufferSize: 100, flushIntervalMs: 60000 });

  const workflowId = "test-workflow-flush";
  await store.capture(createTestEvent({ workflow_id: workflowId }));
  await store.capture(createTestEvent({ workflow_id: workflowId }));

  assertEquals(store.getBufferStatus().size, 2);

  const flushed = await store.flush();
  assertEquals(flushed, 2);
  assertEquals(store.getBufferStatus().size, 0);

  // Verify in database
  const events = await store.getWorkflowEvents(workflowId);
  assertEquals(events.length, 2);

  await store.shutdown();
  await db.close();
});

Deno.test("EpisodicMemoryStore - auto-flush on buffer full", async () => {
  const db = await setupTestDb();
  const store = new EpisodicMemoryStore(db, { bufferSize: 3, flushIntervalMs: 60000 });

  const workflowId = "test-workflow-autoflushed";

  // Add 3 events (equals bufferSize, should trigger flush)
  await store.capture(createTestEvent({ workflow_id: workflowId }));
  await store.capture(createTestEvent({ workflow_id: workflowId }));
  await store.capture(createTestEvent({ workflow_id: workflowId }));

  // Wait for async flush to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Buffer should be empty after auto-flush
  assertEquals(store.getBufferStatus().size, 0);

  // Events should be in database
  const events = await store.getWorkflowEvents(workflowId);
  assertEquals(events.length, 3);

  await store.shutdown();
  await db.close();
});

Deno.test("EpisodicMemoryStore - retrieveRelevant with context hash", async () => {
  const db = await setupTestDb();
  const store = new EpisodicMemoryStore(db, { bufferSize: 100, flushIntervalMs: 60000 });

  const context = { workflowType: "data_analysis", domain: "github" };
  const contextHash = store.hashContext(context);

  // Add events with matching context
  await store.capture(
    createTestEvent({
      workflow_id: "wf-1",
      context_hash: contextHash,
      data: { context, result: { status: "success" } },
    }),
  );
  await store.capture(
    createTestEvent({
      workflow_id: "wf-2",
      context_hash: contextHash,
      data: { context, result: { status: "success" } },
    }),
  );

  // Add event with different context
  await store.capture(
    createTestEvent({
      workflow_id: "wf-3",
      context_hash: "different-hash",
      data: { result: { status: "success" } },
    }),
  );

  await store.flush();

  // Retrieve by context
  const relevant = await store.retrieveRelevant(context);
  assertEquals(relevant.length, 2);

  await store.shutdown();
  await db.close();
});

Deno.test("EpisodicMemoryStore - retrieveRelevant with event type filter", async () => {
  const db = await setupTestDb();
  const store = new EpisodicMemoryStore(db, { bufferSize: 100, flushIntervalMs: 60000 });

  const context = { workflowType: "test" };
  const contextHash = store.hashContext(context);

  // Add different event types
  await store.capture(
    createTestEvent({
      event_type: "task_complete",
      context_hash: contextHash,
    }),
  );
  await store.capture(
    createTestEvent({
      event_type: "speculation_start",
      context_hash: contextHash,
    }),
  );
  await store.capture(
    createTestEvent({
      event_type: "ail_decision",
      context_hash: contextHash,
    }),
  );

  await store.flush();

  // Filter by event type
  const specEvents = await store.retrieveRelevant(context, {
    eventTypes: ["speculation_start"],
  });
  assertEquals(specEvents.length, 1);
  assertEquals(specEvents[0].event_type, "speculation_start");

  await store.shutdown();
  await db.close();
});

Deno.test("EpisodicMemoryStore - getWorkflowEvents returns ordered events", async () => {
  const db = await setupTestDb();
  const store = new EpisodicMemoryStore(db, { bufferSize: 100, flushIntervalMs: 60000 });

  const workflowId = "test-workflow-ordered";

  // Add events with different timestamps
  await store.capture(createTestEvent({ workflow_id: workflowId, timestamp: 1000 }));
  await store.capture(createTestEvent({ workflow_id: workflowId, timestamp: 3000 }));
  await store.capture(createTestEvent({ workflow_id: workflowId, timestamp: 2000 }));

  await store.flush();

  const events = await store.getWorkflowEvents(workflowId);
  assertEquals(events.length, 3);

  // Should be ordered by timestamp ASC
  assertEquals(events[0].timestamp, 1000);
  assertEquals(events[1].timestamp, 2000);
  assertEquals(events[2].timestamp, 3000);

  await store.shutdown();
  await db.close();
});

Deno.test("EpisodicMemoryStore - getStats returns correct statistics", async () => {
  const db = await setupTestDb();
  const store = new EpisodicMemoryStore(db, { bufferSize: 100, flushIntervalMs: 60000 });

  // Add various events
  await store.capture(createTestEvent({ workflow_id: "wf-1", event_type: "task_complete" }));
  await store.capture(createTestEvent({ workflow_id: "wf-1", event_type: "task_complete" }));
  await store.capture(createTestEvent({ workflow_id: "wf-2", event_type: "speculation_start" }));

  await store.flush();

  const stats = await store.getStats();

  assertEquals(stats.totalEvents, 3);
  assertEquals(stats.eventsByType.task_complete, 2);
  assertEquals(stats.eventsByType.speculation_start, 1);
  assertEquals(stats.uniqueWorkflows, 2);

  await store.shutdown();
  await db.close();
});

Deno.test("EpisodicMemoryStore - hashContext generates consistent hashes", async () => {
  const db = new PGliteClient(":memory:");
  const store = new EpisodicMemoryStore(db, { bufferSize: 100, flushIntervalMs: 60000 });

  const context1 = { workflowType: "analysis", domain: "github", complexity: "high" };
  const context2 = { workflowType: "analysis", domain: "github", complexity: "high" };
  const context3 = { workflowType: "analysis", domain: "gitlab", complexity: "high" };

  const hash1 = store.hashContext(context1);
  const hash2 = store.hashContext(context2);
  const hash3 = store.hashContext(context3);

  // Same context should produce same hash
  assertEquals(hash1, hash2);

  // Different context should produce different hash
  assertEquals(hash1 !== hash3, true);

  // Hash format should match expected pattern
  assertEquals(hash1.includes("workflowType:analysis"), true);
  assertEquals(hash1.includes("domain:github"), true);

  // Cleanup to avoid timer leak
  await store.shutdown();
});

Deno.test("EpisodicMemoryStore - shutdown flushes remaining events", async () => {
  const db = await setupTestDb();
  const store = new EpisodicMemoryStore(db, { bufferSize: 100, flushIntervalMs: 60000 });

  const workflowId = "test-workflow-shutdown";
  await store.capture(createTestEvent({ workflow_id: workflowId }));
  await store.capture(createTestEvent({ workflow_id: workflowId }));

  assertEquals(store.getBufferStatus().size, 2);

  await store.shutdown();

  // After shutdown, events should be flushed to database
  const events = await store.getWorkflowEvents(workflowId);
  assertEquals(events.length, 2);

  await db.close();
});
