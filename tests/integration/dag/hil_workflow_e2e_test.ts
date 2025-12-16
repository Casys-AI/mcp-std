/**
 * E2E Integration Test: HIL Workflow with Human Approval (Story 2.5-3 Task 5.2)
 *
 * Tests the complete Human-in-the-Loop workflow:
 * 1. Workflow executes normally
 * 2. HIL checkpoint triggered (approval required)
 * 3. Summary generated for human (500-1000 tokens)
 * 4. Human approves/rejects via approval_response command
 * 5. Workflow continues or aborts based on decision
 *
 * This validates human control over critical workflow operations.
 *
 * **BLOCKED BY BUG-HIL-DEADLOCK**: These tests are temporarily ignored due to an
 * architectural deadlock where the generator cannot yield while Promise.allSettled()
 * is waiting. See: docs/tech-specs/tech-spec-hil-permission-escalation-fix.md
 * Fix: Implement "Deferred Escalation Pattern" from tech-spec.
 *
 * @module tests/integration/dag/hil_workflow_e2e_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { ControlledExecutor } from "../../../src/dag/controlled-executor.ts";
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
 * Mock tool executor for testing
 */
async function mockToolExecutor(
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { tool, args, result: `executed ${tool}` };
}

Deno.test({
  name: "E2E HIL Workflow: Human approves continuation",
  ignore: true, // BUG-HIL-DEADLOCK: See tech-spec-hil-permission-escalation-fix.md
}, async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();

    // Create executor with HIL enabled (always require approval)
    const executor = new ControlledExecutor(mockToolExecutor, {
      hil: {
        enabled: true,
        approval_required: "always",
      },
    });
    executor.setCheckpointManager(db, false);

    // Multi-layer DAG to trigger HIL checkpoint
    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "read_file", arguments: { path: "/data.txt" }, dependsOn: [] },
        { id: "task2", tool: "process_data", arguments: {}, dependsOn: ["task1"] },
        { id: "task3", tool: "write_output", arguments: {}, dependsOn: ["task2"] },
      ],
    };

    // Simulate human approval after HIL checkpoint
    let hilEventReceived = false;
    setTimeout(() => {
      if (hilEventReceived) {
        executor.enqueueCommand({
          type: "approval_response",
          checkpointId: "test-checkpoint",
          approved: true,
          feedback: "Looks good, proceed",
        });
      }
    }, 100);

    // Execute workflow and collect events
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag, "hil-approve-test")) {
      events.push(event);

      // Track HIL event
      if (event.type === "decision_required" && event.decisionType === "HIL") {
        hilEventReceived = true;
        // Get checkpoint ID from most recent checkpoint event
        const lastCheckpoint = events.filter((e) => e.type === "checkpoint").slice(-1)[0];
        if (lastCheckpoint) {
          const checkpointId = (lastCheckpoint as any).checkpointId;
          // Send approval
          setTimeout(() => {
            executor.enqueueCommand({
              type: "approval_response",
              checkpointId: checkpointId,
              approved: true,
              feedback: "Looks good, proceed",
            });
          }, 50);
        }
      }
    }

    // Verify HIL decision event emitted
    const hilEvent = events.find(
      (e) => e.type === "decision_required" && e.decisionType === "HIL",
    );
    assertExists(hilEvent, "HIL decision_required event should be emitted");

    // Verify summary provided (description field should have content)
    const hilEventData = hilEvent as any;
    assertExists(hilEventData.description, "HIL summary should be provided");
    assertEquals(
      hilEventData.description.length > 100,
      true,
      "HIL summary should be substantial (>100 chars for 500-1000 tokens estimate)",
    );

    // Verify approval decision logged
    const finalState = executor.getState();
    assertExists(finalState, "Final state should exist");

    const approvalDecision = finalState?.decisions.find(
      (d) => d.type === "HIL" && d.outcome === "approve",
    );
    assertExists(
      approvalDecision,
      "Approval decision should be logged in WorkflowState",
    );

    // Verify workflow completed successfully (not aborted)
    const completeEvent = events.find((e) => e.type === "workflow_complete");
    assertExists(completeEvent, "Workflow should complete after approval");
    assertEquals(
      (completeEvent as any).successfulTasks,
      3,
      "All 3 tasks should complete",
    );

    console.log(`✓ E2E HIL Approval test passed`);
    console.log(`  - HIL decision event emitted: ✓`);
    console.log(`  - Summary generated (${hilEventData.description.length} chars): ✓`);
    console.log(`  - Approval decision logged: ✓`);
    console.log(`  - Workflow completed: ✓`);
  } finally {
    if (db) await db.close();
  }
});

Deno.test({
  name: "E2E HIL Workflow: Human rejects and workflow aborts",
  ignore: true, // BUG-HIL-DEADLOCK: See tech-spec-hil-permission-escalation-fix.md
}, async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();

    const executor = new ControlledExecutor(mockToolExecutor, {
      hil: {
        enabled: true,
        approval_required: "always",
      },
    });
    executor.setCheckpointManager(db, false);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "read_file", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "delete_file", arguments: {}, dependsOn: ["task1"] },
      ],
    };

    // Simulate human rejection
    let aborted = false;
    try {
      const events: ExecutionEvent[] = [];
      for await (const event of executor.executeStream(dag, "hil-reject-test")) {
        events.push(event);

        // Human rejects the dangerous operation
        if (event.type === "decision_required" && event.decisionType === "HIL") {
          const lastCheckpoint = events.filter((e) => e.type === "checkpoint").slice(-1)[0];
          if (lastCheckpoint) {
            setTimeout(() => {
              executor.enqueueCommand({
                type: "approval_response",
                checkpointId: (lastCheckpoint as any).checkpointId,
                approved: false,
                feedback: "Rejecting delete operation - too risky",
              });
            }, 50);
          }
        }
      }
    } catch (error) {
      aborted = true;
      assertEquals(
        (error as Error).message.includes("aborted"),
        true,
        "Error should indicate workflow aborted by human",
      );
    }

    assertEquals(aborted, true, "Workflow should abort on rejection");

    // Verify rejection decision logged
    const finalState = executor.getState();
    const rejectDecision = finalState?.decisions.find(
      (d) => d.type === "HIL" && d.outcome === "reject",
    );
    assertExists(rejectDecision, "Rejection decision should be logged");
    assertEquals(
      rejectDecision?.metadata?.feedback,
      "Rejecting delete operation - too risky",
      "Feedback should be preserved",
    );

    console.log(`✓ E2E HIL Rejection test passed`);
    console.log(`  - Workflow aborted on rejection: ✓`);
    console.log(`  - Rejection decision logged: ✓`);
    console.log(`  - Feedback preserved: ✓`);
  } finally {
    if (db) await db.close();
  }
});

Deno.test({
  name: "E2E HIL Workflow: Never mode skips all approvals",
  ignore: true, // BUG-HIL-DEADLOCK: See tech-spec-hil-permission-escalation-fix.md
}, async () => {
  let db: PGliteClient | undefined;

  try {
    db = await setupTestDb();

    const executor = new ControlledExecutor(mockToolExecutor, {
      hil: {
        enabled: true,
        approval_required: "never",
      },
    });
    executor.setCheckpointManager(db, false);

    const dag: DAGStructure = {
      tasks: [
        { id: "task1", tool: "read_file", arguments: {}, dependsOn: [] },
        { id: "task2", tool: "process_data", arguments: {}, dependsOn: ["task1"] },
      ],
    };

    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag, "hil-never-test")) {
      events.push(event);
    }

    // Verify NO HIL events emitted
    const hilEvents = events.filter(
      (e) => e.type === "decision_required" && e.decisionType === "HIL",
    );

    assertEquals(
      hilEvents.length,
      0,
      "HIL should not trigger when approval_required=never",
    );

    // Verify workflow completed without waiting for approval
    const completeEvent = events.find((e) => e.type === "workflow_complete");
    assertExists(completeEvent, "Workflow should complete without HIL");

    console.log(`✓ E2E HIL Never mode test passed`);
    console.log(`  - No HIL events: ✓`);
    console.log(`  - Workflow completed: ✓`);
  } finally {
    if (db) await db.close();
  }
});
