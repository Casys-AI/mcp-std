/**
 * WorkflowRepositoryImpl Tests
 *
 * Tests for the in-memory workflow repository implementation:
 * - Workflow creation
 * - Workflow retrieval
 * - Workflow updates
 * - Workflow deletion
 * - Active/awaiting approval listing
 *
 * @module tests/unit/infrastructure/di/adapters/workflow-repository-impl.test
 */

import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@1";
import { WorkflowRepositoryImpl } from "../../../../../src/infrastructure/di/adapters/workflow-repository-impl.ts";
import type {
  CreateWorkflowInput,
  WorkflowStatus,
  WorkflowTaskResult,
} from "../../../../../src/domain/interfaces/workflow-repository.ts";
import type { DAGStructure } from "../../../../../src/graphrag/types.ts";

/**
 * Create a mock DAG structure for testing
 */
function createMockDAG(taskCount: number): DAGStructure {
  return {
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      id: `task-${i + 1}`,
      tool: `tool-${i + 1}`,
      arguments: {},
      dependsOn: i > 0 ? [`task-${i}`] : [],
    })),
  };
}

/**
 * Create a workflow input for testing
 */
function createWorkflowInput(overrides?: Partial<CreateWorkflowInput>): CreateWorkflowInput {
  return {
    intent: "Test workflow intent",
    dag: createMockDAG(3),
    ...overrides,
  };
}

Deno.test("WorkflowRepositoryImpl - Create workflow", async (t) => {
  await t.step("create() creates workflow with auto-generated ID", async () => {
    const repo = new WorkflowRepositoryImpl();
    const input = createWorkflowInput();

    const result = await repo.create(input);

    assertExists(result.workflowId);
    assertEquals(result.status, "created");
    assertEquals(result.intent, input.intent);
    assertEquals(result.currentLayer, 0);
    assertEquals(result.totalLayers, 3);
    assertEquals(result.results, []);
    assertExists(result.createdAt);
    assertExists(result.updatedAt);
  });

  await t.step("create() uses provided workflowId", async () => {
    const repo = new WorkflowRepositoryImpl();
    const input = createWorkflowInput({ workflowId: "custom-workflow-id" });

    const result = await repo.create(input);

    assertEquals(result.workflowId, "custom-workflow-id");
  });

  await t.step("create() handles workflow without DAG", async () => {
    const repo = new WorkflowRepositoryImpl();
    const input = createWorkflowInput({ dag: undefined });

    const result = await repo.create(input);

    assertEquals(result.totalLayers, 0);
  });

  await t.step("create() preserves learningContext", async () => {
    const repo = new WorkflowRepositoryImpl();
    const learningContext = {
      code: "const x = 1;",
      intent: "test intent",
      staticStructure: { nodes: [], edges: [] },
    };
    const input = createWorkflowInput({ learningContext });

    const result = await repo.create(input);

    assertEquals(result.learningContext, learningContext);
  });
});

Deno.test("WorkflowRepositoryImpl - Get workflow", async (t) => {
  await t.step("get() returns workflow by ID", async () => {
    const repo = new WorkflowRepositoryImpl();
    const created = await repo.create(createWorkflowInput({ workflowId: "get-test-id" }));

    const result = await repo.get("get-test-id");

    assertExists(result);
    assertEquals(result.workflowId, created.workflowId);
    assertEquals(result.intent, created.intent);
  });

  await t.step("get() returns null for non-existent workflow", async () => {
    const repo = new WorkflowRepositoryImpl();

    const result = await repo.get("non-existent-id");

    assertEquals(result, null);
  });
});

Deno.test("WorkflowRepositoryImpl - Update workflow", async (t) => {
  await t.step("update() updates status", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "update-test" }));

    const result = await repo.update("update-test", { status: "running" });

    assertEquals(result.status, "running");
  });

  await t.step("update() updates currentLayer", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "layer-test" }));

    const result = await repo.update("layer-test", { currentLayer: 2 });

    assertEquals(result.currentLayer, 2);
  });

  await t.step("update() updates results array", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "results-test" }));
    const newResults: WorkflowTaskResult[] = [
      { taskId: "task-1", status: "success", output: { data: "test" } },
    ];

    const result = await repo.update("results-test", { results: newResults });

    assertEquals(result.results, newResults);
  });

  await t.step("update() sets latestCheckpointId", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "checkpoint-test" }));

    const result = await repo.update("checkpoint-test", { latestCheckpointId: "chk-123" });

    assertEquals(result.latestCheckpointId, "chk-123");
  });

  await t.step("update() updates updatedAt timestamp", async () => {
    const repo = new WorkflowRepositoryImpl();
    const created = await repo.create(createWorkflowInput({ workflowId: "timestamp-test" }));
    const originalUpdatedAt = created.updatedAt;

    // Wait a tiny bit to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 1));

    const result = await repo.update("timestamp-test", { status: "running" });

    assertEquals(result.updatedAt.getTime() >= originalUpdatedAt.getTime(), true);
  });

  await t.step("update() throws for non-existent workflow", async () => {
    const repo = new WorkflowRepositoryImpl();

    await assertRejects(
      () => repo.update("non-existent", { status: "running" }),
      Error,
      "Workflow non-existent not found",
    );
  });

  await t.step("update() can set multiple fields at once", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "multi-update" }));

    const result = await repo.update("multi-update", {
      status: "paused",
      currentLayer: 1,
    });

    assertEquals(result.status, "paused");
    assertEquals(result.currentLayer, 1);
  });
});

Deno.test("WorkflowRepositoryImpl - Delete workflow", async (t) => {
  await t.step("delete() removes workflow", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "delete-test" }));

    await repo.delete("delete-test");

    const result = await repo.get("delete-test");
    assertEquals(result, null);
  });

  await t.step("delete() is idempotent (no error for non-existent)", async () => {
    const repo = new WorkflowRepositoryImpl();

    // Should not throw
    await repo.delete("non-existent");
  });
});

Deno.test("WorkflowRepositoryImpl - List workflows", async (t) => {
  await t.step("listActive() returns active workflows", async () => {
    const repo = new WorkflowRepositoryImpl();

    // Create workflows with different statuses
    await repo.create(createWorkflowInput({ workflowId: "wf-created" }));
    await repo.create(createWorkflowInput({ workflowId: "wf-running" }));
    await repo.update("wf-running", { status: "running" });
    await repo.create(createWorkflowInput({ workflowId: "wf-paused" }));
    await repo.update("wf-paused", { status: "paused" });
    await repo.create(createWorkflowInput({ workflowId: "wf-completed" }));
    await repo.update("wf-completed", { status: "completed" });
    await repo.create(createWorkflowInput({ workflowId: "wf-failed" }));
    await repo.update("wf-failed", { status: "failed" });

    const active = await repo.listActive();

    // Should include created, running, paused but not completed/failed
    assertEquals(active.length, 3);
    const statuses = active.map((w) => w.status);
    assertEquals(statuses.includes("created" as WorkflowStatus), true);
    assertEquals(statuses.includes("running" as WorkflowStatus), true);
    assertEquals(statuses.includes("paused" as WorkflowStatus), true);
  });

  await t.step("listActive() includes awaiting_approval", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "wf-approval" }));
    await repo.update("wf-approval", { status: "awaiting_approval" });

    const active = await repo.listActive();

    assertEquals(active.some((w) => w.status === "awaiting_approval"), true);
  });

  await t.step("listAwaitingApproval() returns only awaiting_approval", async () => {
    const repo = new WorkflowRepositoryImpl();

    await repo.create(createWorkflowInput({ workflowId: "wf-a1" }));
    await repo.update("wf-a1", { status: "awaiting_approval" });
    await repo.create(createWorkflowInput({ workflowId: "wf-a2" }));
    await repo.update("wf-a2", { status: "awaiting_approval" });
    await repo.create(createWorkflowInput({ workflowId: "wf-running2" }));
    await repo.update("wf-running2", { status: "running" });

    const awaiting = await repo.listAwaitingApproval();

    assertEquals(awaiting.length, 2);
    assertEquals(awaiting.every((w) => w.status === "awaiting_approval"), true);
  });

  await t.step("listActive() returns empty array when no active workflows", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "wf-done" }));
    await repo.update("wf-done", { status: "completed" });

    const active = await repo.listActive();

    assertEquals(active.length, 0);
  });
});

Deno.test("WorkflowRepositoryImpl - Utility methods", async (t) => {
  await t.step("getAll() returns all workflows as Map", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "wf-1" }));
    await repo.create(createWorkflowInput({ workflowId: "wf-2" }));

    const all = repo.getAll();

    assertEquals(all.size, 2);
    assertEquals(all.has("wf-1"), true);
    assertEquals(all.has("wf-2"), true);
  });

  await t.step("clear() removes all workflows", async () => {
    const repo = new WorkflowRepositoryImpl();
    await repo.create(createWorkflowInput({ workflowId: "wf-clear-1" }));
    await repo.create(createWorkflowInput({ workflowId: "wf-clear-2" }));

    repo.clear();

    const all = repo.getAll();
    assertEquals(all.size, 0);
  });
});
