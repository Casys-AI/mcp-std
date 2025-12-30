/**
 * GraphRAG Types - Module Re-exports
 *
 * Provides unified access to all GraphRAG type definitions.
 * For new code, prefer importing from specific modules.
 *
 * @module graphrag/types
 */

// DAG and workflow types
export type {
  Task,
  DAGStructure,
  WorkflowIntent,
  WorkflowExecution,
  ExecutionResult,
  DependencyPath,
  SuggestedDAG,
  ExecutionMode,
} from "./dag.ts";

// Prediction and speculation types
export type {
  PredictedNode,
  SpeculationConfig,
  SpeculationCache,
  SpeculationMetrics,
  LearnedPattern,
  WorkflowPredictionState,
  CompletedTask,
} from "./prediction.ts";

// Search and graph statistics types
export type {
  GraphStats,
  ExecutionRecord,
  SpeculativeMetrics,
  HybridSearchResult,
} from "./search.ts";

// Metrics and analytics types
export type {
  MetricsTimeRange,
  TimeSeriesPoint,
  GraphMetricsResponse,
} from "./metrics.ts";

// Schema and edge types
export type {
  ProvidesCoverage,
  JSONSchema,
  FieldMapping,
  ProvidesEdge,
} from "./schema.ts";

// Graph node types
export type {
  GraphNodeType,
  OperationCategory,
  BaseNodeAttributes,
  ToolNodeAttributes,
  OperationNodeAttributes,
  CapabilityNodeAttributes,
  GraphNodeAttributes,
} from "./graph-nodes.ts";
