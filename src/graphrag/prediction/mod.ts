/**
 * Prediction Module Exports
 *
 * Provides prediction functionality for next nodes, capabilities,
 * and alternative suggestions.
 *
 * @module graphrag/prediction
 */

export {
  DANGEROUS_OPERATIONS,
  isDangerousOperation,
  type AlphaResult,
  type CapabilityContextMatch,
  type EdgeData,
  type EpisodeStats,
  type EpisodeStatsMap,
} from "./types.ts";

export {
  adjustConfidenceFromEpisodes,
  applyLocalAlpha,
  createCapabilityTask,
  getCapabilityToolsUsed,
  injectMatchingCapabilities,
  predictCapabilities,
  type CapabilityPredictionDeps,
} from "./capabilities.ts";

export {
  suggestAlternatives,
  type AlternativeSuggestionDeps,
} from "./alternatives.ts";
