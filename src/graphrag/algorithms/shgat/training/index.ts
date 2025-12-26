/**
 * SHGAT Training Module
 *
 * Training logic for SHGAT networks.
 *
 * @module graphrag/algorithms/shgat/training
 */

// V1 Training (3-head architecture)
export {
  type V1GradientAccumulators,
  type TrainingResult,
  initV1Gradients,
  resetV1Gradients,
  computeFusionWeights,
  backward,
  accumulateW_intentGradients,
  applyLayerGradients,
  applyFusionGradients,
  applyFeatureGradients,
  applyW_intentGradients,
  trainOnEpisodes,
} from "./v1-trainer.ts";

// V2 Training (multi-head with TraceFeatures)
export {
  type V2ForwardCache,
  traceStatsToVector,
  forwardV2WithCache,
  backwardV2,
  applyV2Gradients,
  buildTraceFeatures,
  createDefaultTraceStatsFromFeatures,
  computeHeadScores,
  fusionMLPForward,
} from "./v2-trainer.ts";

// Multi-Level Training (n-SuperHyperGraph v1 refactor)
export {
  type MultiLevelGradientAccumulators,
  type LevelGradients,
  type LevelIntermediates,
  type ExtendedMultiLevelForwardCache,
  type MultiLevelTrainingResult,
  initMultiLevelGradients,
  resetMultiLevelGradients,
  backpropAttention,
  backpropLeakyRelu,
  backwardUpwardPhase,
  backwardDownwardPhase,
  backwardMultiLevel,
  applyLevelGradients,
  computeGradientNorm,
  createExtendedCache,
  trainMultiLevelBatch,
  trainOnSingleExample, // Online learning for production
} from "./multi-level-trainer.ts";

// Multi-Level K-Head Training (K-head attention scoring)
export {
  type KHeadGradientAccumulators,
  type MultiLevelKHeadGradientAccumulators,
  type MultiLevelKHeadTrainingResult,
  type KHeadForwardContext,
  initMultiLevelKHeadGradients,
  resetMultiLevelKHeadGradients,
  computeKHeadScoreWithCache,
  computeMultiHeadKHeadScoresWithCache,
  backpropKHeadScore,
  backpropMultiHeadKHead,
  backpropWIntent,
  applyKHeadGradients,
  applyWIntentGradients,
  computeKHeadGradientNorm,
  trainMultiLevelKHeadBatch,
  trainOnSingleKHeadExample, // Online learning for K-head scoring
} from "./multi-level-trainer-khead.ts";
