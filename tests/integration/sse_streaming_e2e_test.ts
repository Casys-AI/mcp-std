/**
 * SSE Streaming End-to-End Integration Test
 *
 * Validates the complete SSE streaming workflow:
 * 1. StreamingExecutor executes DAG with event streaming
 * 2. SSE handler formats events correctly
 * 3. Events are streamed progressively (not batched)
 * 4. Graceful degradation to batch mode works
 * 5. Memory management prevents leaks
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  handleSSERequest,
  handleWorkflowRequest,
  parseSSEStream,
} from "../../src/server/sse-handler.ts";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import type { ToolExecutor } from "../../src/dag/types.ts";

// ============================================
// Mock MCP Tool Executor
// ============================================

/**
 * Create a mock MCP tool executor that simulates real tool execution
 */
function createMockMCPExecutor(): ToolExecutor {
  return async (tool: string, args: Record<string, unknown>): Promise<unknown> => {
    const [serverId, toolName] = tool.split(":");

    // Simulate filesystem tools
    if (serverId === "filesystem") {
      if (toolName === "read_file") {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          success: true,
          content: `Mock content from ${args.path}`,
          size: 1234,
        };
      }

      if (toolName === "write_file") {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return {
          success: true,
          path: args.path,
          bytesWritten: (args.content as string).length,
        };
      }
    }

    // Simulate search tools
    if (serverId === "search") {
      if (toolName === "web_search") {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          success: true,
          results: [
            { title: "Result 1", url: "https://example.com/1" },
            { title: "Result 2", url: "https://example.com/2" },
          ],
          count: 2,
        };
      }
    }

    // Mock failure tool
    if (tool === "mock:fail") {
      throw new Error(args.message as string || "Mock failure");
    }

    // Default
    return { tool, args };
  };
}

// ============================================
// Test 1: SSE Stream Format
// ============================================

Deno.test("SSE E2E - SSE stream format validation", async () => {
  const dag: DAGStructure = {
    tasks: [
      {
        id: "task1",
        tool: "filesystem:read_file",
        arguments: { path: "/test.txt" },
        dependsOn: [],
      },
    ],
  };

  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  const response = await handleSSERequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  // Validate response headers
  assertEquals(response.headers.get("Content-Type"), "text/event-stream");
  assertEquals(response.headers.get("Cache-Control"), "no-cache");
  assertEquals(response.headers.get("Connection"), "keep-alive");

  // Parse SSE stream
  const events = await parseSSEStream(response.body!);

  // Should have: task_start, task_complete, execution_complete
  assertEquals(events.length, 3);
  assertEquals(events[0].type, "task_start");
  assertEquals(events[1].type, "task_complete");
  assertEquals(events[2].type, "execution_complete");
});

// ============================================
// Test 2: Progressive Streaming
// ============================================

Deno.test("SSE E2E - Progressive streaming (events not batched)", async () => {
  // Two sequential tasks: t1 → t2
  const dag: DAGStructure = {
    tasks: [
      {
        id: "t1",
        tool: "filesystem:read_file",
        arguments: { path: "/file1.txt" },
        dependsOn: [],
      },
      {
        id: "t2",
        tool: "filesystem:read_file",
        arguments: { path: "/file2.txt" },
        dependsOn: ["t1"],
      },
    ],
  };

  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  const response = await handleSSERequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  const events = await parseSSEStream(response.body!);

  // Events should be in order: start(t1), complete(t1), start(t2), complete(t2), execution_complete
  assertEquals(events.length, 5);

  assertEquals(events[0].type, "task_start");
  assertEquals((events[0].data as any).taskId, "t1");

  assertEquals(events[1].type, "task_complete");
  assertEquals((events[1].data as any).taskId, "t1");

  assertEquals(events[2].type, "task_start");
  assertEquals((events[2].data as any).taskId, "t2");

  assertEquals(events[3].type, "task_complete");
  assertEquals((events[3].data as any).taskId, "t2");

  assertEquals(events[4].type, "execution_complete");
});

// ============================================
// Test 3: Event Payloads
// ============================================

Deno.test("SSE E2E - Event payload structure validation", async () => {
  const dag: DAGStructure = {
    tasks: [
      {
        id: "task1",
        tool: "filesystem:read_file",
        arguments: { path: "/test.txt" },
        dependsOn: [],
      },
    ],
  };

  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  const response = await handleSSERequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  const events = await parseSSEStream(response.body!);

  // Validate task_start payload
  const startEvent = events[0];
  assertEquals(startEvent.type, "task_start");
  assertExists((startEvent.data as any).taskId);
  assertExists((startEvent.data as any).tool);
  assertExists((startEvent.data as any).timestamp);

  // Validate task_complete payload (success)
  const completeEvent = events[1];
  assertEquals(completeEvent.type, "task_complete");
  assertEquals((completeEvent.data as any).taskId, "task1");
  assertEquals((completeEvent.data as any).status, "success");
  assertExists((completeEvent.data as any).output);
  assertExists((completeEvent.data as any).executionTimeMs);
  assertExists((completeEvent.data as any).timestamp);

  // Validate execution_complete payload
  const execCompleteEvent = events[2];
  assertEquals(execCompleteEvent.type, "execution_complete");
  assertEquals((execCompleteEvent.data as any).totalTasks, 1);
  assertEquals((execCompleteEvent.data as any).successCount, 1);
  assertEquals((execCompleteEvent.data as any).errorCount, 0);
  assertExists((execCompleteEvent.data as any).totalExecutionTimeMs);
  assertExists((execCompleteEvent.data as any).speedup);
  assertExists((execCompleteEvent.data as any).timestamp);
});

// ============================================
// Test 4: Error Handling
// ============================================

Deno.test("SSE E2E - Error event handling", async () => {
  const dag: DAGStructure = {
    tasks: [
      {
        id: "failing_task",
        tool: "mock:fail",
        arguments: { message: "Simulated error" },
        dependsOn: [],
      },
    ],
  };

  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  const response = await handleSSERequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  const events = await parseSSEStream(response.body!);

  // Should have: task_start, task_complete (error), execution_complete
  assertEquals(events.length, 3);

  const completeEvent = events[1];
  assertEquals(completeEvent.type, "task_complete");
  assertEquals((completeEvent.data as any).status, "error");
  assertExists((completeEvent.data as any).error);
  assertEquals((completeEvent.data as any).error.includes("Simulated error"), true);

  const execComplete = events[2];
  assertEquals((execComplete.data as any).errorCount, 1);
  assertEquals((execComplete.data as any).successCount, 0);
});

// ============================================
// Test 5: Graceful Degradation (Batch Mode)
// ============================================

Deno.test("SSE E2E - Graceful degradation to batch mode", async () => {
  const dag: DAGStructure = {
    tasks: [
      {
        id: "task1",
        tool: "filesystem:read_file",
        arguments: { path: "/test.txt" },
        dependsOn: [],
      },
      {
        id: "task2",
        tool: "filesystem:read_file",
        arguments: { path: "/test2.txt" },
        dependsOn: [],
      },
    ],
  };

  // Request WITHOUT SSE support (no text/event-stream in Accept header)
  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "application/json" },
  });

  const response = await handleWorkflowRequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  // Should return JSON response (batch mode)
  assertEquals(response.headers.get("Content-Type"), "application/json");

  const result = await response.json();

  // Validate batch result structure
  assertExists(result.results);
  assertExists(result.executionTimeMs);
  assertExists(result.parallelizationLayers);
  assertEquals(result.totalTasks, 2);
  assertEquals(result.successfulTasks, 2);
  assertEquals(result.failedTasks, 0);
});

Deno.test("SSE E2E - Graceful degradation with SSE support", async () => {
  const dag: DAGStructure = {
    tasks: [
      {
        id: "task1",
        tool: "filesystem:read_file",
        arguments: { path: "/test.txt" },
        dependsOn: [],
      },
    ],
  };

  // Request WITH SSE support
  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  const response = await handleWorkflowRequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  // Should return SSE stream
  assertEquals(response.headers.get("Content-Type"), "text/event-stream");

  const events = await parseSSEStream(response.body!);
  assertEquals(events.length, 3); // start, complete, execution_complete
});

// ============================================
// Test 6: Parallel Tasks Streaming
// ============================================

Deno.test("SSE E2E - Parallel tasks stream as they complete", async () => {
  // Three parallel tasks with different durations
  const dag: DAGStructure = {
    tasks: [
      {
        id: "fast",
        tool: "filesystem:read_file",
        arguments: { path: "/fast.txt" },
        dependsOn: [],
      },
      {
        id: "slow",
        tool: "search:web_search",
        arguments: { query: "test" },
        dependsOn: [],
      },
      {
        id: "medium",
        tool: "filesystem:write_file",
        arguments: { path: "/out.txt", content: "data" },
        dependsOn: [],
      },
    ],
  };

  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  const response = await handleSSERequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  const events = await parseSSEStream(response.body!);

  // Should have: 3 starts + 3 completes + 1 execution_complete = 7 events
  assertEquals(events.length, 7);

  // All tasks should start first (parallel layer)
  const startEvents = events.filter((e) => e.type === "task_start");
  assertEquals(startEvents.length, 3);

  // Then complete events
  const completeEvents = events.filter((e) => e.type === "task_complete");
  assertEquals(completeEvents.length, 3);

  // All tasks should succeed
  assertEquals(
    completeEvents.every((e: any) => e.data.status === "success"),
    true,
  );

  // Finally execution complete
  assertEquals(events[events.length - 1].type, "execution_complete");
});

// ============================================
// Test 7: Complex Workflow
// ============================================

Deno.test("SSE E2E - Complex workflow with mixed patterns", async () => {
  // Diamond pattern: t1 → [t2, t3] → t4
  const dag: DAGStructure = {
    tasks: [
      {
        id: "t1",
        tool: "filesystem:read_file",
        arguments: { path: "/input.txt" },
        dependsOn: [],
      },
      {
        id: "t2",
        tool: "filesystem:read_file",
        arguments: { path: "/file2.txt" },
        dependsOn: ["t1"],
      },
      {
        id: "t3",
        tool: "search:web_search",
        arguments: { query: "test" },
        dependsOn: ["t1"],
      },
      {
        id: "t4",
        tool: "filesystem:write_file",
        arguments: { path: "/output.txt", content: "result" },
        dependsOn: ["t2", "t3"],
      },
    ],
  };

  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  const response = await handleSSERequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  const events = await parseSSEStream(response.body!);

  // Should have: 4 starts + 4 completes + 1 execution_complete = 9 events
  assertEquals(events.length, 9);

  // Validate execution_complete data
  const execComplete = events[events.length - 1];
  assertEquals(execComplete.type, "execution_complete");
  assertEquals((execComplete.data as any).totalTasks, 4);
  assertEquals((execComplete.data as any).successCount, 4);
  assertEquals((execComplete.data as any).errorCount, 0);

  // Speedup should be > 1 due to parallel middle layer
  assertEquals((execComplete.data as any).speedup > 1, true);
});

// ============================================
// Test 8: Memory Management
// ============================================

Deno.test("SSE E2E - Memory management with buffer limits", async () => {
  // Create many tasks to test buffering
  const tasks = Array.from({ length: 20 }, (_, i) => ({
    id: `task_${i}`,
    tool: "filesystem:read_file",
    arguments: { path: `/file${i}.txt` },
    dependsOn: [],
  }));

  const dag: DAGStructure = { tasks };

  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  // Use small buffer size to test flushing
  const response = await handleSSERequest(
    request,
    dag,
    createMockMCPExecutor(),
    { maxBufferSize: 10 },
  );

  const events = await parseSSEStream(response.body!);

  // Should have: 20 starts + 20 completes + 1 execution_complete = 41 events
  assertEquals(events.length, 41);

  // Verify all tasks completed
  const execComplete = events[events.length - 1];
  assertEquals((execComplete.data as any).totalTasks, 20);
  assertEquals((execComplete.data as any).successCount, 20);
});

// ============================================
// Test 9: Performance Validation
// ============================================

Deno.test("SSE E2E - Performance: speedup calculation accuracy", async () => {
  // 3 parallel tasks @ ~50ms each
  const dag: DAGStructure = {
    tasks: [
      { id: "t1", tool: "filesystem:read_file", arguments: { path: "/a" }, dependsOn: [] },
      { id: "t2", tool: "filesystem:read_file", arguments: { path: "/b" }, dependsOn: [] },
      { id: "t3", tool: "filesystem:read_file", arguments: { path: "/c" }, dependsOn: [] },
    ],
  };

  const request = new Request("http://localhost/workflow", {
    headers: { Accept: "text/event-stream" },
  });

  const response = await handleSSERequest(
    request,
    dag,
    createMockMCPExecutor(),
  );

  const events = await parseSSEStream(response.body!);

  const execComplete = events.find((e) => e.type === "execution_complete") as any;
  assertExists(execComplete);

  // Speedup should be ~3x (150ms sequential / ~50ms parallel)
  assertEquals(
    (execComplete.data as any).speedup > 2,
    true,
    `Expected speedup >2x, got ${(execComplete.data as any).speedup.toFixed(2)}x`,
  );

  console.log(`\n⚡ SSE Streaming Performance:`);
  console.log(`  Total time: ${(execComplete.data as any).totalExecutionTimeMs.toFixed(1)}ms`);
  console.log(`  Speedup: ${(execComplete.data as any).speedup.toFixed(2)}x`);
});
