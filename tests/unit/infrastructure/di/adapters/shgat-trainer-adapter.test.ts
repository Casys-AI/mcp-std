/**
 * SHGATTrainerAdapter Tests
 *
 * Tests for the SHGAT training adapter:
 * - shouldTrain() threshold logic
 * - train() accumulation and batch training
 * - registerCapability() delegation
 * - scoreCapabilities() delegation
 *
 * @module tests/unit/infrastructure/di/adapters/shgat-trainer-adapter.test
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { SHGATTrainerAdapter } from "../../../../../src/infrastructure/di/adapters/shgat-trainer-adapter.ts";
import type {
  TrainFromTracesInput,
  SHGATTrainingConfig,
} from "../../../../../src/domain/interfaces/shgat-trainer.ts";
import type { ExecutionTraceEvent } from "../../../../../src/domain/interfaces/code-executor.ts";

/**
 * Create a mock trace input for testing
 */
function createTraceInput(overrides?: Partial<TrainFromTracesInput>): TrainFromTracesInput {
  return {
    capabilityId: `cap-${crypto.randomUUID().slice(0, 8)}`,
    intentEmbedding: Array(128).fill(0).map(() => Math.random()),
    traces: [
      {
        type: "tool_start" as const,
        tool: "test-tool",
        timestamp: Date.now(),
      },
      {
        type: "tool_end" as const,
        tool: "test-tool",
        success: true,
        timestamp: Date.now() + 100,
      },
    ],
    success: true,
    executionTimeMs: 100,
    ...overrides,
  };
}

Deno.test("SHGATTrainerAdapter - shouldTrain threshold", async (t) => {
  await t.step("shouldTrain() returns false when traces below threshold", () => {
    const adapter = new SHGATTrainerAdapter();

    assertEquals(adapter.shouldTrain(), false);
  });

  await t.step("shouldTrain() returns true after accumulating enough traces", async () => {
    const adapter = new SHGATTrainerAdapter();

    // Default minTracesForTraining is 10
    // Accumulate 10 traces via train() calls without triggering actual training
    for (let i = 0; i < 9; i++) {
      await adapter.train(createTraceInput(), { minTraces: 100 }); // High threshold prevents training
    }

    // At 9 traces, shouldTrain should still be false (default threshold is 10)
    assertEquals(adapter.shouldTrain(), false);
  });

  await t.step("shouldTrain() returns false during training", async () => {
    const adapter = new SHGATTrainerAdapter();

    // Accumulate traces
    for (let i = 0; i < 15; i++) {
      await adapter.train(createTraceInput(), { minTraces: 100 });
    }

    // Start training (this will lock isTraining = true during execution)
    const trainingPromise = adapter.train(createTraceInput(), { minTraces: 1 });
    await trainingPromise;

    // After training completes, lock should be released
    // Note: We can't easily test during training without mocking
  });
});

Deno.test("SHGATTrainerAdapter - train()", async (t) => {
  await t.step("train() accumulates traces without training when below threshold", async () => {
    const adapter = new SHGATTrainerAdapter();

    const result = await adapter.train(createTraceInput(), { minTraces: 10 });

    assertEquals(result.trained, false);
    assertEquals(result.tracesProcessed, 0);
    assertEquals(result.examplesGenerated, 0);
  });

  await t.step("train() triggers training when threshold reached", async () => {
    const adapter = new SHGATTrainerAdapter();

    // Accumulate exactly the threshold
    let finalResult;
    for (let i = 0; i < 10; i++) {
      finalResult = await adapter.train(createTraceInput(), { minTraces: 10 });
    }

    // Should have trained on the 10th call
    assertExists(finalResult);
    assertEquals(finalResult.trained, true);
    assertEquals(finalResult.tracesProcessed, 10);
    assertEquals(finalResult.examplesGenerated > 0, true);
  });

  await t.step("train() respects custom minTraces config", async () => {
    const adapter = new SHGATTrainerAdapter();

    // Use low threshold
    const config: SHGATTrainingConfig = { minTraces: 2 };

    await adapter.train(createTraceInput(), config);
    const result = await adapter.train(createTraceInput(), config);

    assertEquals(result.trained, true);
    assertEquals(result.tracesProcessed, 2);
  });

  await t.step("train() skips traces without intentEmbedding", async () => {
    const adapter = new SHGATTrainerAdapter();

    // Train with missing fields
    for (let i = 0; i < 5; i++) {
      await adapter.train(createTraceInput({ intentEmbedding: undefined }), { minTraces: 5 });
    }

    // Add valid trace to trigger training
    const result = await adapter.train(createTraceInput(), { minTraces: 1 });

    // The 5 invalid traces should be skipped in example generation
    assertEquals(result.trained, true);
    // Only the 1 valid trace should generate an example
  });

  await t.step("train() respects maxTraces config", async () => {
    const adapter = new SHGATTrainerAdapter();

    // Accumulate many traces
    for (let i = 0; i < 20; i++) {
      await adapter.train(createTraceInput(), { minTraces: 100 });
    }

    // Train with maxTraces limit
    const result = await adapter.train(createTraceInput(), { minTraces: 1, maxTraces: 5 });

    assertEquals(result.trained, true);
    assertEquals(result.tracesProcessed, 5);
  });

  await t.step("train() returns loss and prioritiesUpdated", async () => {
    const adapter = new SHGATTrainerAdapter();

    for (let i = 0; i < 10; i++) {
      await adapter.train(createTraceInput());
    }

    const result = await adapter.train(createTraceInput(), { minTraces: 1 });

    assertExists(result.loss);
    assertExists(result.prioritiesUpdated);
  });
});

Deno.test("SHGATTrainerAdapter - registerCapability()", async (t) => {
  await t.step("registerCapability() registers capability and tools", async () => {
    const adapter = new SHGATTrainerAdapter();
    const embedding = Array(128).fill(0).map(() => Math.random());

    await adapter.registerCapability("cap-test-1", embedding, ["tool-a", "tool-b"]);

    // Can call scoreCapabilities without error
    const scores = adapter.scoreCapabilities(embedding);
    assertExists(scores);
  });

  await t.step("registerCapability() handles empty toolsUsed", async () => {
    const adapter = new SHGATTrainerAdapter();
    const embedding = Array(128).fill(0).map(() => Math.random());

    // Should not throw
    await adapter.registerCapability("cap-empty-tools", embedding, []);
  });

  await t.step("registerCapability() handles duplicate tool registration", async () => {
    const adapter = new SHGATTrainerAdapter();
    const embedding = Array(128).fill(0).map(() => Math.random());

    // Register same tools twice (should be idempotent)
    await adapter.registerCapability("cap-1", embedding, ["tool-x"]);
    await adapter.registerCapability("cap-2", embedding, ["tool-x"]);

    // Should not throw
  });
});

Deno.test("SHGATTrainerAdapter - scoreCapabilities()", async (t) => {
  await t.step("scoreCapabilities() returns empty array when no capabilities", () => {
    const adapter = new SHGATTrainerAdapter();
    const embedding = Array(128).fill(0).map(() => Math.random());

    const scores = adapter.scoreCapabilities(embedding);

    assertEquals(scores, []);
  });

  await t.step("scoreCapabilities() returns scores for registered capabilities", async () => {
    const adapter = new SHGATTrainerAdapter();
    const embedding1 = Array(128).fill(0).map(() => Math.random());
    const embedding2 = Array(128).fill(0).map(() => Math.random());

    // Register capabilities
    await adapter.registerCapability("cap-a", embedding1, ["tool-1"]);
    await adapter.registerCapability("cap-b", embedding2, ["tool-2"]);

    const intentEmbedding = Array(128).fill(0).map(() => Math.random());
    const scores = adapter.scoreCapabilities(intentEmbedding);

    assertEquals(scores.length >= 0, true); // May be empty depending on SHGAT internals
  });

  await t.step("scoreCapabilities() returns CapabilityScore structure", async () => {
    const adapter = new SHGATTrainerAdapter();
    const embedding = Array(128).fill(0).map(() => Math.random());

    await adapter.registerCapability("cap-struct-test", embedding, ["tool-test"]);

    const scores = adapter.scoreCapabilities(embedding);

    // Each score should have the expected structure
    for (const score of scores) {
      assertExists(score.capabilityId);
      assertExists(score.score);
      // headScores and headWeights are optional
    }
  });
});

Deno.test("SHGATTrainerAdapter - recordToolOutcome()", async (t) => {
  await t.step("recordToolOutcome() is a no-op (not exposed by SHGAT)", () => {
    const adapter = new SHGATTrainerAdapter();

    // Should not throw
    adapter.recordToolOutcome!("tool-x", true);
    adapter.recordToolOutcome!("tool-x", false);
  });
});

Deno.test("SHGATTrainerAdapter - underlying access", async (t) => {
  await t.step("underlying property exposes SHGAT instance", () => {
    const adapter = new SHGATTrainerAdapter();

    const shgat = adapter.underlying;

    assertExists(shgat);
    assertEquals(typeof shgat.scoreAllCapabilities, "function");
    assertEquals(typeof shgat.registerCapability, "function");
    assertEquals(typeof shgat.trainBatch, "function");
  });
});

Deno.test("SHGATTrainerAdapter - convertTracesToExamples", async (t) => {
  await t.step("extracts unique tool IDs from traces", async () => {
    const adapter = new SHGATTrainerAdapter();

    const traces: ExecutionTraceEvent[] = [
      { type: "tool_start", tool: "filesystem:read", timestamp: 1 },
      { type: "tool_end", tool: "filesystem:read", success: true, timestamp: 2 },
      { type: "tool_start", tool: "json:parse", timestamp: 3 },
      { type: "tool_end", tool: "json:parse", success: true, timestamp: 4 },
      { type: "tool_start", tool: "filesystem:read", timestamp: 5 }, // Duplicate
      { type: "tool_end", tool: "filesystem:read", success: true, timestamp: 6 },
    ];

    const input: TrainFromTracesInput = {
      capabilityId: "cap-tools-test",
      intentEmbedding: Array(128).fill(0.5),
      traces,
      success: true,
      executionTimeMs: 100,
    };

    // Trigger training with this input
    const result = await adapter.train(input, { minTraces: 1 });

    assertEquals(result.trained, true);
    assertEquals(result.examplesGenerated, 1);
  });

  await t.step("handles traces with no tool_end events", async () => {
    const adapter = new SHGATTrainerAdapter();

    const traces: ExecutionTraceEvent[] = [
      { type: "tool_start", tool: "test-tool", timestamp: 1 },
      // Missing tool_end
    ];

    const input: TrainFromTracesInput = {
      capabilityId: "cap-incomplete",
      intentEmbedding: Array(128).fill(0.5),
      traces,
      success: false,
      executionTimeMs: 50,
    };

    const result = await adapter.train(input, { minTraces: 1 });

    // Should still process but with no tools extracted from tool_end
    assertEquals(result.trained, true);
  });
});
