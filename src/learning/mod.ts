/**
 * Learning Module
 *
 * Provides episodic memory storage and adaptive threshold learning.
 * Based on ADR-008: Episodic Memory & Adaptive Thresholds.
 *
 * @module learning
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

// Episodic Memory Store
export { type EpisodicMemoryConfig, EpisodicMemoryStore } from "./episodic-memory-store.ts";
