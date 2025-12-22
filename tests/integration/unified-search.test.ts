/**
 * Unified Search Integration Tests
 *
 * Tests the unified search algorithm that works for both tools and capabilities.
 * Formula: score = (semantic × α + graph × (1-α)) × reliability
 *
 * @module tests/integration/unified-search
 */

import { assertEquals, assertGreater, assertLess } from "@std/assert";
import {
  unifiedSearch,
  calculateAdaptiveAlpha,
  calculateReliabilityFactor,
  computeUnifiedScore,
  createMockVectorSearch,
  createMockGraph,
  type SearchableNode,
  type UnifiedSearchGraph,
  DEFAULT_RELIABILITY_CONFIG,
} from "../../src/graphrag/algorithms/unified-search.ts";

Deno.test("Unified Search: calculateAdaptiveAlpha", async (t) => {
  await t.step("returns 1.0 for empty graph (cold start)", () => {
    const graph = createMockGraph([]);
    // Add a node manually to test single node case
    const alpha = calculateAdaptiveAlpha({
      ...graph,
      order: 1,
      size: 0,
    });
    assertEquals(alpha, 1.0);
  });

  await t.step("returns ~1.0 for sparse graph", () => {
    const graph = createMockGraph([
      { from: "a", to: "b" },
    ]);
    // 2 nodes, 1 edge, density = 1 / (2*1) = 0.5
    // alpha = max(0.5, 1.0 - 0.5 * 2) = max(0.5, 0) = 0.5
    const alpha = calculateAdaptiveAlpha(graph);
    assertEquals(alpha, 0.5);
  });

  await t.step("returns 0.5 floor for dense graph", () => {
    const graph = createMockGraph([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "c" },
      { from: "c", to: "a" },
      { from: "b", to: "a" },
      { from: "c", to: "b" },
    ]);
    // 3 nodes, 6 edges = fully connected
    // density = 6 / (3*2) = 1.0
    // alpha = max(0.5, 1.0 - 1.0 * 2) = max(0.5, -1) = 0.5
    const alpha = calculateAdaptiveAlpha(graph);
    assertEquals(alpha, 0.5);
  });
});

Deno.test("Unified Search: calculateReliabilityFactor", async (t) => {
  await t.step("returns penalty for low success rate", () => {
    const factor = calculateReliabilityFactor(0.3);
    assertEquals(factor, DEFAULT_RELIABILITY_CONFIG.penaltyFactor);
  });

  await t.step("returns 1.0 for normal success rate", () => {
    const factor = calculateReliabilityFactor(0.7);
    assertEquals(factor, 1.0);
  });

  await t.step("returns boost for high success rate", () => {
    const factor = calculateReliabilityFactor(0.95);
    assertEquals(factor, DEFAULT_RELIABILITY_CONFIG.boostFactor);
  });

  await t.step("uses custom config", () => {
    const factor = calculateReliabilityFactor(0.4, {
      penaltyThreshold: 0.3,
      penaltyFactor: 0.2,
      boostThreshold: 0.8,
      boostFactor: 1.5,
    });
    assertEquals(factor, 1.0); // 0.4 > 0.3 threshold
  });
});

Deno.test("Unified Search: computeUnifiedScore", async (t) => {
  await t.step("pure semantic when alpha=1.0", () => {
    const breakdown = computeUnifiedScore(0.8, 0.5, 1.0, 1.0);
    assertEquals(breakdown.final, 0.8);
  });

  await t.step("pure graph when alpha=0.0", () => {
    const breakdown = computeUnifiedScore(0.8, 0.5, 0.0, 1.0);
    assertEquals(breakdown.final, 0.5);
  });

  await t.step("balanced when alpha=0.5", () => {
    const breakdown = computeUnifiedScore(0.8, 0.4, 0.5, 1.0);
    // 0.5 * 0.8 + 0.5 * 0.4 = 0.4 + 0.2 = 0.6
    assertEquals(breakdown.final, 0.6);
  });

  await t.step("applies reliability penalty", () => {
    const breakdown = computeUnifiedScore(0.8, 0.4, 0.5, 0.1);
    // hybrid = 0.6, final = 0.6 * 0.1 = 0.06
    assertEquals(breakdown.final, 0.06);
  });

  await t.step("applies reliability boost", () => {
    const breakdown = computeUnifiedScore(0.8, 0.4, 0.5, 1.2);
    // hybrid = 0.6, final = 0.6 * 1.2 = 0.72
    assertEquals(breakdown.final, 0.72);
  });

  await t.step("applies transitive reliability", () => {
    const breakdown = computeUnifiedScore(0.8, 0.4, 0.5, 1.0, 0.5);
    // hybrid = 0.6, final = 0.6 * 1.0 * 0.5 = 0.3
    assertEquals(breakdown.final, 0.3);
  });

  await t.step("caps at 0.95", () => {
    const breakdown = computeUnifiedScore(1.0, 1.0, 0.5, 1.5);
    // hybrid = 1.0, final = 1.0 * 1.5 = 1.5, capped to 0.95
    assertEquals(breakdown.final, 0.95);
  });
});

Deno.test("Unified Search: unifiedSearch basic", async (t) => {
  // Setup test data
  const nodes = new Map<string, SearchableNode>([
    ["fs:read", {
      id: "fs:read",
      type: "tool",
      name: "read file",
      description: "Read contents of a file from the filesystem",
      successRate: 0.95,
      serverId: "filesystem",
    }],
    ["fs:write", {
      id: "fs:write",
      type: "tool",
      name: "write file",
      description: "Write contents to a file on the filesystem",
      successRate: 0.90,
      serverId: "filesystem",
    }],
    ["git:commit", {
      id: "git:commit",
      type: "tool",
      name: "git commit",
      description: "Commit changes to git repository",
      successRate: 0.85,
      serverId: "git",
    }],
    ["code-review", {
      id: "code-review",
      type: "capability",
      name: "code review",
      description: "Review code changes and provide feedback",
      successRate: 0.80,
    }],
    ["broken-tool", {
      id: "broken-tool",
      type: "tool",
      name: "broken tool",
      description: "A tool that often fails",
      successRate: 0.2,
      serverId: "test",
    }],
  ]);

  const graph = createMockGraph([
    { from: "fs:read", to: "fs:write", weight: 0.8 },
    { from: "fs:write", to: "git:commit", weight: 0.6 },
    { from: "code-review", to: "git:commit", weight: 0.7 },
  ]);

  const vectorSearch = createMockVectorSearch(nodes);

  await t.step("finds matching tools by query", async () => {
    const results = await unifiedSearch(vectorSearch, graph, nodes, "read file");

    assertGreater(results.length, 0);
    assertEquals(results[0].nodeId, "fs:read");
    assertEquals(results[0].nodeType, "tool");
  });

  await t.step("finds capabilities by query", async () => {
    const results = await unifiedSearch(vectorSearch, graph, nodes, "code review");

    assertGreater(results.length, 0);
    assertEquals(results[0].nodeId, "code-review");
    assertEquals(results[0].nodeType, "capability");
  });

  await t.step("penalizes unreliable tools", async () => {
    const results = await unifiedSearch(vectorSearch, graph, nodes, "broken tool");

    assertGreater(results.length, 0);
    assertEquals(results[0].nodeId, "broken-tool");
    // Should have low reliability factor
    assertLess(results[0].reliabilityFactor, 0.5);
  });

  await t.step("boosts graph-related nodes with context", async () => {
    // Search for "commit" with fs:write as context
    // Should boost git:commit since it's connected to fs:write
    const resultsWithContext = await unifiedSearch(
      vectorSearch,
      graph,
      nodes,
      "git commit",
      { contextNodes: ["fs:write"] }
    );

    const resultsWithoutContext = await unifiedSearch(
      vectorSearch,
      graph,
      nodes,
      "git commit",
      { contextNodes: [] }
    );

    // Both should find git:commit
    assertEquals(resultsWithContext[0].nodeId, "git:commit");
    assertEquals(resultsWithoutContext[0].nodeId, "git:commit");

    // With context should have higher graph score
    assertGreater(resultsWithContext[0].graphScore, resultsWithoutContext[0].graphScore);
  });
});

Deno.test("Unified Search: reliability formula", async (t) => {
  // Test the complete formula: score = (semantic × α + graph × (1-α)) × reliability
  const nodes = new Map<string, SearchableNode>([
    ["high-success", {
      id: "high-success",
      type: "tool",
      name: "test tool",
      description: "test tool description",
      successRate: 0.95,
    }],
    ["low-success", {
      id: "low-success",
      type: "tool",
      name: "test tool",
      description: "test tool description",
      successRate: 0.3,
    }],
  ]);

  const graph = createMockGraph([]);
  const vectorSearch = createMockVectorSearch(nodes);

  await t.step("high success rate gets boost", async () => {
    const results = await unifiedSearch(vectorSearch, graph, nodes, "test tool", {
      alpha: 1.0, // Pure semantic to isolate reliability effect
    });

    const highSuccess = results.find(r => r.nodeId === "high-success");
    const lowSuccess = results.find(r => r.nodeId === "low-success");

    assertGreater(highSuccess!.finalScore, lowSuccess!.finalScore);
    assertEquals(highSuccess!.reliabilityFactor, 1.2); // boost
    assertEquals(lowSuccess!.reliabilityFactor, 0.1); // penalty
  });
});

Deno.test("Unified Search: transitive reliability", async (t) => {
  const nodes = new Map<string, SearchableNode>([
    ["parent-cap", {
      id: "parent-cap",
      type: "capability",
      name: "parent capability",
      description: "depends on child",
      successRate: 0.95,
    }],
    ["child-cap", {
      id: "child-cap",
      type: "capability",
      name: "child capability",
      description: "standalone capability",
      successRate: 0.5, // Weak link
    }],
  ]);

  // parent depends on child
  const graph = createMockGraph([
    { from: "parent-cap", to: "child-cap", weight: 1.0 },
  ]);

  const vectorSearch = createMockVectorSearch(nodes);

  // Simulate transitive reliability lookup
  const transitiveReliability = new Map<string, number>([
    ["parent-cap", 0.5], // Weakened by child's low success rate
    ["child-cap", 1.0],  // No dependencies
  ]);

  await t.step("applies transitive reliability to capabilities", async () => {
    const results = await unifiedSearch(vectorSearch, graph, nodes, "parent capability", {
      alpha: 1.0,
      getTransitiveReliability: async (nodeId) => transitiveReliability.get(nodeId) ?? 1.0,
    });

    const parent = results.find(r => r.nodeId === "parent-cap");

    // Parent has 0.95 success rate (boost 1.2) but transitive 0.5
    // Final reliability = 1.2 * 0.5 = 0.6
    assertEquals(parent!.reliabilityFactor, 0.6);
  });
});

Deno.test("Unified Search: mixed tools and capabilities", async (t) => {
  // Simulate a real scenario with tools and capabilities mixed
  const nodes = new Map<string, SearchableNode>([
    // Atomic tools
    ["fs:read", {
      id: "fs:read",
      type: "tool",
      name: "read file",
      description: "Read a file",
      successRate: 0.95,
      serverId: "filesystem",
    }],
    ["fs:write", {
      id: "fs:write",
      type: "tool",
      name: "write file",
      description: "Write a file",
      successRate: 0.92,
      serverId: "filesystem",
    }],
    // Capability grouping tools
    ["file-operations", {
      id: "file-operations",
      type: "capability",
      name: "file operations",
      description: "Read and write files on the filesystem",
      successRate: 0.90,
    }],
  ]);

  const graph = createMockGraph([
    { from: "file-operations", to: "fs:read", weight: 1.0 },
    { from: "file-operations", to: "fs:write", weight: 1.0 },
    { from: "fs:read", to: "fs:write", weight: 0.6 },
  ]);

  const vectorSearch = createMockVectorSearch(nodes);

  await t.step("can find both tools and capabilities for same query", async () => {
    const results = await unifiedSearch(vectorSearch, graph, nodes, "file", {
      limit: 10,
      minScore: 0.3,
    });

    // Should find capability and tools
    const types = new Set(results.map(r => r.nodeType));
    assertEquals(types.has("tool"), true);
    assertEquals(types.has("capability"), true);
  });

  await t.step("capability benefits from graph connections", async () => {
    const results = await unifiedSearch(vectorSearch, graph, nodes, "file operations", {
      contextNodes: ["fs:read"], // User just used fs:read
    });

    const capability = results.find(r => r.nodeId === "file-operations");

    // Capability should have graph score from connection to fs:read
    assertGreater(capability!.graphScore, 0);
  });
});
