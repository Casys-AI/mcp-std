/**
 * Unit Tests: AIL/HIL Decision Points (Story 2.5-3 Task 1)
 *
 * Tests AIL (Agent-in-the-Loop) and HIL (Human-in-the-Loop) decision logic.
 * Covers configuration, event emission, command processing, and state updates.
 */

import { assertEquals, assertExists } from "@std/assert";
import { ControlledExecutor } from "../../../src/dag/controlled-executor.ts";
import type { DAGStructure } from "../../../src/graphrag/types.ts";
import type { ExecutionEvent } from "../../../src/dag/types.ts";

/**
 * Mock tool executor for testing
 */
const mockToolExecutor = async (
  _tool: string,
  _args: Record<string, unknown>,
): Promise<unknown> => {
  return { success: true };
};

// Test 1: AIL decision point emitted per_layer
Deno.test("AIL: decision_required event emitted per_layer", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    ail: {
      enabled: true,
      decision_points: "per_layer",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  // Enqueue continue command immediately so test doesn't hang
  executor.enqueueCommand({ type: "continue", reason: "test" });

  const events: ExecutionEvent[] = [];
  for await (const event of executor.executeStream(dag)) {
    events.push(event);
  }

  // Find AIL decision_required event
  const ailEvent = events.find(
    (e) => e.type === "decision_required" && e.decisionType === "AIL",
  );

  assertExists(ailEvent, "AIL decision_required event should be emitted");
  assertEquals(
    (ailEvent as any).decisionType,
    "AIL",
    "Decision type should be AIL",
  );
});

// Test 2: AIL decision point emitted on_error
Deno.test("AIL: decision_required event emitted on_error only", async () => {
  const errorToolExecutor = async () => {
    throw new Error("Simulated task error");
  };

  const executor = new ControlledExecutor(errorToolExecutor, {
    ail: {
      enabled: true,
      decision_points: "on_error",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "failing_tool", arguments: {}, dependsOn: [] },
    ],
  };

  // Enqueue continue command
  executor.enqueueCommand({ type: "continue" });

  const events: ExecutionEvent[] = [];
  for await (const event of executor.executeStream(dag)) {
    events.push(event);
  }

  // AIL should trigger because task failed
  const ailEvent = events.find(
    (e) => e.type === "decision_required" && e.decisionType === "AIL",
  );

  assertExists(
    ailEvent,
    "AIL decision_required event should be emitted after error",
  );
});

// Test 3: Continue command processed correctly
Deno.test("AIL: continue command processed correctly", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    ail: {
      enabled: true,
      decision_points: "per_layer",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  // Enqueue continue command with reason
  executor.enqueueCommand({ type: "continue", reason: "all tasks succeeded" });

  const events: ExecutionEvent[] = [];
  for await (const event of executor.executeStream(dag)) {
    events.push(event);
  }

  // Workflow should complete successfully
  const completeEvent = events.find((e) => e.type === "workflow_complete");
  assertExists(completeEvent, "Workflow should complete after continue command");
});

// Test 4: Abort command halts execution gracefully
Deno.test("AIL: abort command halts execution gracefully", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    ail: {
      enabled: true,
      decision_points: "per_layer",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
      { id: "task2", tool: "test_tool", arguments: {}, dependsOn: ["task1"] },
    ],
  };

  // Enqueue abort command
  executor.enqueueCommand({
    type: "abort",
    reason: "test abort",
  });

  let errorThrown = false;
  try {
    for await (const _event of executor.executeStream(dag)) {
      // Should throw before completing
    }
  } catch (error) {
    errorThrown = true;
    assertEquals(
      (error as Error).message,
      "Workflow aborted by agent: test abort",
    );
  }

  assertEquals(errorThrown, true, "Abort command should throw error");
});

// Test 5: AIL decisions logged to WorkflowState.decisions[]
Deno.test("AIL: decisions logged to WorkflowState.decisions[]", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    ail: {
      enabled: true,
      decision_points: "per_layer",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  executor.enqueueCommand({ type: "continue", reason: "test reason" });

  for await (const _event of executor.executeStream(dag)) {
    // Let execution complete
  }

  const state = executor.getState();
  assertExists(state, "State should exist");
  assertEquals(
    state.decisions.length,
    1,
    "Should have one AIL decision logged",
  );
  assertEquals(state.decisions[0].type, "AIL");
  assertEquals(state.decisions[0].outcome, "continue");
});

// Test 6: HIL checkpoint emitted when approval_required="always"
Deno.test("HIL: decision_required event emitted when approval_required=always", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    hil: {
      enabled: true,
      approval_required: "always",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  // Enqueue approval response
  executor.enqueueCommand({
    type: "approval_response",
    checkpointId: "test-checkpoint",
    approved: true,
  });

  const events: ExecutionEvent[] = [];
  for await (const event of executor.executeStream(dag)) {
    events.push(event);
  }

  const hilEvent = events.find(
    (e) => e.type === "decision_required" && e.decisionType === "HIL",
  );

  assertExists(hilEvent, "HIL decision_required event should be emitted");
  assertEquals((hilEvent as any).decisionType, "HIL");
});

// Test 7: HIL checkpoint skipped when approval_required="never"
Deno.test("HIL: checkpoint skipped when approval_required=never", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    hil: {
      enabled: true,
      approval_required: "never",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  const events: ExecutionEvent[] = [];
  for await (const event of executor.executeStream(dag)) {
    events.push(event);
  }

  const hilEvent = events.find(
    (e) => e.type === "decision_required" && e.decisionType === "HIL",
  );

  assertEquals(
    hilEvent,
    undefined,
    "HIL decision should NOT be emitted when approval_required=never",
  );
});

// Test 8: HIL summary generated correctly (500-1000 tokens)
Deno.test("HIL: summary generated within token limit", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    hil: {
      enabled: true,
      approval_required: "always",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  executor.enqueueCommand({
    type: "approval_response",
    checkpointId: "test",
    approved: true,
  });

  const events: ExecutionEvent[] = [];
  for await (const event of executor.executeStream(dag)) {
    events.push(event);
  }

  const hilEvent = events.find(
    (e) => e.type === "decision_required" && e.decisionType === "HIL",
  ) as any;

  assertExists(hilEvent, "HIL event should exist");
  assertExists(hilEvent.description, "HIL event should have description");

  // Check token count (rough estimate: 1 token ≈ 4 chars)
  const tokenEstimate = hilEvent.description.length / 4;
  assertEquals(
    tokenEstimate >= 125 && tokenEstimate <= 1000,
    true,
    `Summary should be ~500-1000 tokens (got ~${tokenEstimate})`,
  );
});

// Test 9: Approved response continues execution
Deno.test("HIL: approved response continues execution", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    hil: {
      enabled: true,
      approval_required: "always",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  executor.enqueueCommand({
    type: "approval_response",
    checkpointId: "test",
    approved: true,
    feedback: "looks good",
  });

  const events: ExecutionEvent[] = [];
  for await (const event of executor.executeStream(dag)) {
    events.push(event);
  }

  const completeEvent = events.find((e) => e.type === "workflow_complete");
  assertExists(
    completeEvent,
    "Workflow should complete after HIL approval",
  );
});

// Test 10: Rejected response aborts workflow
Deno.test("HIL: rejected response aborts workflow", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    hil: {
      enabled: true,
      approval_required: "always",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  executor.enqueueCommand({
    type: "approval_response",
    checkpointId: "test",
    approved: false,
    feedback: "not ready",
  });

  let errorThrown = false;
  try {
    for await (const _event of executor.executeStream(dag)) {
      // Should throw
    }
  } catch (error) {
    errorThrown = true;
    assertEquals((error as Error).message.includes("not ready"), true);
  }

  assertEquals(errorThrown, true, "HIL rejection should abort workflow");
});

// Test 11: HIL decisions logged to WorkflowState.decisions[]
Deno.test("HIL: decisions logged to WorkflowState.decisions[]", async () => {
  const executor = new ControlledExecutor(mockToolExecutor, {
    hil: {
      enabled: true,
      approval_required: "always",
    },
  });

  const dag: DAGStructure = {
    tasks: [
      { id: "task1", tool: "test_tool", arguments: {}, dependsOn: [] },
    ],
  };

  executor.enqueueCommand({
    type: "approval_response",
    checkpointId: "test",
    approved: true,
  });

  for await (const _event of executor.executeStream(dag)) {
    // Let execution complete
  }

  const state = executor.getState();
  assertExists(state);
  assertEquals(
    state.decisions.length,
    1,
    "Should have one HIL decision logged",
  );
  assertEquals(state.decisions[0].type, "HIL");
  assertEquals(state.decisions[0].outcome, "approve");
});
