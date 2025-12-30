/**
 * Gateway Factory Pattern
 *
 * Factory for creating PMLGatewayServer instances using DI container.
 * Abstracts away dependency resolution and provides consistent creation.
 *
 * @example
 * ```typescript
 * // Simple creation with defaults
 * const gateway = await GatewayFactory.create(config);
 *
 * // With DI container
 * const gateway = await GatewayFactory.createFromContainer(container, config);
 * ```
 *
 * @module infrastructure/patterns/factory/gateway-factory
 */

import type { Container } from "diod";
import type { GatewayServerConfig } from "../../../mcp/server/mod.ts";
import { GatewayBuilder } from "../builder/mod.ts";
import type { DbClient } from "../../../db/types.ts";
import type { VectorSearch } from "../../../vector/search.ts";
import type { GraphRAGEngine } from "../../../graphrag/graph-engine.ts";
import type { DAGSuggester } from "../../../graphrag/dag-suggester.ts";
import type { ParallelExecutor } from "../../../dag/executor.ts";
import type { MCPClientBase } from "../../../mcp/types.ts";
import type { CapabilityStore } from "../../../capabilities/capability-store.ts";
import type { AdaptiveThresholdManager } from "../../../mcp/adaptive-threshold.ts";
import type { EmbeddingModelInterface } from "../../../vector/embeddings.ts";

// DI Container tokens (from src/infrastructure/di/container.ts)
// Note: Not all deps are in DI yet, so createFromContainer is limited
// Unused imports kept as comments for future implementation:
// import { DatabaseClient, GraphEngine, MCPClientRegistry, VectorSearch } from "../../di/container.ts";

/**
 * PII type literals
 */
export type PIIType = "email" | "phone" | "credit_card" | "ssn" | "api_key";

/**
 * Factory options for gateway creation
 */
export interface GatewayFactoryOptions {
  /** Server configuration */
  config?: GatewayServerConfig;
  /** Enable speculative execution */
  enableSpeculation?: boolean;
  /** Enable PII protection */
  enablePIIProtection?: boolean;
  /** Custom PII types to detect */
  piiTypes?: PIIType[];
}

/**
 * Dependencies resolved by factory
 */
export interface GatewayDependencies {
  db: DbClient;
  vectorSearch: VectorSearch;
  graphEngine: GraphRAGEngine;
  dagSuggester: DAGSuggester;
  executor: ParallelExecutor;
  mcpClients: Map<string, MCPClientBase>;
  capabilityStore?: CapabilityStore;
  adaptiveThresholdManager?: AdaptiveThresholdManager;
  embeddingModel?: EmbeddingModelInterface;
}

/**
 * Factory for creating PMLGatewayServer instances
 *
 * Provides multiple creation strategies:
 * - From explicit dependencies
 * - From DI container
 * - From builder
 */
export class GatewayFactory {
  /**
   * Create gateway from explicit dependencies
   *
   * @param deps All required and optional dependencies
   * @param options Factory options
   * @returns Builder result ready for PMLGatewayServer constructor
   */
  static create(
    deps: GatewayDependencies,
    options: GatewayFactoryOptions = {},
  ): ReturnType<GatewayBuilder["build"]> {
    const builder = new GatewayBuilder()
      .withDatabase(deps.db)
      .withVectorSearch(deps.vectorSearch)
      .withGraphEngine(deps.graphEngine)
      .withDAGSuggester(deps.dagSuggester)
      .withExecutor(deps.executor)
      .withMCPClients(deps.mcpClients);

    // Optional dependencies
    if (deps.capabilityStore) {
      builder.withCapabilityStore(deps.capabilityStore);
    }
    if (deps.adaptiveThresholdManager) {
      builder.withAdaptiveThresholdManager(deps.adaptiveThresholdManager);
    }
    if (deps.embeddingModel) {
      builder.withEmbeddingModel(deps.embeddingModel);
    }

    // Configuration options
    if (options.config) {
      builder.withConfig(options.config);
    }
    if (options.enableSpeculation !== undefined) {
      builder.withSpeculation(options.enableSpeculation);
    }
    if (options.enablePIIProtection !== undefined || options.piiTypes) {
      builder.withPIIProtection({
        enabled: options.enablePIIProtection ?? true,
        types: options.piiTypes,
      });
    }

    return builder.build();
  }

  /**
   * Create gateway from DI container
   *
   * Resolves dependencies from container and creates gateway.
   * Requires container to have all required services registered.
   *
   * NOTE: Not fully implemented yet - DAGSuggester and Executor
   * are not yet in the DI container.
   *
   * @param _container DI container with registered services
   * @param _options Factory options
   * @returns Builder result ready for PMLGatewayServer constructor
   */
  static createFromContainer(
    _container: Container,
    _options: GatewayFactoryOptions = {},
  ): ReturnType<GatewayBuilder["build"]> {
    // TODO: Implement when DAGSuggester and Executor are in DI container
    // Example usage when ready:
    // const db = container.get(DatabaseClient) as unknown as DbClient;
    // const vectorSearch = container.get(VectorSearchToken) as unknown as VectorSearch;
    // const graphEngine = container.get(GraphEngine) as unknown as GraphRAGEngine;
    // const mcpRegistry = container.get(MCPClientRegistry);

    throw new Error(
      "createFromContainer not fully implemented: DAGSuggester and Executor not yet in DI container. " +
        "Use create() with explicit dependencies for now.",
    );
  }

  /**
   * Create a pre-configured builder
   *
   * Useful when you need to customize beyond factory options.
   *
   * @param deps Base dependencies to pre-configure
   * @returns Configured builder for further customization
   */
  static createBuilder(deps: Partial<GatewayDependencies> = {}): GatewayBuilder {
    const builder = new GatewayBuilder();

    if (deps.db) builder.withDatabase(deps.db);
    if (deps.vectorSearch) builder.withVectorSearch(deps.vectorSearch);
    if (deps.graphEngine) builder.withGraphEngine(deps.graphEngine);
    if (deps.dagSuggester) builder.withDAGSuggester(deps.dagSuggester);
    if (deps.executor) builder.withExecutor(deps.executor);
    if (deps.mcpClients) builder.withMCPClients(deps.mcpClients);
    if (deps.capabilityStore) builder.withCapabilityStore(deps.capabilityStore);
    if (deps.adaptiveThresholdManager) {
      builder.withAdaptiveThresholdManager(deps.adaptiveThresholdManager);
    }
    if (deps.embeddingModel) builder.withEmbeddingModel(deps.embeddingModel);

    return builder;
  }
}
