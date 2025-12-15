/**
 * Integration tests for error handling scenarios
 */

import { assert, assertEquals, assertRejects } from "@std/assert";
import { MCPClient } from "../../src/mcp/client.ts";
import { MCPServerError } from "../../src/errors/error-types.ts";
import { VectorSearch } from "../../src/vector/search.ts";
import { PGliteClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";

Deno.test("Integration: MCP server unreachable throws MCPServerError", async () => {
  const server = {
    id: "nonexistent-server",
    name: "Nonexistent Server",
    protocol: "stdio" as const,
    command: "/nonexistent/command",
    args: [],
    env: {},
  };

  const client = new MCPClient(server, 1000);

  await assertRejects(
    async () => {
      await client.connect();
    },
    MCPServerError,
  );
});

Deno.test({
  name: "Integration: MCP client timeout",
  sanitizeResources: false, // Sleep process creates resources
  sanitizeOps: false,
  fn: async () => {
    const server = {
      id: "slow-server",
      name: "Slow Server",
      protocol: "stdio" as const,
      command: "sleep",
      args: ["10"],
      env: {},
    };

    const client = new MCPClient(server, 500); // 500ms timeout

    // Should fail due to timeout or connection error
    await assertRejects(
      async () => {
        await client.connect();
      },
      Error, // Accept any error type
    );
  },
});

Deno.test({
  name: "Integration: Vector search fallback to keyword search",
  sanitizeResources: false, // PGlite may keep file handles open
  fn: async () => {
    // Create in-memory database
    const db = new PGliteClient(":memory:");
    await db.connect();

    try {
      // Initialize database schema
      const runner = new MigrationRunner(db);
      await runner.runUp(getAllMigrations());

      // Use unique tool ID to avoid conflicts
      const uniqueToolId = `test-tool-${Date.now()}`;

      // Insert test data - tool_schema first
      await db.exec(
        `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
         VALUES ('${uniqueToolId}', 'test-server', 'test-tool', 'A test tool for searching', '{}')`,
      );

      // Then insert embedding with correct vector dimension (1024 for BGE-Large-EN-v1.5)
      const dummyEmbedding = new Array(1024).fill(0.1).join(",");
      await db.exec(
        `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding)
         VALUES ('${uniqueToolId}', 'test-server', 'test-tool', '[${dummyEmbedding}]'::vector(1024))`,
      );

      // Create mock embedding model that fails
      const mockEmbeddingModel = {
        encode: async (_query: string) => {
          throw new Error("Embedding model unavailable");
        },
      };

      const vectorSearch = new VectorSearch(
        db,
        mockEmbeddingModel as any,
      );

      // Should fallback to keyword search
      const results = await vectorSearch.searchTools("test", 5, 0.5);

      // Should find at least our test tool (may find others from migrations)
      assert(results.length >= 1, `Expected at least 1 result, got ${results.length}`);

      // Verify our test tool is in the results
      const ourTool = results.find((r) => r.toolName === "test-tool");
      assert(ourTool !== undefined, "Should find our test-tool in results");
      assertEquals(ourTool.score, 0.5); // Keyword search fixed score
    } finally {
      await db.close();
    }
  },
});

Deno.test({
  name: "Integration: Migration rollback on failure",
  sanitizeResources: false, // PGlite may keep file handles open
  fn: async () => {
    const db = new PGliteClient(":memory:");
    await db.connect();

    try {
      const runner = new MigrationRunner(db);

      // Apply initial migrations
      await runner.runUp(getAllMigrations());

      const versionBefore = await runner.getCurrentVersion();
      assert(versionBefore > 0, "Should have applied migrations");

      // Attempt rollback to version 1
      await runner.rollbackTo(1, getAllMigrations());

      const versionAfter = await runner.getCurrentVersion();
      assertEquals(versionAfter, 1, "Should have rolled back to version 1");
    } finally {
      await db.close();
    }
  },
});

Deno.test({
  name: "Integration: Error log persistence",
  sanitizeResources: false, // PGlite may keep file handles open
  fn: async () => {
    const db = new PGliteClient(":memory:");
    await db.connect();

    try {
      // Initialize database with error_log table
      const runner = new MigrationRunner(db);
      await runner.runUp(getAllMigrations());

      // Log an error to database using direct SQL
      const testError = new Error("Test error for logging");
      const context = { userId: "test-user", action: "test-action" };

      // Use string interpolation (safe in test context)
      const contextJson = JSON.stringify(context).replace(/'/g, "''"); // Escape single quotes
      const stack = (testError.stack || "").replace(/'/g, "''");
      await db.exec(
        `INSERT INTO error_log (error_type, message, stack, context)
         VALUES ('${testError.name}', '${testError.message}', '${stack}', '${contextJson}')`,
      );

      // Verify error was logged
      const results = await db.query(
        `SELECT error_type, message, context FROM error_log ORDER BY timestamp DESC LIMIT 1`,
      );

      assertEquals(results.length, 1);
      assertEquals(results[0].error_type, "Error");
      assertEquals(results[0].message, "Test error for logging");

      // PGlite may return JSONB as object or string depending on configuration
      const storedContext = typeof results[0].context === "string"
        ? JSON.parse(results[0].context as string)
        : results[0].context;
      assertEquals(storedContext.userId, "test-user");
    } finally {
      await db.close();
    }
  },
});
