/**
 * Unit tests for user-usage filtering (Story 9.8)
 *
 * @module tests/unit/graphrag/user_usage_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  filterSnapshotByExecution,
  getExecutedToolIds,
  getUserCapabilities,
  isLocalMode,
  type GraphSnapshot,
} from "../../../src/graphrag/user-usage.ts";

// Mock database client for testing
function createMockDb(mockData: Array<{ tool_key: string; user_id?: string }>) {
  return {
    query: (_sql: string, params?: unknown[]) => {
      const userId = params?.[0] as string | undefined;
      const results = mockData
        .filter((row) => !userId || row.user_id === userId)
        .map((row) => ({ tool_key: row.tool_key }));
      return Promise.resolve(results);
    },
    queryOne: () => Promise.resolve(null),
  };
}

// ============================================================================
// getExecutedToolIds tests
// ============================================================================

Deno.test("getExecutedToolIds - scope=user filters by userId", async () => {
  const mockDb = createMockDb([
    { tool_key: "tool-a", user_id: "user-1" },
    { tool_key: "tool-b", user_id: "user-2" },
    { tool_key: "tool-c", user_id: "user-1" },
  ]);

  const ids = await getExecutedToolIds(mockDb as any, "user", "user-1");

  assertEquals(ids.size, 2);
  assertEquals(ids.has("tool-a"), true);
  assertEquals(ids.has("tool-c"), true);
  assertEquals(ids.has("tool-b"), false); // user-2's tool
});

Deno.test("getExecutedToolIds - scope=system returns all executed", async () => {
  const mockDb = createMockDb([
    { tool_key: "tool-a", user_id: "user-1" },
    { tool_key: "tool-b", user_id: "user-2" },
  ]);

  const ids = await getExecutedToolIds(mockDb as any, "system", undefined);

  assertEquals(ids.size, 2);
  assertEquals(ids.has("tool-a"), true);
  assertEquals(ids.has("tool-b"), true);
});

Deno.test("getExecutedToolIds - scope=user with no userId returns empty set", async () => {
  const mockDb = createMockDb([
    { tool_key: "tool-a", user_id: "user-1" },
  ]);

  const ids = await getExecutedToolIds(mockDb as any, "user", undefined);

  assertEquals(ids.size, 0);
});

Deno.test("getExecutedToolIds - handles empty results", async () => {
  const mockDb = createMockDb([]);

  const ids = await getExecutedToolIds(mockDb as any, "user", "user-1");

  assertEquals(ids.size, 0);
});

Deno.test("getExecutedToolIds - filters out null tool_keys", async () => {
  const mockDb = {
    query: () => Promise.resolve([
      { tool_key: "tool-a" },
      { tool_key: null },
      { tool_key: "tool-b" },
    ]),
    queryOne: () => Promise.resolve(null),
  };

  const ids = await getExecutedToolIds(mockDb as any, "system", undefined);

  assertEquals(ids.size, 2);
  assertEquals(ids.has("tool-a"), true);
  assertEquals(ids.has("tool-b"), true);
});

// ============================================================================
// filterSnapshotByExecution tests
// ============================================================================

Deno.test("filterSnapshotByExecution - filters nodes and edges", () => {
  const snapshot: GraphSnapshot = {
    nodes: [
      { id: "tool-a", label: "Tool A", server: "test", pagerank: 0.1, degree: 2, communityId: "1" },
      { id: "tool-b", label: "Tool B", server: "test", pagerank: 0.2, degree: 2, communityId: "1" },
      { id: "tool-c", label: "Tool C", server: "test", pagerank: 0.3, degree: 2, communityId: "2" },
    ],
    edges: [
      { source: "tool-a", target: "tool-b", confidence: 0.9, observed_count: 1, edge_type: "sequence", edge_source: "observed" },
      { source: "tool-b", target: "tool-c", confidence: 0.8, observed_count: 1, edge_type: "sequence", edge_source: "observed" },
      { source: "tool-a", target: "tool-c", confidence: 0.7, observed_count: 1, edge_type: "sequence", edge_source: "observed" },
    ],
    metadata: {
      total_nodes: 3,
      total_edges: 3,
      density: 0.5,
      last_updated: new Date().toISOString(),
    },
  };

  const executedIds = new Set(["tool-a", "tool-b"]);
  const filtered = filterSnapshotByExecution(snapshot, executedIds);

  // Should only have 2 nodes
  assertEquals(filtered.nodes.length, 2);
  assertEquals(filtered.nodes.map((n) => n.id).sort(), ["tool-a", "tool-b"]);

  // Should only have 1 edge (a->b), not b->c or a->c (c not in set)
  assertEquals(filtered.edges.length, 1);
  assertEquals(filtered.edges[0].source, "tool-a");
  assertEquals(filtered.edges[0].target, "tool-b");
});

Deno.test("filterSnapshotByExecution - preserves snapshot metadata", () => {
  const snapshot: GraphSnapshot = {
    nodes: [{ id: "tool-a", label: "A", server: "test", pagerank: 0.1, degree: 0, communityId: "1" }],
    edges: [],
    metadata: {
      total_nodes: 1,
      total_edges: 0,
      density: 0,
      last_updated: new Date().toISOString(),
    },
  };

  const filtered = filterSnapshotByExecution(snapshot, new Set(["tool-a"]));

  // Metadata should be preserved (original snapshot metadata)
  assertExists(filtered.metadata);
  assertEquals(filtered.metadata.total_nodes, 1);
});

Deno.test("filterSnapshotByExecution - handles empty executed set", () => {
  const snapshot: GraphSnapshot = {
    nodes: [
      { id: "tool-a", label: "A", server: "test", pagerank: 0.1, degree: 1, communityId: "1" },
      { id: "tool-b", label: "B", server: "test", pagerank: 0.2, degree: 1, communityId: "1" },
    ],
    edges: [
      { source: "tool-a", target: "tool-b", confidence: 0.9, observed_count: 1, edge_type: "sequence", edge_source: "observed" },
    ],
    metadata: {
      total_nodes: 2,
      total_edges: 1,
      density: 0.5,
      last_updated: new Date().toISOString(),
    },
  };

  const filtered = filterSnapshotByExecution(snapshot, new Set());

  assertEquals(filtered.nodes.length, 0);
  assertEquals(filtered.edges.length, 0);
});

Deno.test("filterSnapshotByExecution - handles partial edge matches", () => {
  // Edge where source exists but target doesn't should be filtered out
  const snapshot: GraphSnapshot = {
    nodes: [
      { id: "tool-a", label: "A", server: "test", pagerank: 0.1, degree: 1, communityId: "1" },
      { id: "tool-b", label: "B", server: "test", pagerank: 0.2, degree: 1, communityId: "1" },
    ],
    edges: [
      { source: "tool-a", target: "tool-b", confidence: 0.9, observed_count: 1, edge_type: "sequence", edge_source: "observed" },
    ],
    metadata: {
      total_nodes: 2,
      total_edges: 1,
      density: 0.5,
      last_updated: new Date().toISOString(),
    },
  };

  // Only tool-a is executed
  const filtered = filterSnapshotByExecution(snapshot, new Set(["tool-a"]));

  assertEquals(filtered.nodes.length, 1);
  assertEquals(filtered.edges.length, 0); // Edge requires both endpoints
});

// ============================================================================
// isLocalMode tests
// ============================================================================

Deno.test("isLocalMode - returns true for undefined userId", () => {
  assertEquals(isLocalMode(undefined), true);
});

Deno.test("isLocalMode - returns true for 'local' userId", () => {
  assertEquals(isLocalMode("local"), true);
});

Deno.test("isLocalMode - returns false for actual userId", () => {
  assertEquals(isLocalMode("user-123"), false);
  assertEquals(isLocalMode("github|12345"), false);
});

// ============================================================================
// getUserCapabilities tests (mock only)
// ============================================================================

Deno.test("getUserCapabilities - queries with correct userId", async () => {
  let capturedParams: unknown[] = [];
  const mockDb = {
    query: (_sql: string, params?: unknown[]) => {
      capturedParams = params || [];
      return Promise.resolve([]);
    },
    queryOne: () => Promise.resolve(null),
  };

  await getUserCapabilities(mockDb as any, "test-user");

  assertEquals(capturedParams.length, 1);
  assertEquals(capturedParams[0], "test-user");
});
