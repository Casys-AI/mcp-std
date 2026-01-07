/**
 * GraphSyncController Unit Tests
 *
 * Tests for event-driven incremental graph updates.
 * Note: Some tests require integration testing due to KV store dependencies.
 *
 * @module tests/unit/mcp/graph-sync/controller
 */

import { assertExists } from "jsr:@std/assert@1";
import {
  GraphSyncController,
  type CapabilityZoneCreatedPayload,
  type CapabilityZoneUpdatedPayload,
  type CapabilityMergedPayload,
} from "../../../../src/mcp/graph-sync/controller.ts";
import { eventBus } from "../../../../src/events/mod.ts";

// Mock types
interface MockGraphEngine {
  addCapabilityNode: (id: string, toolIds: string[]) => void;
  syncFromDatabase: () => Promise<void>;
  getGraphSnapshot: () => { nodes: string[]; edges: Array<{ from: string; to: string }> };
}

interface MockDbClient {
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
}

interface MockSHGAT {
  registerCapability: (cap: unknown) => void;
}

// Helper to create controller with mocks
function createTestController(options?: {
  graphEngine?: MockGraphEngine | null;
  shgat?: MockSHGAT | null;
  dbQueryResult?: unknown[];
}): {
  controller: GraphSyncController;
  mocks: {
    graphEngine: MockGraphEngine | null;
    db: MockDbClient;
    shgat: MockSHGAT | null;
    calls: {
      addCapabilityNode: Array<{ id: string; toolIds: string[] }>;
      syncFromDatabase: number;
      registerCapability: unknown[];
      dbQuery: Array<{ sql: string; params?: unknown[] }>;
    };
  };
} {
  const calls = {
    addCapabilityNode: [] as Array<{ id: string; toolIds: string[] }>,
    syncFromDatabase: 0,
    registerCapability: [] as unknown[],
    dbQuery: [] as Array<{ sql: string; params?: unknown[] }>,
  };

  const mockGraphEngine: MockGraphEngine | null = options?.graphEngine === null ? null : {
    addCapabilityNode: (id: string, toolIds: string[]) => {
      calls.addCapabilityNode.push({ id, toolIds });
    },
    syncFromDatabase: async () => {
      calls.syncFromDatabase++;
    },
    getGraphSnapshot: () => ({ nodes: [], edges: [] }),
  };

  const mockDb: MockDbClient = {
    query: async (sql: string, params?: unknown[]) => {
      calls.dbQuery.push({ sql, params });
      return options?.dbQueryResult ?? [];
    },
  };

  const mockSHGAT: MockSHGAT | null = options?.shgat === null ? null : {
    registerCapability: (cap: unknown) => {
      calls.registerCapability.push(cap);
    },
  };

  const controller = new GraphSyncController(
    mockGraphEngine as unknown as import("../../../../src/graphrag/graph-engine.ts").GraphRAGEngine,
    mockDb as unknown as import("../../../../src/db/types.ts").DbClient,
    () => mockSHGAT as import("../../../../src/graphrag/algorithms/shgat.ts").SHGAT | null,
  );

  return {
    controller,
    mocks: {
      graphEngine: mockGraphEngine,
      db: mockDb,
      shgat: mockSHGAT,
      calls,
    },
  };
}

Deno.test("GraphSyncController - start and stop lifecycle", async (t) => {
  await t.step("start() subscribes to capability events without error", () => {
    const { controller } = createTestController();
    controller.start();
    controller.stop();
  });

  await t.step("stop() unsubscribes cleanly", () => {
    const { controller } = createTestController();
    controller.start();
    controller.stop();
    // No error should occur
  });

  await t.step("multiple starts are safe (idempotent)", () => {
    const { controller } = createTestController();
    controller.start();
    controller.start(); // Second start should be safe
    controller.stop();
  });

  await t.step("multiple stops are safe", () => {
    const { controller } = createTestController();
    controller.start();
    controller.stop();
    controller.stop(); // Second stop should be safe
  });

  await t.step("can restart controller", () => {
    const { controller } = createTestController();
    controller.start();
    controller.stop();
    controller.start();
    controller.stop();
  });
});

Deno.test("GraphSyncController - event handling basics", async (t) => {
  await t.step("handles capability.zone.created event without error", async () => {
    const { controller } = createTestController();
    controller.start();

    const payload: CapabilityZoneCreatedPayload = {
      capabilityId: "cap-123",
      toolIds: ["tool:a", "tool:b"],
      label: "Test Capability",
    };

    // Should not throw - errors are logged but not propagated
    eventBus.emit({
      type: "capability.zone.created",
      source: "test",
      timestamp: Date.now(),
      payload,
    });

    await new Promise((r) => setTimeout(r, 50));
    controller.stop();
  });

  await t.step("handles capability.zone.updated event without error", async () => {
    const { controller } = createTestController();
    controller.start();

    const payload: CapabilityZoneUpdatedPayload = {
      capabilityId: "cap-456",
      toolIds: ["tool:a", "tool:b", "tool:c"],
    };

    eventBus.emit({
      type: "capability.zone.updated",
      source: "test",
      timestamp: Date.now(),
      payload,
    });

    await new Promise((r) => setTimeout(r, 50));
    controller.stop();
  });

  await t.step("handles capability.merged event without error", async () => {
    const { controller } = createTestController();
    controller.start();

    const payload: CapabilityMergedPayload = {
      sourceId: "cap-old",
      sourceName: "Old Capability",
      sourcePatternId: "pattern-old",
      targetId: "cap-new",
      targetName: "New Capability",
      targetPatternId: "pattern-new",
    };

    eventBus.emit({
      type: "capability.merged",
      source: "test",
      timestamp: Date.now(),
      payload,
    });

    await new Promise((r) => setTimeout(r, 50));
    controller.stop();
  });

  await t.step("handles missing graph engine gracefully", async () => {
    const { controller } = createTestController({ graphEngine: null });
    controller.start();

    const payload: CapabilityZoneCreatedPayload = {
      capabilityId: "cap-123",
      toolIds: ["tool:a"],
    };

    // Should not throw
    eventBus.emit({
      type: "capability.zone.created",
      source: "test",
      timestamp: Date.now(),
      payload,
    });

    await new Promise((r) => setTimeout(r, 50));
    controller.stop();
  });

  await t.step("handles null SHGAT gracefully", async () => {
    const { controller } = createTestController({ shgat: null });
    controller.start();

    const payload: CapabilityZoneCreatedPayload = {
      capabilityId: "cap-123",
      toolIds: ["tool:a"],
    };

    eventBus.emit({
      type: "capability.zone.created",
      source: "test",
      timestamp: Date.now(),
      payload,
    });

    await new Promise((r) => setTimeout(r, 50));
    controller.stop();
  });

  await t.step("handles null sourcePatternId in merge gracefully", async () => {
    const { controller } = createTestController();
    controller.start();

    const payload: CapabilityMergedPayload = {
      sourceId: "cap-old",
      sourceName: "Old Capability",
      sourcePatternId: null,
      targetId: "cap-new",
      targetName: "New Capability",
      targetPatternId: "pattern-new",
    };

    eventBus.emit({
      type: "capability.merged",
      source: "test",
      timestamp: Date.now(),
      payload,
    });

    await new Promise((r) => setTimeout(r, 50));
    controller.stop();
  });
});

Deno.test("GraphSyncController - constructor", async (t) => {
  await t.step("creates controller with all dependencies", () => {
    const { controller } = createTestController();
    assertExists(controller);
  });

  await t.step("creates controller with null graph engine", () => {
    const { controller } = createTestController({ graphEngine: null });
    assertExists(controller);
  });

  await t.step("creates controller with null SHGAT getter", () => {
    const { controller } = createTestController({ shgat: null });
    assertExists(controller);
  });
});
