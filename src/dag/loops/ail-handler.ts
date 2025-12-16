/**
 * AIL (Agent-in-the-Loop) Handler Module
 *
 * Handles AI agent decision points during workflow execution.
 * Supports continue, abort, and replan_dag commands.
 *
 * @module dag/loops/ail-handler
 */

import type { ExecutorConfig } from "../types.ts";
// Logger removed - not used in current implementation

/**
 * Check if AIL decision point should be triggered (Story 2.5-3)
 *
 * @param config - Executor configuration
 * @param _layerIdx - Current layer index (unused, reserved for future)
 * @param hasErrors - Whether current layer had errors
 * @returns true if decision point should trigger
 */
export function shouldTriggerAIL(
  config: ExecutorConfig,
  _layerIdx: number,
  hasErrors: boolean,
): boolean {
  if (!config.ail?.enabled) return false;

  const mode = config.ail.decision_points;
  if (mode === "per_layer") return true;
  if (mode === "on_error") return hasErrors;
  if (mode === "manual") return false; // Only trigger via explicit command

  return false;
}

/**
 * Maximum number of replans per workflow
 */
export const MAX_REPLANS = 3;
