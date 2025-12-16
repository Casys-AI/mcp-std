/**
 * Prediction Module Types
 *
 * Type definitions for prediction operations including next-nodes,
 * capabilities, and alternatives.
 *
 * @module graphrag/prediction/types
 */

import type { Capability } from "../../capabilities/types.ts";

/**
 * Episode statistics for a tool
 */
export interface EpisodeStats {
  total: number;
  successes: number;
  failures: number;
  successRate: number;
  failureRate: number;
}

/**
 * Episode statistics map type
 */
export type EpisodeStatsMap = Map<string, EpisodeStats>;

/**
 * Edge data from graph
 */
export interface EdgeData {
  weight: number;
  count: number;
}

/**
 * Alpha result from local alpha calculation
 */
export interface AlphaResult {
  confidence: number;
  alpha: number;
  algorithm: string;
}

/**
 * Capability context match
 */
export interface CapabilityContextMatch {
  capability: Capability;
  overlapScore: number;
}

/**
 * Dangerous operations blacklist - never speculate on these (ADR-006)
 */
export const DANGEROUS_OPERATIONS = [
  "delete",
  "remove",
  "deploy",
  "payment",
  "send_email",
  "execute_shell",
  "drop",
  "truncate",
  "transfer",
  "admin",
] as const;

/**
 * Check if a tool is a dangerous operation (never speculate)
 *
 * @param toolId - Tool identifier to check
 * @returns true if tool is dangerous
 */
export function isDangerousOperation(toolId: string): boolean {
  const lowerToolId = toolId.toLowerCase();
  return DANGEROUS_OPERATIONS.some((op) => lowerToolId.includes(op));
}
