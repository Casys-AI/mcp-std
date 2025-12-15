/**
 * Unit tests for CommandQueue and AsyncQueue
 *
 * Tests:
 * - FIFO ordering maintained
 * - Enqueue/dequeue operations
 * - Non-blocking processing
 * - Injection latency (<10ms P95)
 * - Type validation (reject invalid commands)
 *
 * @module tests/unit/dag/command_queue_test
 */

import { assertEquals, assertThrows } from "@std/assert";
import { AsyncQueue, CommandQueue, isValidCommand } from "../../../src/dag/command-queue.ts";
import type { Command } from "../../../src/dag/types.ts";

Deno.test("AsyncQueue - Basic Operations", async (t) => {
  await t.step("enqueue and dequeue single item", async () => {
    const queue = new AsyncQueue<number>();

    queue.enqueue(42);

    const value = await queue.dequeue();
    assertEquals(value, 42);
  });

  await t.step("dequeue waits for enqueue if empty", async () => {
    const queue = new AsyncQueue<string>();

    // Start dequeue (will wait)
    const dequeuePromise = queue.dequeue();

    // Enqueue after 10ms
    setTimeout(() => queue.enqueue("hello"), 10);

    const value = await dequeuePromise;
    assertEquals(value, "hello");
  });

  await t.step("FIFO ordering maintained", async () => {
    const queue = new AsyncQueue<number>();

    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);

    assertEquals(await queue.dequeue(), 1);
    assertEquals(await queue.dequeue(), 2);
    assertEquals(await queue.dequeue(), 3);
  });

  await t.step("isEmpty returns correct state", () => {
    const queue = new AsyncQueue<number>();

    assertEquals(queue.isEmpty(), true);

    queue.enqueue(1);
    assertEquals(queue.isEmpty(), false);

    queue.dequeue();
    assertEquals(queue.isEmpty(), true);
  });

  await t.step("size returns correct count", () => {
    const queue = new AsyncQueue<number>();

    assertEquals(queue.size(), 0);

    queue.enqueue(1);
    queue.enqueue(2);
    assertEquals(queue.size(), 2);

    queue.dequeue();
    assertEquals(queue.size(), 1);
  });

  await t.step("clear removes all items", () => {
    const queue = new AsyncQueue<number>();

    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);

    queue.clear();

    assertEquals(queue.isEmpty(), true);
    assertEquals(queue.size(), 0);
  });
});

Deno.test("AsyncQueue - Concurrent Operations", async (t) => {
  await t.step("multiple concurrent dequeuers get FIFO items", async () => {
    const queue = new AsyncQueue<number>();

    // Start 3 dequeuers (will wait)
    const dequeue1 = queue.dequeue();
    const dequeue2 = queue.dequeue();
    const dequeue3 = queue.dequeue();

    // Enqueue 3 items
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);

    const results = await Promise.all([dequeue1, dequeue2, dequeue3]);

    // Should receive in FIFO order
    assertEquals(results, [1, 2, 3]);
  });

  await t.step("handles interleaved enqueue/dequeue", async () => {
    const queue = new AsyncQueue<number>();

    queue.enqueue(1);
    const v1 = await queue.dequeue();

    queue.enqueue(2);
    queue.enqueue(3);

    const v2 = await queue.dequeue();
    const v3 = await queue.dequeue();

    assertEquals([v1, v2, v3], [1, 2, 3]);
  });
});

Deno.test("CommandQueue - Command Validation", async (t) => {
  await t.step("isValidCommand accepts valid abort command", () => {
    const cmd: Command = {
      type: "abort",
      reason: "test abort",
    };

    assertEquals(isValidCommand(cmd), true);
  });

  await t.step("isValidCommand accepts valid inject_tasks command", () => {
    const cmd: Command = {
      type: "inject_tasks",
      tasks: [
        {
          id: "task1",
          tool: "tool1",
          arguments: {},
          dependsOn: [],
        },
      ],
      targetLayer: 2,
    };

    assertEquals(isValidCommand(cmd), true);
  });

  await t.step("isValidCommand accepts all 8 command types", () => {
    const commands: Command[] = [
      { type: "continue", reason: "test" },
      { type: "abort", reason: "test" },
      { type: "inject_tasks", tasks: [], targetLayer: 0 },
      { type: "replan_dag", newRequirement: "test requirement", availableContext: {} },
      { type: "skip_layer", layerIndex: 1, reason: "test" },
      { type: "modify_args", taskId: "task1", updates: {} },
      {
        type: "checkpoint_response",
        checkpointId: "cp1",
        decision: "continue",
      },
      {
        type: "approval_response",
        checkpointId: "cp1",
        approved: true,
      },
    ];

    for (const cmd of commands) {
      assertEquals(isValidCommand(cmd), true, `Failed: ${cmd.type}`);
    }
  });

  await t.step("isValidCommand rejects invalid command type", () => {
    const cmd = {
      type: "invalid_type",
      data: "test",
    };

    assertEquals(isValidCommand(cmd), false);
  });

  await t.step("isValidCommand rejects missing required fields", () => {
    const cmd = {
      type: "abort",
      // Missing 'reason' field
    };

    assertEquals(isValidCommand(cmd), false);
  });

  await t.step("isValidCommand rejects non-object", () => {
    assertEquals(isValidCommand(null), false);
    assertEquals(isValidCommand(undefined), false);
    assertEquals(isValidCommand("string"), false);
    assertEquals(isValidCommand(42), false);
  });
});

Deno.test("CommandQueue - Operations", async (t) => {
  await t.step("enqueue and processCommands", async () => {
    const queue = new CommandQueue();

    const cmd: Command = {
      type: "abort",
      reason: "test",
    };

    queue.enqueue(cmd);

    const commands = await queue.processCommandsAsync();

    assertEquals(commands.length, 1);
    assertEquals(commands[0].type, "abort");
  });

  await t.step("enqueue rejects invalid command", () => {
    const queue = new CommandQueue();

    const invalidCmd = {
      type: "invalid",
    };

    assertThrows(
      () => queue.enqueue(invalidCmd as any),
      Error,
      "Invalid command type",
    );
  });

  await t.step("processCommands drains queue (non-blocking)", async () => {
    const queue = new CommandQueue();

    queue.enqueue({ type: "abort", reason: "r1" });
    queue.enqueue({ type: "abort", reason: "r2" });
    queue.enqueue({ type: "abort", reason: "r3" });

    const commands = await queue.processCommandsAsync();

    assertEquals(commands.length, 3);
    assertEquals(queue.size(), 0);
    assertEquals(queue.hasPending(), false);
  });

  await t.step("processCommands returns empty array if queue empty", async () => {
    const queue = new CommandQueue();

    const commands = await queue.processCommandsAsync();

    assertEquals(commands.length, 0);
  });

  await t.step("hasPending returns correct state", () => {
    const queue = new CommandQueue();

    assertEquals(queue.hasPending(), false);

    queue.enqueue({ type: "abort", reason: "test" });

    assertEquals(queue.hasPending(), true);
  });

  await t.step("clear removes all commands", () => {
    const queue = new CommandQueue();

    queue.enqueue({ type: "abort", reason: "r1" });
    queue.enqueue({ type: "abort", reason: "r2" });

    queue.clear();

    assertEquals(queue.hasPending(), false);
    assertEquals(queue.size(), 0);
  });
});

Deno.test("CommandQueue - Performance", async (t) => {
  await t.step("injection latency <10ms P95 (100 commands)", async () => {
    const queue = new CommandQueue();
    const latencies: number[] = [];

    for (let i = 0; i < 100; i++) {
      const cmd: Command = {
        type: "abort",
        reason: `test${i}`,
      };

      const start = performance.now();
      queue.enqueue(cmd);
      const elapsed = performance.now() - start;

      latencies.push(elapsed);
    }

    // Calculate P95
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95 = latencies[p95Index];

    console.log(`Command injection P95: ${p95.toFixed(2)}ms`);

    // P95 should be <10ms (usually <1ms)
    assertEquals(
      p95 < 10,
      true,
      `Expected P95 <10ms, got ${p95.toFixed(2)}ms`,
    );
  });

  await t.step("processCommands handles large batches efficiently", async () => {
    const queue = new CommandQueue();

    // Enqueue 1000 commands
    for (let i = 0; i < 1000; i++) {
      queue.enqueue({ type: "abort", reason: `test${i}` });
    }

    const start = performance.now();
    const commands = await queue.processCommandsAsync();
    const elapsed = performance.now() - start;

    assertEquals(commands.length, 1000);
    console.log(`Process 1000 commands: ${elapsed.toFixed(2)}ms`);

    // Should complete quickly (<100ms)
    assertEquals(
      elapsed < 100,
      true,
      `Expected <100ms, got ${elapsed.toFixed(2)}ms`,
    );
  });
});

Deno.test("CommandQueue - Statistics", async (t) => {
  await t.step("getStats returns accurate counts", async () => {
    const queue = new CommandQueue();

    const initialStats = queue.getStats();
    assertEquals(initialStats.totalCommands, 0);
    assertEquals(initialStats.processedCommands, 0);

    // Enqueue 5 commands
    for (let i = 0; i < 5; i++) {
      queue.enqueue({ type: "abort", reason: `test${i}` });
    }

    let stats = queue.getStats();
    assertEquals(stats.totalCommands, 5);
    assertEquals(stats.processedCommands, 0);

    // Process commands
    await queue.processCommandsAsync();

    stats = queue.getStats();
    assertEquals(stats.totalCommands, 5);
    assertEquals(stats.processedCommands, 5);
  });

  await t.step("rejected_commands incremented on invalid command", () => {
    const queue = new CommandQueue();

    try {
      queue.enqueue({ type: "invalid" } as any);
    } catch {
      // Expected
    }

    const stats = queue.getStats();
    assertEquals(stats.rejectedCommands, 1);
  });
});
