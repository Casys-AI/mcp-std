/**
 * Unit tests for GraphRAG Engine - Search & Explorer Features
 *
 * Story 6.4: Graph Explorer & Search Interface
 *
 * Tests cover:
 * - AC10: searchToolsForAutocomplete() method
 * - Graph snapshot server/label extraction
 * - Search scoring logic
 *
 * Note: sanitizeOps/sanitizeResources disabled due to EventBus singleton using BroadcastChannel
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

// Test options to disable sanitizers (EventBus singleton uses BroadcastChannel)
const testOpts = { sanitizeOps: false, sanitizeResources: false };

/**
 * Create test database with schema
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  // Run all migrations properly
  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  return db;
}

/**
 * Insert test tools into database with "server:tool_name" format
 */
async function insertTestTools(db: PGliteClient): Promise<void> {
  const tools = [
    { id: "filesystem:read_file", server: "filesystem", name: "read_file" },
    { id: "filesystem:write_file", server: "filesystem", name: "write_file" },
    { id: "filesystem:list_directory", server: "filesystem", name: "list_directory" },
    { id: "memory:read_graph", server: "memory", name: "read_graph" },
    { id: "memory:create_entities", server: "memory", name: "create_entities" },
    { id: "playwright:browser_click", server: "playwright", name: "browser_click" },
    { id: "playwright:browser_navigate", server: "playwright", name: "browser_navigate" },
  ];

  for (const tool of tools) {
    // Insert tool schema
    await db.query(
      `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
       VALUES ($1, $2, $3, $4, $5)`,
      [tool.id, tool.server, tool.name, `Description for ${tool.name}`, "{}"],
    );

    // Insert tool embedding (dummy 1024-dim vector)
    const embedding = new Array(1024).fill(0).map(() => Math.random());
    await db.query(
      `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        tool.id,
        tool.server,
        tool.name,
        `[${embedding.join(",")}]`,
        JSON.stringify({ description: `Description for ${tool.name}` }),
      ],
    );
  }
}

/**
 * Insert test dependencies
 */
async function insertTestDependencies(db: PGliteClient): Promise<void> {
  const dependencies = [
    { from: "filesystem:read_file", to: "memory:read_graph", count: 5, confidence: 0.8 },
    {
      from: "playwright:browser_click",
      to: "playwright:browser_navigate",
      count: 3,
      confidence: 0.7,
    },
  ];

  for (const dep of dependencies) {
    await db.query(
      `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score)
       VALUES ($1, $2, $3, $4)`,
      [dep.from, dep.to, dep.count, dep.confidence],
    );
  }
}

// ============================================
// Story 6.4 AC10: searchToolsForAutocomplete
// ============================================

Deno.test({
  name: "searchToolsForAutocomplete - returns empty for query < 2 chars",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const results = engine.searchToolsForAutocomplete("r", 10);
    assertEquals(results.length, 0);

    await db.close();
  },
});

Deno.test({
  name: "searchToolsForAutocomplete - finds tools by name prefix",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const results = engine.searchToolsForAutocomplete("read", 10);

    assert(results.length >= 2, "Should find at least 2 tools starting with 'read'");
    assert(results.some((r) => r.tool_id === "filesystem:read_file"));
    assert(results.some((r) => r.tool_id === "memory:read_graph"));

    await db.close();
  },
});

Deno.test({
  name: "searchToolsForAutocomplete - extracts server and name correctly",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const results = engine.searchToolsForAutocomplete("read_file", 10);

    assert(results.length >= 1);
    const result = results.find((r) => r.tool_id === "filesystem:read_file");
    assertExists(result);
    assertEquals(result.server, "filesystem");
    assertEquals(result.name, "read_file");

    await db.close();
  },
});

Deno.test({
  name: "searchToolsForAutocomplete - scores exact match higher",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const results = engine.searchToolsForAutocomplete("read_file", 10);

    // Exact match should have score 1.0
    const exactMatch = results.find((r) => r.name === "read_file");
    assertExists(exactMatch);
    assertEquals(exactMatch.score, 1.0);

    await db.close();
  },
});

Deno.test({
  name: "searchToolsForAutocomplete - finds tools by server name",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const results = engine.searchToolsForAutocomplete("filesystem", 10);

    assert(results.length >= 3, "Should find all filesystem tools");
    assert(results.every((r) => r.server === "filesystem"));

    await db.close();
  },
});

Deno.test({
  name: "searchToolsForAutocomplete - respects limit parameter",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const results = engine.searchToolsForAutocomplete("browser", 1);

    assertEquals(results.length, 1);

    await db.close();
  },
});

Deno.test({
  name: "searchToolsForAutocomplete - includes pagerank in results",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await insertTestDependencies(db);
    await engine.syncFromDatabase();

    const results = engine.searchToolsForAutocomplete("read", 10);

    assert(results.length > 0);
    // All results should have pagerank defined (may be 0)
    assert(results.every((r) => typeof r.pagerank === "number"));

    await db.close();
  },
});

// ============================================
// Story 6.4: getGraphSnapshot server/label extraction
// ============================================

Deno.test({
  name: "getGraphSnapshot - extracts server from colon format",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const snapshot = engine.getGraphSnapshot();

    // Find a filesystem tool
    const fsNode = snapshot.nodes.find((n) => n.id === "filesystem:read_file");
    assertExists(fsNode);
    assertEquals(fsNode.server, "filesystem");
    assertEquals(fsNode.label, "read_file");

    await db.close();
  },
});

Deno.test({
  name: "getGraphSnapshot - handles all inserted servers",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const snapshot = engine.getGraphSnapshot();

    // Check all servers are extracted correctly
    const servers = new Set(snapshot.nodes.map((n) => n.server));
    assert(servers.has("filesystem"));
    assert(servers.has("memory"));
    assert(servers.has("playwright"));

    await db.close();
  },
});

Deno.test({
  name: "getGraphSnapshot - no 'unknown' servers when properly formatted",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const snapshot = engine.getGraphSnapshot();

    // None of the test tools should have "unknown" server
    const unknownNodes = snapshot.nodes.filter((n) => n.server === "unknown");
    assertEquals(unknownNodes.length, 0, "All nodes should have extracted server names");

    await db.close();
  },
});

// ============================================
// Search performance test
// ============================================

Deno.test({
  name: "searchToolsForAutocomplete - performance < 10ms",
  ...testOpts,
  fn: async () => {
    const db = await createTestDb();
    const engine = new GraphRAGEngine(db);

    await insertTestTools(db);
    await engine.syncFromDatabase();

    const start = performance.now();
    engine.searchToolsForAutocomplete("read", 10);
    const elapsed = performance.now() - start;

    assert(elapsed < 10, `Search should complete in < 10ms, took ${elapsed.toFixed(2)}ms`);

    await db.close();
  },
});
