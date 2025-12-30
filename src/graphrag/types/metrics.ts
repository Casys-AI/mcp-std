/**
 * Metrics and Analytics Types
 *
 * Types for dashboard metrics and analytics (Story 6.3).
 *
 * @module graphrag/types/metrics
 */

/**
 * Time range for metrics queries
 */
export type MetricsTimeRange = "1h" | "24h" | "7d";

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

/**
 * Graph metrics response for dashboard (Story 6.3 AC4)
 *
 * Contains current snapshot metrics, time series data for charts,
 * and period statistics for the selected time range.
 */
export interface GraphMetricsResponse {
  /** Current snapshot metrics */
  current: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    /** @deprecated Use localAlpha instead (ADR-048) */
    adaptiveAlpha: number;
    communitiesCount: number;
    pagerankTop10: Array<{ toolId: string; score: number }>;
    // Extended metrics
    capabilitiesCount?: number;
    embeddingsCount?: number;
    dependenciesCount?: number;
    /** ADR-048: Local adaptive alpha statistics from recent traces */
    localAlpha?: {
      /** Average alpha across all recent traces */
      avgAlpha: number;
      /** Average alpha by mode */
      byMode: {
        activeSearch: number;
        passiveSuggestion: number;
      };
      /** Algorithm usage distribution */
      algorithmDistribution: {
        embeddingsHybrides: number;
        heatDiffusion: number;
        heatHierarchical: number;
        bayesian: number;
        none: number;
      };
      /** Cold start percentage */
      coldStartPercentage: number;
    };
  };

  /** Time series data for charts */
  timeseries: {
    edgeCount: TimeSeriesPoint[];
    avgConfidence: TimeSeriesPoint[];
    workflowRate: TimeSeriesPoint[];
  };

  /** Period statistics */
  period: {
    range: MetricsTimeRange;
    workflowsExecuted: number;
    workflowsSuccessRate: number;
    newEdgesCreated: number;
    newNodesAdded: number;
  };

  /** Algorithm tracing statistics (Story 7.6, ADR-039) */
  algorithm?: {
    tracesCount: number;
    acceptanceRate: number;
    avgFinalScore: number;
    avgSemanticScore: number;
    avgGraphScore: number;
    byDecision: { accepted: number; filtered: number; rejected: number };
    byTargetType: { tool: number; capability: number };
    timeseries?: {
      acceptanceRate: TimeSeriesPoint[];
      avgScore: TimeSeriesPoint[];
      volume: TimeSeriesPoint[];
    };

    /**
     * ADR-039: Separation of Graph vs Hypergraph algorithm stats
     *
     * - graph: Simple algos (PageRank, Adamic-Adar, co-occurrence)
     * - hypergraph: Advanced algos (Spectral Clustering, capability matching)
     *
     * Classification logic:
     * - hypergraph if target_type = 'capability' OR signals.spectralClusterMatch IS NOT NULL
     * - graph otherwise
     */
    byGraphType?: {
      graph: {
        count: number;
        avgScore: number;
        acceptanceRate: number;
        topSignals: { pagerank: number; adamicAdar: number; cooccurrence: number };
      };
      hypergraph: {
        count: number;
        avgScore: number;
        acceptanceRate: number;
        spectralRelevance: {
          withClusterMatch: { count: number; avgScore: number; selectedRate: number };
          withoutClusterMatch: { count: number; avgScore: number; selectedRate: number };
        };
      };
    };

    /** ADR-039: Threshold efficiency metrics */
    thresholdEfficiency?: {
      rejectedByThreshold: number;
      totalEvaluated: number;
      rejectionRate: number;
    };

    /** ADR-039: Score distribution histograms by graph type */
    scoreDistribution?: {
      graph: Array<{ bucket: string; count: number }>;
      hypergraph: Array<{ bucket: string; count: number }>;
    };

    /** ADR-039: Stats by algorithm mode */
    byMode?: {
      activeSearch: { count: number; avgScore: number; acceptanceRate: number };
      passiveSuggestion: { count: number; avgScore: number; acceptanceRate: number };
    };
  };
}
