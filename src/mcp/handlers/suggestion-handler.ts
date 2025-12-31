/**
 * Suggestion Handler (Thin)
 *
 * Thin handler that delegates to GetSuggestionUseCase.
 * Handles validation and response formatting only.
 *
 * @module mcp/handlers/suggestion-handler
 */

import {
  GetSuggestionUseCase,
  type GetSuggestionRequest,
  type GetSuggestionResult,
  type SuggestedDag,
} from "../../application/use-cases/capabilities/mod.ts";
import type { DRDSP } from "../../graphrag/algorithms/dr-dsp.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { CapabilityRegistry } from "../../capabilities/capability-registry.ts";
import type { IDecisionLogger } from "../../telemetry/decision-logger.ts";

// Re-export types for consumers
export type { GetSuggestionResult, SuggestedDag };
export type { SuggestedTask } from "../../application/use-cases/capabilities/mod.ts";

/**
 * Dependencies for suggestion handler
 */
export interface SuggestionDependencies {
  drdsp?: DRDSP;
  capabilityStore: CapabilityStore;
  graphEngine: GraphRAGEngine;
  capabilityRegistry?: CapabilityRegistry;
  decisionLogger?: IDecisionLogger;
}

/**
 * Best capability match from SHGAT
 */
export interface BestCapability {
  id: string;
  score: number;
}

/**
 * Get workflow suggestion (thin handler)
 *
 * Delegates to GetSuggestionUseCase and handles errors.
 *
 * @param deps - Handler dependencies
 * @param intent - Natural language intent
 * @param bestCapability - Best match from SHGAT
 * @param correlationId - Optional correlation ID
 * @returns Suggestion result
 */
export async function getSuggestion(
  deps: SuggestionDependencies,
  intent: string,
  bestCapability?: BestCapability,
  correlationId?: string,
): Promise<GetSuggestionResult> {
  // Build use case with dependencies
  const useCase = new GetSuggestionUseCase(
    deps.capabilityStore,
    deps.graphEngine,
    deps.drdsp,
    deps.capabilityRegistry,
    deps.decisionLogger,
  );

  // Build request
  const request: GetSuggestionRequest = {
    intent,
    bestCapability,
    correlationId,
  };

  // Execute use case
  const result = await useCase.execute(request);

  // Handle errors (return empty suggestion)
  if (!result.success || !result.data) {
    return { confidence: 0 };
  }

  return result.data;
}
