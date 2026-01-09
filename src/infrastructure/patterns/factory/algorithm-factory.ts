/**
 * Algorithm Factory Pattern
 *
 * Factory for creating algorithm instances (SHGAT, DR-DSP) from
 * capabilities data. Abstracts initialization complexity and provides
 * consistent algorithm creation across the application.
 *
 * ## Supported Algorithms
 *
 * - **SHGAT**: Sparse Heterogeneous Graph Attention Network
 *   - Scores capabilities using graph attention on tool-capability hypergraph
 *   - Uses embeddings, hierarchy, and co-occurrence patterns
 *
 * - **DR-DSP**: Dynamic Resource Demand-Supply Planning
 *   - Alternative scoring based on tool usage patterns
 *   - Lightweight, no embeddings required
 *
 * ## Factory Methods
 *
 * | Method | Description |
 * |--------|-------------|
 * | `createSHGAT()` | Create SHGAT with optional co-occurrence and caching |
 * | `createEmptySHGAT()` | Create empty SHGAT for dynamic registration |
 * | `createDRDSP()` | Create DR-DSP from tool patterns |
 * | `createBoth()` | Create both algorithms concurrently |
 *
 * ## Options
 *
 * - `withCooccurrence`: Load tool co-occurrence patterns for SHGAT
 * - `withHyperedgeCache`: Cache hyperedges in Deno KV (requires --unstable-kv)
 *
 * @example
 * ```typescript
 * // Create SHGAT from capabilities
 * const result = await AlgorithmFactory.createSHGAT(capabilities, {
 *   withCooccurrence: true,
 * });
 * console.log(`Loaded ${result.capabilitiesLoaded} capabilities`);
 *
 * // Create both algorithms concurrently
 * const { shgat, drdsp } = await AlgorithmFactory.createBoth(capabilities);
 * ```
 *
 * @module infrastructure/patterns/factory/algorithm-factory
 */

import * as log from "@std/log";
import {
  createSHGATFromCapabilities,
  type SHGAT,
} from "../../../graphrag/algorithms/shgat.ts";
import {
  buildDRDSPFromCapabilities,
  buildDRDSPAligned,
  type DRDSP,
  type AlignedToolInput,
} from "../../../graphrag/algorithms/dr-dsp.ts";
import { loadCooccurrenceData } from "../../../graphrag/algorithms/shgat/message-passing/index.ts";
import {
  buildHyperedgesFromSHGAT,
  cacheHyperedges,
} from "../../../cache/hyperedge-cache.ts";
import { initBlasAcceleration } from "../../../graphrag/algorithms/shgat/utils/math.ts";

/**
 * Capability data for algorithm initialization
 */
export interface AlgorithmCapabilityInput {
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
  children?: string[];
  parents?: string[];
}

/**
 * Simplified capability for DR-DSP (no embedding needed)
 */
export interface DRDSPCapabilityInput {
  id: string;
  toolsUsed: string[];
  successRate: number;
}

/**
 * Options for SHGAT creation
 */
export interface SHGATFactoryOptions {
  /** Load V→V co-occurrence data from scraped workflows */
  withCooccurrence?: boolean;
  /** Cache hyperedges in KV for tensor-entropy */
  withHyperedgeCache?: boolean;
}

/**
 * Result of SHGAT creation
 */
export interface SHGATFactoryResult {
  shgat: SHGAT;
  capabilitiesLoaded: number;
  cooccurrenceEdges?: number;
  hyperedgesCached?: number;
}

/**
 * Factory for creating algorithm instances
 *
 * Provides centralized creation of ML algorithms used for
 * capability matching and DAG suggestion.
 */
export class AlgorithmFactory {
  /** Track if BLAS has been initialized */
  private static blasInitialized = false;

  /**
   * Initialize BLAS acceleration (called once, idempotent)
   *
   * Loads OpenBLAS via FFI for ~15x speedup on matrix operations.
   * Falls back to JS implementation if BLAS is unavailable.
   */
  private static async initBlas(): Promise<void> {
    if (this.blasInitialized) return;

    try {
      const available = await initBlasAcceleration();
      this.blasInitialized = true;
      if (available) {
        log.info("[AlgorithmFactory] BLAS acceleration enabled (OpenBLAS)");
      } else {
        log.debug("[AlgorithmFactory] BLAS not available, using JS fallback");
      }
    } catch (e) {
      log.debug(`[AlgorithmFactory] BLAS init failed: ${e}`);
      this.blasInitialized = true; // Don't retry
    }
  }

  /**
   * Create SHGAT instance from capabilities
   *
   * @param capabilities Array of capabilities with embeddings
   * @param options Creation options
   * @returns SHGAT instance and metadata
   */
  static async createSHGAT(
    capabilities: AlgorithmCapabilityInput[],
    options: SHGATFactoryOptions = {},
  ): Promise<SHGATFactoryResult> {
    // Initialize BLAS for matrix acceleration (ADR-058)
    await this.initBlas();

    // Create SHGAT with capabilities
    const shgat = createSHGATFromCapabilities(capabilities);
    log.info(
      `[AlgorithmFactory] SHGAT initialized with ${capabilities.length} capabilities`,
    );

    const result: SHGATFactoryResult = {
      shgat,
      capabilitiesLoaded: capabilities.length,
    };

    // Load co-occurrence data if requested
    if (options.withCooccurrence) {
      try {
        const toolIndex = shgat.getToolIndexMap();
        const coocData = await loadCooccurrenceData(toolIndex);
        if (coocData.entries.length > 0) {
          shgat.setCooccurrenceData(coocData.entries);
          result.cooccurrenceEdges = coocData.stats.edges;
          log.info(
            `[AlgorithmFactory] V→V co-occurrence loaded: ${coocData.stats.edges} edges`,
          );
        }
      } catch (e) {
        log.debug(`[AlgorithmFactory] No V→V co-occurrence data: ${e}`);
      }
    }

    // Cache hyperedges if requested
    if (options.withHyperedgeCache) {
      const hyperedges = buildHyperedgesFromSHGAT(capabilities);
      if (hyperedges.length > 0) {
        await cacheHyperedges(hyperedges);
        result.hyperedgesCached = hyperedges.length;
        log.info(
          `[AlgorithmFactory] Cached ${hyperedges.length} hyperedges in KV`,
        );
      }
    }

    return result;
  }

  /**
   * Create empty SHGAT (for cases with no initial capabilities)
   *
   * Capabilities can be added dynamically via shgat.registerCapability()
   */
  static async createEmptySHGAT(): Promise<SHGAT> {
    // Initialize BLAS for matrix acceleration (ADR-058)
    await this.initBlas();

    const shgat = createSHGATFromCapabilities([]);
    log.info(`[AlgorithmFactory] Empty SHGAT initialized`);
    return shgat;
  }

  /**
   * Create DR-DSP instance from capabilities (legacy - tools only as nodes)
   * @deprecated Use createDRDSPAligned for capabilities as nodes
   *
   * @param capabilities Array of capabilities (embeddings not required)
   * @returns DR-DSP instance
   */
  static createDRDSP(capabilities: DRDSPCapabilityInput[]): DRDSP {
    const drdsp = buildDRDSPFromCapabilities(capabilities);
    log.info(
      `[AlgorithmFactory] DR-DSP (legacy) initialized with ${capabilities.length} capabilities`,
    );
    return drdsp;
  }

  /**
   * Create DR-DSP aligned with SHGAT model
   *
   * Both tools AND capabilities are nodes in the hypergraph.
   * This enables capability-to-capability pathfinding.
   *
   * @param tools Tool nodes to register
   * @param capabilities Capability nodes with members
   * @param cooccurrences Optional co-occurrence data for sequence edges
   * @returns DR-DSP instance with aligned model
   */
  static createDRDSPAligned(
    tools: AlignedToolInput[],
    capabilities: AlgorithmCapabilityInput[],
    cooccurrences?: Array<{ from: string; to: string; weight: number }>,
  ): DRDSP {
    const drdsp = buildDRDSPAligned(
      tools,
      capabilities.map((cap) => ({
        id: cap.id,
        toolsUsed: cap.toolsUsed,
        children: cap.children,
        parents: cap.parents,
        hierarchyLevel: cap.children?.length ? 1 : 0,
        successRate: cap.successRate,
        embedding: cap.embedding,
      })),
      cooccurrences,
    );

    const stats = drdsp.getStats();
    log.info(
      `[AlgorithmFactory] DR-DSP (aligned) initialized: ${stats.nodeCount} nodes, ${stats.hyperedgeCount} hyperedges`,
    );
    return drdsp;
  }

  /**
   * Create both SHGAT and DR-DSP from the same capabilities
   *
   * Uses aligned DR-DSP model where capabilities are nodes.
   *
   * @param capabilities Capabilities with embeddings
   * @param options SHGAT options
   * @returns Both algorithm instances
   */
  static async createBoth(
    capabilities: AlgorithmCapabilityInput[],
    options: SHGATFactoryOptions = {},
  ): Promise<{
    shgat: SHGATFactoryResult;
    drdsp: DRDSP;
  }> {
    // Extract unique tools from all capabilities
    const toolSet = new Set<string>();
    for (const cap of capabilities) {
      for (const tool of cap.toolsUsed) {
        toolSet.add(tool);
      }
    }
    const tools: AlignedToolInput[] = Array.from(toolSet).map((id) => ({ id }));

    // Load co-occurrence for both SHGAT and DR-DSP
    let cooccurrences: Array<{ from: string; to: string; weight: number }> | undefined;
    if (options.withCooccurrence) {
      try {
        // Create temporary tool index for co-occurrence loading
        const toolIndex = new Map<string, number>();
        tools.forEach((t, i) => toolIndex.set(t.id, i));
        const coocData = await loadCooccurrenceData(toolIndex);
        if (coocData.entries.length > 0) {
          // CooccurrenceEntry has: from (index), to (index), weight
          // We need to convert indices back to tool IDs
          const indexToTool = new Map<number, string>();
          toolIndex.forEach((idx, id) => indexToTool.set(idx, id));

          cooccurrences = coocData.entries
            .filter((e) => indexToTool.has(e.from) && indexToTool.has(e.to))
            .map((e) => ({
              from: indexToTool.get(e.from)!,
              to: indexToTool.get(e.to)!,
              weight: e.weight,
            }));
        }
      } catch {
        // Co-occurrence not available, continue without
      }
    }

    const [shgatResult, drdsp] = await Promise.all([
      this.createSHGAT(capabilities, options),
      Promise.resolve(this.createDRDSPAligned(tools, capabilities, cooccurrences)),
    ]);

    return {
      shgat: shgatResult,
      drdsp,
    };
  }
}
