/**
 * Algorithm Initialization Module
 *
 * Handles complex initialization of SHGAT and DR-DSP algorithms at startup.
 * Extracted from gateway-server.ts to reduce complexity and improve testability.
 *
 * ## Responsibilities
 *
 * 1. **Database Loading**: Fetch capabilities with embeddings from PostgreSQL
 * 2. **Hierarchy Building**: Build parent-child relationships from contains edges
 * 3. **SHGAT Creation**: Initialize SHGAT algorithm with capabilities
 * 4. **DR-DSP Creation**: Initialize DR-DSP for tool selection
 * 5. **Co-occurrence Loading**: Load tool co-occurrence patterns for SHGAT
 * 6. **Hyperedge Caching**: Cache capability hyperedges in Deno KV
 * 7. **Graph Sync**: Start GraphSyncController for incremental updates
 * 8. **Params Persistence**: Load/save SHGAT learned parameters
 * 9. **Background Training**: Train SHGAT on execution traces
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  AlgorithmInitializer                       │
 * │                                                             │
 * │  Dependencies:                    Outputs:                  │
 * │  ├─ DbClient                     ├─ SHGAT                  │
 * │  ├─ GraphRAGEngine               ├─ DR-DSP                 │
 * │  ├─ CapabilityStore              ├─ GraphSyncController    │
 * │  └─ EmbeddingModel               └─ Hyperedge Cache        │
 * │                                                             │
 * │  init() ─────────────────────────────────────────────────►  │
 * │           │                                                 │
 * │           ├─ loadCapabilities()                            │
 * │           ├─ buildHierarchy()                              │
 * │           ├─ AlgorithmFactory.createBoth()                 │
 * │           ├─ loadCooccurrence()                            │
 * │           ├─ cacheHyperedges()                             │
 * │           ├─ GraphSyncController.start()                   │
 * │           └─ trainOnTraces() [background]                  │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { AlgorithmInitializer } from "./algorithm-init/mod.ts";
 *
 * const initializer = new AlgorithmInitializer(deps);
 * const result = await initializer.init();
 *
 * // Use the initialized algorithms
 * const scores = result.shgat.scoreCapabilities(query);
 * ```
 *
 * @module mcp/algorithm-init
 * @see {@link AlgorithmInitializer}
 */

export {
  AlgorithmInitializer,
  type AlgorithmInitializerDeps,
  type AlgorithmInitResult,
} from "./initializer.ts";
