/**
 * Unit Tests for Playground Capabilities Helper (Story 3.1)
 *
 * Tests the lazy singleton pattern, mock embedding fallback,
 * and reset functionality for notebook isolation.
 *
 * @module playground/lib/capabilities_test
 */

import { assertEquals, assertExists, assert } from "@std/assert";
import {
  getCapabilityStore,
  getCapabilityMatcher,
  getAdaptiveThresholdManager,
  getDatabase,
  getEmbeddingModel,
  getPlaygroundStatus,
  isRealSystemAvailable,
  resetPlaygroundState,
  MockEmbeddingModel,
} from "./capabilities.ts";

// ============================================================================
// Setup / Teardown
// ============================================================================

// Reset state before each test to ensure isolation
async function setup(): Promise<void> {
  await resetPlaygroundState();
}

// ============================================================================
// Tests
// ============================================================================

Deno.test({
  name: "Capabilities Helper",
  // BGE-M3 model uses ONNX runtime with background threads and Web Workers
  // that don't cleanly terminate within Deno's sanitizer expectations.
  // This is a known limitation of @xenova/transformers running in Deno.
  // The operations complete successfully but leave async handles open.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
  await t.step("getPlaygroundStatus - returns valid status after init", async () => {
    await setup();

    const status = await getPlaygroundStatus();

    assertExists(status);
    assertEquals(typeof status.embeddingModel, "string");
    assert(["real", "mock"].includes(status.embeddingModel));
    assertEquals(status.databaseReady, true);
    assertEquals(status.storeReady, true);
    assertEquals(status.matcherReady, true);
    assertEquals(status.thresholdReady, true);
    assertEquals(status.capabilityCount, 0); // Fresh state
  });

  await t.step("getCapabilityStore - returns working store", async () => {
    await setup();

    const store = await getCapabilityStore();
    assertExists(store);

    // Test saveCapability
    const capability = await store.saveCapability({
      code: 'console.log("test");',
      intent: "Log a test message to console",
      durationMs: 10,
      success: true,
    });

    assertExists(capability);
    assertExists(capability.id);
    assertExists(capability.codeHash);
    assertEquals(capability.usageCount, 1);
    assertEquals(capability.successRate, 1.0);
  });

  await t.step("getCapabilityStore - same instance on multiple calls", async () => {
    await setup();

    const store1 = await getCapabilityStore();
    const store2 = await getCapabilityStore();

    // Should be the same singleton
    assertEquals(store1, store2);
  });

  await t.step("getCapabilityStore - searchByIntent works", async () => {
    await setup();

    const store = await getCapabilityStore();

    // Save a capability
    await store.saveCapability({
      code: 'const x = Math.random();',
      intent: "Generate a random number",
      durationMs: 5,
      success: true,
    });

    // Search for it
    const results = await store.searchByIntent("random number generation", 5);

    assertExists(results);
    assert(results.length > 0);
    assert(results[0].capability.codeSnippet.includes("Math.random"));
  });

  await t.step("getCapabilityMatcher - returns working matcher", async () => {
    await setup();

    const matcher = await getCapabilityMatcher();
    assertExists(matcher);
    assertEquals(typeof matcher.findMatch, "function");
  });

  await t.step("getAdaptiveThresholdManager - returns configured manager", async () => {
    await setup();

    const manager = await getAdaptiveThresholdManager();
    assertExists(manager);

    const thresholds = manager.getThresholds();
    assertExists(thresholds);

    // Should have demo-friendly config (smaller window, higher learning rate)
    assertEquals(thresholds.suggestionThreshold, 0.7);
    assertEquals(thresholds.explicitThreshold, 0.5);
  });

  await t.step("getDatabase - returns connected PGliteClient", async () => {
    await setup();

    const db = await getDatabase();
    assertExists(db);

    // Verify we can query
    const result = await db.query("SELECT 1 as test");
    assertEquals(result.length, 1);
  });

  await t.step("getEmbeddingModel - returns working model", async () => {
    await setup();

    const model = await getEmbeddingModel();
    assertExists(model);
    assertEquals(typeof model.encode, "function");

    // Test encoding
    const embedding = await model.encode("test text");
    assertExists(embedding);
    assertEquals(embedding.length, 1024); // BGE-M3 produces 1024-dim
  });

  await t.step("isRealSystemAvailable - returns boolean", async () => {
    await setup();

    const isReal = await isRealSystemAvailable();
    assertEquals(typeof isReal, "boolean");
  });

  await t.step("resetPlaygroundState - clears all singletons", async () => {
    // First, initialize and add data
    const store1 = await getCapabilityStore();
    await store1.saveCapability({
      code: "const y = 1;",
      intent: "Initialize y",
      durationMs: 1,
    });

    const status1 = await getPlaygroundStatus();
    assertEquals(status1.capabilityCount, 1);

    // Reset
    await resetPlaygroundState();

    // After reset, should have fresh state
    const status2 = await getPlaygroundStatus();
    assertEquals(status2.capabilityCount, 0);

    // Store should be different instance
    const store2 = await getCapabilityStore();
    assert(store1 !== store2);
  });

  await t.step("resetPlaygroundState - allows reinitialization", async () => {
    await setup();

    // Initialize
    await getCapabilityStore();
    const status1 = await getPlaygroundStatus();
    assertEquals(status1.storeReady, true);

    // Reset and verify can reinit
    await resetPlaygroundState();

    // This should work without errors
    const store = await getCapabilityStore();
    assertExists(store);

    const status2 = await getPlaygroundStatus();
    assertEquals(status2.storeReady, true);
  });

  // ============================================================================
  // MockEmbeddingModel Tests (H3 - Test coverage for fallback path)
  // ============================================================================

  await t.step("MockEmbeddingModel - generates deterministic embeddings", async () => {
    const mock = new MockEmbeddingModel();
    await mock.load();

    const embedding1 = await mock.encode("test text for embedding");
    const embedding2 = await mock.encode("test text for embedding");

    // Same input MUST produce same output (deterministic)
    assertEquals(embedding1.length, 1024);
    assertEquals(embedding2.length, 1024);
    assertEquals(embedding1, embedding2);
  });

  await t.step("MockEmbeddingModel - different text produces different embeddings", async () => {
    const mock = new MockEmbeddingModel();
    await mock.load();

    const embedding1 = await mock.encode("hello world");
    const embedding2 = await mock.encode("goodbye world");

    // Different input should produce different output
    assertEquals(embedding1.length, 1024);
    assertEquals(embedding2.length, 1024);

    // At least some values should differ
    let hasDifference = false;
    for (let i = 0; i < 10; i++) {
      if (embedding1[i] !== embedding2[i]) {
        hasDifference = true;
        break;
      }
    }
    assert(hasDifference, "Different inputs should produce different embeddings");
  });

  await t.step("MockEmbeddingModel - implements full interface", async () => {
    const mock = new MockEmbeddingModel();

    // Not loaded initially
    assertEquals(mock.isLoaded(), false);

    // Load
    await mock.load();
    assertEquals(mock.isLoaded(), true);

    // Encode works
    const embedding = await mock.encode("test");
    assertEquals(embedding.length, 1024);
    assert(embedding.every((v) => v >= -1 && v <= 1), "Values should be in [-1, 1]");

    // Dispose
    await mock.dispose();
    assertEquals(mock.isLoaded(), false);
  });

  // Cleanup
  await resetPlaygroundState();
  },
});
