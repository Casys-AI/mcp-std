/**
 * SHGAT Types and Configuration
 *
 * Type definitions and default configurations for SHGAT v2.
 * Extracted from shgat.ts for maintainability.
 *
 * @module graphrag/algorithms/shgat-types
 */

// ============================================================================
// Trace Features (v2)
// ============================================================================

/**
 * Trace-derived statistics for multi-head attention (v2)
 *
 * These statistics are extracted from execution_trace and episodic_events tables.
 * All features are fed to ALL heads - each head learns different patterns.
 */
export interface TraceStats {
  // === Success patterns ===
  /** Success rate of this tool overall (0-1) */
  historicalSuccessRate: number;
  /** Success rate when used after context tools (0-1) */
  contextualSuccessRate: number;
  /** Success rate for similar intents (0-1) */
  intentSimilarSuccessRate: number;

  // === Co-occurrence patterns ===
  /** How often this tool follows context tools (0-1) */
  cooccurrenceWithContext: number;
  /** Typical position in workflows (0=start, 1=end) */
  sequencePosition: number;

  // === Temporal patterns ===
  /** Exponential decay since last use (0-1, 1=very recent) */
  recencyScore: number;
  /** Normalized usage count (0-1) */
  usageFrequency: number;
  /** Normalized average duration (0-1) */
  avgExecutionTime: number;

  // === Error patterns ===
  /** Success rate after errors in context (0-1) */
  errorRecoveryRate: number;

  // === Path patterns ===
  /** Average steps to reach successful outcome */
  avgPathLengthToSuccess: number;
  /** Variance in path lengths */
  pathVariance: number;

  // === Error type patterns ===
  /** Success rate per error type (one-hot style: TIMEOUT, PERMISSION, NOT_FOUND, VALIDATION, NETWORK, UNKNOWN) */
  errorTypeAffinity: number[];
}

/**
 * Default trace stats for cold start
 */
export const DEFAULT_TRACE_STATS: TraceStats = {
  historicalSuccessRate: 0.5,
  contextualSuccessRate: 0.5,
  intentSimilarSuccessRate: 0.5,
  cooccurrenceWithContext: 0,
  sequencePosition: 0.5,
  recencyScore: 0.5,
  usageFrequency: 0,
  avgExecutionTime: 0.5,
  errorRecoveryRate: 0.5,
  avgPathLengthToSuccess: 3,
  pathVariance: 0,
  errorTypeAffinity: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], // TIMEOUT, PERMISSION, NOT_FOUND, VALIDATION, NETWORK, UNKNOWN
};

/**
 * Number of scalar features in TraceStats (derived from DEFAULT_TRACE_STATS)
 * = 11 scalar fields + 6 errorTypeAffinity values = 17
 */
export const NUM_TRACE_STATS = Object.keys(DEFAULT_TRACE_STATS).length - 1 + DEFAULT_TRACE_STATS.errorTypeAffinity.length;
// -1 because errorTypeAffinity is counted as array length, not as 1 key

/**
 * Rich features derived from execution traces (v2)
 *
 * All features fed to ALL heads (heads learn different patterns).
 * This replaces the 3 specialized heads (semantic/structure/temporal).
 */
export interface TraceFeatures {
  // === Core Embeddings ===
  /** User intent embedding (BGE-M3, 1024D) */
  intentEmbedding: number[];
  /** Tool/capability being scored (BGE-M3, 1024D) */
  candidateEmbedding: number[];

  // === Context Embeddings ===
  /** Recent tools in current session (max 5) */
  contextEmbeddings: number[][];
  /** Mean pooling of context embeddings */
  contextAggregated: number[];

  // === Trace-Derived Statistics ===
  traceStats: TraceStats;
}

/**
 * Create default TraceFeatures for cold start
 */
export function createDefaultTraceFeatures(
  intentEmbedding: number[],
  candidateEmbedding: number[],
): TraceFeatures {
  return {
    intentEmbedding,
    candidateEmbedding,
    contextEmbeddings: [],
    contextAggregated: new Array(intentEmbedding.length).fill(0),
    traceStats: { ...DEFAULT_TRACE_STATS },
  };
}

// ============================================================================
// Legacy Types (kept for backward compatibility)
// ============================================================================

/**
 * @deprecated Use TraceStats instead. Kept for API compatibility.
 */
export interface FusionWeights {
  semantic: number;
  structure: number;
  temporal: number;
}

/**
 * @deprecated Use DEFAULT_TRACE_STATS instead.
 */
export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  semantic: 1.0,
  structure: 0.5,
  temporal: 0.5,
};

/**
 * @deprecated Use TraceStats instead.
 */
export interface FeatureWeights {
  semantic: number;
  structure: number;
  temporal: number;
}

/**
 * @deprecated Use DEFAULT_TRACE_STATS instead.
 */
export const DEFAULT_FEATURE_WEIGHTS: FeatureWeights = {
  semantic: 0.5,
  structure: 0.1,
  temporal: 0.1,
};

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for SHGAT v2
 *
 * Key changes from v1:
 * - numHeads: Now 4-16 (adaptive based on trace volume), not fixed 3
 * - headDim: hiddenDim / numHeads (for parallel attention)
 * - mlpHiddenDim: Fusion MLP hidden size
 * - maxContextLength: Max recent tools for context
 * - maxBufferSize: PER buffer cap
 * - minTracesForTraining: Cold start threshold
 */
export interface SHGATConfig {
  // === Architecture ===
  /** Number of attention heads (4-16, adaptive based on trace volume) */
  numHeads: number;
  /** Hidden dimension for projections (scales with numHeads) */
  hiddenDim: number;
  /** Dimension per head (hiddenDim / numHeads) */
  headDim: number;
  /** Embedding dimension (should match BGE-M3: 1024) */
  embeddingDim: number;
  /** Number of message passing layers */
  numLayers: number;
  /** Fusion MLP hidden dimension */
  mlpHiddenDim: number;

  // === Training ===
  /** Learning rate for training */
  learningRate: number;
  /** Batch size for training */
  batchSize: number;
  /** Max recent tools in context */
  maxContextLength: number;

  // === Buffer Management ===
  /** PER buffer cap */
  maxBufferSize: number;
  /** Cold start threshold - min traces before training */
  minTracesForTraining: number;

  // === Regularization ===
  /** Dropout rate (0 = no dropout) */
  dropout: number;
  /** L2 regularization weight */
  l2Lambda: number;
  /** LeakyReLU negative slope */
  leakyReluSlope: number;
  /** Decay factor for recursive depth */
  depthDecay: number;

  // === Legacy (kept for backward compatibility) ===
  /** @deprecated Which heads are active - all heads active in v2 */
  activeHeads?: number[];
  /** @deprecated Fixed fusion weights - learned in v2 */
  headFusionWeights?: number[];
}

/**
 * Default configuration for SHGAT v2
 *
 * Conservative defaults (K=4) for cold start.
 * Use getAdaptiveConfig() for scaling based on trace volume.
 */
export const DEFAULT_SHGAT_CONFIG: SHGATConfig = {
  // Architecture
  numHeads: 4, // Conservative default, scales up with data
  hiddenDim: 64,
  headDim: 16, // 64 / 4
  embeddingDim: 1024,
  numLayers: 2,
  mlpHiddenDim: 32,

  // Training
  learningRate: 0.001,
  batchSize: 32,
  maxContextLength: 5,

  // Buffer management
  maxBufferSize: 50_000,
  minTracesForTraining: 100,

  // Regularization
  dropout: 0.1,
  l2Lambda: 0.0001,
  leakyReluSlope: 0.2,
  depthDecay: 0.8,
};

/**
 * Get adaptive config based on trace volume
 *
 * More data = more heads can learn useful patterns.
 * Scales architecture to match available training data.
 *
 * @param traceCount Number of available execution traces
 * @returns Partial config to merge with defaults
 */
export function getAdaptiveConfig(traceCount: number): Partial<SHGATConfig> {
  if (traceCount < 1_000) {
    // Conservative - few traces, simple model
    return { numHeads: 4, hiddenDim: 64, headDim: 16, mlpHiddenDim: 32 };
  }
  if (traceCount < 10_000) {
    // Default - moderate traces
    return { numHeads: 8, hiddenDim: 128, headDim: 16, mlpHiddenDim: 64 };
  }
  if (traceCount < 100_000) {
    // Scale up - many traces
    return { numHeads: 12, hiddenDim: 192, headDim: 16, mlpHiddenDim: 96 };
  }
  // Full capacity - very large dataset
  return { numHeads: 16, hiddenDim: 256, headDim: 16, mlpHiddenDim: 128 };
}

// ============================================================================
// Training Types
// ============================================================================

/**
 * Training example from episodic events
 */
export interface TrainingExample {
  /** Intent embedding (1024-dim) */
  intentEmbedding: number[];
  /** Context tool IDs that were active */
  contextTools: string[];
  /** Candidate capability ID */
  candidateId: string;
  /** Outcome: 1 = success, 0 = failure */
  outcome: number;
}

// ============================================================================
// Graph Feature Types
// ============================================================================

/**
 * Hypergraph features for SHGAT 3-head attention (CAPABILITIES)
 *
 * These features are used by the 3-head architecture:
 * - Head 0 (semantic): uses embedding + featureWeights.semantic
 * - Head 1 (structure): hypergraphPageRank + adamicAdar × featureWeights.structure
 * - Head 2 (temporal): recency + heatDiffusion × featureWeights.temporal
 *
 * NOTE: For capabilities (hyperedges), these use HYPERGRAPH algorithms.
 * For tools, use ToolGraphFeatures instead (simple graph algorithms).
 */
export interface HypergraphFeatures {
  /** Spectral cluster ID on the hypergraph (0-based) */
  spectralCluster: number;
  /** Hypergraph PageRank score (0-1) */
  hypergraphPageRank: number;
  /** Co-occurrence frequency from episodic traces (0-1) */
  cooccurrence: number;
  /** Recency score - how recently used (0-1, 1 = very recent) */
  recency: number;
  /** Adamic-Adar similarity with neighboring capabilities (0-1) */
  adamicAdar?: number;
  /** Heat diffusion score (0-1) */
  heatDiffusion?: number;
}

/**
 * Default hypergraph features (cold start)
 */
export const DEFAULT_HYPERGRAPH_FEATURES: HypergraphFeatures = {
  spectralCluster: 0,
  hypergraphPageRank: 0.01,
  cooccurrence: 0,
  recency: 0,
  adamicAdar: 0,
  heatDiffusion: 0,
};

/**
 * Tool graph features for SHGAT 3-head attention (TOOLS)
 *
 * These features use SIMPLE GRAPH algorithms (not hypergraph):
 * - Head 1 (structure): pageRank + adamicAdar × featureWeights.structure
 * - Head 2 (temporal): cooccurrence + recency × featureWeights.temporal
 *
 * This is separate from HypergraphFeatures because tools exist in a
 * simple directed graph (Graphology), not the superhypergraph.
 */
export interface ToolGraphFeatures {
  /** Regular PageRank score from Graphology (0-1) */
  pageRank: number;
  /** Louvain community ID (0-based integer) */
  louvainCommunity: number;
  /** Adamic-Adar similarity with neighboring tools (0-1) */
  adamicAdar: number;
  /** Co-occurrence frequency from execution_trace (0-1) */
  cooccurrence: number;
  /** Recency score - exponential decay since last use (0-1, 1 = very recent) */
  recency: number;
  /** Heat diffusion score from graph topology (0-1) */
  heatDiffusion: number;
}

/**
 * Default tool graph features (cold start)
 */
export const DEFAULT_TOOL_GRAPH_FEATURES: ToolGraphFeatures = {
  pageRank: 0.01,
  louvainCommunity: 0,
  adamicAdar: 0,
  cooccurrence: 0,
  recency: 0,
  heatDiffusion: 0,
};

// ============================================================================
// Node Types
// ============================================================================

/**
 * Tool node (vertex in hypergraph)
 */
export interface ToolNode {
  id: string;
  /** Embedding (from tool description) */
  embedding: number[];
  /** Tool graph features (simple graph algorithms) */
  toolFeatures?: ToolGraphFeatures;
}

/**
 * Capability node (hyperedge in hypergraph)
 */
export interface CapabilityNode {
  id: string;
  /** Embedding (from description or aggregated tools) */
  embedding: number[];
  /** Tools in this capability (vertex IDs) */
  toolsUsed: string[];
  /** Success rate from history (reliability) */
  successRate: number;
  /** Parent capabilities (via contains) */
  parents: string[];
  /** Child capabilities (via contains) */
  children: string[];
  /** Hypergraph features for multi-head attention */
  hypergraphFeatures?: HypergraphFeatures;
}

/**
 * Attention result for a capability
 */
export interface AttentionResult {
  capabilityId: string;
  /** Final attention score (0-1) */
  score: number;
  /** Per-head attention weights */
  headWeights: number[];
  /** Per-head raw scores before fusion */
  headScores: number[];
  /** Contribution from recursive parents */
  recursiveContribution: number;
  /** Feature contributions for interpretability */
  featureContributions?: {
    semantic: number;
    structure: number;
    temporal: number;
    reliability: number;
  };
  /** Attention over tools (for interpretability) */
  toolAttention?: number[];
}

/**
 * Cached activations for backpropagation
 */
export interface ForwardCache {
  /** Vertex (tool) embeddings at each layer */
  H: number[][][];
  /** Hyperedge (capability) embeddings at each layer */
  E: number[][][];
  /** Attention weights vertex→edge [layer][head][vertex][edge] */
  attentionVE: number[][][][];
  /** Attention weights edge→vertex [layer][head][edge][vertex] */
  attentionEV: number[][][][];
}
