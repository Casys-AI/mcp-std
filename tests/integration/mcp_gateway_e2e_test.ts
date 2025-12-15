/**
 * MCP Gateway E2E Integration Test
 *
 * End-to-end test simulating Claude Code client interacting with Casys PML gateway.
 * Tests the complete flow: stdio transport, MCP protocol, tool execution.
 *
 * @module tests/integration/mcp_gateway_e2e_test
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { createDefaultClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import { PMLGatewayServer } from "../../src/mcp/gateway-server.ts";
import { EmbeddingModel } from "../../src/vector/embeddings.ts";
import { VectorSearch } from "../../src/vector/search.ts";
import { GraphRAGEngine } from "../../src/graphrag/graph-engine.ts";
import { DAGSuggester } from "../../src/graphrag/dag-suggester.ts";
import { ParallelExecutor } from "../../src/dag/executor.ts";
import type { PGliteClient } from "../../src/db/client.ts";
import type { MCPTool } from "../../src/mcp/types.ts";

/**
 * Setup test database with sample tools
 */
async function setupTestDatabase(db: PGliteClient): Promise<void> {
  // Insert sample tool schemas
  await db.exec(`
    INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
    VALUES
      ('test-server:test_tool', 'test-server', 'test_tool', 'A test tool for testing purposes',
       '{"type":"object","properties":{"input":{"type":"string"}}}'::jsonb),
      ('mock-server:mock_action', 'mock-server', 'mock_action', 'Mock action for integration testing',
       '{"type":"object","properties":{"action":{"type":"string"}}}'::jsonb)
    ON CONFLICT (tool_id) DO UPDATE SET
      description = EXCLUDED.description,
      input_schema = EXCLUDED.input_schema
  `);

  // Insert sample tool embeddings (using zero vectors for testing)
  const embedding = new Array(1024).fill(0);
  embedding[0] = 1.0; // Make non-zero to avoid division by zero

  await db.exec(`
    INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata)
    VALUES
      ('test-server:test_tool', 'test-server', 'test_tool', '[${embedding.join(",")}]', '{}'),
      ('mock-server:mock_action', 'mock-server', 'mock_action', '[${embedding.join(",")}]', '{}')
    ON CONFLICT (tool_id) DO UPDATE SET
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata
  `);
}

/**
 * Mock MCP client for testing
 */
function createMockMCPClient() {
  return {
    callTool: async (toolName: string, args: Record<string, unknown>) => {
      return {
        success: true,
        result: `Mock result for ${toolName}`,
        args,
      };
    },
    disconnect: async () => {},
    close: async () => {},
  };
}

/**
 * Mock tool executor for ParallelExecutor
 */
function createMockToolExecutor() {
  return async (toolName: string, args: Record<string, unknown>) => {
    return {
      success: true,
      output: `Executed ${toolName}`,
      args,
    };
  };
}

Deno.test({
  name: "MCP Gateway E2E - Full integration test",
  async fn() {
    // 1. Setup database
    const db = createDefaultClient();
    await db.connect();

    const runner = new MigrationRunner(db);
    await runner.runUp(getAllMigrations());

    await setupTestDatabase(db);

    try {
      // 2. Initialize components
      const embeddingModel = new EmbeddingModel();
      await embeddingModel.load();

      const vectorSearch = new VectorSearch(db, embeddingModel);
      const graphEngine = new GraphRAGEngine(db);
      await graphEngine.syncFromDatabase();

      const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

      const toolExecutor = createMockToolExecutor();
      const executor = new ParallelExecutor(toolExecutor);

      // Create mock MCP clients
      const mcpClients = new Map();
      mcpClients.set("test-server", createMockMCPClient());
      mcpClients.set("mock-server", createMockMCPClient());

      // 3. Create gateway
      const gateway = new PMLGatewayServer(
        db,
        vectorSearch,
        graphEngine,
        dagSuggester,
        executor,
        mcpClients,
        undefined, // capabilityStore
        undefined, // adaptiveThresholdManager
        {
          name: "pml-test",
          version: "1.0.0-test",
        },
      );

      // 4. Test list_tools (simulating Claude Code request)
      const handleListTools = (gateway as any).handleListTools.bind(gateway);
      const listResult = await handleListTools({
        params: { query: "test" },
      });

      assertExists(listResult.tools);
      assert(Array.isArray(listResult.tools));
      assert(listResult.tools.length > 0);

      // Verify workflow tool is present (renamed in Story 2.5-4)
      const workflowTool = listResult.tools.find((t: MCPTool) =>
        t.name === "pml:execute_dag"
      );
      assertExists(workflowTool);

      // 5. Test call_tool for single tool (simulating Claude Code calling a tool)
      const handleCallTool = (gateway as any).handleCallTool.bind(gateway);
      const callResult = await handleCallTool({
        params: {
          name: "test-server:test_tool",
          arguments: { input: "test input" },
        },
      });

      assertExists(callResult.content);
      assert(Array.isArray(callResult.content));
      assertEquals(callResult.content[0].type, "text");

      const parsedResult = JSON.parse(callResult.content[0].text);
      assertEquals(parsedResult.success, true);

      // 6. Test workflow execution (renamed in Story 2.5-4)
      const workflowResult = await handleCallTool({
        params: {
          name: "pml:execute_dag",
          arguments: {
            workflow: {
              tasks: [
                {
                  id: "task1",
                  tool: "test-server:test_tool",
                  arguments: { input: "workflow test" },
                  dependsOn: [],
                },
                {
                  id: "task2",
                  tool: "mock-server:mock_action",
                  arguments: { action: "test" },
                  dependsOn: ["task1"],
                },
              ],
            },
          },
        },
      });

      assertExists(workflowResult.content);
      const workflowResponse = JSON.parse(workflowResult.content[0].text);
      assertEquals(workflowResponse.status, "completed");
      assertExists(workflowResponse.results);

      console.log("✓ E2E integration test completed successfully");
    } finally {
      await db.close();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "MCP Gateway E2E - Error handling",
  async fn() {
    const db = createDefaultClient();
    await db.connect();

    const runner = new MigrationRunner(db);
    await runner.runUp(getAllMigrations());

    try {
      const embeddingModel = new EmbeddingModel();
      await embeddingModel.load();

      const vectorSearch = new VectorSearch(db, embeddingModel);
      const graphEngine = new GraphRAGEngine(db);
      await graphEngine.syncFromDatabase();

      const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);
      const toolExecutor = createMockToolExecutor();
      const executor = new ParallelExecutor(toolExecutor);

      const mcpClients = new Map();

      const gateway = new PMLGatewayServer(
        db,
        vectorSearch,
        graphEngine,
        dagSuggester,
        executor,
        mcpClients,
      );

      // Test calling unknown server
      const handleCallTool = (gateway as any).handleCallTool.bind(gateway);
      const errorResult = await handleCallTool({
        params: {
          name: "unknown:tool",
          arguments: {},
        },
      });

      // Should return MCP-compliant error
      assertExists(errorResult.error);
      assertEquals(errorResult.error.code, -32602); // INVALID_PARAMS
      assert(errorResult.error.message.includes("Unknown MCP server"));

      console.log("✓ Error handling test completed successfully");
    } finally {
      await db.close();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
