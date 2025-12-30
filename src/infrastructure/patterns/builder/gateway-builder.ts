/**
 * Gateway Builder Pattern
 *
 * Fluent builder for PMLGatewayServer to replace 10-parameter constructor.
 * Provides clear configuration API with sensible defaults.
 *
 * @example
 * ```typescript
 * const gateway = new GatewayBuilder()
 *   .withDatabase(db)
 *   .withVectorSearch(vectorSearch)
 *   .withGraphEngine(graphEngine)
 *   .withMCPClients(mcpClients)
 *   .withSpeculation(true)
 *   .withPIIProtection({ enabled: true, types: ["email", "phone"] })
 *   .build();
 * ```
 *
 * @module infrastructure/patterns/builder/gateway-builder
 */

import type { DbClient } from "../../../db/types.ts";
import type { VectorSearch } from "../../../vector/search.ts";
import type { GraphRAGEngine } from "../../../graphrag/graph-engine.ts";
import type { DAGSuggester } from "../../../graphrag/dag-suggester.ts";
import type { ParallelExecutor } from "../../../dag/executor.ts";
import type { MCPClientBase } from "../../../mcp/types.ts";
import type { CapabilityStore } from "../../../capabilities/capability-store.ts";
import type { AdaptiveThresholdManager } from "../../../mcp/adaptive-threshold.ts";
import type { EmbeddingModelInterface } from "../../../vector/embeddings.ts";
import type { GatewayServerConfig } from "../../../mcp/server/mod.ts";

/**
 * Builder state - tracks what has been configured
 */
export interface GatewayBuilderState {
  db?: DbClient;
  vectorSearch?: VectorSearch;
  graphEngine?: GraphRAGEngine;
  dagSuggester?: DAGSuggester;
  executor?: ParallelExecutor;
  mcpClients?: Map<string, MCPClientBase>;
  capabilityStore?: CapabilityStore;
  adaptiveThresholdManager?: AdaptiveThresholdManager;
  embeddingModel?: EmbeddingModelInterface;
  config: Partial<GatewayServerConfig>;
}

/**
 * Validation errors for builder
 */
export class GatewayBuilderError extends Error {
  constructor(
    message: string,
    public readonly missingDependencies: string[],
  ) {
    super(message);
    this.name = "GatewayBuilderError";
  }
}

/**
 * Fluent builder for PMLGatewayServer
 *
 * Replaces the 10-parameter constructor with a clear, chainable API.
 * Required dependencies are validated at build() time.
 */
export class GatewayBuilder {
  private state: GatewayBuilderState = {
    config: {},
  };

  // ============================================================================
  // Required Dependencies
  // ============================================================================

  /**
   * Set database client (required)
   */
  withDatabase(db: DbClient): this {
    this.state.db = db;
    return this;
  }

  /**
   * Set vector search engine (required)
   */
  withVectorSearch(vectorSearch: VectorSearch): this {
    this.state.vectorSearch = vectorSearch;
    return this;
  }

  /**
   * Set GraphRAG engine (required)
   */
  withGraphEngine(graphEngine: GraphRAGEngine): this {
    this.state.graphEngine = graphEngine;
    return this;
  }

  /**
   * Set DAG suggester (required)
   */
  withDAGSuggester(dagSuggester: DAGSuggester): this {
    this.state.dagSuggester = dagSuggester;
    return this;
  }

  /**
   * Set parallel executor (required)
   */
  withExecutor(executor: ParallelExecutor): this {
    this.state.executor = executor;
    return this;
  }

  /**
   * Set MCP clients map (required)
   */
  withMCPClients(mcpClients: Map<string, MCPClientBase>): this {
    this.state.mcpClients = mcpClients;
    return this;
  }

  // ============================================================================
  // Optional Dependencies
  // ============================================================================

  /**
   * Set capability store (optional - enables capability learning)
   */
  withCapabilityStore(store: CapabilityStore): this {
    this.state.capabilityStore = store;
    return this;
  }

  /**
   * Set adaptive threshold manager (optional - enables dynamic thresholds)
   */
  withAdaptiveThresholdManager(manager: AdaptiveThresholdManager): this {
    this.state.adaptiveThresholdManager = manager;
    return this;
  }

  /**
   * Set embedding model (optional - enables semantic search)
   */
  withEmbeddingModel(model: EmbeddingModelInterface): this {
    this.state.embeddingModel = model;
    return this;
  }

  // ============================================================================
  // Configuration Options
  // ============================================================================

  /**
   * Set server name and version
   */
  withServerInfo(name: string, version: string): this {
    this.state.config.name = name;
    this.state.config.version = version;
    return this;
  }

  /**
   * Enable/disable speculative execution
   */
  withSpeculation(enabled: boolean): this {
    this.state.config.enableSpeculative = enabled;
    return this;
  }

  /**
   * Set default tool limit for searches
   */
  withDefaultToolLimit(limit: number): this {
    this.state.config.defaultToolLimit = limit;
    return this;
  }

  /**
   * Configure PII protection
   */
  withPIIProtection(options: {
    enabled?: boolean;
    types?: Array<"email" | "phone" | "credit_card" | "ssn" | "api_key">;
    detokenizeOutput?: boolean;
  }): this {
    this.state.config.piiProtection = {
      enabled: options.enabled ?? true,
      types: options.types ?? ["email", "phone", "credit_card", "ssn", "api_key"],
      detokenizeOutput: options.detokenizeOutput ?? false,
    };
    return this;
  }

  /**
   * Configure caching
   */
  withCaching(options: {
    enabled?: boolean;
    maxEntries?: number;
    ttlSeconds?: number;
    persistence?: boolean;
  }): this {
    this.state.config.cacheConfig = {
      enabled: options.enabled ?? true,
      maxEntries: options.maxEntries ?? 100,
      ttlSeconds: options.ttlSeconds ?? 300,
      persistence: options.persistence ?? false,
    };
    return this;
  }

  /**
   * Apply full config object (for migration from old constructor)
   */
  withConfig(config: GatewayServerConfig): this {
    this.state.config = { ...this.state.config, ...config };
    return this;
  }

  // ============================================================================
  // Build
  // ============================================================================

  /**
   * Validate required dependencies are present
   */
  private validate(): string[] {
    const missing: string[] = [];

    if (!this.state.db) missing.push("db (use withDatabase())");
    if (!this.state.vectorSearch) missing.push("vectorSearch (use withVectorSearch())");
    if (!this.state.graphEngine) missing.push("graphEngine (use withGraphEngine())");
    if (!this.state.dagSuggester) missing.push("dagSuggester (use withDAGSuggester())");
    if (!this.state.executor) missing.push("executor (use withExecutor())");
    if (!this.state.mcpClients) missing.push("mcpClients (use withMCPClients())");

    return missing;
  }

  /**
   * Get current builder state (for inspection/debugging)
   */
  getState(): Readonly<GatewayBuilderState> {
    return { ...this.state };
  }

  /**
   * Build the PMLGatewayServer instance
   *
   * @throws GatewayBuilderError if required dependencies are missing
   * @returns Constructor arguments tuple for PMLGatewayServer
   */
  build(): {
    db: DbClient;
    vectorSearch: VectorSearch;
    graphEngine: GraphRAGEngine;
    dagSuggester: DAGSuggester;
    executor: ParallelExecutor;
    mcpClients: Map<string, MCPClientBase>;
    capabilityStore?: CapabilityStore;
    adaptiveThresholdManager?: AdaptiveThresholdManager;
    config?: GatewayServerConfig;
    embeddingModel?: EmbeddingModelInterface;
  } {
    const missing = this.validate();
    if (missing.length > 0) {
      throw new GatewayBuilderError(
        `Cannot build GatewayServer: missing required dependencies:\n  - ${missing.join("\n  - ")}`,
        missing,
      );
    }

    // TypeScript now knows these are defined after validation
    return {
      db: this.state.db!,
      vectorSearch: this.state.vectorSearch!,
      graphEngine: this.state.graphEngine!,
      dagSuggester: this.state.dagSuggester!,
      executor: this.state.executor!,
      mcpClients: this.state.mcpClients!,
      capabilityStore: this.state.capabilityStore,
      adaptiveThresholdManager: this.state.adaptiveThresholdManager,
      config: Object.keys(this.state.config).length > 0
        ? this.state.config as GatewayServerConfig
        : undefined,
      embeddingModel: this.state.embeddingModel,
    };
  }

  /**
   * Reset builder to initial state
   */
  reset(): this {
    this.state = { config: {} };
    return this;
  }
}
