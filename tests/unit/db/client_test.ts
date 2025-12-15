/**
 * Tests for PGlite Database Client
 *
 * Validates AC1, AC2, AC3, AC5 (basic CRUD)
 */

import { assertEquals } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

// Helper to create unique test database using in-memory databases
function getTestDbPath(_testName: string): string {
  // Use in-memory database for tests to avoid file leaks
  // All migrations including metrics table are now run via getAllMigrations()
  return `memory://${crypto.randomUUID()}`;
}

Deno.test("AC1: PGlite database initialization", async () => {
  const client = new PGliteClient(getTestDbPath("ac1"));
  await client.connect();

  // Verify we can query the database
  const result = await client.query("SELECT 1 as value");
  assertEquals(result.length, 1);
  assertEquals(result[0].value, 1);

  await client.close();
});

Deno.test("AC2: pgvector extension loaded", async () => {
  const client = new PGliteClient(getTestDbPath("ac2"));
  await client.connect();

  // Try to use vector type
  await client.exec(
    "CREATE TABLE test_vector (id SERIAL PRIMARY KEY, vec vector(3))",
  );

  // Verify the table was created
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
  );

  const hasTestVector = tables.some(
    (t) => t.table_name === "test_vector",
  );
  assertEquals(hasTestVector, true);

  await client.close();
});

Deno.test("AC3: Database schema creation", async () => {
  const client = new PGliteClient(getTestDbPath("ac3"));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.runUp(getAllMigrations());

  // Verify all three tables exist
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );

  const tableNames = tables.map((t) => t.table_name as string).filter(
    (name) => name !== "migrations_history",
  );

  assertEquals(tableNames.includes("config"), true);
  assertEquals(tableNames.includes("tool_embedding"), true);
  assertEquals(tableNames.includes("tool_schema"), true);

  // Verify tool_schema columns
  const schemaColumns = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'tool_schema' ORDER BY column_name",
  );

  const columnNames = schemaColumns.map((c) => c.column_name as string);
  assertEquals(columnNames.includes("tool_id"), true);
  assertEquals(columnNames.includes("server_id"), true);
  assertEquals(columnNames.includes("input_schema"), true);

  await client.close();
});

Deno.test("AC4: HNSW index creation", async () => {
  const client = new PGliteClient(getTestDbPath("ac4"));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.runUp(getAllMigrations());

  // Verify HNSW index exists
  const indexes = await client.query(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'tool_embedding'",
  );

  const hasHnsw = indexes.some(
    (i) => i.indexname === "idx_tool_embedding_hnsw",
  );
  assertEquals(hasHnsw, true);

  await client.close();
});

Deno.test("AC5: CRUD operations - Create", async () => {
  const client = new PGliteClient(getTestDbPath("ac5-create"));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.runUp(getAllMigrations());

  // Create test data
  const testData = {
    tool_id: "test-tool",
    server_id: "test-server",
    name: "Test Tool",
    input_schema: JSON.stringify({ type: "object" }),
  };

  await client.exec(
    `INSERT INTO tool_schema (tool_id, server_id, name, input_schema)
     VALUES ('${testData.tool_id}', '${testData.server_id}', '${testData.name}', '${testData.input_schema}')`,
  );

  // Verify insert
  const result = await client.queryOne(
    `SELECT tool_id FROM tool_schema WHERE tool_id = '${testData.tool_id}'`,
  );

  assertEquals(result?.tool_id, "test-tool");
  await client.close();
});

Deno.test("AC5: CRUD operations - Read", async () => {
  const client = new PGliteClient(getTestDbPath("ac5-read"));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.runUp(getAllMigrations());

  // Insert test data
  await client.exec(
    `INSERT INTO tool_schema (tool_id, server_id, name, input_schema)
     VALUES ('read-test', 'test-server', 'Read Test', '${JSON.stringify({ type: "object" })}')`,
  );

  // Read the data
  const result = await client.query(
    "SELECT * FROM tool_schema WHERE tool_id = 'read-test'",
  );

  assertEquals(result.length, 1);
  assertEquals(result[0].name, "Read Test");
  await client.close();
});

Deno.test("AC5: CRUD operations - Update", async () => {
  const client = new PGliteClient(getTestDbPath("ac5-update"));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.runUp(getAllMigrations());

  // Insert test data
  await client.exec(
    `INSERT INTO tool_schema (tool_id, server_id, name, input_schema)
     VALUES ('update-test', 'test-server', 'Original', '${JSON.stringify({ type: "object" })}')`,
  );

  // Update the data
  await client.exec(
    "UPDATE tool_schema SET name = 'Updated' WHERE tool_id = 'update-test'",
  );

  // Verify update
  const result = await client.queryOne(
    "SELECT name FROM tool_schema WHERE tool_id = 'update-test'",
  );

  assertEquals(result?.name, "Updated");
  await client.close();
});

Deno.test("AC5: CRUD operations - Delete", async () => {
  const client = new PGliteClient(getTestDbPath("ac5-delete"));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.runUp(getAllMigrations());

  // Insert test data
  await client.exec(
    `INSERT INTO tool_schema (tool_id, server_id, name, input_schema)
     VALUES ('delete-test', 'test-server', 'ToDelete', '${JSON.stringify({ type: "object" })}')`,
  );

  // Delete the data
  await client.exec(
    "DELETE FROM tool_schema WHERE tool_id = 'delete-test'",
  );

  // Verify deletion
  const result = await client.queryOne(
    "SELECT tool_id FROM tool_schema WHERE tool_id = 'delete-test'",
  );

  assertEquals(result, null);
  await client.close();
});

Deno.test("AC5: Transaction support", async () => {
  const client = new PGliteClient(getTestDbPath("ac5-transaction"));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.runUp(getAllMigrations());

  // Test successful transaction
  await client.transaction(async (tx) => {
    await tx.exec(
      `INSERT INTO config (key, value) VALUES ('tx-test', 'value1')`,
    );
  });

  const result = await client.queryOne(
    "SELECT value FROM config WHERE key = 'tx-test'",
  );

  assertEquals(result?.value, "value1");
  await client.close();
});
