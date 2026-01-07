/**
 * Episodic Memory Module
 *
 * Provides episodic event storage and capture for DAG workflow execution.
 * Based on ADR-008: Episodic Memory & Adaptive Thresholds.
 *
 * @module dag/episodic
 */

// Types
export type {
  DecisionData,
  EpisodicEvent,
  EpisodicEventData,
  EpisodicEventInput,
  EpisodicEventType,
  EpisodicMemoryStats,
  PredictionData,
  ResultData,
  RetrieveOptions,
  StoredThreshold,
  ThresholdContext,
} from "./types.ts";

// Store
export { type EpisodicMemoryConfig, EpisodicMemoryStore } from "./store.ts";

// Capture functions
export {
  captureAILDecision,
  type CaptureContext,
  captureHILDecision,
  captureSpeculationStart,
  captureTaskComplete,
  getContextHash,
} from "./capture.ts";
