/**
 * Search and Graph Statistics Types
 *
 * Types for hybrid search (ADR-022) and graph analytics.
 *
 * @module graphrag/types/search
 */

/**
 * Graph statistics
 */
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  communities: number;
  avgPageRank: number;
}

/**
 * Execution record for adaptive learning
 *
 * Story 10.7c: Added toolId for Thompson Sampling per-tool learning.
 */
export interface ExecutionRecord {
  confidence: number;
  mode: "explicit" | "suggestion" | "speculative";
  success: boolean;
  userAccepted?: boolean;
  executionTime?: number;
  timestamp: number;
  /** Story 10.7c: Tool ID for per-tool Thompson Sampling updates */
  toolId?: string;
}

/**
 * Speculative execution metrics
 */
export interface SpeculativeMetrics {
  totalSpeculativeAttempts: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgExecutionTime: number;
  avgConfidence: number;
  wastedComputeCost: number;
  savedLatency: number;
}

/**
 * Result from hybrid search combining semantic and graph scores (ADR-022)
 *
 * Centralizes the hybrid search logic for use in both:
 * - GatewayServer.handleSearchTools (MCP tool)
 * - DAGSuggester.suggestDAG (internal)
 */
export interface HybridSearchResult {
  toolId: string;
  serverId: string;
  toolName: string;
  description: string;
  /** Semantic similarity score (0-1) */
  semanticScore: number;
  /** Graph relatedness score (0-1) */
  graphScore: number;
  /** Combined final score: α × semantic + (1-α) × graph */
  finalScore: number;
  /** Related tools (in/out neighbors) if requested */
  relatedTools?: Array<{
    toolId: string;
    relation: "often_before" | "often_after";
    score: number;
  }>;
  /** Original schema from tool_schema table */
  schema?: Record<string, unknown>;
}
