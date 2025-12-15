/**
 * E2E Test 01: Initialization and Migrations
 *
 * Tests database initialization, migrations, and schema setup.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { cleanupTestDatabase, initializeTestDatabase } from "../fixtures/test-helpers.ts";

Deno.test("E2E 01: Database initialization and migrations", async (t) => {
  let testDir: string | undefined;
  let db: any;

  try {
    await t.step("1. Create temporary directory", async () => {
      testDir = await Deno.makeTempDir({ prefix: "pml_e2e_01_" });
      assert(testDir, "Test directory should be created");
    });

    await t.step("2. Initialize database with migrations", async () => {
      db = await initializeTestDatabase(testDir!);
      assert(db, "Database should be initialized");
    });

    await t.step("3. Verify mcp_server table exists", async () => {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'mcp_server'
        )
      `);
      assertEquals(result[0].exists, true);
    });

    await t.step("4. Verify mcp_tool table exists", async () => {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'mcp_tool'
        )
      `);
      assertEquals(result[0].exists, true);
    });

    await t.step("5. Verify tool_embedding table exists", async () => {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'tool_embedding'
        )
      `);
      assertEquals(result[0].exists, true);
    });

    await t.step("6. Verify pgvector extension is enabled", async () => {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM pg_extension
          WHERE extname = 'vector'
        )
      `);
      assertEquals(result[0].exists, true);
    });

    await t.step("7. Verify HNSW index exists on embeddings", async () => {
      const result = await db.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'tool_embedding'
        AND indexname LIKE '%hnsw%'
      `);
      assert(result.length > 0, "HNSW index should exist");
    });

    await t.step("8. Test basic insert into mcp_server", async () => {
      await db.query(
        `
        INSERT INTO mcp_server (server_id, server_name, connection_info)
        VALUES ($1, $2, $3)
      `,
        ["test-server", "Test Server", JSON.stringify({ test: true })],
      );

      const result = await db.query(
        `SELECT * FROM mcp_server WHERE server_id = $1`,
        ["test-server"],
      );

      assertEquals(result.length, 1);
      assertEquals(result[0].server_id, "test-server");
    });

    await t.step("9. Test basic insert into mcp_tool", async () => {
      await db.query(
        `
        INSERT INTO mcp_tool (server_id, tool_name, tool_schema)
        VALUES ($1, $2, $3)
      `,
        [
          "test-server",
          "test_tool",
          JSON.stringify({
            name: "test_tool",
            description: "A test tool",
          }),
        ],
      );

      const result = await db.query(
        `SELECT * FROM mcp_tool WHERE tool_name = $1`,
        ["test_tool"],
      );

      assertEquals(result.length, 1);
      assertEquals(result[0].tool_name, "test_tool");
    });

    await t.step("10. Test vector insert into tool_embedding", async () => {
      // Get tool ID
      const toolResult = await db.query(
        `SELECT id FROM mcp_tool WHERE tool_name = $1`,
        ["test_tool"],
      );
      const toolId = toolResult[0].id;

      // Create a test vector (1024 dimensions for BGE-M3)
      const testVector = Array(1024).fill(0).map((_, i) => i / 1024);

      await db.query(
        `
        INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding)
        VALUES ($1, $2, $3, $4::vector)
      `,
        [toolId, "test-server", "test_tool", `[${testVector.join(",")}]`],
      );

      const result = await db.query(
        `SELECT * FROM tool_embedding WHERE tool_id = $1`,
        [toolId],
      );

      assertEquals(result.length, 1);
      assert(result[0].embedding, "Embedding should be stored");
    });
  } finally {
    // Cleanup
    if (db && testDir) {
      await cleanupTestDatabase(db, testDir);
    }
  }
});
