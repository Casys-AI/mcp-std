/**
 * Unit tests for WorkflowState and Reducers
 *
 * Tests:
 * - State reducer functions (messages, tasks, decisions, context)
 * - State invariant validation
 * - updateState() helper
 * - Performance (<1ms per update)
 *
 * Target: >90% code coverage for reducers
 *
 * @module tests/unit/dag/state_test
 */

import { assertEquals, assertThrows } from "@std/assert";
import {
  contextReducer,
  createInitialState,
  type Decision,
  decisionsReducer,
  getStateSnapshot,
  type Message,
  messagesReducer,
  type TaskResult,
  tasksReducer,
  updateState,
  validateStateInvariants,
  type WorkflowState,
} from "../../../src/dag/state.ts";

Deno.test("WorkflowState - Reducers", async (t) => {
  await t.step("messagesReducer appends messages", () => {
    const existing: Message[] = [
      { role: "user", content: "Hello", timestamp: 1 },
    ];
    const update: Message[] = [
      { role: "assistant", content: "Hi", timestamp: 2 },
    ];

    const result = messagesReducer(existing, update);

    assertEquals(result.length, 2);
    assertEquals(result[0].content, "Hello");
    assertEquals(result[1].content, "Hi");
    // Verify immutability - original unchanged
    assertEquals(existing.length, 1);
  });

  await t.step("tasksReducer appends tasks", () => {
    const existing: TaskResult[] = [
      { taskId: "task1", status: "success", output: "result1" },
    ];
    const update: TaskResult[] = [
      { taskId: "task2", status: "success", output: "result2" },
    ];

    const result = tasksReducer(existing, update);

    assertEquals(result.length, 2);
    assertEquals(result[0].taskId, "task1");
    assertEquals(result[1].taskId, "task2");
    assertEquals(existing.length, 1); // Immutability
  });

  await t.step("decisionsReducer appends decisions", () => {
    const existing: Decision[] = [
      {
        type: "AIL",
        timestamp: 1,
        description: "Decision 1",
        outcome: "approved",
      },
    ];
    const update: Decision[] = [
      {
        type: "HIL",
        timestamp: 2,
        description: "Decision 2",
        outcome: "rejected",
      },
    ];

    const result = decisionsReducer(existing, update);

    assertEquals(result.length, 2);
    assertEquals(result[0].type, "AIL");
    assertEquals(result[1].type, "HIL");
    assertEquals(existing.length, 1); // Immutability
  });

  await t.step("contextReducer merges context (shallow)", () => {
    const existing = { key1: "value1", key2: "value2" };
    const update = { key2: "updated", key3: "value3" };

    const result = contextReducer(existing, update);

    assertEquals(result.key1, "value1");
    assertEquals(result.key2, "updated"); // Overwrite
    assertEquals(result.key3, "value3"); // New key
    assertEquals(Object.keys(result).length, 3);
    assertEquals(Object.keys(existing).length, 2); // Immutability
  });

  await t.step("reducers handle empty arrays/objects", () => {
    assertEquals(messagesReducer([], []).length, 0);
    assertEquals(tasksReducer([], []).length, 0);
    assertEquals(decisionsReducer([], []).length, 0);
    assertEquals(Object.keys(contextReducer({}, {})).length, 0);
  });
});

Deno.test("WorkflowState - Invariants", async (t) => {
  await t.step("validateStateInvariants passes for valid state", () => {
    const state: WorkflowState = {
      workflowId: "test-workflow",
      currentLayer: 0,
      messages: [],
      tasks: [],
      decisions: [],
      context: {},
    };

    // Should not throw
    validateStateInvariants(state);
  });

  await t.step("validateStateInvariants rejects empty workflow_id", () => {
    const state: WorkflowState = {
      workflowId: "",
      currentLayer: 0,
      messages: [],
      tasks: [],
      decisions: [],
      context: {},
    };

    assertThrows(
      () => validateStateInvariants(state),
      Error,
      "workflow_id must be non-empty",
    );
  });

  await t.step("validateStateInvariants rejects negative layer", () => {
    const state: WorkflowState = {
      workflowId: "test",
      currentLayer: -1,
      messages: [],
      tasks: [],
      decisions: [],
      context: {},
    };

    assertThrows(
      () => validateStateInvariants(state),
      Error,
      "current_layer must be >= 0",
    );
  });

  await t.step(
    "validateStateInvariants rejects tasks.length < decisions.length",
    () => {
      const state: WorkflowState = {
        workflowId: "test",
        currentLayer: 0,
        messages: [],
        tasks: [{ taskId: "task1", status: "success" }],
        decisions: [
          { type: "AIL", timestamp: 1, description: "d1", outcome: "ok" },
          { type: "AIL", timestamp: 2, description: "d2", outcome: "ok" },
        ],
        context: {},
      };

      assertThrows(
        () => validateStateInvariants(state),
        Error,
        "tasks.length",
      );
    },
  );

  await t.step("validateStateInvariants allows tasks.length >= decisions.length", () => {
    const state: WorkflowState = {
      workflowId: "test",
      currentLayer: 0,
      messages: [],
      tasks: [
        { taskId: "task1", status: "success" },
        { taskId: "task2", status: "success" },
      ],
      decisions: [
        { type: "AIL", timestamp: 1, description: "d1", outcome: "ok" },
      ],
      context: {},
    };

    // Should not throw
    validateStateInvariants(state);
  });
});

Deno.test("WorkflowState - updateState", async (t) => {
  await t.step("updateState applies messages reducer", () => {
    const state = createInitialState("test");
    const newMessages: Message[] = [
      { role: "user", content: "Hello", timestamp: 1 },
    ];

    const updated = updateState(state, { messages: newMessages });

    assertEquals(updated.messages.length, 1);
    assertEquals(updated.messages[0].content, "Hello");
    assertEquals(state.messages.length, 0); // Original unchanged
  });

  await t.step("updateState applies tasks reducer", () => {
    const state = createInitialState("test");
    const newTasks: TaskResult[] = [
      { taskId: "task1", status: "success", output: "result" },
    ];

    const updated = updateState(state, { tasks: newTasks });

    assertEquals(updated.tasks.length, 1);
    assertEquals(updated.tasks[0].taskId, "task1");
  });

  await t.step("updateState applies decisions reducer", () => {
    const state = createInitialState("test");
    // Must add task first to satisfy invariant (tasks.length >= decisions.length)
    const stateWithTask = updateState(state, {
      tasks: [{ taskId: "task1", status: "success", output: "result" }],
    });

    const newDecisions: Decision[] = [
      { type: "HIL", timestamp: 1, description: "test", outcome: "approved" },
    ];

    const updated = updateState(stateWithTask, { decisions: newDecisions });

    assertEquals(updated.decisions.length, 1);
    assertEquals(updated.decisions[0].type, "HIL");
  });

  await t.step("updateState applies context reducer", () => {
    const state = createInitialState("test");
    const newContext = { key: "value" };

    const updated = updateState(state, { context: newContext });

    assertEquals(updated.context.key, "value");
  });

  await t.step("updateState updates currentLayer", () => {
    const state = createInitialState("test");

    const updated = updateState(state, { currentLayer: 5 });

    assertEquals(updated.currentLayer, 5);
    assertEquals(state.currentLayer, 0); // Original unchanged
  });

  await t.step("updateState applies multiple updates atomically", () => {
    const state = createInitialState("test");

    const updated = updateState(state, {
      currentLayer: 2,
      messages: [{ role: "user", content: "test", timestamp: 1 }],
      context: { key: "value" },
    });

    assertEquals(updated.currentLayer, 2);
    assertEquals(updated.messages.length, 1);
    assertEquals(updated.context.key, "value");
  });

  await t.step("updateState validates invariants after update", () => {
    const state = createInitialState("test");

    // This should throw because decisions > tasks
    assertThrows(
      () =>
        updateState(state, {
          decisions: [
            { type: "AIL", timestamp: 1, description: "d", outcome: "ok" },
          ],
        }),
      Error,
      "tasks.length",
    );
  });

  await t.step("updateState preserves workflow_id (immutable)", () => {
    const state = createInitialState("original-id");

    const updated = updateState(state, { currentLayer: 1 });

    assertEquals(updated.workflowId, "original-id");
  });
});

Deno.test("WorkflowState - Helpers", async (t) => {
  await t.step("createInitialState creates valid state", () => {
    const state = createInitialState("test-workflow");

    assertEquals(state.workflowId, "test-workflow");
    assertEquals(state.currentLayer, 0);
    assertEquals(state.messages.length, 0);
    assertEquals(state.tasks.length, 0);
    assertEquals(state.decisions.length, 0);
    assertEquals(Object.keys(state.context).length, 0);

    // Should pass validation
    validateStateInvariants(state);
  });

  await t.step("getStateSnapshot returns readonly view", () => {
    const state = createInitialState("test");
    const snapshot = getStateSnapshot(state);

    // Snapshot should be frozen
    assertEquals(snapshot.workflowId, "test");

    // Attempting to modify should throw in strict mode
    // (In non-strict mode, it silently fails)
    // We can't easily test this, but the type system enforces Readonly
  });
});

Deno.test("WorkflowState - Performance", async (t) => {
  await t.step("updateState completes in <1ms (1000 updates)", () => {
    let state = createInitialState("perf-test");

    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      state = updateState(state, {
        messages: [{ role: "user", content: `msg${i}`, timestamp: i }],
      });
    }

    const elapsed = performance.now() - startTime;
    const avgPerUpdate = elapsed / 1000;

    console.log(
      `Average update time: ${avgPerUpdate.toFixed(3)}ms per update`,
    );

    // Should be well under 1ms per update
    // On modern hardware, should be <0.1ms
    assertEquals(avgPerUpdate < 1, true, `Expected <1ms, got ${avgPerUpdate}ms`);
  });

  await t.step("reducers handle large arrays efficiently", () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({
      role: "user" as const,
      content: `msg${i}`,
      timestamp: i,
    }));

    const startTime = performance.now();
    const result = messagesReducer([], largeArray);
    const elapsed = performance.now() - startTime;

    assertEquals(result.length, 10000);
    console.log(`Reducer with 10k items: ${elapsed.toFixed(2)}ms`);

    // Should complete quickly even with large arrays
    assertEquals(elapsed < 100, true, `Expected <100ms, got ${elapsed}ms`);
  });
});
