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

export {
  extractPathLevelFeatures,
  getFeaturesForTrace,
  getPathKey,
  type PathLevelFeatures,
} from "./path-level-features.ts";

export {
  flattenExecutedPath,
  getExecutionCount,
  resetExecutionCounter,
  shouldRunBatchTraining,
  traceToTrainingExamples,
  trainSHGATOnPathTraces,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_TRACES,
  DEFAULT_MIN_PRIORITY,
  DEFAULT_MIN_TRACES,
  DEFAULT_PER_ALPHA,
  type PERTrainingOptions,
  type PERTrainingResult,
} from "./per-training.ts";
