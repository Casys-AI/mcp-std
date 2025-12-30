/**
 * GraphEngine Adapter
 *
 * Wraps GraphRAGEngine to implement the DI GraphEngine token.
 * Delegates directly to GraphRAGEngine since it already implements
 * the required interface.
 *
 * @module infrastructure/di/adapters/graph-engine-adapter
 */

import { GraphEngine, type MetricsTimeRange } from "../container.ts";
import type { GraphRAGEngine } from "../../../graphrag/graph-engine.ts";

/**
 * Adapter that wraps GraphRAGEngine for DI registration.
 *
 * Delegates all calls to the underlying GraphRAGEngine instance.
 */
export class GraphEngineAdapter extends GraphEngine {
  constructor(private readonly engine: GraphRAGEngine) {
    super();
  }

  syncFromDatabase = () => this.engine.syncFromDatabase();
  getPageRank = (nodeId: string) => this.engine.getPageRank(nodeId);
  getCommunity = (nodeId: string) => this.engine.getCommunity(nodeId);
  findCommunityMembers = (communityId: string) => this.engine.findCommunityMembers(communityId);
  findShortestPath = (from: string, to: string) => this.engine.findShortestPath(from, to);
  buildDAG = (candidateTools: string[]) => this.engine.buildDAG(candidateTools);
  getNeighbors = (nodeId: string, direction?: "in" | "out" | "both") =>
    this.engine.getNeighbors(nodeId, direction);
  adamicAdarBetween = (a: string, b: string) => this.engine.adamicAdarBetween(a, b);
  computeGraphRelatedness = (nodeId: string, candidates: string[]) =>
    this.engine.computeGraphRelatedness(nodeId, candidates);
  getStats = () => this.engine.getStats();
  getGraphSnapshot = () => this.engine.getGraphSnapshot();
  getAdaptiveAlpha = () => this.engine.getAdaptiveAlpha();
  getGraphDensity = () => this.engine.getGraphDensity();
  getTotalCommunities = () => this.engine.getTotalCommunities();
  getMetrics = (range: MetricsTimeRange) => this.engine.getMetrics(range);
  getEdgeCount = () => this.engine.getEdgeCount();

  /** Access underlying engine for methods not in interface */
  get underlying(): GraphRAGEngine {
    return this.engine;
  }
}
