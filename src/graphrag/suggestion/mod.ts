/**
 * Suggestion Module Exports
 *
 * Provides confidence calculation, rationale generation, and candidate ranking
 * for DAG suggestions.
 *
 * @module graphrag/suggestion
 */

export {
  calculateCommunityConfidence,
  calculateCooccurrenceConfidence,
  calculateConfidenceHybrid,
  calculatePathConfidence,
  getAdaptiveWeightsFromAlpha,
  type AdaptiveWeights,
  type ConfidenceBreakdown,
  type ScoredCandidate,
} from "./confidence.ts";

export {
  explainPath,
  generatePredictionReasoning,
  generateRationaleHybrid,
  type RationaleCandidate,
} from "./rationale.ts";

export {
  calculateAverageAlpha,
  extractDependencyPaths,
  rankCandidates,
  type CandidateAlpha,
  type RankedCandidate,
} from "./ranking.ts";
