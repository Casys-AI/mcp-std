/**
 * Episodic Memory Types
 *
 * Types for episodic memory storage and adaptive threshold learning.
 * Based on ADR-008: Episodic Memory & Adaptive Thresholds.
 *
 * @module learning/types
 */

/**
 * Event types captured by episodic memory
 */
export type EpisodicEventType =
  | "speculation_start"
  | "task_complete"
  | "ail_decision"
  | "hil_decision"
  | "workflow_start"
  | "workflow_complete";

/**
 * Prediction data captured during speculation
 */
export interface PredictionData {
  toolId: string;
  confidence: number;
  reasoning: string;
  wasCorrect?: boolean;
}

/**
 * Result data captured after task execution
 */
export interface ResultData {
  status: "success" | "error";
  output?: unknown;
  executionTimeMs?: number;
  errorMessage?: string;
}

/**
 * Decision data captured for AIL/HIL events
 */
export interface DecisionData {
  type: "ail" | "hil";
  action: string;
  reasoning: string;
  approved?: boolean;
}

/**
 * Episodic event data payload (flexible JSONB content)
 */
export interface EpisodicEventData {
  context?: Record<string, unknown>;
  contextHash?: string;
  prediction?: PredictionData;
  result?: ResultData;
  decision?: DecisionData;
  metadata?: Record<string, unknown>;
}

/**
 * Episodic event stored in database
 */
export interface EpisodicEvent {
  id: string;
  workflow_id: string;
  event_type: EpisodicEventType;
  task_id?: string;
  timestamp: number;
  context_hash?: string;
  data: EpisodicEventData;
}

/**
 * Input for creating a new episodic event (without id)
 */
export type EpisodicEventInput = Omit<EpisodicEvent, "id">;

/**
 * Options for retrieving relevant episodes
 */
export interface RetrieveOptions {
  /** Maximum number of events to return */
  limit?: number;
  /** Filter by specific event types */
  eventTypes?: EpisodicEventType[];
  /** Time range filter (events after this timestamp) */
  afterTimestamp?: number;
}

/**
 * Stored adaptive threshold record
 */
export interface StoredThreshold {
  contextHash: string;
  contextKeys: Record<string, unknown>;
  suggestionThreshold: number;
  explicitThreshold: number;
  successRate: number | null;
  sampleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Context for threshold lookup
 */
export interface ThresholdContext {
  workflowType?: string;
  domain?: string;
  complexity?: string;
  [key: string]: unknown;
}

/**
 * Episodic memory statistics
 */
export interface EpisodicMemoryStats {
  totalEvents: number;
  eventsByType: Record<EpisodicEventType, number>;
  oldestEventTimestamp: number | null;
  newestEventTimestamp: number | null;
  uniqueWorkflows: number;
}
