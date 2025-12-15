/**
 * Integration Tests: MCP Control Tools (Story 2.5-4)
 *
 * Tests the MCP control tools for per-layer validation:
 * - agentcards:continue - Continue workflow execution
 * - agentcards:abort - Abort workflow with cleanup
 * - agentcards:replan - Replan DAG with new requirements
 * - agentcards:approval_response - HIL approval/rejection
 *
 * @module tests/integration/mcp/control_tools_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";
import {
  cleanupExpiredDAGs,
  deleteWorkflowDAG,
  getWorkflowDAG,
  getWorkflowDAGRecord,
  saveWorkflowDAG,
  updateWorkflowDAG,
} from "../../../src/mcp/workflow-dag-store.ts";
import type { DAGStructure } from "../../../src/graphrag/types.ts";

/**
 * Setup test database with all migrations
 */
async function setupTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(":memory:");
  await db.connect();
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());
  return db;
}

/**
 * Create a test DAG structure
 */
function createTestDAG(taskCount: number = 2): DAGStructure {
  const tasks = [];
  for (let i = 0; i < taskCount; i++) {
    tasks.push({
      id: `task-${i + 1}`,
      tool: `test:tool_${i + 1}`,
      arguments: { arg: `value-${i + 1}` },
      dependsOn: i > 0 ? [`task-${i}`] : [],
    });
  }
  return { tasks };
}

// =============================================================================
// Workflow DAG Store Tests
// =============================================================================

Deno.test("WorkflowDAGStore: saveWorkflowDAG and getWorkflowDAG", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = "test-workflow-1";
    const dag = createTestDAG(3);
    const intent = "Test workflow intent";

    // Save DAG
    await saveWorkflowDAG(db, workflowId, dag, intent);

    // Retrieve DAG
    const retrieved = await getWorkflowDAG(db, workflowId);

    assertExists(retrieved, "DAG should be retrieved");
    assertEquals(retrieved!.tasks.length, 3, "Should have 3 tasks");
    assertEquals(retrieved!.tasks[0].id, "task-1", "First task ID should match");
    assertEquals(retrieved!.tasks[0].tool, "test:tool_1", "First task tool should match");
  } finally {
    await db.close();
  }
});

Deno.test("WorkflowDAGStore: getWorkflowDAGRecord returns full record", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = "test-workflow-record";
    const dag = createTestDAG(2);
    const intent = "Full record test";

    await saveWorkflowDAG(db, workflowId, dag, intent);

    const record = await getWorkflowDAGRecord(db, workflowId);

    assertExists(record, "Record should exist");
    assertEquals(record!.workflow_id, workflowId);
    assertEquals(record!.intent, intent);
    assertExists(record!.created_at, "created_at should exist");
    assertExists(record!.expires_at, "expires_at should exist");
  } finally {
    await db.close();
  }
});

Deno.test("WorkflowDAGStore: updateWorkflowDAG modifies existing DAG", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = "test-workflow-update";
    const originalDag = createTestDAG(2);
    await saveWorkflowDAG(db, workflowId, originalDag, "original");

    // Create updated DAG with more tasks
    const updatedDag = createTestDAG(4);
    await updateWorkflowDAG(db, workflowId, updatedDag);

    const retrieved = await getWorkflowDAG(db, workflowId);

    assertExists(retrieved, "Updated DAG should exist");
    assertEquals(retrieved!.tasks.length, 4, "Should now have 4 tasks");
  } finally {
    await db.close();
  }
});

Deno.test("WorkflowDAGStore: deleteWorkflowDAG removes DAG", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = "test-workflow-delete";
    const dag = createTestDAG(2);
    await saveWorkflowDAG(db, workflowId, dag, "to-delete");

    // Verify it exists
    let retrieved = await getWorkflowDAG(db, workflowId);
    assertExists(retrieved, "DAG should exist before delete");

    // Delete it
    await deleteWorkflowDAG(db, workflowId);

    // Verify it's gone
    retrieved = await getWorkflowDAG(db, workflowId);
    assertEquals(retrieved, null, "DAG should be null after delete");
  } finally {
    await db.close();
  }
});

Deno.test("WorkflowDAGStore: getWorkflowDAG returns null for non-existent workflow", async () => {
  const db = await setupTestDb();

  try {
    const retrieved = await getWorkflowDAG(db, "non-existent-workflow");
    assertEquals(retrieved, null, "Should return null for non-existent workflow");
  } finally {
    await db.close();
  }
});

Deno.test("WorkflowDAGStore: saveWorkflowDAG upserts on conflict", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = "test-workflow-upsert";
    const dag1 = createTestDAG(2);
    const dag2 = createTestDAG(5);

    // Save first DAG
    await saveWorkflowDAG(db, workflowId, dag1, "first");

    // Save again with same ID (should upsert)
    await saveWorkflowDAG(db, workflowId, dag2, "second");

    const retrieved = await getWorkflowDAG(db, workflowId);

    assertEquals(retrieved!.tasks.length, 5, "Should have updated to 5 tasks");
  } finally {
    await db.close();
  }
});

Deno.test("WorkflowDAGStore: cleanupExpiredDAGs removes expired entries", async () => {
  const db = await setupTestDb();

  try {
    // Insert a DAG with expired timestamp
    const expiredWorkflowId = "expired-workflow";
    const dag = createTestDAG(1);
    const dagJson = JSON.stringify(dag);

    await db.exec(`
      INSERT INTO workflow_dags (workflow_id, dag, intent, expires_at)
      VALUES ('${expiredWorkflowId}', '${dagJson}', 'expired', NOW() - INTERVAL '1 hour')
    `);

    // Insert a valid DAG
    await saveWorkflowDAG(db, "valid-workflow", dag, "valid");

    // Run cleanup
    const deletedCount = await cleanupExpiredDAGs(db);

    assertEquals(deletedCount, 1, "Should delete 1 expired DAG");

    // Verify expired is gone
    const expiredDag = await getWorkflowDAG(db, expiredWorkflowId);
    assertEquals(expiredDag, null, "Expired DAG should be gone");

    // Verify valid is still there
    const validDag = await getWorkflowDAG(db, "valid-workflow");
    assertExists(validDag, "Valid DAG should still exist");
  } finally {
    await db.close();
  }
});

// =============================================================================
// Per-Layer Validation Flow Tests
// =============================================================================

Deno.test("Per-layer validation: DAG persists across simulated MCP calls", async () => {
  const db = await setupTestDb();

  try {
    // Simulate execute_dag with per_layer_validation: true
    const workflowId = crypto.randomUUID();
    const dag = createTestDAG(3);

    // Step 1: Save DAG (simulates start of execute_dag)
    await saveWorkflowDAG(db, workflowId, dag, "multi-step workflow");

    // Step 2: Simulate layer 0 complete, MCP returns layer_complete
    // Client makes new MCP call: continue(workflow_id)

    // Step 3: Load DAG for continuation
    const dagForContinue = await getWorkflowDAG(db, workflowId);
    assertExists(dagForContinue, "DAG should be available for continue");
    assertEquals(dagForContinue!.tasks.length, 3);

    // Step 4: After workflow completes, cleanup
    await deleteWorkflowDAG(db, workflowId);

    const afterCleanup = await getWorkflowDAG(db, workflowId);
    assertEquals(afterCleanup, null, "DAG should be cleaned up after completion");
  } finally {
    await db.close();
  }
});

Deno.test("Per-layer validation: Replan updates DAG in database", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = crypto.randomUUID();
    const originalDag = createTestDAG(2);

    // Step 1: Start workflow
    await saveWorkflowDAG(db, workflowId, originalDag, "original intent");

    // Step 2: Simulate replan - agent wants to add XML parser
    const replanDag: DAGStructure = {
      tasks: [
        ...originalDag.tasks,
        {
          id: "task-xml-parser",
          tool: "xml:parse",
          arguments: { file: "data.xml" },
          dependsOn: ["task-2"],
        },
      ],
    };

    await updateWorkflowDAG(db, workflowId, replanDag);

    // Step 3: Continue should see updated DAG
    const dagForContinue = await getWorkflowDAG(db, workflowId);

    assertEquals(dagForContinue!.tasks.length, 3, "Should have 3 tasks after replan");
    assertEquals(
      dagForContinue!.tasks[2].tool,
      "xml:parse",
      "New task should be XML parser",
    );
  } finally {
    await db.close();
  }
});

Deno.test("Per-layer validation: Abort cleans up DAG", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = crypto.randomUUID();
    const dag = createTestDAG(5);

    // Start workflow
    await saveWorkflowDAG(db, workflowId, dag, "workflow to abort");

    // Simulate partial execution (layer 0 complete)
    // ...

    // Agent decides to abort
    await deleteWorkflowDAG(db, workflowId);

    // DAG should be gone
    const afterAbort = await getWorkflowDAG(db, workflowId);
    assertEquals(afterAbort, null, "DAG should be deleted after abort");
  } finally {
    await db.close();
  }
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("WorkflowDAGStore: handles large DAGs", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = "large-dag-test";
    const largeDag = createTestDAG(100); // 100 tasks

    await saveWorkflowDAG(db, workflowId, largeDag, "large workflow");

    const retrieved = await getWorkflowDAG(db, workflowId);

    assertExists(retrieved);
    assertEquals(retrieved!.tasks.length, 100, "Should handle 100 tasks");
  } finally {
    await db.close();
  }
});

Deno.test("WorkflowDAGStore: handles special characters in intent", async () => {
  const db = await setupTestDb();

  try {
    const workflowId = "special-chars-test";
    const dag = createTestDAG(1);
    const intent = "Intent with 'quotes' and \"double quotes\" and \\ backslashes";

    await saveWorkflowDAG(db, workflowId, dag, intent);

    const record = await getWorkflowDAGRecord(db, workflowId);

    assertExists(record);
    assertEquals(record!.intent, intent, "Special characters should be preserved");
  } finally {
    await db.close();
  }
});

Deno.test("WorkflowDAGStore: multiple concurrent workflows", async () => {
  const db = await setupTestDb();

  try {
    const workflows = [
      { id: "workflow-a", tasks: 2 },
      { id: "workflow-b", tasks: 3 },
      { id: "workflow-c", tasks: 4 },
    ];

    // Save all workflows
    await Promise.all(
      workflows.map((w) => saveWorkflowDAG(db, w.id, createTestDAG(w.tasks), `intent-${w.id}`)),
    );

    // Verify all exist independently
    for (const w of workflows) {
      const dag = await getWorkflowDAG(db, w.id);
      assertExists(dag, `Workflow ${w.id} should exist`);
      assertEquals(dag!.tasks.length, w.tasks, `Workflow ${w.id} should have ${w.tasks} tasks`);
    }

    // Delete one, others should remain
    await deleteWorkflowDAG(db, "workflow-b");

    const afterDelete = await getWorkflowDAG(db, "workflow-b");
    assertEquals(afterDelete, null, "Deleted workflow should be gone");

    const stillExistsA = await getWorkflowDAG(db, "workflow-a");
    const stillExistsC = await getWorkflowDAG(db, "workflow-c");
    assertExists(stillExistsA, "workflow-a should still exist");
    assertExists(stillExistsC, "workflow-c should still exist");
  } finally {
    await db.close();
  }
});

console.log("✓ MCP Control Tools integration tests loaded");
