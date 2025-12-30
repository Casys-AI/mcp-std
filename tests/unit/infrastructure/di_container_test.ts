/**
 * DI Container Tests
 *
 * Tests for the diod-based dependency injection container.
 *
 * @module tests/unit/infrastructure/di_container_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  buildTestContainer,
  createMockCapabilityRepo,
  createMockDAGExecutor,
  createMockGraphEngine,
  createMockMCPClientRegistry,
  CapabilityRepository,
  DAGExecutor,
  GraphEngine,
  MCPClientRegistry,
  DatabaseClient,
  VectorSearch,
  EventBus,
} from "../../../src/infrastructure/di/mod.ts";

Deno.test("DI Container - buildTestContainer creates container with mocks", () => {
  const container = buildTestContainer();

  // All services should be resolvable
  const capRepo = container.get(CapabilityRepository);
  const dagExec = container.get(DAGExecutor);
  const graph = container.get(GraphEngine);
  const mcpReg = container.get(MCPClientRegistry);
  const db = container.get(DatabaseClient);
  const vector = container.get(VectorSearch);
  const eventBus = container.get(EventBus);

  assertExists(capRepo);
  assertExists(dagExec);
  assertExists(graph);
  assertExists(mcpReg);
  assertExists(db);
  assertExists(vector);
  assertExists(eventBus);
});

Deno.test("DI Container - mocks have default implementations", async () => {
  const container = buildTestContainer();

  const capRepo = container.get(CapabilityRepository);
  const dagExec = container.get(DAGExecutor);
  const graph = container.get(GraphEngine);

  // Test capability repo mock
  const saveResult = await capRepo.saveCapability({
    intent: "test",
    code: "test code",
    durationMs: 100,
  });
  assertEquals(saveResult.capability.id, "test-id");
  assertExists(saveResult.capability);

  // Test DAG executor mock
  const dagResult = await dagExec.execute({ tasks: [] });
  assertEquals(dagResult.success, true);

  // Test graph engine mock
  const pageRank = graph.getPageRank("tool-1");
  assertEquals(pageRank, 0);
});

Deno.test("DI Container - overrides work correctly", async () => {
  const customFindById = async (_id: string) => ({
    id: "custom-id",
    codeSnippet: "custom code",
    codeHash: "xyz",
    intentEmbedding: new Float32Array(1024),
    cacheConfig: { ttl_ms: 3600000, cacheable: true },
    successRate: 0.8,
    usageCount: 5,
    successCount: 4,
    avgDurationMs: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: new Date(),
    source: "emergent" as const,
    toolsUsed: [] as string[],
  });

  const container = buildTestContainer({
    capabilityRepo: {
      findById: customFindById,
    },
  });

  const capRepo = container.get(CapabilityRepository);
  const result = await capRepo.findById("any-id");

  assertEquals(result?.id, "custom-id");
  assertEquals(result?.usageCount, 5);
});

Deno.test("DI Container - EventBus mock works", () => {
  const container = buildTestContainer();
  const eventBus = container.get(EventBus);

  const received: unknown[] = [];
  const unsubscribe = eventBus.subscribe((event) => {
    received.push(event);
  });

  eventBus.emit({ type: "test", data: 123 });
  eventBus.emit({ type: "test2", data: 456 });

  assertEquals(received.length, 2);
  assertEquals((received[0] as { data: number }).data, 123);

  unsubscribe();
  eventBus.emit({ type: "test3", data: 789 });

  // Should not receive after unsubscribe
  assertEquals(received.length, 2);
});

Deno.test("DI Container - mock factories create valid instances", () => {
  const capRepo = createMockCapabilityRepo();
  const dagExec = createMockDAGExecutor();
  const graph = createMockGraphEngine();
  const mcpReg = createMockMCPClientRegistry();

  assertExists(capRepo.saveCapability);
  assertExists(dagExec.execute);
  assertExists(graph.getGraphSnapshot);
  assertExists(mcpReg.getAllClients);
});

Deno.test("DI Container - GraphEngine mock methods", () => {
  const graph = createMockGraphEngine();

  // Test all methods return expected defaults
  assertEquals(graph.getPageRank("any"), 0);
  assertEquals(graph.getCommunity("any"), undefined);
  assertEquals(graph.findCommunityMembers("any"), []);
  assertEquals(graph.findShortestPath("a", "b"), null);
  assertEquals(graph.getNeighbors("any"), []);
  assertEquals(graph.adamicAdarBetween("a", "b"), 0);
  assertEquals(graph.computeGraphRelatedness("a", []), 0);
  assertEquals(graph.getAdaptiveAlpha(), 0.5);
  assertEquals(graph.getGraphDensity(), 0);
  assertEquals(graph.getTotalCommunities(), 0);
  assertEquals(graph.getEdgeCount(), 0);

  const stats = graph.getStats();
  assertEquals(stats.nodeCount, 0);
  assertEquals(stats.edgeCount, 0);
  assertEquals(stats.avgPageRank, 0);
  assertEquals(stats.communities, 0);

  const snapshot = graph.getGraphSnapshot();
  assertEquals(snapshot.nodes, []);
  assertEquals(snapshot.edges, []);
  assertExists(snapshot.metadata);
});

Deno.test("DI Container - MCPClientRegistry mock methods", async () => {
  const registry = createMockMCPClientRegistry();

  assertEquals(registry.getClient("any"), undefined);
  assertEquals(registry.getAllClients(), []);
  assertEquals(registry.getConnectedClientIds(), []);
  assertEquals(registry.has("any"), false);
  assertEquals(registry.size(), 0);
  assertEquals(registry.getAllTools(), []);
  assertEquals(registry.findToolProvider("any"), undefined);

  // callTool should throw by default
  try {
    await registry.callTool("any", {});
    throw new Error("Should have thrown");
  } catch (e) {
    assertEquals((e as Error).message, "No mock client configured");
  }
});
