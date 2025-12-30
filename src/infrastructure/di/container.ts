/**
 * Dependency Injection Container
 *
 * Central DI container using diod for service registration and resolution.
 * Uses abstract classes as tokens (interfaces are erased at runtime).
 *
 * Phase 2.1: Foundation for DI architecture
 *
 * @see https://github.com/artberri/diod
 * @module infrastructure/di/container
 */

// Reflect metadata polyfill (required for diod autowiring)
import "npm:reflect-metadata@0.2.2";

import { ContainerBuilder, type Container, Service } from "diod";

// Domain interfaces (for type hints)
import type { ICapabilityRepository } from "../../domain/interfaces/capability-repository.ts";
import type { IDAGExecutor } from "../../domain/interfaces/dag-executor.ts";
import type { IGraphEngine } from "../../domain/interfaces/graph-engine.ts";
import type { IMCPClientRegistry } from "../../domain/interfaces/mcp-client-registry.ts";

/**
 * Abstract class tokens for DI resolution.
 *
 * diod requires class references at runtime. TypeScript interfaces
 * are erased during compilation, so we use abstract classes as tokens.
 * The implementations will extend/implement these.
 */

/** Token for capability repository */
export abstract class CapabilityRepository implements ICapabilityRepository {
  abstract saveCapability: ICapabilityRepository["saveCapability"];
  abstract findById: ICapabilityRepository["findById"];
  abstract findByCodeHash: ICapabilityRepository["findByCodeHash"];
  abstract searchByIntent: ICapabilityRepository["searchByIntent"];
  abstract updateUsage: ICapabilityRepository["updateUsage"];
  abstract getCapabilityCount: ICapabilityRepository["getCapabilityCount"];
  abstract getStats: ICapabilityRepository["getStats"];
  abstract getStaticStructure: ICapabilityRepository["getStaticStructure"];
  abstract addDependency: ICapabilityRepository["addDependency"];
  abstract removeDependency: ICapabilityRepository["removeDependency"];
  abstract getAllDependencies: ICapabilityRepository["getAllDependencies"];
}

/** Token for DAG executor */
export abstract class DAGExecutor implements IDAGExecutor {
  abstract execute: IDAGExecutor["execute"];
  abstract resume: IDAGExecutor["resume"];
  abstract abort: IDAGExecutor["abort"];
  abstract getState: IDAGExecutor["getState"];
  abstract enqueueCommand: IDAGExecutor["enqueueCommand"];
  abstract updateState: IDAGExecutor["updateState"];
}

/** Token for graph engine */
export abstract class GraphEngine implements IGraphEngine {
  abstract syncFromDatabase: IGraphEngine["syncFromDatabase"];
  abstract getPageRank: IGraphEngine["getPageRank"];
  abstract getCommunity: IGraphEngine["getCommunity"];
  abstract findCommunityMembers: IGraphEngine["findCommunityMembers"];
  abstract findShortestPath: IGraphEngine["findShortestPath"];
  abstract buildDAG: IGraphEngine["buildDAG"];
  abstract getNeighbors: IGraphEngine["getNeighbors"];
  abstract adamicAdarBetween: IGraphEngine["adamicAdarBetween"];
  abstract computeGraphRelatedness: IGraphEngine["computeGraphRelatedness"];
  abstract getStats: IGraphEngine["getStats"];
  abstract getGraphSnapshot: IGraphEngine["getGraphSnapshot"];
  abstract getAdaptiveAlpha: IGraphEngine["getAdaptiveAlpha"];
  abstract getGraphDensity: IGraphEngine["getGraphDensity"];
  abstract getTotalCommunities: IGraphEngine["getTotalCommunities"];
  abstract getMetrics: IGraphEngine["getMetrics"];
  abstract getEdgeCount: IGraphEngine["getEdgeCount"];
}

// Re-export MetricsTimeRange for adapter consumers
export type { MetricsTimeRange } from "../../graphrag/types.ts";

/** Token for MCP client registry */
export abstract class MCPClientRegistry implements IMCPClientRegistry {
  abstract getClient: IMCPClientRegistry["getClient"];
  abstract getAllClients: IMCPClientRegistry["getAllClients"];
  abstract getConnectedClientIds: IMCPClientRegistry["getConnectedClientIds"];
  abstract register: IMCPClientRegistry["register"];
  abstract unregister: IMCPClientRegistry["unregister"];
  abstract has: IMCPClientRegistry["has"];
  abstract size: IMCPClientRegistry["size"];
  abstract getAllTools: IMCPClientRegistry["getAllTools"];
  abstract findToolProvider: IMCPClientRegistry["findToolProvider"];
  abstract callTool: IMCPClientRegistry["callTool"];
}

// Re-export MCPClientBase for adapter consumers
export type { MCPClientBase } from "../../mcp/types.ts";

/** Token for database client */
export abstract class DatabaseClient {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** Token for vector search */
export abstract class VectorSearch {
  abstract searchTools(query: string, limit?: number): Promise<unknown[]>;
  abstract searchCapabilities(query: string, limit?: number): Promise<unknown[]>;
}

/** Token for event bus */
export abstract class EventBus {
  abstract emit(event: unknown): void;
  abstract subscribe(handler: (event: unknown) => void): () => void;
}

/**
 * Application configuration for DI
 */
export interface AppConfig {
  dbPath: string;
  embeddingModel?: string;
  vectorDimension?: number;
}

/**
 * Implementation factories passed to buildContainer.
 *
 * These are passed from app bootstrap to avoid circular imports.
 */
export interface ContainerImplementations {
  // Infrastructure
  DatabaseClientImpl?: new () => DatabaseClient;
  VectorSearchImpl?: new (db: DatabaseClient) => VectorSearch;
  EventBusImpl?: new () => EventBus;

  // Domain services
  CapabilityRepositoryImpl?: new (db: DatabaseClient) => CapabilityRepository;
  GraphEngineImpl?: new () => GraphEngine;
  DAGExecutorImpl?: new (repo: CapabilityRepository, graph: GraphEngine) => DAGExecutor;
  MCPClientRegistryImpl?: new () => MCPClientRegistry;

  // Factory functions (alternative to classes)
  createDbClient?: (dbPath: string) => DatabaseClient;
  createVectorSearch?: (db: DatabaseClient) => VectorSearch;
  createEventBus?: () => EventBus;
  createCapabilityRepository?: (db: DatabaseClient) => CapabilityRepository;
  createGraphEngine?: () => GraphEngine;
  createDAGExecutor?: (repo: CapabilityRepository, graph: GraphEngine) => DAGExecutor;
  createMCPClientRegistry?: () => MCPClientRegistry;
}

/**
 * Build the DI container with all service registrations.
 *
 * diod validates the dependency graph at build time:
 * - Detects circular dependencies
 * - Ensures all dependencies are registered
 * - Validates lifetime compatibility
 *
 * @param config Application configuration
 * @param impls Implementation classes or factories
 */
export function buildContainer(
  config: AppConfig,
  impls: ContainerImplementations,
): Container {
  const builder = new ContainerBuilder();

  // ========================================
  // Infrastructure Layer (singletons)
  // ========================================

  // Database client
  if (impls.DatabaseClientImpl) {
    builder.register(DatabaseClient).use(impls.DatabaseClientImpl).asSingleton();
  } else if (impls.createDbClient) {
    const dbClient = impls.createDbClient(config.dbPath);
    builder.register(DatabaseClient).useInstance(dbClient);
  }

  // Vector search
  if (impls.VectorSearchImpl) {
    builder.register(VectorSearch).use(impls.VectorSearchImpl).asSingleton();
  } else if (impls.createVectorSearch) {
    builder.register(VectorSearch).useFactory((c) => {
      const db = c.get(DatabaseClient);
      return impls.createVectorSearch!(db);
    }).asSingleton();
  }

  // Event bus
  if (impls.EventBusImpl) {
    builder.register(EventBus).use(impls.EventBusImpl).asSingleton();
  } else if (impls.createEventBus) {
    builder.register(EventBus).useInstance(impls.createEventBus());
  }

  // ========================================
  // Domain Services (singletons)
  // ========================================

  // Capability Repository
  if (impls.CapabilityRepositoryImpl) {
    builder.register(CapabilityRepository).use(impls.CapabilityRepositoryImpl).asSingleton();
  } else if (impls.createCapabilityRepository) {
    builder.register(CapabilityRepository).useFactory((c) => {
      const db = c.get(DatabaseClient);
      return impls.createCapabilityRepository!(db);
    }).asSingleton();
  }

  // Graph Engine
  if (impls.GraphEngineImpl) {
    builder.register(GraphEngine).use(impls.GraphEngineImpl).asSingleton();
  } else if (impls.createGraphEngine) {
    builder.register(GraphEngine).useInstance(impls.createGraphEngine());
  }

  // DAG Executor
  if (impls.DAGExecutorImpl) {
    builder.register(DAGExecutor).use(impls.DAGExecutorImpl).asSingleton();
  } else if (impls.createDAGExecutor) {
    builder.register(DAGExecutor).useFactory((c) => {
      const repo = c.get(CapabilityRepository);
      const graph = c.get(GraphEngine);
      return impls.createDAGExecutor!(repo, graph);
    }).asSingleton();
  }

  // MCP Client Registry
  if (impls.MCPClientRegistryImpl) {
    builder.register(MCPClientRegistry).use(impls.MCPClientRegistryImpl).asSingleton();
  } else if (impls.createMCPClientRegistry) {
    builder.register(MCPClientRegistry).useInstance(impls.createMCPClientRegistry());
  }

  // Build validates graph - throws if cycles or missing deps
  return builder.build();
}

/**
 * Type-safe service accessor functions
 */
export function getCapabilityRepository(container: Container): CapabilityRepository {
  return container.get(CapabilityRepository);
}

export function getDAGExecutor(container: Container): DAGExecutor {
  return container.get(DAGExecutor);
}

export function getGraphEngine(container: Container): GraphEngine {
  return container.get(GraphEngine);
}

export function getMCPClientRegistry(container: Container): MCPClientRegistry {
  return container.get(MCPClientRegistry);
}

export function getDbClient(container: Container): DatabaseClient {
  return container.get(DatabaseClient);
}

export function getVectorSearch(container: Container): VectorSearch {
  return container.get(VectorSearch);
}

export function getEventBus(container: Container): EventBus {
  return container.get(EventBus);
}

/**
 * Re-export for consumers
 */
export { Service, type Container };
