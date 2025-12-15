/**
 * Unit tests for EventStream
 *
 * Tests:
 * - Event emission for all 9 event types
 * - Emission overhead (<5ms P95)
 * - Backpressure handling (drop events when consumer slow)
 * - Multiple subscribers support
 *
 * @module tests/unit/dag/event_stream_test
 */

import { assertEquals } from "@std/assert";
import { EventStream } from "../../../src/dag/event-stream.ts";
import type { ExecutionEvent } from "../../../src/dag/types.ts";

Deno.test("EventStream - Event Emission", async (t) => {
  await t.step("emit workflow_start event", async () => {
    const stream = new EventStream();

    const event: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflowId: "test",
      totalLayers: 3,
    };

    const emitted = await stream.emit(event);
    assertEquals(emitted, true);

    await stream.close();
  });

  await t.step("emit all 9 event types", async () => {
    const stream = new EventStream();

    const events: ExecutionEvent[] = [
      {
        type: "workflow_start",
        timestamp: Date.now(),
        workflowId: "test",
        totalLayers: 1,
      },
      {
        type: "layer_start",
        timestamp: Date.now(),
        workflowId: "test",
        layerIndex: 0,
        tasksCount: 2,
      },
      {
        type: "task_start",
        timestamp: Date.now(),
        workflowId: "test",
        taskId: "task1",
        tool: "tool1",
      },
      {
        type: "task_complete",
        timestamp: Date.now(),
        workflowId: "test",
        taskId: "task1",
        executionTimeMs: 10,
      },
      {
        type: "task_error",
        timestamp: Date.now(),
        workflowId: "test",
        taskId: "task2",
        error: "test error",
      },
      {
        type: "state_updated",
        timestamp: Date.now(),
        workflowId: "test",
        updates: { tasksAdded: 1 },
      },
      {
        type: "checkpoint",
        timestamp: Date.now(),
        workflowId: "test",
        checkpointId: "cp1",
        layerIndex: 0,
      },
      {
        type: "decision_required",
        timestamp: Date.now(),
        workflowId: "test",
        decisionType: "HIL",
        description: "test decision",
      },
      {
        type: "workflow_complete",
        timestamp: Date.now(),
        workflowId: "test",
        totalTimeMs: 100,
        successfulTasks: 1,
        failedTasks: 1,
      },
    ];

    for (const event of events) {
      const emitted = await stream.emit(event);
      assertEquals(emitted, true, `Failed to emit ${event.type}`);
    }

    const stats = stream.getStats();
    assertEquals(stats.total_events, 9);
    assertEquals(stats.dropped_events, 0);

    await stream.close();
  });

  await t.step("subscribe receives emitted events", async () => {
    const stream = new EventStream();

    const event: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflowId: "test",
      totalLayers: 1,
    };

    // Start subscriber in background
    const receivedEvents: ExecutionEvent[] = [];
    const subscriberPromise = (async () => {
      for await (const evt of stream.subscribe()) {
        receivedEvents.push(evt);
        if (evt.type === "workflow_complete") break;
      }
    })();

    // Emit events
    await stream.emit(event);
    await stream.emit({
      type: "workflow_complete",
      timestamp: Date.now(),
      workflowId: "test",
      totalTimeMs: 10,
      successfulTasks: 0,
      failedTasks: 0,
    });

    // Wait for subscriber to process
    await subscriberPromise;

    assertEquals(receivedEvents.length, 2);
    assertEquals(receivedEvents[0].type, "workflow_start");
    assertEquals(receivedEvents[1].type, "workflow_complete");

    await stream.close();
  });

  await t.step("cannot emit to closed stream", async () => {
    const stream = new EventStream();
    await stream.close();

    const event: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflowId: "test",
      totalLayers: 1,
    };

    const emitted = await stream.emit(event);
    assertEquals(emitted, false);
  });
});

Deno.test("EventStream - Performance", async (t) => {
  await t.step("emission overhead <5ms P95 (1000 events)", async () => {
    const stream = new EventStream();
    const latencies: number[] = [];

    for (let i = 0; i < 1000; i++) {
      const event: ExecutionEvent = {
        type: "task_complete",
        timestamp: Date.now(),
        workflowId: "test",
        taskId: `task${i}`,
        executionTimeMs: 10,
      };

      const start = performance.now();
      await stream.emit(event);
      const elapsed = performance.now() - start;

      latencies.push(elapsed);
    }

    // Calculate P95
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95 = latencies[p95Index];

    console.log(`Event emission P95: ${p95.toFixed(2)}ms`);
    console.log(
      `Event emission P50: ${latencies[Math.floor(latencies.length * 0.5)].toFixed(2)}ms`,
    );

    // P95 should be <5ms (usually <1ms on modern hardware)
    assertEquals(
      p95 < 5,
      true,
      `Expected P95 <5ms, got ${p95.toFixed(2)}ms`,
    );

    await stream.close();
  });

  await t.step("handles slow consumers without blocking", async () => {
    const stream = new EventStream();

    // Create slow consumer
    const receivedEvents: ExecutionEvent[] = [];
    const slowSubscriber = (async () => {
      for await (const evt of stream.subscribe()) {
        receivedEvents.push(evt);
        // Simulate slow processing
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (receivedEvents.length >= 10) break;
      }
    })();

    // Emit many events quickly (should not block)
    const startTime = performance.now();
    for (let i = 0; i < 100; i++) {
      await stream.emit({
        type: "task_complete",
        timestamp: Date.now(),
        workflowId: "test",
        taskId: `task${i}`,
        executionTimeMs: 10,
      });
    }
    const emitTime = performance.now() - startTime;

    await stream.close();
    await slowSubscriber;

    const stats = stream.getStats();

    console.log(`Total events: ${stats.total_events}`);
    console.log(`Emit time: ${emitTime.toFixed(1)}ms`);
    console.log(`Received events: ${receivedEvents.length}`);

    // All events should be emitted (no backpressure drops in simple implementation)
    assertEquals(stats.total_events, 100);
    assertEquals(stats.dropped_events, 0);

    // Emission should be fast (not blocked by slow consumer)
    assertEquals(emitTime < 100, true, `Expected <100ms emit time, got ${emitTime}ms`);
  });
});

Deno.test("EventStream - Statistics", async (t) => {
  await t.step("getStats returns accurate counts", async () => {
    const stream = new EventStream();

    const initialStats = stream.getStats();
    assertEquals(initialStats.total_events, 0);
    assertEquals(initialStats.dropped_events, 0);

    // Emit 10 events
    for (let i = 0; i < 10; i++) {
      await stream.emit({
        type: "task_complete",
        timestamp: Date.now(),
        workflowId: "test",
        taskId: `task${i}`,
        executionTimeMs: 10,
      });
    }

    const stats = stream.getStats();
    assertEquals(stats.total_events, 10);

    await stream.close();
  });

  await t.step("isClosed returns correct state", async () => {
    const stream = new EventStream();

    assertEquals(stream.isClosed(), false);

    await stream.close();

    assertEquals(stream.isClosed(), true);
  });
});

Deno.test("EventStream - Multiple Subscribers", async (t) => {
  await t.step("supports multiple concurrent subscribers", async () => {
    const stream = new EventStream();

    const subscriber1Events: ExecutionEvent[] = [];
    const subscriber2Events: ExecutionEvent[] = [];

    // Start two subscribers
    const sub1 = (async () => {
      for await (const evt of stream.subscribe()) {
        subscriber1Events.push(evt);
        if (evt.type === "workflow_complete") break;
      }
    })();

    const sub2 = (async () => {
      for await (const evt of stream.subscribe()) {
        subscriber2Events.push(evt);
        if (evt.type === "workflow_complete") break;
      }
    })();

    // Emit events
    await stream.emit({
      type: "workflow_start",
      timestamp: Date.now(),
      workflowId: "test",
      totalLayers: 1,
    });

    await stream.emit({
      type: "task_complete",
      timestamp: Date.now(),
      workflowId: "test",
      taskId: "task1",
      executionTimeMs: 10,
    });

    await stream.emit({
      type: "workflow_complete",
      timestamp: Date.now(),
      workflowId: "test",
      totalTimeMs: 100,
      successfulTasks: 1,
      failedTasks: 0,
    });

    // Wait for both subscribers
    await Promise.all([sub1, sub2]);

    // Both should receive all events
    assertEquals(subscriber1Events.length, 3);
    assertEquals(subscriber2Events.length, 3);

    await stream.close();
  });
});
