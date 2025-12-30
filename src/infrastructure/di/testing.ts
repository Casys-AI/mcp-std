/**
 * Test Container Factory
 *
 * Creates DI containers with mocked dependencies for testing.
 *
 * Phase 2.1: Foundation for DI architecture
 *
 * @module infrastructure/di/testing
 */

// Reflect metadata polyfill
import "npm:reflect-metadata@0.2.2";

import { ContainerBuilder, type Container } from "diod";
import {
  CapabilityRepository,
  DAGExecutor,
  GraphEngine,
  MCPClientRegistry,
  DatabaseClient,
  VectorSearch,
  EventBus,
} from "./container.ts";

// Domain interface types for partial overrides
import type { ICapabilityRepository } from "../../domain/interfaces/capability-repository.ts";
import type { IDAGExecutor, DAGStructure, DAGExecutionResult } from "../../domain/interfaces/dag-executor.ts";
import type { IGraphEngine, GraphSnapshot, GraphStats } from "../../domain/interfaces/graph-engine.ts";
import type { IMCPClientRegistry } from "../../domain/interfaces/mcp-client-registry.ts";

/**
 * Override options for test container
 */
export interface TestOverrides {
  capabilityRepo?: Partial<ICapabilityRepository>;
  dagExecutor?: Partial<IDAGExecutor>;
  graphEngine?: Partial<IGraphEngine>;
  mcpClientRegistry?: Partial<IMCPClientRegistry>;
}

/**
 * Create a mock capability repository
 */
export function createMockCapabilityRepo(
  overrides?: Partial<ICapabilityRepository>,
): CapabilityRepository {
  const mockCapability = {
    id: "test-id",
    codeSnippet: "test code",
    codeHash: "abc123",
    intentEmbedding: new Float32Array(1024),
    cacheConfig: { ttl_ms: 3600000, cacheable: true },
    successRate: 1.0,
    usageCount: 1,
    successCount: 1,
    avgDurationMs: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: new Date(),
    source: "emergent" as const,
    toolsUsed: [],
  };
  const mock = {
    saveCapability: async () => ({ capability: mockCapability, trace: undefined }),
    findById: async () => null,
    findByCodeHash: async () => null,
    searchByIntent: async () => [],
    updateUsage: async () => {},
    getCapabilityCount: async () => 0,
    getStats: async () => ({ totalCapabilities: 0, totalExecutions: 0, avgSuccessRate: 0, avgDurationMs: 0 }),
    getStaticStructure: async () => null,
    addDependency: async () => ({ fromId: "", toId: "", confidence: 1, type: "flow" }),
    removeDependency: async () => {},
    getAllDependencies: async () => [],
    ...overrides,
  };
  return mock as unknown as CapabilityRepository;
}

/**
 * Create a mock DAG executor
 */
export function createMockDAGExecutor(
  overrides?: Partial<IDAGExecutor>,
): DAGExecutor {
  const mock = {
    execute: async (_dag: DAGStructure): Promise<DAGExecutionResult> => ({
      workflowId: "test-workflow",
      success: true,
      results: {},
      durationMs: 0,
    }),
    resume: async (): Promise<DAGExecutionResult> => ({
      workflowId: "test-workflow",
      success: true,
      results: {},
      durationMs: 0,
    }),
    abort: async () => {},
    getState: () => null,
    enqueueCommand: () => {},
    updateState: () => {},
    ...overrides,
  };
  return mock as unknown as DAGExecutor;
}

/**
 * Create a mock graph engine
 */
export function createMockGraphEngine(
  overrides?: Partial<IGraphEngine>,
): GraphEngine {
  const mockStats: GraphStats = { nodeCount: 0, edgeCount: 0, communities: 0, avgPageRank: 0 };
  const mockSnapshot: GraphSnapshot = {
    nodes: [],
    edges: [],
    metadata: { total_nodes: 0, total_edges: 0, density: 0, last_updated: new Date().toISOString() },
  };
  const mock = {
    syncFromDatabase: async () => {},
    getPageRank: () => 0,
    getCommunity: () => undefined,
    findCommunityMembers: () => [],
    findShortestPath: () => null,
    buildDAG: () => ({ tasks: [] }),
    getNeighbors: () => [],
    adamicAdarBetween: () => 0,
    computeGraphRelatedness: () => 0,
    getStats: (): GraphStats => mockStats,
    getGraphSnapshot: (): GraphSnapshot => mockSnapshot,
    getAdaptiveAlpha: () => 0.5,
    getGraphDensity: () => 0,
    getTotalCommunities: () => 0,
    getMetrics: async () => ({
      current: {
        nodeCount: 0,
        edgeCount: 0,
        density: 0,
        adaptiveAlpha: 0.5,
        communitiesCount: 0,
        pagerankTop10: [],
      },
      history: { dataPoints: [], aggregatedStats: { totalQueries: 0, avgResponseTime: 0, peakUsage: 0 } },
    }),
    getEdgeCount: () => 0,
    ...overrides,
  };
  return mock as unknown as GraphEngine;
}

/**
 * Create a mock MCP client registry
 */
export function createMockMCPClientRegistry(
  overrides?: Partial<IMCPClientRegistry>,
): MCPClientRegistry {
  const mock = {
    getClient: () => undefined,
    getAllClients: () => [],
    getConnectedClientIds: () => [],
    register: () => {},
    unregister: () => {},
    has: () => false,
    size: () => 0,
    getAllTools: () => [],
    findToolProvider: () => undefined,
    callTool: async () => {
      throw new Error("No mock client configured");
    },
    ...overrides,
  };
  return mock as unknown as MCPClientRegistry;
}

/**
 * Create a mock database client
 */
export function createMockDatabaseClient(): DatabaseClient {
  const mock = {
    connect: async () => {},
    disconnect: async () => {},
    query: async () => [],
  };
  return mock as unknown as DatabaseClient;
}

/**
 * Create a mock vector search
 */
export function createMockVectorSearch(): VectorSearch {
  const mock = {
    searchTools: async () => [],
    searchCapabilities: async () => [],
  };
  return mock as unknown as VectorSearch;
}

/**
 * Create a mock event bus
 */
export function createMockEventBus(): EventBus {
  const subscribers: Array<(event: unknown) => void> = [];
  const mock = {
    emit: (event: unknown) => {
      subscribers.forEach((fn) => fn(event));
    },
    subscribe: (handler: (event: unknown) => void) => {
      subscribers.push(handler);
      return () => {
        const idx = subscribers.indexOf(handler);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },
  };
  return mock as unknown as EventBus;
}

/**
 * Build a test container with mocked dependencies
 *
 * @param overrides Optional partial implementations to customize mocks
 */
export function buildTestContainer(overrides?: TestOverrides): Container {
  const builder = new ContainerBuilder();

  // Register all mocks
  builder.register(DatabaseClient).useInstance(createMockDatabaseClient());
  builder.register(VectorSearch).useInstance(createMockVectorSearch());
  builder.register(EventBus).useInstance(createMockEventBus());

  builder
    .register(CapabilityRepository)
    .useInstance(createMockCapabilityRepo(overrides?.capabilityRepo));

  builder
    .register(DAGExecutor)
    .useInstance(createMockDAGExecutor(overrides?.dagExecutor));

  builder
    .register(GraphEngine)
    .useInstance(createMockGraphEngine(overrides?.graphEngine));

  builder
    .register(MCPClientRegistry)
    .useInstance(createMockMCPClientRegistry(overrides?.mcpClientRegistry));

  return builder.build();
}
