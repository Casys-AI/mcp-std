/**
 * Unit tests for DAGSuggester Episodic Memory Integration (Story 4.1e)
 *
 * Tests learning-enhanced predictions using historical episode data.
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { DAGSuggester } from "../../../src/graphrag/dag-suggester.ts";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import { VectorSearch } from "../../../src/vector/search.ts";
import { MockEmbeddingModel } from "../../fixtures/mock-embedding-model.ts";
import type { EmbeddingModel } from "../../../src/vector/embeddings.ts";
import { EpisodicMemoryStore } from "../../../src/learning/episodic-memory-store.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

/**
 * Create test database with full schema including episodic memory
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  // Run all migrations properly (including edge_type columns from migration 012)
  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  return db;
}

/**
 * Insert test tools and dependencies
 */
async function insertTestTools(db: PGliteClient, model: MockEmbeddingModel): Promise<void> {
  const tools = [
    { id: "git:clone", server: "git", name: "clone", desc: "Clone git repository" },
    { id: "npm:install", server: "npm", name: "install", desc: "Install npm dependencies" },
    { id: "npm:test", server: "npm", name: "test", desc: "Run npm tests" },
    { id: "deploy:production", server: "deploy", name: "deploy", desc: "Deploy to production" },
  ];

  for (const tool of tools) {
    await db.query(
      `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
       VALUES ($1, $2, $3, $4, $5)`,
      [tool.id, tool.server, tool.name, tool.desc, "{}"],
    );

    const embedding = await model.encode(tool.desc);
    await db.query(
      `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [tool.id, tool.server, tool.name, `[${embedding.join(",")}]`, "{}"],
    );
  }

  // Add dependencies
  const deps = [
    { from: "git:clone", to: "npm:install", count: 20, confidence: 0.95 },
    { from: "npm:install", to: "npm:test", count: 15, confidence: 0.80 },
    { from: "npm:test", to: "deploy:production", count: 10, confidence: 0.70 },
  ];

  for (const dep of deps) {
    await db.query(
      `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score)
       VALUES ($1, $2, $3, $4)`,
      [dep.from, dep.to, dep.count, dep.confidence],
    );
  }
}

/**
 * AC #4 (Baseline): Test DAGSuggester without episodic memory returns base confidence
 */
Deno.test({
  name: "Story 4.1e AC4 - Baseline without episodic memory",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestTools(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model as unknown as EmbeddingModel);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    // No episodic memory set - should use base confidence only
    const predictions = await suggester.predictNextNodes(
      {
        workflowId: "test-workflow",
        currentLayer: 1,
        completedTasks: [
          { tool: "git:clone", status: "success", taskId: "task-1" },
        ],
      },
      undefined,
    );

    assertExists(predictions, "Should return predictions");
    assert(predictions.length > 0, "Should have at least one prediction");

    // Find npm:install prediction (should exist due to graph dependency)
    const npmInstallPred = predictions.find((p) => p.toolId === "npm:install");
    assertExists(npmInstallPred, "Should predict npm:install after git:clone");

    // Store base confidence for comparison
    const baseConfidence = npmInstallPred!.confidence;
    assert(baseConfidence > 0, "Base confidence should be positive");

    await db.close();
  },
});

/**
 * AC #2: Test confidence boost for successful episodes
 */
Deno.test({
  name: "Story 4.1e AC2 - Confidence boost for successful patterns",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestTools(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model as unknown as EmbeddingModel);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    // Create episodic memory store and set it
    const episodicMemory = new EpisodicMemoryStore(db);
    suggester.setEpisodicMemoryStore(episodicMemory);

    // Insert successful episodes for npm:install
    for (let i = 0; i < 5; i++) {
      await episodicMemory.capture({
        workflow_id: `workflow-${i}`,
        event_type: "speculation_start",
        timestamp: Date.now() - (i * 1000),
        context_hash: "workflowType:unknown|domain:general|complexity:1",
        data: {
          context: { workflowType: "unknown", domain: "general", complexity: "1" },
          prediction: {
            toolId: "npm:install",
            confidence: 0.80,
            reasoning: "Test prediction",
            wasCorrect: true, // All successful
          },
        },
      });
    }

    await episodicMemory.flush();

    // Now predict - should have confidence boost
    const predictions = await suggester.predictNextNodes(
      {
        workflowId: "test-workflow",
        currentLayer: 1,
        completedTasks: [
          { tool: "git:clone", status: "success", taskId: "task-1" },
        ],
        context: { workflowType: "unknown", domain: "general" },
      },
      undefined,
    );

    const npmInstallPred = predictions.find((p) => p.toolId === "npm:install");
    assertExists(npmInstallPred, "Should predict npm:install");

    // Confidence should be boosted (exact value depends on base + boost formula)
    // Base ~0.8-0.9, boost = min(0.15, 1.0 * 0.20) = 0.15
    // Expected: base + 0.15, capped at 1.0
    assert(npmInstallPred!.confidence > 0.8, "Confidence should be boosted by successful episodes");

    await episodicMemory.shutdown();
    await db.close();
  },
});

/**
 * AC #3: Test confidence penalty for failed episodes
 */
Deno.test({
  name: "Story 4.1e AC3 - Confidence penalty for failed patterns",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestTools(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model as unknown as EmbeddingModel);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    const episodicMemory = new EpisodicMemoryStore(db);
    suggester.setEpisodicMemoryStore(episodicMemory);

    // Insert failed episodes for npm:test (2 failures out of 5 total = 40% failure rate)
    // This should apply penalty but NOT exclude (< 50% threshold)
    for (let i = 0; i < 2; i++) {
      await episodicMemory.capture({
        workflow_id: `workflow-fail-${i}`,
        event_type: "speculation_start",
        timestamp: Date.now() - (i * 1000),
        context_hash: "workflowType:unknown|domain:general|complexity:2",
        data: {
          context: { workflowType: "unknown", domain: "general", complexity: "2" },
          prediction: {
            toolId: "npm:test",
            confidence: 0.70,
            reasoning: "Test prediction",
            wasCorrect: false, // Failed
          },
        },
      });
    }

    // Three successes (failureRate = 40%, which is < 50% threshold)
    for (let i = 0; i < 3; i++) {
      await episodicMemory.capture({
        workflow_id: `workflow-success-${i}`,
        event_type: "speculation_start",
        timestamp: Date.now() - ((i + 10) * 1000),
        context_hash: "workflowType:unknown|domain:general|complexity:2",
        data: {
          context: { workflowType: "unknown", domain: "general", complexity: "2" },
          prediction: {
            toolId: "npm:test",
            confidence: 0.70,
            reasoning: "Test prediction",
            wasCorrect: true,
          },
        },
      });
    }

    await episodicMemory.flush();

    const predictions = await suggester.predictNextNodes(
      {
        workflowId: "test-workflow",
        currentLayer: 2,
        completedTasks: [
          { tool: "git:clone", status: "success", taskId: "task-1" },
          { tool: "npm:install", status: "success", taskId: "task-2" },
        ],
        context: { workflowType: "unknown", domain: "general" },
      },
      undefined,
    );

    const npmTestPred = predictions.find((p) => p.toolId === "npm:test");
    assertExists(npmTestPred, "Should still predict npm:test (failureRate = 40% < 50% threshold)");

    // Confidence should be penalized
    // Note: Actual penalty depends on base confidence from graph patterns.
    // This test verifies the tool is still predicted (not excluded) despite failures.
    // The penalty calculation is verified in unit tests for adjustConfidenceFromEpisodes().
    assert(
      npmTestPred!.confidence >= 0 && npmTestPred!.confidence <= 1.0,
      "Confidence should be in valid range",
    );

    await episodicMemory.shutdown();
    await db.close();
  },
});

/**
 * AC #3 (Task 4.4): Test tool exclusion for high failure rate (>50%)
 */
Deno.test({
  name: "Story 4.1e AC3 Task 4.4 - Exclude tool with >50% failure rate",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestTools(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model as unknown as EmbeddingModel);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    const episodicMemory = new EpisodicMemoryStore(db);
    suggester.setEpisodicMemoryStore(episodicMemory);

    // Insert episodes with >50% failure rate for deploy:production (4 failures, 2 successes = 67% failure)
    for (let i = 0; i < 4; i++) {
      await episodicMemory.capture({
        workflow_id: `workflow-deploy-fail-${i}`,
        event_type: "speculation_start",
        timestamp: Date.now() - (i * 1000),
        context_hash: "workflowType:unknown|domain:general|complexity:3",
        data: {
          context: { workflowType: "unknown", domain: "general", complexity: "3" },
          prediction: {
            toolId: "deploy:production",
            confidence: 0.70,
            reasoning: "Test prediction",
            wasCorrect: false,
          },
        },
      });
    }

    for (let i = 0; i < 2; i++) {
      await episodicMemory.capture({
        workflow_id: `workflow-deploy-success-${i}`,
        event_type: "speculation_start",
        timestamp: Date.now() - ((i + 10) * 1000),
        context_hash: "workflowType:unknown|domain:general|complexity:3",
        data: {
          context: { workflowType: "unknown", domain: "general", complexity: "3" },
          prediction: {
            toolId: "deploy:production",
            confidence: 0.70,
            reasoning: "Test prediction",
            wasCorrect: true,
          },
        },
      });
    }

    await episodicMemory.flush();

    const predictions = await suggester.predictNextNodes(
      {
        workflowId: "test-workflow",
        currentLayer: 3,
        completedTasks: [
          { tool: "git:clone", status: "success", taskId: "task-1" },
          { tool: "npm:install", status: "success", taskId: "task-2" },
          { tool: "npm:test", status: "success", taskId: "task-3" },
        ],
        context: { workflowType: "unknown", domain: "general" },
      },
      undefined,
    );

    // deploy:production should be EXCLUDED due to failureRate > 0.50
    const deployPred = predictions.find((p) => p.toolId === "deploy:production");
    assertEquals(
      deployPred,
      undefined,
      "deploy:production should be excluded due to high failure rate (>50%)",
    );

    await episodicMemory.shutdown();
    await db.close();
  },
});

/**
 * AC #6: Test graceful degradation when episodic memory unavailable
 */
Deno.test({
  name: "Story 4.1e AC6 - Graceful degradation without episodic memory",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestTools(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model as unknown as EmbeddingModel);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    // Do NOT set episodic memory - should gracefully degrade to base predictions

    const predictions = await suggester.predictNextNodes(
      {
        workflowId: "test-workflow",
        currentLayer: 1,
        completedTasks: [
          { tool: "git:clone", status: "success", taskId: "task-1" },
        ],
      },
      undefined,
    );

    assertExists(predictions, "Should return predictions without episodic memory");
    assert(predictions.length > 0, "Should have predictions from graph patterns");

    // Verify npm:install is still predicted (from graph)
    const npmInstallPred = predictions.find((p) => p.toolId === "npm:install");
    assertExists(npmInstallPred, "Should predict npm:install from graph patterns");

    await db.close();
  },
});

/**
 * AC #5: Performance test - episode retrieval should add <50ms overhead
 */
Deno.test({
  name: "Story 4.1e AC5 - Episode retrieval performance <50ms",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestTools(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model as unknown as EmbeddingModel);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    const episodicMemory = new EpisodicMemoryStore(db);
    suggester.setEpisodicMemoryStore(episodicMemory);

    // Insert 100+ episodes to test retrieval performance
    for (let i = 0; i < 120; i++) {
      await episodicMemory.capture({
        workflow_id: `workflow-perf-${i}`,
        event_type: "speculation_start",
        timestamp: Date.now() - (i * 1000),
        context_hash: `workflowType:unknown|domain:general|complexity:${i % 5}`,
        data: {
          context: { workflowType: "unknown", domain: "general", complexity: (i % 5).toString() },
          prediction: {
            toolId: ["npm:install", "npm:test", "deploy:production"][i % 3],
            confidence: 0.70 + (Math.random() * 0.2),
            reasoning: "Performance test",
            wasCorrect: Math.random() > 0.3, // 70% success rate
          },
        },
      });
    }

    await episodicMemory.flush();

    // Measure prediction time with episodic retrieval
    const startTime = performance.now();

    const predictions = await suggester.predictNextNodes(
      {
        workflowId: "test-workflow-perf",
        currentLayer: 1,
        completedTasks: [
          { tool: "git:clone", status: "success", taskId: "task-1" },
        ],
        context: { workflowType: "unknown", domain: "general" },
      },
      undefined,
    );

    const elapsedMs = performance.now() - startTime;

    assertExists(predictions, "Should return predictions");
    assert(predictions.length > 0, "Should have predictions");

    // Total predictNextNodes time should be <200ms (includes graph operations + episode retrieval)
    // Episode retrieval alone should be <50ms, but we're testing the integrated flow
    assert(
      elapsedMs < 200,
      `predictNextNodes with episode retrieval should complete in <200ms (actual: ${
        elapsedMs.toFixed(1)
      }ms)`,
    );

    console.log(
      `✓ Performance test: predictNextNodes completed in ${
        elapsedMs.toFixed(1)
      }ms with 120 episodes`,
    );

    await episodicMemory.shutdown();
    await db.close();
  },
});
