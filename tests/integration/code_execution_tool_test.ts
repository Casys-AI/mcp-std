/**
 * Integration Tests: agentcards:execute_code MCP Tool
 *
 * Tests the execute_code tool through the gateway server.
 * Validates intent-based mode, explicit mode, error handling, and metrics.
 *
 * Story 3.4 - AC: #1, #2, #3, #4, #5, #6, #7
 *
 * @module tests/integration/code_execution_tool_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PMLGatewayServer } from "../../src/mcp/gateway-server.ts";
import { createDefaultClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import { VectorSearch } from "../../src/vector/search.ts";
import { EmbeddingModel } from "../../src/vector/embeddings.ts";
import { GraphRAGEngine } from "../../src/graphrag/graph-engine.ts";
import { DAGSuggester } from "../../src/graphrag/dag-suggester.ts";
import { ParallelExecutor } from "../../src/dag/executor.ts";
import type { PGliteClient } from "../../src/db/client.ts";

/**
 * Shared test context (initialized once)
 */
let sharedDb: PGliteClient;
let sharedEmbeddingModel: EmbeddingModel;

/**
 * Initialize shared resources once for all tests
 */
async function initializeOnce() {
  if (!sharedDb) {
    sharedDb = createDefaultClient();
    await sharedDb.connect();

    const runner = new MigrationRunner(sharedDb);
    await runner.runUp(getAllMigrations());
  }

  if (!sharedEmbeddingModel) {
    sharedEmbeddingModel = new EmbeddingModel();
    await sharedEmbeddingModel.load();
  }
}

/**
 * Helper to create test gateway with shared dependencies
 */
async function createTestGateway() {
  await initializeOnce();

  const vectorSearch = new VectorSearch(sharedDb, sharedEmbeddingModel);
  const graphEngine = new GraphRAGEngine(sharedDb);
  const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);
  const executor = new ParallelExecutor(async () => ({}));

  const gateway = new PMLGatewayServer(
    sharedDb,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    new Map(),
  );

  return gateway;
}

Deno.test({
  name: "Integration: execute_code tool registration",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const gateway = await createTestGateway();

    // Call handleListTools via reflection (test internal method)
    const listToolsMethod = (gateway as any).handleListTools.bind(gateway);
    const result = await listToolsMethod({});

    // Verify execute_code tool is registered
    const executeCodeTool = result.tools.find((t: any) => t.name === "pml:execute_code");

    assertExists(executeCodeTool, "execute_code tool should be registered");
    assertEquals(
      executeCodeTool.inputSchema.required,
      ["code"],
      "code should be required parameter",
    );
  },
});

Deno.test({
  name: "Integration: execute_code explicit mode (simple arithmetic)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const gateway = await createTestGateway();

    // Execute simple code
    const handleExecuteCode = (gateway as any).handleExecuteCode.bind(gateway);
    const result = await handleExecuteCode({
      code: "return 1 + 1;",
    });

    // Verify result structure
    assertExists(result.content, "Result should have content");
    const response = JSON.parse(result.content[0].text);

    assertEquals(response.result, 2, "Code should return 2");
    assertExists(response.metrics, "Metrics should be present");
    assertExists(response.metrics.executionTimeMs, "Execution time should be tracked");
  },
});

Deno.test({
  name: "Integration: execute_code error handling (syntax error)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const gateway = await createTestGateway();

    // Execute invalid code
    const handleExecuteCode = (gateway as any).handleExecuteCode.bind(gateway);
    const result = await handleExecuteCode({
      code: "return 1 +;", // Syntax error
    });

    // Verify error response
    assertExists(result.error, "Error should be present");
    assertEquals(
      result.error.code,
      -32603,
      "Should return internal error code",
    );
  },
});

Deno.test({
  name: "Integration: execute_code timeout handling",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const gateway = await createTestGateway();

    // Execute code that times out
    const handleExecuteCode = (gateway as any).handleExecuteCode.bind(gateway);
    const result = await handleExecuteCode({
      code: "while (true) { /* infinite loop */ }",
      sandbox_config: {
        timeout: 100, // 100ms timeout
      },
    });

    // Verify timeout error
    assertExists(result.error, "Timeout error should be present");
  },
});

Deno.test({
  name: "Integration: execute_code with context injection",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const gateway = await createTestGateway();

    // Execute with custom context
    const handleExecuteCode = (gateway as any).handleExecuteCode.bind(gateway);
    const result = await handleExecuteCode({
      code: "return { sum: data.a + data.b };",
      context: {
        data: { a: 10, b: 20 },
      },
    });

    // Verify result
    assertExists(result.content, "Result should have content");
    const response = JSON.parse(result.content[0].text);
    assertEquals(response.result.sum, 30, "Should compute sum from context");
  },
});

Deno.test({
  name: "Integration: execute_code validation (code size limit)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const gateway = await createTestGateway();

    // Generate code larger than 100KB
    const largeCode = "return 1;" + " ".repeat(101 * 1024);

    const handleExecuteCode = (gateway as any).handleExecuteCode.bind(gateway);
    const result = await handleExecuteCode({
      code: largeCode,
    });

    // Verify validation error
    assertExists(result.error, "Validation error should be present");
    assertEquals(
      result.error.code,
      -32602,
      "Should return invalid params error",
    );
  },
});
