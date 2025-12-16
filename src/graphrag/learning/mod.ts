/**
 * Learning Module Exports
 *
 * Provides episodic memory integration and pattern import/export
 * for learning-enhanced predictions.
 *
 * @module graphrag/learning
 */

export {
  getContextHash,
  loadEpisodeStatistics,
  parseEpisodeStatistics,
  retrieveRelevantEpisodes,
  type EpisodicEvent,
} from "./episodic-adapter.ts";

export {
  exportLearnedPatterns,
  importLearnedPatterns,
  registerAgentHint,
  type LearnedPatternData,
  type PatternImport,
} from "./pattern-io.ts";
