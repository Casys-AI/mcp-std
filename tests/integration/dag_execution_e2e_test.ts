/**
 * DAG Execution End-to-End Integration Test
 *
 * Validates the complete workflow:
 * 1. DAGSuggester generates DAG from intent
 * 2. ParallelExecutor executes DAG with real/mock MCP tools
 * 3. Results are aggregated correctly
 *
 * This test bridges Story 2.1 (GraphRAG/DAG Suggester) and Story 2.2 (Parallel Executor)
 */

import { assertEquals, assertExists } from "@std/assert";
import { ParallelExecutor } from "../../src/dag/executor.ts";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import type { ToolExecutor } from "../../src/dag/types.ts";

// ============================================
// Mock MCP Tool Executor
// ============================================

/**
 * Create a mock MCP tool executor that simulates real tool execution
 *
 * In a real system, this would:
 * 1. Parse tool string (e.g., "filesystem:read_file")
 * 2. Get MCP client for server
 * 3. Call client.callTool(toolName, args)
 *
 * For this test, we simulate tools with realistic behavior
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

      if (toolName === "list_directory") {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          success: true,
          files: ["file1.ts", "file2.ts", "file3.ts"],
          count: 3,
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
        await new Promise((resolve) => setTimeout(resolve, 200));
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

    // Simulate fetch tools
    if (serverId === "fetch") {
      if (toolName === "fetch_url") {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return {
          success: true,
          url: args.url,
          statusCode: 200,
          content: `<html>Mock content from ${args.url}</html>`,
        };
      }
    }

    // Default: return tool not found
    throw new Error(`Unknown tool: ${tool}`);
  };
}

// ============================================
// Test 1: Simple Parallel Workflow
// ============================================

Deno.test("E2E - Simple parallel workflow (3 independent file reads)", async () => {
  const executor = new ParallelExecutor(createMockMCPExecutor());

  // DAG: Read 3 files in parallel
  const dag: DAGStructure = {
    tasks: [
      {
        id: "read_config",
        tool: "filesystem:read_file",
        arguments: { path: "/app/config.json" },
        dependsOn: [],
      },
      {
        id: "read_schema",
        tool: "filesystem:read_file",
        arguments: { path: "/app/schema.sql" },
        dependsOn: [],
      },
      {
        id: "read_readme",
        tool: "filesystem:read_file",
        arguments: { path: "/app/README.md" },
        dependsOn: [],
      },
    ],
  };

  const result = await executor.execute(dag);

  // Validate results
  assertEquals(result.totalTasks, 3);
  assertEquals(result.successfulTasks, 3);
  assertEquals(result.failedTasks, 0);
  assertEquals(result.parallelizationLayers, 1); // All parallel

  // Should execute in parallel (~50ms), not sequential (~150ms)
  assertEquals(
    result.executionTimeMs < 100,
    true,
    `Expected <100ms, got ${result.executionTimeMs.toFixed(1)}ms`,
  );

  // Validate individual results
  const configResult = result.results.find((r) => r.taskId === "read_config");
  assertExists(configResult);
  assertEquals(configResult?.status, "success");
  assertExists((configResult?.output as any)?.content);

  // Calculate speedup
  const speedup = executor.calculateSpeedup(result);
  assertEquals(speedup > 2.5, true, `Expected speedup >2.5x, got ${speedup.toFixed(2)}x`);
});

// ============================================
// Test 2: Sequential Workflow with Dependencies
// ============================================

Deno.test("E2E - Sequential workflow with dependencies (search → fetch → write)", async () => {
  const executor = new ParallelExecutor(createMockMCPExecutor());

  // DAG: search → fetch → write (sequential chain)
  const dag: DAGStructure = {
    tasks: [
      {
        id: "search_docs",
        tool: "search:web_search",
        arguments: { query: "TypeScript best practices", limit: 5 },
        dependsOn: [],
      },
      {
        id: "fetch_page",
        tool: "fetch:fetch_url",
        arguments: { url: "$OUTPUT[search_docs].results[0].url" },
        dependsOn: ["search_docs"],
      },
      {
        id: "save_content",
        tool: "filesystem:write_file",
        arguments: {
          path: "/tmp/fetched_content.html",
          content: "$OUTPUT[fetch_page].content",
        },
        dependsOn: ["fetch_page"],
      },
    ],
  };

  const result = await executor.execute(dag);

  // Validate results
  assertEquals(result.totalTasks, 3);
  assertEquals(result.successfulTasks, 3);
  assertEquals(result.failedTasks, 0);
  assertEquals(result.parallelizationLayers, 3); // Fully sequential

  // Should take ~410ms (200 + 150 + 60)
  assertEquals(result.executionTimeMs > 300, true);
  assertEquals(result.executionTimeMs < 500, true);

  // Validate $OUTPUT resolution worked
  const saveResult = result.results.find((r) => r.taskId === "save_content");
  assertExists(saveResult);
  assertEquals(saveResult?.status, "success");
  assertEquals((saveResult?.output as any)?.success, true);
});

// ============================================
// Test 3: Mixed Parallel/Sequential (Diamond Pattern)
// ============================================

Deno.test("E2E - Mixed parallel/sequential (diamond pattern)", async () => {
  const executor = new ParallelExecutor(createMockMCPExecutor());

  // DAG: list_dir → [read_file1, read_file2] → write_summary
  const dag: DAGStructure = {
    tasks: [
      {
        id: "list_files",
        tool: "filesystem:list_directory",
        arguments: { path: "/app/src" },
        dependsOn: [],
      },
      {
        id: "read_file1",
        tool: "filesystem:read_file",
        arguments: { path: "/app/src/file1.ts" },
        dependsOn: ["list_files"],
      },
      {
        id: "read_file2",
        tool: "filesystem:read_file",
        arguments: { path: "/app/src/file2.ts" },
        dependsOn: ["list_files"],
      },
      {
        id: "write_summary",
        tool: "filesystem:write_file",
        arguments: {
          path: "/tmp/summary.txt",
          content: "Summary of file1 and file2",
        },
        dependsOn: ["read_file1", "read_file2"],
      },
    ],
  };

  const result = await executor.execute(dag);

  // Validate results
  assertEquals(result.totalTasks, 4);
  assertEquals(result.successfulTasks, 4);
  assertEquals(result.failedTasks, 0);
  assertEquals(result.parallelizationLayers, 3); // [list] → [read1, read2] → [write]

  // Verify layer structure
  const stats = executor.getStats(result);
  assertEquals(stats.totalTasks, 4);
  assertEquals(stats.successRate, 100);
  assertEquals(stats.parallelizationLayers, 3);

  // Should be faster than pure sequential (30 + 100 + 60 = 190ms)
  // But slower than pure parallel (~100ms)
  assertEquals(result.executionTimeMs < 250, true);
});

// ============================================
// Test 4: Partial Failure Handling
// ============================================

Deno.test("E2E - Partial failure handling (one task fails, others continue)", async () => {
  const executor = new ParallelExecutor(createMockMCPExecutor());

  // DAG: 3 parallel tasks, one will fail
  const dag: DAGStructure = {
    tasks: [
      {
        id: "valid_task1",
        tool: "filesystem:read_file",
        arguments: { path: "/app/config.json" },
        dependsOn: [],
      },
      {
        id: "invalid_task",
        tool: "nonexistent:bad_tool", // This will fail
        arguments: { foo: "bar" },
        dependsOn: [],
      },
      {
        id: "valid_task2",
        tool: "filesystem:list_directory",
        arguments: { path: "/app/src" },
        dependsOn: [],
      },
    ],
  };

  const result = await executor.execute(dag);

  // Validate partial success
  assertEquals(result.totalTasks, 3);
  assertEquals(result.successfulTasks, 2); // valid_task1 and valid_task2 succeed
  assertEquals(result.failedTasks, 1); // invalid_task fails
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].taskId, "invalid_task");
  assertEquals(result.errors[0].error.includes("Unknown tool"), true);

  // Verify successful tasks completed
  const task1 = result.results.find((r) => r.taskId === "valid_task1");
  const task2 = result.results.find((r) => r.taskId === "valid_task2");
  assertEquals(task1?.status, "success");
  assertEquals(task2?.status, "success");
});

// ============================================
// Test 5: Complex Workflow (Realistic Example)
// ============================================

Deno.test("E2E - Complex workflow with 8 tasks (mixed pattern)", async () => {
  const executor = new ParallelExecutor(createMockMCPExecutor(), { verbose: true });

  // DAG representing a realistic workflow:
  // [search, list_dir] → [fetch, read_file1, read_file2] → [write1, write2] → summary
  const dag: DAGStructure = {
    tasks: [
      // Layer 1: Independent initiation
      {
        id: "search",
        tool: "search:web_search",
        arguments: { query: "documentation" },
        dependsOn: [],
      },
      {
        id: "list_dir",
        tool: "filesystem:list_directory",
        arguments: { path: "/app" },
        dependsOn: [],
      },
      // Layer 2: Depends on layer 1
      {
        id: "fetch",
        tool: "fetch:fetch_url",
        arguments: { url: "https://example.com/docs" },
        dependsOn: ["search"],
      },
      {
        id: "read1",
        tool: "filesystem:read_file",
        arguments: { path: "/app/file1.ts" },
        dependsOn: ["list_dir"],
      },
      {
        id: "read2",
        tool: "filesystem:read_file",
        arguments: { path: "/app/file2.ts" },
        dependsOn: ["list_dir"],
      },
      // Layer 3: Depends on layer 2
      {
        id: "write1",
        tool: "filesystem:write_file",
        arguments: { path: "/tmp/fetched.html", content: "$OUTPUT[fetch].content" },
        dependsOn: ["fetch"],
      },
      {
        id: "write2",
        tool: "filesystem:write_file",
        arguments: { path: "/tmp/combined.txt", content: "combined" },
        dependsOn: ["read1", "read2"],
      },
      // Layer 4: Final summary
      {
        id: "summary",
        tool: "filesystem:write_file",
        arguments: { path: "/tmp/summary.txt", content: "workflow complete" },
        dependsOn: ["write1", "write2"],
      },
    ],
  };

  const result = await executor.execute(dag);

  // Validate results
  assertEquals(result.totalTasks, 8);
  assertEquals(result.successfulTasks, 8);
  assertEquals(result.failedTasks, 0);
  assertEquals(result.parallelizationLayers, 4);

  // Calculate performance
  const stats = executor.getStats(result);
  assertEquals(stats.successRate, 100);
  assertEquals(stats.speedup > 1.2, true); // Should have some speedup despite sequential dependencies

  console.log("\n📊 Complex Workflow Stats:");
  console.log(`  Total tasks: ${stats.totalTasks}`);
  console.log(`  Layers: ${stats.parallelizationLayers}`);
  console.log(`  Execution time: ${result.executionTimeMs.toFixed(1)}ms`);
  console.log(`  Speedup: ${stats.speedup.toFixed(2)}x`);
  console.log(`  Success rate: ${stats.successRate.toFixed(1)}%`);
});

// ============================================
// Test 6: Performance Comparison
// ============================================

Deno.test("E2E - Performance comparison (parallel vs sequential baseline)", async () => {
  const parallelExecutor = new ParallelExecutor(createMockMCPExecutor());

  // 5 independent tasks
  const parallelDAG: DAGStructure = {
    tasks: [
      { id: "t1", tool: "filesystem:read_file", arguments: { path: "/a" }, dependsOn: [] },
      { id: "t2", tool: "filesystem:read_file", arguments: { path: "/b" }, dependsOn: [] },
      { id: "t3", tool: "filesystem:read_file", arguments: { path: "/c" }, dependsOn: [] },
      { id: "t4", tool: "filesystem:read_file", arguments: { path: "/d" }, dependsOn: [] },
      { id: "t5", tool: "filesystem:read_file", arguments: { path: "/e" }, dependsOn: [] },
    ],
  };

  // Same tasks but sequential
  const sequentialDAG: DAGStructure = {
    tasks: [
      { id: "t1", tool: "filesystem:read_file", arguments: { path: "/a" }, dependsOn: [] },
      { id: "t2", tool: "filesystem:read_file", arguments: { path: "/b" }, dependsOn: ["t1"] },
      { id: "t3", tool: "filesystem:read_file", arguments: { path: "/c" }, dependsOn: ["t2"] },
      { id: "t4", tool: "filesystem:read_file", arguments: { path: "/d" }, dependsOn: ["t3"] },
      { id: "t5", tool: "filesystem:read_file", arguments: { path: "/e" }, dependsOn: ["t4"] },
    ],
  };

  // Execute parallel
  const parallelResult = await parallelExecutor.execute(parallelDAG);
  const parallelTime = parallelResult.executionTimeMs;

  // Execute sequential
  const sequentialResult = await parallelExecutor.execute(sequentialDAG);
  const sequentialTime = sequentialResult.executionTimeMs;

  // Validate
  assertEquals(parallelResult.successfulTasks, 5);
  assertEquals(sequentialResult.successfulTasks, 5);

  // Parallel should be significantly faster
  const actualSpeedup = sequentialTime / parallelTime;

  console.log("\n⚡ Performance Comparison:");
  console.log(`  Parallel execution: ${parallelTime.toFixed(1)}ms (1 layer)`);
  console.log(`  Sequential execution: ${sequentialTime.toFixed(1)}ms (5 layers)`);
  console.log(`  Speedup: ${actualSpeedup.toFixed(2)}x`);

  assertEquals(
    actualSpeedup > 3.5,
    true,
    `Expected speedup >3.5x, got ${actualSpeedup.toFixed(2)}x`,
  );
});
