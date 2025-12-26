/**
 * SHGAT Initialization Module
 *
 * Parameter initialization and management for SHGAT networks.
 *
 * @module graphrag/algorithms/shgat/initialization
 */

export {
  // Types
  type LayerParams,
  type HeadParams,
  type FusionMLPParams,
  type SHGATParams,
  type V2GradientAccumulators,
  // Tensor initialization
  initTensor3D,
  initMatrix,
  initVector,
  zerosLike2D,
  zerosLike3D,
  // Parameter initialization
  initializeParameters,
  initializeV2GradientAccumulators,
  resetV2GradientAccumulators,
  // Multi-level parameter initialization (v1 refactor)
  initializeLevelParameters,
  countLevelParameters,
  getLevelParams,
  // Level params serialization (v1 refactor)
  exportLevelParams,
  importLevelParams,
  // Adaptive configuration (v1 refactor)
  getAdaptiveHeadsByGraphSize,
  // Legacy serialization
  exportParams,
  importParams,
  // Statistics
  countParameters,
} from "./parameters.ts";
