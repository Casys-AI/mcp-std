/**
 * ParallelExecutor Unit Tests
 *
 * Tests for DAG parallel execution engine
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { ParallelExecutor } from "../../../src/dag/executor.ts";
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

// ============================================
// AC1: Parallel executor module created
// ============================================

Deno.test("ParallelExecutor - class instantiation", () => {
  const executor = new ParallelExecutor(createMockExecutor());
  assertExists(executor);
  assertExists(executor.execute);
  assertExists(executor.calculateSpeedup);
});

Deno.test("ParallelExecutor - constructor with config", () => {
  const executor = new ParallelExecutor(createMockExecutor(), {
    maxConcurrency: 5,
    taskTimeout: 5000,
    verbose: true,
  });
  assertExists(executor);
});

// ============================================
// AC2: Topological sort identifies parallel layers
// ============================================

Deno.test("ParallelExecutor - topological sort for parallel layers", async () => {
  const executor = new ParallelExecutor(createMockExecutor(10));

  // DAG: [t1, t2] → t3 → [t4, t5]
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: ["t1", "t2"] },
      { id: "t4", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: ["t3"] },
      { id: "t5", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: ["t3"] },
    ],
  };

  const result = await executor.execute(dag);

  // Should have 3 layers: [t1,t2] → [t3] → [t4,t5]
  assertEquals(result.parallelizationLayers, 3);
  assertEquals(result.totalTasks, 5);
  assertEquals(result.successfulTasks, 5);
});

Deno.test("ParallelExecutor - all independent tasks in single layer", async () => {
  const executor = new ParallelExecutor(createMockExecutor(10));

  // All tasks independent
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
    ],
  };

  const result = await executor.execute(dag);

  // Should have 1 layer (all parallel)
  assertEquals(result.parallelizationLayers, 1);
  assertEquals(result.successfulTasks, 3);
});

// ============================================
// AC3: Promise.allSettled for parallel execution
// ============================================

Deno.test("ParallelExecutor - parallel execution timing", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  // 3 independent tasks @ 100ms each
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
    ],
  };

  const startTime = performance.now();
  const result = await executor.execute(dag);
  const elapsed = performance.now() - startTime;

  // Should execute in parallel (~100ms), not sequential (~300ms)
  assertEquals(result.successfulTasks, 3);
  assertEquals(result.parallelizationLayers, 1);
  // Allow some overhead, but should be much less than sequential
  assertEquals(elapsed < 200, true, `Expected <200ms, got ${elapsed.toFixed(1)}ms`);
});

// ============================================
// AC4: Sequential execution for dependent tasks
// ============================================

Deno.test("ParallelExecutor - sequential execution respects dependencies", async () => {
  const executor = new ParallelExecutor(createMockExecutor(50));

  // Sequential chain: t1 → t2 → t3
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 50 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 50 }, dependsOn: ["t1"] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 50 }, dependsOn: ["t2"] },
    ],
  };

  const result = await executor.execute(dag);

  // Should have 3 layers (fully sequential)
  assertEquals(result.parallelizationLayers, 3);
  assertEquals(result.successfulTasks, 3);
  // Should take ~150ms (sequential)
  assertEquals(result.executionTimeMs > 100, true);
});

// ============================================
// AC5: Partial success handling
// ============================================

Deno.test("ParallelExecutor - partial success when one task fails", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
      { id: "t2", tool: "mock:fail", arguments: { message: "Task 2 failed" }, dependsOn: [] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
    ],
  };

  const result = await executor.execute(dag);

  // Should continue execution despite failure
  assertEquals(result.totalTasks, 3);
  assertEquals(result.successfulTasks, 2); // t1 and t3 succeed
  assertEquals(result.failedTasks, 1); // t2 fails
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].taskId, "t2");
});

Deno.test("ParallelExecutor - dependent task fails when dependency fails", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:fail", arguments: { message: "Base task failed" }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: ["t1"] },
    ],
  };

  const result = await executor.execute(dag);

  // Both tasks should fail
  assertEquals(result.totalTasks, 2);
  assertEquals(result.successfulTasks, 0);
  assertEquals(result.failedTasks, 2);
});

// ============================================
// AC6: Results aggregation
// ============================================

Deno.test("ParallelExecutor - results aggregation structure", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:echo", arguments: { value: "result1" }, dependsOn: [] },
      { id: "t2", tool: "mock:fail", arguments: { message: "Error" }, dependsOn: [] },
    ],
  };

  const result = await executor.execute(dag);

  // Check result structure
  assertExists(result.results);
  assertExists(result.errors);
  assertExists(result.executionTimeMs);
  assertExists(result.parallelizationLayers);

  assertEquals(result.results.length, 2);
  assertEquals(result.errors.length, 1);

  // Check success result
  const t1Result = result.results.find((r) => r.taskId === "t1");
  assertExists(t1Result);
  assertEquals(t1Result?.status, "success");
  assertExists(t1Result?.output);

  // Check error result
  const t2Result = result.results.find((r) => r.taskId === "t2");
  assertExists(t2Result);
  assertEquals(t2Result?.status, "error");
  assertExists(t2Result?.error);
});

// ============================================
// AC7: Performance measurement
// ============================================

Deno.test("ParallelExecutor - performance measurement and speedup calculation", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  // 3 parallel tasks @ 100ms each
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 100 }, dependsOn: [] },
    ],
  };

  const result = await executor.execute(dag);

  // Calculate speedup
  const speedup = executor.calculateSpeedup(result);

  // Sequential would be ~300ms, parallel ~100ms → speedup ~3x
  assertEquals(speedup > 2, true, `Expected speedup >2x, got ${speedup.toFixed(2)}x`);
  assertEquals(result.executionTimeMs > 0, true);

  // Check stats
  const stats = executor.getStats(result);
  assertEquals(stats.totalTasks, 3);
  assertEquals(stats.successRate, 100);
  assertEquals(stats.speedup > 2, true);
});

// ============================================
// AC8 & AC9: Performance targets (covered in benchmarks)
// ============================================

// ============================================
// $OUTPUT Reference Resolution
// ============================================

Deno.test("ParallelExecutor - $OUTPUT reference resolution", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:echo", arguments: { data: "hello" }, dependsOn: [] },
      { id: "t2", tool: "mock:echo", arguments: { input: "$OUTPUT[t1]" }, dependsOn: ["t1"] },
    ],
  };

  const result = await executor.execute(dag);

  assertEquals(result.successfulTasks, 2);

  // t2 should have t1's output
  const t2Result = result.results.find((r) => r.taskId === "t2");
  assertExists(t2Result);
  assertEquals(t2Result?.status, "success");
  // t2's output should include t1's data
  assertExists((t2Result?.output as any)?.input);
});

Deno.test("ParallelExecutor - $OUTPUT nested property resolution", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  const dag: DAGStructure = {
    tasks: [
      {
        id: "t1",
        tool: "mock:echo",
        arguments: { result: { nested: { value: 42 } } },
        dependsOn: [],
      },
      {
        id: "t2",
        tool: "mock:echo",
        arguments: { extracted: "$OUTPUT[t1].result.nested.value" },
        dependsOn: ["t1"],
      },
    ],
  };

  const result = await executor.execute(dag);

  assertEquals(result.successfulTasks, 2);

  const t2Result = result.results.find((r) => r.taskId === "t2");
  assertEquals((t2Result?.output as any)?.extracted, 42);
});

// ============================================
// Circular Dependency Detection
// ============================================

Deno.test("ParallelExecutor - detects circular dependencies", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  // Circular: t1 → t2 → t3 → t1
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:echo", arguments: {}, dependsOn: ["t3"] },
      { id: "t2", tool: "mock:echo", arguments: {}, dependsOn: ["t1"] },
      { id: "t3", tool: "mock:echo", arguments: {}, dependsOn: ["t2"] },
    ],
  };

  await assertRejects(
    async () => await executor.execute(dag),
    Error,
    "Circular dependency detected",
  );
});

// ============================================
// Error Handling
// ============================================

Deno.test("ParallelExecutor - handles missing dependency reference", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:echo", arguments: { input: "$OUTPUT[nonexistent]" }, dependsOn: [] },
    ],
  };

  const result = await executor.execute(dag);

  assertEquals(result.failedTasks, 1);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].error.includes("undefined task output"), true);
});

Deno.test({
  name: "ParallelExecutor - handles task timeout",
  sanitizeResources: false, // Mock executor creates timers that outlive the timeout
  sanitizeOps: false,
  async fn() {
    const executor = new ParallelExecutor(createMockExecutor(), { taskTimeout: 50 });

    const dag: DAGStructure = {
      tasks: [
        { id: "t1", tool: "mock:delay", arguments: { ms: 1000 }, dependsOn: [] },
      ],
    };

    const result = await executor.execute(dag);

    assertEquals(result.failedTasks, 1);
    assertEquals(result.errors[0].error.includes("timed out"), true);
  },
});

// ============================================
// Edge Cases
// ============================================

Deno.test("ParallelExecutor - handles empty DAG", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  const dag: DAGStructure = {
    tasks: [],
  };

  const result = await executor.execute(dag);

  assertEquals(result.totalTasks, 0);
  assertEquals(result.successfulTasks, 0);
  assertEquals(result.parallelizationLayers, 0);
});

Deno.test("ParallelExecutor - handles single task DAG", async () => {
  const executor = new ParallelExecutor(createMockExecutor());

  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:echo", arguments: { value: "solo" }, dependsOn: [] },
    ],
  };

  const result = await executor.execute(dag);

  assertEquals(result.totalTasks, 1);
  assertEquals(result.successfulTasks, 1);
  assertEquals(result.parallelizationLayers, 1);
});

// ============================================
// Complex DAG Patterns
// ============================================

Deno.test("ParallelExecutor - complex diamond DAG pattern", async () => {
  const executor = new ParallelExecutor(createMockExecutor(10));

  // Diamond: t1 → [t2, t3] → t4
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: [] },
      { id: "t2", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: ["t1"] },
      { id: "t3", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: ["t1"] },
      { id: "t4", tool: "mock:delay", arguments: { ms: 10 }, dependsOn: ["t2", "t3"] },
    ],
  };

  const result = await executor.execute(dag);

  // Should have 3 layers: [t1] → [t2, t3] → [t4]
  assertEquals(result.parallelizationLayers, 3);
  assertEquals(result.successfulTasks, 4);
});
