/**
 * E2E Test 06: DAG Execution
 *
 * Tests parallel DAG execution with mock MCP servers.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { MockMCPServer } from "../fixtures/mock-mcp-server.ts";
import { ParallelExecutor } from "../../src/dag/executor.ts";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import type { ToolExecutor } from "../../src/dag/types.ts";

Deno.test("E2E 06: DAG parallel execution", async (t) => {
  let executor: ParallelExecutor;
  const servers = new Map<string, MockMCPServer>();

  try {
    await t.step("1. Create mock MCP servers", () => {
      const server1 = new MockMCPServer("server1");
      server1.addTool("step1", (args: any) => ({ result: `output-${args.input}` }), 10);
      server1.addTool("step2", (args: any) => ({ result: `processed-${args.data}` }), 15);

      const server2 = new MockMCPServer("server2");
      server2.addTool("transform", (args: any) => ({ result: `transformed-${args.value}` }), 20);

      servers.set("server1", server1);
      servers.set("server2", server2);
    });

    await t.step("2. Create tool executor function", () => {
      const toolExecutor: ToolExecutor = async (
        toolName: string,
        args: any,
      ) => {
        const [serverId, tool] = toolName.split(":");
        const server = servers.get(serverId);

        if (!server) {
          throw new Error(`Server not found: ${serverId}`);
        }

        if (!server.hasTool(tool)) {
          throw new Error(`Tool not found: ${toolName}`);
        }

        return await server.callTool(tool, args);
      };

      executor = new ParallelExecutor(toolExecutor, { verbose: true });
    });

    await t.step("3. Execute simple sequential DAG", async () => {
      const dag: DAGStructure = {
        tasks: [
          {
            id: "task1",
            tool: "server1:step1",
            arguments: { input: "test" },
            dependsOn: [],
          },
          {
            id: "task2",
            tool: "server1:step2",
            arguments: { data: "$OUTPUT[task1].result" },
            dependsOn: ["task1"],
          },
        ],
      };

      const result = await executor.execute(dag);

      assertEquals(result.totalTasks, 2, "Should execute 2 tasks");
      assertEquals(result.errors.length, 0, "Should have no errors");
      assertEquals(result.parallelizationLayers, 2, "Should have 2 layers (sequential)");

      const successfulTasks = result.results.filter((r) => r.status === "success");
      assertEquals(successfulTasks.length, 2, "Both tasks should succeed");

      console.log(`  Execution time: ${result.executionTimeMs.toFixed(1)}ms`);
    });

    await t.step("4. Execute parallel DAG", async () => {
      // Reset call counters
      servers.forEach((s) => s.reset());

      const dag: DAGStructure = {
        tasks: [
          {
            id: "parallel1",
            tool: "server1:step1",
            arguments: { input: "a" },
            dependsOn: [],
          },
          {
            id: "parallel2",
            tool: "server1:step1",
            arguments: { input: "b" },
            dependsOn: [],
          },
          {
            id: "parallel3",
            tool: "server2:transform",
            arguments: { value: "c" },
            dependsOn: [],
          },
        ],
      };

      const result = await executor.execute(dag);

      assertEquals(result.totalTasks, 3, "Should execute 3 tasks");
      assertEquals(result.parallelizationLayers, 1, "Should have 1 layer (all parallel)");
      assertEquals(result.errors.length, 0, "Should have no errors");

      console.log(`  Parallel execution time: ${result.executionTimeMs.toFixed(1)}ms`);
      console.log(`  Speedup vs sequential: ~${(30 / result.executionTimeMs).toFixed(1)}x`);
    });

    await t.step("5. Execute complex DAG with dependencies", async () => {
      const dag: DAGStructure = {
        tasks: [
          // Layer 1: 2 parallel tasks
          { id: "t1", tool: "server1:step1", arguments: { input: "1" }, dependsOn: [] },
          { id: "t2", tool: "server1:step1", arguments: { input: "2" }, dependsOn: [] },

          // Layer 2: depends on t1
          {
            id: "t3",
            tool: "server1:step2",
            arguments: { data: "$OUTPUT[t1].result" },
            dependsOn: ["t1"],
          },

          // Layer 3: depends on both t2 and t3
          {
            id: "t4",
            tool: "server2:transform",
            arguments: { value: "$OUTPUT[t3].result" },
            dependsOn: ["t2", "t3"],
          },
        ],
      };

      const result = await executor.execute(dag);

      assertEquals(result.totalTasks, 4, "Should execute 4 tasks");
      assertEquals(result.errors.length, 0, "Should have no errors");
      assertEquals(result.parallelizationLayers, 3, "Should have 3 layers");

      console.log(
        `  Complex DAG: ${result.parallelizationLayers} layers, ${
          result.executionTimeMs.toFixed(1)
        }ms`,
      );
    });

    await t.step("6. Test partial failure handling", async () => {
      // Add a tool that fails
      const server = servers.get("server1")!;
      server.addTool("fail", () => {
        throw new Error("Intentional failure");
      });

      const dag: DAGStructure = {
        tasks: [
          { id: "success", tool: "server1:step1", arguments: { input: "ok" }, dependsOn: [] },
          { id: "failure", tool: "server1:fail", arguments: {}, dependsOn: [] },
        ],
      };

      const result = await executor.execute(dag);

      assertEquals(result.errors.length, 1, "Should have 1 error");
      assert(result.errors[0].taskId === "failure", "Error should be from 'failure' task");

      const successCount = result.results.filter((r) => r.status === "success").length;
      assertEquals(successCount, 1, "One task should still succeed");
    });

    await t.step("7. Test $OUTPUT reference resolution", async () => {
      const dag: DAGStructure = {
        tasks: [
          {
            id: "source",
            tool: "server1:step1",
            arguments: { input: "data" },
            dependsOn: [],
          },
          {
            id: "consumer",
            tool: "server1:step2",
            arguments: { data: "$OUTPUT[source].result" },
            dependsOn: ["source"],
          },
        ],
      };

      const result = await executor.execute(dag);

      assertEquals(result.errors.length, 0, "Should resolve references correctly");

      const consumerResult = result.results.find((r) => r.taskId === "consumer");
      assert(consumerResult?.status === "success", "Consumer should succeed");
    });

    await t.step("8. Test performance with 10-task DAG", async () => {
      const tasks = [];
      for (let i = 0; i < 10; i++) {
        tasks.push({
          id: `task${i}`,
          tool: "server1:step1",
          arguments: { input: `value${i}` },
          dependsOn: i > 0 ? [`task${i - 1}`] : [],
        });
      }

      const dag: DAGStructure = { tasks };

      const start = performance.now();
      const result = await executor.execute(dag);
      const duration = performance.now() - start;

      assertEquals(result.totalTasks, 10, "Should execute 10 tasks");
      assert(duration < 3000, `Execution too slow: ${duration.toFixed(1)}ms`);

      console.log(`  10-task DAG: ${duration.toFixed(1)}ms (P95 < 3s target)`);
    });
  } finally {
    // Cleanup
    servers.clear();
  }
});
