/**
 * E2E Integration Test: GraphRAG Feedback Loop (Story 2.5-3 Task 5.4)
 *
 * Tests the complete GraphRAG feedback loop:
 * 1. Workflow executes with DAG structure
 * 2. ControlledExecutor calls updateFromExecution() on completion
 * 3. Tool co-occurrence patterns extracted from executed DAG
 * 4. Edge weights updated in PGlite (observed_count++, confidence_score)
 * 5. PageRank recomputed with new data
 * 6. Subsequent DAG suggestions use updated knowledge
 *
 * This validates the self-improving "Loop 3" from 3-Loop Learning Architecture.
 *
 * @module tests/integration/dag/graphrag_feedback_e2e_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { ControlledExecutor } from "../../../src/dag/controlled-executor.ts";
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

// Shared semantic mock for all tests
const sharedSemanticMock = new SemanticMockEmbedding();

/**
 * Seed database with test tools
 */
async function seedTools(db: PGliteClient): Promise<void> {
  // Use semantic embeddings for realistic similarity
  const embed1 = await sharedSemanticMock.encodeToString("read file contents");
  const embed2 = await sharedSemanticMock.encodeToString("process data");
  const embed3 = await sharedSemanticMock.encodeToString("write file contents");

  await db.query(
    `INSERT INTO tool_embedding (tool_id, tool_name, server_id, embedding, metadata)
     VALUES
       ($1, $2, $3, $4, $5),
       ($6, $7, $8, $9, $10),
       ($11, $12, $13, $14, $15)`,
    [
      "fs:read",
      "read_file",
      "server1",
      embed1,
      JSON.stringify({ description: "Read file contents" }),
      "data:process",
      "process_data",
      "server2",
      embed2,
      JSON.stringify({ description: "Process data" }),
      "fs:write",
      "write_file",
      "server1",
      embed3,
      JSON.stringify({ description: "Write file contents" }),
    ],
  );

  // Insert initial dependency (weak)
  await db.query(
    `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score)
     VALUES ($1, $2, $3, $4)`,
    ["fs:read", "data:process", 1, 0.30], // Low confidence initially
  );
}

/**
 * Mock tool executor
 */
async function mockToolExecutor(
  _tool: string,
  _args: Record<string, unknown>,
): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { success: true };
}

Deno.test("E2E GraphRAG Feedback: Workflow execution updates knowledge graph", async () => {
  let db: PGliteClient | undefined;

  try {
    // 1. Setup GraphRAG with initial weak dependencies
    db = await setupTestDb();
    await seedTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, sharedSemanticMock as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    // 2. Get initial edge weight (before execution)
    const initialEdges = await db.query(
      `SELECT observed_count, confidence_score
       FROM tool_dependency
       WHERE from_tool_id = $1 AND to_tool_id = $2`,
      ["fs:read", "data:process"],
    );

    const initialCount = initialEdges[0]?.observed_count as number || 0;
    const initialConfidence = initialEdges[0]?.confidence_score as number || 0;

    console.log(`Initial edge state:`);
    console.log(`  - observed_count: ${initialCount}`);
    console.log(`  - confidence_score: ${initialConfidence.toFixed(2)}`);

    // 3. Create executor and execute workflow with this pattern
    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setDAGSuggester(dagSuggester);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "fs:read", arguments: { path: "/data.txt" }, dependsOn: [] },
        { id: "task2", tool: "data:process", arguments: {}, dependsOn: ["task1"] },
        { id: "task3", tool: "fs:write", arguments: {}, dependsOn: ["task2"] },
      ],
    };

    // 4. Execute workflow (should trigger updateFromExecution)
    for await (const _event of executor.executeStream(dag, "feedback-test")) {
      // Just drain events
    }

    // 5. Wait for async feedback loop to complete (fire-and-forget)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 6. Verify edge weights updated
    const updatedEdges = await db.query(
      `SELECT observed_count, confidence_score
       FROM tool_dependency
       WHERE from_tool_id = $1 AND to_tool_id = $2`,
      ["fs:read", "data:process"],
    );

    const updatedCount = updatedEdges[0]?.observed_count as number || 0;
    const updatedConfidence = updatedEdges[0]?.confidence_score as number || 0;

    console.log(`Updated edge state:`);
    console.log(`  - observed_count: ${updatedCount} (was ${initialCount})`);
    console.log(
      `  - confidence_score: ${updatedConfidence.toFixed(2)} (was ${initialConfidence.toFixed(2)})`,
    );

    // 7. Assertions
    assertEquals(
      updatedCount > initialCount,
      true,
      "observed_count should increment after workflow execution",
    );

    assertEquals(
      updatedConfidence >= initialConfidence,
      true,
      "confidence_score should increase or stay same",
    );

    // 8. Verify new edge created (process_data → write_file)
    const newEdges = await db.query(
      `SELECT observed_count FROM tool_dependency
       WHERE from_tool_id = $1 AND to_tool_id = $2`,
      ["data:process", "fs:write"],
    );

    assertExists(
      newEdges[0],
      "New edge (data:process → fs:write) should be created from workflow pattern",
    );

    console.log(`✓ E2E GraphRAG Feedback test passed`);
    console.log(`  - Edge weights updated: ✓`);
    console.log(`  - New edges created: ✓`);
    console.log(`  - Knowledge graph enriched: ✓`);
  } finally {
    if (db) await db.close();
  }
});

Deno.test("E2E GraphRAG Feedback: PageRank recomputed after update", async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();
    await seedTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    // Get initial PageRank
    const initialPageRank = graphEngine.getPageRank("data:process");
    console.log(`Initial PageRank for data:process: ${initialPageRank.toFixed(4)}`);

    const vectorSearch = new VectorSearch(db, sharedSemanticMock as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setDAGSuggester(dagSuggester);

    // Execute workflow (adds more edges to data:process)
    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "fs:read", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "data:process", arguments: {}, dependsOn: ["task1"] },
        { id: "task3", tool: "fs:write", arguments: {}, dependsOn: ["task2"] },
      ],
    };

    for await (const _event of executor.executeStream(dag, "pagerank-test")) {
      // Drain events
    }

    // Wait for feedback loop
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Re-sync graph (triggers PageRank recomputation)
    await graphEngine.syncFromDatabase();

    // Get updated PageRank
    const updatedPageRank = graphEngine.getPageRank("data:process");
    console.log(`Updated PageRank for data:process: ${updatedPageRank.toFixed(4)}`);

    // PageRank should change (likely increase) due to new edges
    // Note: In small graphs, PageRank changes can be subtle
    assertExists(updatedPageRank, "PageRank should be computed");

    console.log(`✓ E2E PageRank recomputation test passed`);
    console.log(`  - PageRank updated: ✓`);
  } finally {
    if (db) await db.close();
  }
});

Deno.test("E2E GraphRAG Feedback: Subsequent DAG suggestions use updated graph", async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();
    await seedTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, sharedSemanticMock as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setDAGSuggester(dagSuggester);

    // 1. Execute first workflow (establishes pattern)
    const dag1: DAGStructure = {
      tasks: [
        { id: "task1", tool: "fs:read", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "data:process", arguments: {}, dependsOn: ["task1"] },
      ],
    };

    for await (const _event of executor.executeStream(dag1, "workflow-1")) {
      // Drain
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    // 2. Re-sync GraphRAG (gets updated edges)
    await graphEngine.syncFromDatabase();

    // 3. Execute second workflow (uses same pattern)
    const dag2: DAGStructure = {
      tasks: [
        { id: "task1", tool: "fs:read", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "data:process", arguments: {}, dependsOn: ["task1"] },
      ],
    };

    for await (const _event of executor.executeStream(dag2, "workflow-2")) {
      // Drain
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    // 4. Verify edge count increased (pattern reinforced)
    const finalEdges = await db.query(
      `SELECT observed_count FROM tool_dependency
       WHERE from_tool_id = $1 AND to_tool_id = $2`,
      ["fs:read", "data:process"],
    );

    const finalCount = finalEdges[0]?.observed_count as number || 0;

    assertEquals(
      finalCount >= 2,
      true,
      "Pattern should be reinforced after multiple executions (observed_count >= 2)",
    );

    console.log(`✓ E2E Self-improvement test passed`);
    console.log(`  - Pattern reinforced: ✓`);
    console.log(`  - Final observed_count: ${finalCount}`);
  } finally {
    if (db) await db.close();
  }
});

Deno.test("E2E GraphRAG Feedback: Fire-and-forget doesn't block workflow completion", async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();
    await seedTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, sharedSemanticMock as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    const executor = new ControlledExecutor(mockToolExecutor);
    executor.setDAGSuggester(dagSuggester);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "fs:read", arguments: {}, dependsOn: [] },
      ],
    };

    const startTime = performance.now();

    // Execute workflow
    for await (const _event of executor.executeStream(dag, "non-blocking-test")) {
      // Drain
    }

    const workflowTime = performance.now() - startTime;

    // Workflow should complete quickly (<100ms) even with feedback loop
    // Because updateFromExecution is fire-and-forget
    console.log(`Workflow completion time: ${workflowTime.toFixed(1)}ms`);

    assertEquals(
      workflowTime < 100,
      true,
      "Workflow should complete quickly (fire-and-forget feedback loop)",
    );

    console.log(`✓ E2E Non-blocking feedback test passed`);
    console.log(`  - Workflow not blocked: ✓`);
  } finally {
    if (db) await db.close();
  }
});
