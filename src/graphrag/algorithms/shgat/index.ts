/**
 * SHGAT Module Index
 *
 * SuperHyperGraph Attention Networks - modular architecture.
 *
 * Modules:
 * - graph: Graph construction and management
 * - initialization: Parameter initialization
 * - message-passing: Two-phase message passing
 * - scoring: V1 and V2 scoring implementations
 * - training: V1 and V2 training logic
 * - utils: Mathematical utilities
 *
 * @module graphrag/algorithms/shgat
 */

// Graph construction
export * from "./graph/index.ts";

// Parameter initialization
export * from "./initialization/index.ts";

// Message passing
export * from "./message-passing/index.ts";

// Scoring
export * from "./scoring/index.ts";

// Training
export * from "./training/index.ts";

// Math utilities
export * as math from "./utils/math.ts";

// Re-export types from ./types.ts
export type {
  // Trace Features (v2)
  TraceStats,
  TraceFeatures,
  // Configuration
  SHGATConfig,
  // Training Types
  TrainingExample,
  // Graph Feature Types
  HypergraphFeatures,
  ToolGraphFeatures,
  // Node Types
  Member,
  ToolMember,
  CapabilityMember,
  ToolNode,
  CapabilityNode,
  LegacyCapabilityNode,
  AttentionResult,
  ForwardCache,
  // Multi-level message passing types (v1 refactor)
  MultiLevelEmbeddings,
  LevelParams,
  MultiLevelForwardCache,
  // Legacy Types
  FusionWeights,
  FeatureWeights,
} from "./types.ts";

export {
  // Constants
  DEFAULT_TRACE_STATS,
  NUM_TRACE_STATS,
  DEFAULT_SHGAT_CONFIG,
  DEFAULT_HYPERGRAPH_FEATURES,
  DEFAULT_TOOL_GRAPH_FEATURES,
  DEFAULT_FUSION_WEIGHTS,
  DEFAULT_FEATURE_WEIGHTS,
  // Functions
  createDefaultTraceFeatures,
  getAdaptiveConfig,
  // n-SuperHyperGraph helpers (v1 refactor)
  getDirectTools,
  getDirectCapabilities,
  createMembersFromLegacy,
  migrateCapabilityNode,
} from "./types.ts";

// Re-export HierarchyCycleError from graph module for easy access
export { HierarchyCycleError } from "./graph/index.ts";
