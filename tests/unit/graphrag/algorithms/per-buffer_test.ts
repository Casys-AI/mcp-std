/**
 * Tests for PER (Prioritized Experience Replay) Buffer
 */
import { assertEquals, assertAlmostEquals } from "@std/assert";
import { PERBuffer, annealBeta } from "../../../../src/graphrag/algorithms/shgat/training/per-buffer.ts";

Deno.test("PERBuffer - initialization", () => {
  const items = ["a", "b", "c", "d", "e"];
  const buffer = new PERBuffer(items);

  assertEquals(buffer.size, 5);
});

Deno.test("PERBuffer - sample returns correct batch size", () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  const buffer = new PERBuffer(items);

  const { items: sampled, indices, weights } = buffer.sample(10);

  assertEquals(sampled.length, 10);
  assertEquals(indices.length, 10);
  assertEquals(weights.length, 10);

  // All weights should be positive
  for (const w of weights) {
    assertEquals(w > 0, true);
    assertEquals(w <= 1, true); // Normalized by max
  }

  // Indices should be unique (sampling without replacement)
  const uniqueIndices = new Set(indices);
  assertEquals(uniqueIndices.size, 10);
});

Deno.test("PERBuffer - update priorities", () => {
  const items = ["a", "b", "c", "d", "e"];
  const buffer = new PERBuffer(items);

  // Update priorities with high TD errors
  buffer.updatePriorities([0, 2, 4], [0.9, 0.1, 0.5]);

  const stats = buffer.getStats();
  assertEquals(stats.max > stats.min, true);
});

Deno.test("PERBuffer - high priority items sampled more often", () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const buffer = new PERBuffer(items, { alpha: 1.0 }); // Full prioritization

  // Set very high priority for item 0, very low for others
  buffer.updatePriorities([0], [1.0]);
  for (let i = 1; i < 10; i++) {
    buffer.updatePriorities([i], [0.001]);
  }

  // Sample many times and count how often item 0 is selected
  let count0 = 0;
  const trials = 100;
  for (let t = 0; t < trials; t++) {
    const { indices } = buffer.sample(3);
    if (indices.includes(0)) count0++;
  }

  // Item 0 should be sampled very frequently (>80% of trials with alpha=1)
  assertEquals(count0 > 60, true, `Item 0 sampled ${count0}/${trials} times, expected >60`);
});

Deno.test("annealBeta - anneals from start to 1.0", () => {
  const betaStart = 0.4;
  const totalEpochs = 10;

  // At epoch 0, beta should be betaStart
  assertAlmostEquals(annealBeta(0, totalEpochs, betaStart), 0.4, 0.01);

  // At final epoch, beta should be 1.0
  assertAlmostEquals(annealBeta(9, totalEpochs, betaStart), 1.0, 0.01);

  // At middle epoch, beta should be ~0.7
  assertAlmostEquals(annealBeta(5, totalEpochs, betaStart), 0.73, 0.05);
});

Deno.test("PERBuffer - sample all when batch >= size", () => {
  const items = ["a", "b", "c"];
  const buffer = new PERBuffer(items);

  // Request more than available
  const { items: sampled, weights } = buffer.sample(10);

  assertEquals(sampled.length, 3);
  // All weights should be 1.0 (uniform)
  for (const w of weights) {
    assertEquals(w, 1.0);
  }
});
