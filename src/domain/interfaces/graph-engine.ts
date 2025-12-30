/**
 * Graph Engine Interface
 *
 * Defines the contract for GraphRAG operations.
 * Implementations: GraphRAGEngine
 *
 * Phase 2.1: Foundation for DI with diod
 *
 * @module domain/interfaces/graph-engine
 */

import type { DAGStructure } from "./dag-executor.ts";

/**
 * Statistics about the graph
 */
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  density: number;
  communities: number;
}

/**
 * Snapshot of the graph state
 */
export interface GraphSnapshot {
  nodes: Array<{
    id: string;
    pagerank: number;
    degree: number;
    community?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
  timestamp: Date;
}

/**
 * Time range for metrics queries
 */
export type MetricsTimeRange = "hour" | "day" | "week" | "month";

/**
 * Graph metrics response
 */
export interface GraphMetricsResponse {
  toolUsage: Record<string, number>;
  successRates: Record<string, number>;
  avgLatencies: Record<string, number>;
}

/**
 * Interface for GraphRAG operations
 *
 * This interface abstracts the graph-based recommendation
 * and learning system, supporting different graph backends
 * and easy mocking in tests.
 */
export interface IGraphEngine {
  /**
   * Sync graph state from database
   */
  syncFromDatabase(): Promise<void>;

  /**
   * Get PageRank score for a tool
   */
  getPageRank(toolId: string): number;

  /**
   * Get community ID for a tool
   */
  getCommunity(toolId: string): string | undefined;

  /**
   * Find tools in the same community
   */
  findCommunityMembers(toolId: string): string[];

  /**
   * Find shortest path between tools
   */
  findShortestPath(fromToolId: string, toToolId: string): string[] | null;

  /**
   * Build a DAG from candidate tools
   */
  buildDAG(candidateTools: string[]): DAGStructure;

  /**
   * Get neighbor tools
   */
  getNeighbors(toolId: string, direction?: "in" | "out" | "both"): string[];

  /**
   * Compute Adamic-Adar similarity between tools
   */
  adamicAdarBetween(toolId1: string, toolId2: string): number;

  /**
   * Compute graph relatedness score
   */
  computeGraphRelatedness(toolId: string, contextTools: string[]): number;

  /**
   * Get current graph statistics
   */
  getStats(): GraphStats;

  /**
   * Get full graph snapshot
   */
  getGraphSnapshot(): GraphSnapshot;

  /**
   * Get adaptive alpha value
   */
  getAdaptiveAlpha(): number;

  /**
   * Get graph density
   */
  getGraphDensity(): number;

  /**
   * Get total number of communities
   */
  getTotalCommunities(): number;

  /**
   * Get metrics for a time range
   */
  getMetrics(range: MetricsTimeRange): Promise<GraphMetricsResponse>;

  /**
   * Get edge count
   */
  getEdgeCount(): number;
}
