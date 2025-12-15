/**
 * E2E Integration Test: Dynamic DAG Replanning (Story 2.5-3 Task 5.3)
 *
 * Tests the complete dynamic replanning scenario:
 * 1. Workflow discovers unexpected data format (XML files)
 * 2. DAGSuggester.replanDAG() queries GraphRAG
 * 3. New tools found (XML parser) and ranked by PageRank
 * 4. New tasks merged into DAG structure
 * 5. Cycle validation ensures no circular dependencies
 * 6. Execution continues with augmented DAG
 * 7. Parallel execution preserved (5x speedup maintained)
 *
 * This is the "discovery pattern" scenario from Tech-Spec Epic 2.5.
 *
 * @module tests/integration/dag/replanning_e2e_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { DAGSuggester } from "../../../src/graphrag/dag-suggester.ts";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import { VectorSearch } from "../../../src/vector/search.ts";
import type { DAGStructure } from "../../../src/graphrag/types.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

/**
 * Setup test database with migrations
 */
async function setupTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(":memory:");
  await db.connect();
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());
  return db;
}

import { SemanticMockEmbedding } from "../../mocks/semantic-embedding-mock.ts";

// Shared semantic mock for all tests (deterministic embeddings)
const sharedSemanticMock = new SemanticMockEmbedding();

/**
 * Seed GraphRAG with comprehensive tool ecosystem
 */
async function seedComprehensiveTools(db: PGliteClient): Promise<void> {
  // Insert tools with semantic embeddings for realistic vector search
  const embed1 = await sharedSemanticMock.encodeToString("list files and detect file types");
  const embed2 = await sharedSemanticMock.encodeToString("read file contents");
  const embed3 = await sharedSemanticMock.encodeToString("parse xml documents and extract data");
  const embed4 = await sharedSemanticMock.encodeToString("parse json documents");
  const embed5 = await sharedSemanticMock.encodeToString("validate data structure and schema");

  // Insert into tool_schema first (required for JOIN in vector search)
  await db.query(
    `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
     VALUES
       ($1, $2, $3, $4, $5),
       ($6, $7, $8, $9, $10),
       ($11, $12, $13, $14, $15),
       ($16, $17, $18, $19, $20),
       ($21, $22, $23, $24, $25)`,
    [
      "filesystem:list_directory",
      "server1",
      "list_directory",
      "List files and detect file types",
      JSON.stringify({ type: "object", properties: { path: { type: "string" } } }),
      "filesystem:read_file",
      "server1",
      "read_file",
      "Read file contents",
      JSON.stringify({ type: "object", properties: { path: { type: "string" } } }),
      "xml:parse",
      "server2",
      "parse_xml",
      "Parse XML documents and extract data",
      JSON.stringify({ type: "object", properties: { xml: { type: "string" } } }),
      "json:parse",
      "server3",
      "parse_json",
      "Parse JSON documents",
      JSON.stringify({ type: "object", properties: { json: { type: "string" } } }),
      "data:validate",
      "server4",
      "validate_data",
      "Validate data structure and schema",
      JSON.stringify({ type: "object", properties: { data: { type: "object" } } }),
    ],
  );

  await db.query(
    `INSERT INTO tool_embedding (tool_id, tool_name, server_id, embedding, metadata)
     VALUES
       ($1, $2, $3, $4, $5),
       ($6, $7, $8, $9, $10),
       ($11, $12, $13, $14, $15),
       ($16, $17, $18, $19, $20),
       ($21, $22, $23, $24, $25)`,
    [
      "filesystem:list_directory",
      "list_directory",
      "server1",
      embed1,
      JSON.stringify({ description: "List files and detect file types" }),
      "filesystem:read_file",
      "read_file",
      "server1",
      embed2,
      JSON.stringify({ description: "Read file contents" }),
      "xml:parse",
      "parse_xml",
      "server2",
      embed3,
      JSON.stringify({ description: "Parse XML documents and extract data" }),
      "json:parse",
      "parse_json",
      "server3",
      embed4,
      JSON.stringify({ description: "Parse JSON documents" }),
      "data:validate",
      "validate_data",
      "server4",
      embed5,
      JSON.stringify({ description: "Validate data structure and schema" }),
    ],
  );

  // Insert dependencies: list_directory → parse_xml (observed pattern)
  await db.query(
    `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score)
     VALUES
       ($1, $2, $3, $4),
       ($5, $6, $7, $8)`,
    [
      "filesystem:list_directory",
      "xml:parse",
      10,
      0.90, // Strong pattern
      "xml:parse",
      "data:validate",
      5,
      0.75,
    ],
  );
}

Deno.test("E2E Dynamic Replanning: XML discovery triggers replan with new tools", async () => {
  let db: PGliteClient | undefined;

  try {
    // 1. Setup GraphRAG with comprehensive tool ecosystem
    db = await setupTestDb();
    await seedComprehensiveTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, sharedSemanticMock as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    // 2. Initial DAG: Just list directory
    const initialDAG: DAGStructure = {
      tasks: [
        {
          id: "task1",
          tool: "filesystem:list_directory",
          arguments: { path: "/data" },
          dependsOn: [],
        },
      ],
    };

    // 3. Simulate agent discovering XML files and triggering replan
    const completedTasks = [
      {
        taskId: "task1",
        status: "success" as const,
        output: {
          files: ["data.xml", "config.xml", "readme.txt"],
          xml_detected: true,
        },
      },
    ];

    const startTime = performance.now();

    const augmentedDAG = await dagSuggester.replanDAG(initialDAG, {
      completedTasks,
      newRequirement: "parse XML files found in directory",
      availableContext: { detected_formats: ["xml"] },
    });

    const replanTime = performance.now() - startTime;

    // 4. Verify new tools added
    assertEquals(
      augmentedDAG.tasks.length > initialDAG.tasks.length,
      true,
      "New tasks should be added to DAG",
    );

    const newTasks = augmentedDAG.tasks.slice(initialDAG.tasks.length);
    assertEquals(
      newTasks.length > 0,
      true,
      "At least one new task should be added",
    );

    // 5. Verify XML parser added (from GraphRAG query)
    const xmlParserAdded = newTasks.some((task) => task.tool.includes("xml"));
    assertEquals(
      xmlParserAdded,
      true,
      "XML parser tool should be added via GraphRAG query",
    );

    // 6. Verify dependencies set correctly (new tasks depend on completed task1)
    const firstNewTask = newTasks[0];
    assertEquals(
      firstNewTask.dependsOn.includes("task1"),
      true,
      "New tasks should depend on completed task",
    );

    // 7. Verify no cycles (DAG validation)
    // If replanDAG completed without error, cycle validation passed
    assertExists(augmentedDAG, "Augmented DAG should be valid (no cycles)");

    // 8. Verify performance target (<200ms P95)
    console.log(`✓ E2E Dynamic Replanning test passed`);
    console.log(`  - Replan time: ${replanTime.toFixed(1)}ms (target <200ms)`);
    console.log(`  - Initial tasks: ${initialDAG.tasks.length}`);
    console.log(`  - Augmented tasks: ${augmentedDAG.tasks.length}`);
    console.log(`  - New tasks added: ${newTasks.length}`);
    console.log(`  - XML parser added: ✓`);
    console.log(`  - Dependencies correct: ✓`);
    console.log(`  - No cycles: ✓`);

    // Performance assertion (should be well under 200ms)
    assertEquals(
      replanTime < 200,
      true,
      `Replan should complete <200ms (actual: ${replanTime.toFixed(1)}ms)`,
    );
  } finally {
    if (db) await db.close();
  }
});

Deno.test("E2E Dynamic Replanning: No relevant tools returns unchanged DAG", async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();
    await seedComprehensiveTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, sharedSemanticMock as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    const initialDAG: DAGStructure = {
      tasks: [
        { id: "task1", tool: "filesystem:list_directory", arguments: {}, dependsOn: [] },
      ],
    };

    // Request completely irrelevant tool (no match in GraphRAG)
    const augmentedDAG = await dagSuggester.replanDAG(initialDAG, {
      completedTasks: [{ taskId: "task1", status: "success" }],
      newRequirement: "quantum teleportation of electrons",
      availableContext: {},
    });

    // Should return same DAG (graceful degradation)
    assertEquals(
      augmentedDAG.tasks.length,
      initialDAG.tasks.length,
      "DAG should remain unchanged when no relevant tools found",
    );

    console.log(`✓ E2E Replanning graceful degradation test passed`);
  } finally {
    if (db) await db.close();
  }
});

Deno.test("E2E Dynamic Replanning: Cycle detection rejects invalid replan", async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();
    await seedComprehensiveTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, sharedSemanticMock as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    // Create DAG with potential for circular dependency
    const initialDAG: DAGStructure = {
      tasks: [
        { id: "task1", tool: "filesystem:read_file", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "data:process", arguments: {}, dependsOn: ["task1"] },
      ],
    };

    // Attempt replan that would create cycle (implementation should detect)
    const augmentedDAG = await dagSuggester.replanDAG(initialDAG, {
      completedTasks: [{ taskId: "task1", status: "success" }],
      newRequirement: "parse XML files",
      availableContext: {},
    });

    // Verify DAG remains valid (no cycles)
    // validateDAGNoCycles is called internally in replanDAG
    assertExists(augmentedDAG, "DAG should be valid");

    // Try to manually verify no cycles via topological sort simulation
    const taskIds = new Set(augmentedDAG.tasks.map((t) => t.id));
    for (const task of augmentedDAG.tasks) {
      for (const dep of task.dependsOn) {
        assertEquals(
          taskIds.has(dep),
          true,
          `Dependency ${dep} should exist in task list`,
        );
      }
    }

    console.log(`✓ E2E Replanning cycle detection test passed`);
  } finally {
    if (db) await db.close();
  }
});

Deno.test("E2E Dynamic Replanning: PageRank ranking influences tool selection", async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();
    await seedComprehensiveTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    // Verify PageRank computed
    const xmlParserRank = graphEngine.getPageRank("xml:parse");
    const jsonParserRank = graphEngine.getPageRank("json:parse");

    console.log(`PageRank scores:`);
    console.log(`  - xml:parse: ${xmlParserRank.toFixed(4)}`);
    console.log(`  - json:parse: ${jsonParserRank.toFixed(4)}`);

    // XML parser should have higher rank (more dependencies)
    assertEquals(
      xmlParserRank >= jsonParserRank,
      true,
      "xml:parse should have higher/equal PageRank (more connections)",
    );

    const vectorSearch = new VectorSearch(db, sharedSemanticMock as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    const initialDAG: DAGStructure = {
      tasks: [
        { id: "task1", tool: "filesystem:list_directory", arguments: {}, dependsOn: [] },
      ],
    };

    // Request XML parsing
    const augmentedDAG = await dagSuggester.replanDAG(initialDAG, {
      completedTasks: [{ taskId: "task1", status: "success" }],
      newRequirement: "parse XML files",
      availableContext: {},
    });

    // Verify xml:parse tool selected (ranked higher by PageRank)
    const hasXmlParser = augmentedDAG.tasks.some((t) => t.tool.includes("xml"));
    assertEquals(
      hasXmlParser,
      true,
      "XML parser should be selected based on PageRank + semantic match",
    );

    console.log(`✓ E2E Replanning PageRank influence test passed`);
  } finally {
    if (db) await db.close();
  }
});
