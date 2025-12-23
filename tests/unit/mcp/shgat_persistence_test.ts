/**
 * SHGAT Persistence Unit Tests (Story 10.7b)
 *
 * Tests for SHGAT weight persistence:
 * - Save params to database
 * - Load params from database
 * - Params survive server restart simulation
 *
 * @module tests/unit/mcp/shgat_persistence_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { createSHGATFromCapabilities } from "../../../src/graphrag/algorithms/shgat.ts";

// =============================================================================
// SHGAT exportParams/importParams Tests
// =============================================================================

Deno.test("SHGAT Persistence - exportParams returns serializable object", () => {
  // Create SHGAT with some capabilities
  const capabilities = [
    {
      id: "cap-1",
      embedding: new Array(1024).fill(0.1),
      toolsUsed: ["fs:read", "fs:write"],
      successRate: 0.9,
    },
    {
      id: "cap-2",
      embedding: new Array(1024).fill(0.2),
      toolsUsed: ["github:create_issue"],
      successRate: 0.8,
    },
  ];

  const shgat = createSHGATFromCapabilities(capabilities);
  const params = shgat.exportParams();

  // Should be serializable
  assertExists(params);
  const json = JSON.stringify(params);
  assertExists(json);

  // Should be able to parse back
  const parsed = JSON.parse(json);
  assertExists(parsed);
});

Deno.test("SHGAT Persistence - importParams restores weights", () => {
  // Create two SHGATs with same structure
  const capabilities = [
    {
      id: "cap-1",
      embedding: new Array(1024).fill(0.1),
      toolsUsed: ["fs:read"],
      successRate: 0.9,
    },
  ];

  const shgat1 = createSHGATFromCapabilities(capabilities);
  const shgat2 = createSHGATFromCapabilities(capabilities);

  // Train shgat1 to modify weights
  shgat1.trainOnExample({
    intentEmbedding: new Array(1024).fill(0.3),
    contextTools: ["fs:read"],
    candidateId: "cap-1",
    outcome: 1.0,
  });

  // Export from trained shgat1
  const params = shgat1.exportParams();

  // Import into fresh shgat2
  shgat2.importParams(params);

  // Export from shgat2 should match
  const params2 = shgat2.exportParams();

  // layerParams should be the same
  assertEquals(
    JSON.stringify(params.layerParams),
    JSON.stringify(params2.layerParams),
    "layerParams should match after import",
  );
});

Deno.test("SHGAT Persistence - round-trip through JSON preserves params", () => {
  const capabilities = [
    {
      id: "cap-1",
      embedding: new Array(1024).fill(0.1),
      toolsUsed: ["fs:read", "github:create_issue"],
      successRate: 0.95,
    },
  ];

  const shgat = createSHGATFromCapabilities(capabilities);

  // Train a bit
  for (let i = 0; i < 5; i++) {
    shgat.trainOnExample({
      intentEmbedding: new Array(1024).fill(0.1 + i * 0.01),
      contextTools: ["fs:read"],
      candidateId: "cap-1",
      outcome: i % 2 === 0 ? 1.0 : 0.0,
    });
  }

  // Export → JSON → Parse → Import
  const exported = shgat.exportParams();
  const json = JSON.stringify(exported);
  const parsed = JSON.parse(json);

  const shgat2 = createSHGATFromCapabilities(capabilities);
  shgat2.importParams(parsed);

  // Verify the weights are preserved
  const exported2 = shgat2.exportParams();
  assertEquals(
    JSON.stringify(exported.layerParams),
    JSON.stringify(exported2.layerParams),
    "Weights should survive JSON round-trip",
  );
});

// =============================================================================
// Database simulation test
// =============================================================================

Deno.test("SHGAT Persistence - simulate DB save/load cycle", async () => {
  // Simulate database storage with a Map
  const mockDB = new Map<string, string>();

  // Create and train SHGAT
  const capabilities = [
    {
      id: "cap-1",
      embedding: new Array(1024).fill(0.1),
      toolsUsed: ["fs:read"],
      successRate: 0.9,
    },
  ];

  const shgat1 = createSHGATFromCapabilities(capabilities);
  shgat1.trainOnExample({
    intentEmbedding: new Array(1024).fill(0.5),
    contextTools: ["fs:read"],
    candidateId: "cap-1",
    outcome: 1.0,
  });

  // "Save" to mock DB
  const params = shgat1.exportParams();
  mockDB.set("shgat_params:local", JSON.stringify(params));

  // Simulate server restart - create new SHGAT
  const shgat2 = createSHGATFromCapabilities(capabilities);

  // "Load" from mock DB
  const savedJson = mockDB.get("shgat_params:local");
  assertExists(savedJson, "Should have saved params");

  const loadedParams = JSON.parse(savedJson);
  shgat2.importParams(loadedParams);

  // Verify weights match
  const finalParams = shgat2.exportParams();
  assertEquals(
    JSON.stringify(params.layerParams),
    JSON.stringify(finalParams.layerParams),
    "Weights should survive simulated restart",
  );
});
