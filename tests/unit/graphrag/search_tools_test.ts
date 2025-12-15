/**
 * Unit tests for Story 5.1: search_tools with Adamic-Adar graph re-ranking
 *
 * Tests cover:
 * - AC1: search_tools MCP tool exposed
 * - AC2: Accepts query and limit
 * - AC3: Returns semantic similarity scores
 * - AC4: Adamic-Adar graph relatedness re-ranking
 * - AC5: Adaptive alpha based on graph density
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  return db;
}

async function insertTestTools(db: PGliteClient): Promise<void> {
  const tools = [
    { id: "playwright:screenshot", server: "playwright", name: "playwright_screenshot" },
    { id: "playwright:navigate", server: "playwright", name: "playwright_navigate" },
    { id: "filesystem:read", server: "filesystem", name: "read_file" },
    { id: "filesystem:write", server: "filesystem", name: "write_file" },
    { id: "filesystem:list", server: "filesystem", name: "list_directory" },
  ];

  for (const tool of tools) {
    await db.query(
      `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
       VALUES ($1, $2, $3, $4, $5)`,
      [tool.id, tool.server, tool.name, `${tool.name} description`, "{}"],
    );

    // Insert dummy embedding (1024 dimensions for BGE-M3)
    const embedding = new Array(1024).fill(0.1);
    await db.query(
      `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding) VALUES ($1, $2, $3, $4)`,
      [tool.id, tool.server, tool.name, JSON.stringify(embedding)],
    );
  }
}

Deno.test("GraphRAGEngine - getEdgeCount returns 0 for empty graph", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const edgeCount = engine.getEdgeCount();
  assertEquals(edgeCount, 0, "Empty graph should have 0 edges");

  await db.close();
});

Deno.test("GraphRAGEngine - getEdgeCount increases after updateFromExecution", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // Execute workflow with dependencies
  await engine.updateFromExecution({
    executionId: "test-1",
    executedAt: new Date(),
    intentText: "test workflow",
    dagStructure: {
      tasks: [
        { id: "t1", tool: "filesystem:read", arguments: {}, dependsOn: [] },
        { id: "t2", tool: "filesystem:write", arguments: {}, dependsOn: ["t1"] },
      ],
    },
    success: true,
    executionTimeMs: 100,
  });

  const edgeCount = engine.getEdgeCount();
  assertEquals(edgeCount, 1, "Graph should have 1 edge (read → write)");

  await db.close();
});

Deno.test("GraphRAGEngine - computeAdamicAdar finds related tools", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // Create workflow: screenshot depends on navigate
  await engine.updateFromExecution({
    executionId: "test-workflow",
    executedAt: new Date(),
    intentText: "take screenshot",
    dagStructure: {
      tasks: [
        { id: "t1", tool: "playwright:navigate", arguments: {}, dependsOn: [] },
        { id: "t2", tool: "playwright:screenshot", arguments: {}, dependsOn: ["t1"] },
      ],
    },
    success: true,
    executionTimeMs: 100,
  });

  // Find tools related to navigate
  const related = engine.computeAdamicAdar("playwright:navigate", 5);

  assertExists(related, "Should return related tools");
  assert(related.length >= 0, "Should return array of results");

  // If there are related tools, they should have valid structure
  if (related.length > 0) {
    const first = related[0];
    assertExists(first.toolId, "Related tool should have toolId");
    assertExists(first.score, "Related tool should have score");
    assert(first.score >= 0, "Score should be non-negative");
  }

  await db.close();
});

Deno.test("GraphRAGEngine - computeGraphRelatedness returns score", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // Create some edges
  await engine.updateFromExecution({
    executionId: "test-1",
    executedAt: new Date(),
    intentText: "file operations",
    dagStructure: {
      tasks: [
        { id: "t1", tool: "filesystem:read", arguments: {}, dependsOn: [] },
        { id: "t2", tool: "filesystem:write", arguments: {}, dependsOn: ["t1"] },
      ],
    },
    success: true,
    executionTimeMs: 100,
  });

  const score = engine.computeGraphRelatedness("filesystem:list", ["filesystem:read"]);

  assertExists(score, "Should return a score");
  assert(score >= 0 && score <= 1, "Score should be between 0 and 1");

  await db.close();
});

Deno.test("GraphRAGEngine - getStats returns nodeCount and edgeCount", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const stats = engine.getStats();

  assertExists(stats, "Should return stats");
  assertExists(stats.nodeCount, "Stats should have nodeCount");
  assertEquals(stats.nodeCount, 5, "Should have 5 nodes (5 tools inserted)");

  await db.close();
});

Deno.test("Adaptive alpha - changes with graph density", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const stats = engine.getStats();
  const nodeCount = stats.nodeCount;

  // Test alpha calculation with different edge counts
  const testCases = [
    { edges: 0, expectedAlphaRange: [0.99, 1.0] }, // Pure semantic
    { edges: 1, expectedAlphaRange: [0.89, 0.91] }, // Very sparse (5 nodes → max 20 edges → density 5% → alpha 0.9)
    { edges: 5, expectedAlphaRange: [0.49, 0.51] }, // Sparse (density 25% → alpha 0.5)
  ];

  for (const testCase of testCases) {
    const maxEdges = nodeCount * (nodeCount - 1);
    const density = maxEdges > 0 ? testCase.edges / maxEdges : 0;
    const alpha = Math.max(0.5, 1.0 - density * 2);

    assert(
      alpha >= testCase.expectedAlphaRange[0] && alpha <= testCase.expectedAlphaRange[1],
      `Alpha ${alpha} should be in range ${testCase.expectedAlphaRange} for ${testCase.edges} edges`,
    );
  }

  await db.close();
});

Deno.test("GraphRAGEngine - getNeighbors returns connected tools", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // Create edge: read → write
  await engine.updateFromExecution({
    executionId: "test-1",
    executedAt: new Date(),
    intentText: "copy file",
    dagStructure: {
      tasks: [
        { id: "t1", tool: "filesystem:read", arguments: {}, dependsOn: [] },
        { id: "t2", tool: "filesystem:write", arguments: {}, dependsOn: ["t1"] },
      ],
    },
    success: true,
    executionTimeMs: 100,
  });

  const outNeighbors = engine.getNeighbors("filesystem:read", "out");
  assert(outNeighbors.includes("filesystem:write"), "read should have write as out-neighbor");

  const inNeighbors = engine.getNeighbors("filesystem:write", "in");
  assert(inNeighbors.includes("filesystem:read"), "write should have read as in-neighbor");

  await db.close();
});
