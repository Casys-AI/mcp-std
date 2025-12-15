/**
 * StreamingExecutor Unit Tests
 *
 * Tests for SSE streaming DAG execution
 */

import { assertEquals, assertExists } from "@std/assert";
import { BufferedEventStream, StreamingExecutor } from "../../../src/dag/streaming.ts";
import type { SSEEvent } from "../../../src/dag/streaming.ts";
import type { DAGStructure } from "../../../src/graphrag/types.ts";
import type { ToolExecutor } from "../../../src/dag/types.ts";

// ============================================
// Test Helpers
// ============================================

/**
 * Create a mock tool executor with configurable delay
 */
function createMockExecutor(defaultDelay = 10): ToolExecutor {
  return async (tool: string, args: Record<string, unknown>): Promise<unknown> => {
    // Support mock:delay tool for timing tests
    if (tool === "mock:delay") {
      const delay = (args.ms as number) || defaultDelay;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return { success: true, delay };
    }

    // Support mock:echo for output testing
    if (tool === "mock:echo") {
      return { ...args };
    }

    // Support mock:fail for error testing
    if (tool === "mock:fail") {
      throw new Error(args.message as string || "Mock failure");
    }

    // Default: return args
    return { tool, args };
  };
}

/**
 * Create a writable stream that collects events
 */
function createEventCollector(): {
  stream: WritableStream<SSEEvent>;
  events: SSEEvent[];
} {
  const events: SSEEvent[] = [];

  const stream = new WritableStream<SSEEvent>({
    write(event) {
      events.push(event);
    },
  });

  return { stream, events };
}

// ============================================
// AC1: SSE implementation for streaming
// ============================================

Deno.test("StreamingExecutor - class instantiation", () => {
  const executor = new StreamingExecutor(createMockExecutor());
  assertExists(executor);
  assertExists(executor.executeWithStreaming);
});

Deno.test("StreamingExecutor - extends ParallelExecutor", () => {
  const executor = new StreamingExecutor(createMockExecutor());
  // Should have parent class methods
  assertExists(executor.execute);
  assertExists(executor.calculateSpeedup);
});

// ============================================
// AC2: Event types defined
// ============================================

Deno.test("StreamingExecutor - task_start events emitted", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  // Should have task_start events for each task
  const startEvents = events.filter((e) => e.type === "task_start");
  assertEquals(startEvents.length, 2);
  assertEquals(startEvents[0].data.taskId, "t1");
  assertEquals(startEvents[1].data.taskId, "t2");
  assertExists(startEvents[0].data.tool);
  assertExists(startEvents[0].data.timestamp);
});

Deno.test("StreamingExecutor - task_complete events emitted", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:echo", arguments: { value: "result1" }, dependsOn: [] },
      { id: "t2", tool: "mock:echo", arguments: { value: "result2" }, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  // Should have task_complete events for each task
  const completeEvents = events.filter((e) => e.type === "task_complete");
  assertEquals(completeEvents.length, 2);
  assertEquals(completeEvents[0].data.status, "success");
  assertEquals(completeEvents[1].data.status, "success");
  assertExists(completeEvents[0].data.executionTimeMs);
  assertExists(completeEvents[0].data.timestamp);
});

Deno.test("StreamingExecutor - execution_complete event emitted", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  // Should have exactly one execution_complete event
  const completeEvents = events.filter((e) => e.type === "execution_complete");
  assertEquals(completeEvents.length, 1);
  assertEquals(completeEvents[0].data.totalTasks, 1);
  assertEquals(completeEvents[0].data.successCount, 1);
  assertEquals(completeEvents[0].data.errorCount, 0);
  assertExists(completeEvents[0].data.totalExecutionTimeMs);
  assertExists(completeEvents[0].data.speedup);
  assertExists(completeEvents[0].data.timestamp);
});

Deno.test("StreamingExecutor - error events emitted on task failure", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:fail", arguments: { message: "Test error" }, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  // Should have task_complete event with error status
  const completeEvents = events.filter((e) => e.type === "task_complete");
  assertEquals(completeEvents.length, 1);
  assertEquals(completeEvents[0].data.status, "error");
  assertExists(completeEvents[0].data.error);
  assertEquals(completeEvents[0].data.error?.includes("Test error"), true);
});

// ============================================
// AC3: Results streamed immediately
// ============================================

Deno.test("StreamingExecutor - events streamed progressively", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  // Two layers: t1 → t2
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 50 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 50 }, dependsOn: ["t1"] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  // Events should be in order: start(t1), complete(t1), start(t2), complete(t2), execution_complete
  assertEquals(events[0].type, "task_start");
  if (events[0].type === "task_start") {
    assertEquals(events[0].data.taskId, "t1");
  }

  assertEquals(events[1].type, "task_complete");
  if (events[1].type === "task_complete") {
    assertEquals(events[1].data.taskId, "t1");
  }

  assertEquals(events[2].type, "task_start");
  if (events[2].type === "task_start") {
    assertEquals(events[2].data.taskId, "t2");
  }

  assertEquals(events[3].type, "task_complete");
  if (events[3].type === "task_complete") {
    assertEquals(events[3].data.taskId, "t2");
  }

  assertEquals(events[4].type, "execution_complete");
});

Deno.test("StreamingExecutor - parallel tasks stream as they complete", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  // Three parallel tasks with different durations
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 50 }, dependsOn: [] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 75 }, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  // Should have all events
  assertEquals(events.length, 7); // 3 starts + 3 completes + 1 execution_complete

  // All tasks should start first
  const startEvents = events.filter((e) => e.type === "task_start");
  assertEquals(startEvents.length, 3);

  // Then complete events
  const completeEvents = events.filter((e) => e.type === "task_complete");
  assertEquals(completeEvents.length, 3);

  // Finally execution complete
  assertEquals(events[events.length - 1].type, "execution_complete");
});

// ============================================
// AC4: Event payload structure
// ============================================

Deno.test("StreamingExecutor - task_start payload structure", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [
      { id: "test-task", tool: "mock:echo", arguments: {}, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  const startEvent = events.find((e) => e.type === "task_start");
  assertExists(startEvent);
  assertEquals(startEvent.data.taskId, "test-task");
  assertEquals(startEvent.data.tool, "mock:echo");
  assertExists(startEvent.data.timestamp);
  assertEquals(typeof startEvent.data.timestamp, "string");
});

Deno.test("StreamingExecutor - task_complete payload structure (success)", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [
      { id: "test-task", tool: "mock:echo", arguments: { value: 42 }, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  const completeEvent = events.find((e) => e.type === "task_complete") as any;
  assertExists(completeEvent);
  assertEquals(completeEvent.data.taskId, "test-task");
  assertEquals(completeEvent.data.tool, "mock:echo");
  assertEquals(completeEvent.data.status, "success");
  assertExists(completeEvent.data.output);
  assertEquals(typeof completeEvent.data.executionTimeMs, "number");
  assertExists(completeEvent.data.timestamp);
});

Deno.test("StreamingExecutor - task_complete payload structure (error)", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [
      { id: "test-task", tool: "mock:fail", arguments: { message: "Test error" }, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  const completeEvent = events.find((e) => e.type === "task_complete") as any;
  assertExists(completeEvent);
  assertEquals(completeEvent.data.taskId, "test-task");
  assertEquals(completeEvent.data.status, "error");
  assertExists(completeEvent.data.error);
  assertEquals(typeof completeEvent.data.executionTimeMs, "number");
  assertExists(completeEvent.data.timestamp);
});

// ============================================
// AC7: Max event buffer size
// ============================================

Deno.test("BufferedEventStream - buffer management", async () => {
  const { stream } = createEventCollector();
  const writer = stream.getWriter();

  let flushed = false;
  const bufferedStream = new BufferedEventStream(writer, {
    maxBufferSize: 5,
    onFlush: () => {
      flushed = true;
    },
  });

  // Write 6 events (should trigger flush at 5)
  for (let i = 0; i < 6; i++) {
    await bufferedStream.write({
      type: "task_start",
      data: {
        taskId: `t${i}`,
        tool: "mock:echo",
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Should have flushed
  assertEquals(flushed, true);

  await bufferedStream.close();
});

// ============================================
// Integration: Complete workflow
// ============================================

Deno.test("StreamingExecutor - complete workflow with mixed success/failure", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:echo", arguments: { value: "ok" }, dependsOn: [] },
      { id: "t2", tool: "mock:fail", arguments: { message: "Error" }, dependsOn: [] },
      { id: "t3", tool: "mock:echo", arguments: { value: "ok" }, dependsOn: ["t1"] },
    ],
  };

  const result = await executor.executeWithStreaming(dag, stream);

  // Check result
  assertEquals(result.totalTasks, 3);
  assertEquals(result.successfulTasks, 2);
  assertEquals(result.failedTasks, 1);

  // Check events
  assertEquals(events.length, 7); // 3 starts + 3 completes + 1 execution_complete

  // Verify execution_complete data matches result
  const execComplete = events.find((e) => e.type === "execution_complete") as any;
  assertEquals(execComplete.data.totalTasks, 3);
  assertEquals(execComplete.data.successCount, 2);
  assertEquals(execComplete.data.errorCount, 1);
});

Deno.test("StreamingExecutor - empty DAG", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  const dag: DAGStructure = {
    tasks: [],
  };

  const result = await executor.executeWithStreaming(dag, stream);

  assertEquals(result.totalTasks, 0);
  assertEquals(events.length, 1); // Only execution_complete
  assertEquals(events[0].type, "execution_complete");
});

// ============================================
// Performance: Speedup calculation
// ============================================

Deno.test("StreamingExecutor - speedup calculation in execution_complete", async () => {
  const executor = new StreamingExecutor(createMockExecutor());
  const { stream, events } = createEventCollector();

  // 3 parallel tasks @ 100ms each
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
    ],
  };

  await executor.executeWithStreaming(dag, stream);

  const execComplete = events.find((e) => e.type === "execution_complete") as any;
  assertExists(execComplete);

  // Speedup should be ~3x (300ms sequential / ~100ms parallel)
  assertEquals(execComplete.data.speedup > 2, true);
});
