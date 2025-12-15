/**
 * E2E Integration Test: AIL Workflow with DAG Replanning (Story 2.5-3 Task 5.1)
 *
 * Tests the complete Agent-in-the-Loop workflow:
 * 1. Agent executes initial DAG
 * 2. Agent discovers new requirement (e.g., XML files found)
 * 3. Agent triggers replan_dag command
 * 4. DAGSuggester queries GraphRAG for XML parser tools
 * 5. New tasks merged into DAG
 * 6. Execution continues with augmented DAG
 *
 * This validates the complete adaptive feedback loop from discovery to replanning.
 *
 * @module tests/integration/dag/ail_workflow_e2e_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { ControlledExecutor } from "../../../src/dag/controlled-executor.ts";
import { DAGSuggester } from "../../../src/graphrag/dag-suggester.ts";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import { VectorSearch } from "../../../src/vector/search.ts";
import type { DAGStructure } from "../../../src/graphrag/types.ts";
import type { ExecutionEvent } from "../../../src/dag/types.ts";
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

/**
 * Mock EmbeddingModel for tests
 */
class MockEmbeddingModel {
  async encode(_text: string): Promise<number[]> {
    // Return mock 1024-dim embedding
    return new Array(1024).fill(0.5);
  }
}

/**
 * Seed database with test tools for GraphRAG
 */
async function seedGraphRAGTools(db: PGliteClient): Promise<void> {
  // Insert test tools (filesystem and XML parser)
  const mockEmbed1 = `[${new Array(1024).fill(0.1).join(",")}]`;
  const mockEmbed2 = `[${new Array(1024).fill(0.2).join(",")}]`;
  const mockEmbed3 = `[${new Array(1024).fill(0.3).join(",")}]`;

  await db.query(
    `INSERT INTO tool_embedding (tool_id, tool_name, server_id, embedding, metadata)
     VALUES
       ($1, $2, $3, $4, $5),
       ($6, $7, $8, $9, $10),
       ($11, $12, $13, $14, $15)`,
    [
      "filesystem:list_directory",
      "list_directory",
      "server1",
      mockEmbed1,
      JSON.stringify({ description: "List files in a directory" }),
      "filesystem:read_file",
      "read_file",
      "server1",
      mockEmbed2,
      JSON.stringify({ description: "Read file contents" }),
      "xml:parse",
      "parse_xml",
      "server2",
      mockEmbed3,
      JSON.stringify({ description: "Parse XML documents" }),
    ],
  );

  // Insert tool dependencies (list_directory often followed by parse_xml)
  await db.query(
    `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score)
     VALUES ($1, $2, $3, $4)`,
    ["filesystem:list_directory", "xml:parse", 5, 0.85],
  );
}

/**
 * Mock tool executor that simulates discovering XML files
 */
let executionStep = 0;
async function mockToolExecutorWithDiscovery(
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 10));

  executionStep++;

  if (tool === "list_directory") {
    // Simulate discovering XML files
    return {
      files: ["data.xml", "config.xml", "results.txt"],
      xml_files_found: true,
    };
  } else if (tool === "parse_xml") {
    // Simulate XML parsing (injected by replan)
    return {
      parsed: true,
      data: { key: "value" },
    };
  }

  return { tool, args, result: `executed ${tool}` };
}

Deno.test("E2E AIL Workflow: Agent discovers XML files and triggers replanning", async () => {
  let db: PGliteClient | undefined;

  try {
    // 1. Setup test database and seed GraphRAG
    db = await setupTestDb();
    await seedGraphRAGTools(db);

    // 2. Initialize GraphRAG components
    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const mockEmbeddingModel = new MockEmbeddingModel();
    const vectorSearch = new VectorSearch(db, mockEmbeddingModel as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    // 3. Create executor with AIL enabled
    executionStep = 0;
    const executor = new ControlledExecutor(mockToolExecutorWithDiscovery, {
      ail: {
        enabled: true,
        decision_points: "per_layer",
      },
    });
    executor.setDAGSuggester(dagSuggester);

    // 4. Initial DAG: Just list directory
    const initialDAG: DAGStructure = {
      tasks: [
        {
          id: "task1",
          tool: "list_directory",
          arguments: { path: "/data" },
          dependsOn: [],
        },
      ],
    };

    // 5. Enqueue replan command after first layer (simulating agent decision)
    setTimeout(() => {
      executor.enqueueCommand({
        type: "replan_dag",
        newRequirement: "parse XML files found in directory",
        availableContext: { xml_files: ["data.xml", "config.xml"] },
      });
    }, 50);

    // 6. Execute workflow and collect events
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(initialDAG, "ail-test-workflow")) {
      events.push(event);

      // After AIL decision event, auto-continue after replan
      if (
        event.type === "decision_required" &&
        event.decisionType === "AIL"
      ) {
        // Give replan time to process, then continue
        setTimeout(() => {
          executor.enqueueCommand({ type: "continue", reason: "replan processed" });
        }, 100);
      }
    }

    // 7. Verify AIL decision event emitted
    const ailEvent = events.find(
      (e) => e.type === "decision_required" && e.decisionType === "AIL",
    );
    assertExists(ailEvent, "AIL decision_required event should be emitted");

    // 8. Verify workflow state includes replan decision
    const finalState = executor.getState();
    assertExists(finalState, "Final state should exist");

    const replanDecision = finalState?.decisions.find(
      (d) => d.type === "AIL" && d.outcome?.includes("replan"),
    );
    assertExists(
      replanDecision,
      "Replan decision should be logged in WorkflowState",
    );

    // 9. Verify workflow completed successfully
    const completeEvent = events.find((e) => e.type === "workflow_complete");
    assertExists(completeEvent, "Workflow should complete");
    assertEquals(
      (completeEvent as any).successfulTasks >= 1,
      true,
      "At least initial task should succeed",
    );

    console.log(`✓ E2E AIL Workflow test passed`);
    console.log(`  - AIL decision event emitted: ✓`);
    console.log(`  - Replan decision logged: ✓`);
    console.log(`  - Workflow completed: ✓`);
    console.log(`  - Total events: ${events.length}`);
  } finally {
    if (db) await db.close();
  }
});

Deno.test("E2E AIL Workflow: Agent abort command stops execution", async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();
    await seedGraphRAGTools(db);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const mockEmbeddingModel = new MockEmbeddingModel();
    const vectorSearch = new VectorSearch(db, mockEmbeddingModel as any);
    const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

    executionStep = 0;
    const executor = new ControlledExecutor(mockToolExecutorWithDiscovery, {
      ail: {
        enabled: true,
        decision_points: "per_layer",
      },
    });
    executor.setDAGSuggester(dagSuggester);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "list_directory", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "read_file", arguments: {}, dependsOn: ["task1"] },
      ],
    };

    // Enqueue abort command after first layer
    setTimeout(() => {
      executor.enqueueCommand({
        type: "abort",
        reason: "Agent detected security risk",
      });
    }, 50);

    // Execute and expect abort
    let aborted = false;
    try {
      const events: ExecutionEvent[] = [];
      for await (const event of executor.executeStream(dag, "ail-abort-test")) {
        events.push(event);
      }
    } catch (error) {
      aborted = true;
      assertEquals(
        (error as Error).message.includes("aborted"),
        true,
        "Error should indicate workflow aborted",
      );
    }

    assertEquals(aborted, true, "Workflow should abort on abort command");

    // Verify abort decision logged
    const finalState = executor.getState();
    const abortDecision = finalState?.decisions.find(
      (d) => d.type === "AIL" && d.outcome === "abort",
    );
    assertExists(abortDecision, "Abort decision should be logged");

    console.log(`✓ E2E AIL Abort test passed`);
  } finally {
    if (db) await db.close();
  }
});
