/**
 * DAGSuggester Adapter
 *
 * Wraps the DAGSuggester class to implement the IDAGSuggester interface.
 * Maps between the DI interface and the actual implementation.
 *
 * Phase 3.2: DI Container Expansion
 *
 * @module infrastructure/di/adapters/dag-suggester-adapter
 */

import { DAGSuggester as DAGSuggesterToken } from "../container.ts";
import {
  DAGSuggester as DAGSuggesterImpl,
} from "../../../graphrag/dag-suggester.ts";
import type { GraphRAGEngine } from "../../../graphrag/graph-engine.ts";
import type { VectorSearch } from "../../../vector/search.ts";
import type { CapabilityMatcher } from "../../../capabilities/matcher.ts";
import type { CapabilityStore } from "../../../capabilities/capability-store.ts";
import type { SuggestionResult } from "../../../domain/interfaces/dag-suggester.ts";
import type { WorkflowIntent } from "../../../graphrag/types.ts";

/**
 * Adapter that wraps DAGSuggester for DI registration.
 *
 * Maps the IDAGSuggester interface to the actual DAGSuggester implementation.
 * The main difference is:
 * - IDAGSuggester.suggest(intent: string, correlationId?) -> SuggestionResult
 * - DAGSuggester.suggestDAG(intent: WorkflowIntent) -> SuggestedDAG | null
 */
export class DAGSuggesterAdapter extends DAGSuggesterToken {
  private readonly suggester: DAGSuggesterImpl;

  constructor(
    graphEngine: GraphRAGEngine,
    vectorSearch: VectorSearch,
    capabilityMatcher?: CapabilityMatcher,
    capabilityStore?: CapabilityStore,
  ) {
    super();
    this.suggester = new DAGSuggesterImpl(
      graphEngine,
      vectorSearch,
      capabilityMatcher,
      capabilityStore,
    );
  }

  /**
   * Suggest DAG from natural language intent
   *
   * Maps the string intent to WorkflowIntent and converts the result.
   */
  suggest = async (intent: string, _correlationId?: string): Promise<SuggestionResult> => {
    const workflowIntent: WorkflowIntent = {
      text: intent,
      toolsConsidered: [],
    };

    const suggestedDag = await this.suggester.suggestDAG(workflowIntent);

    if (!suggestedDag) {
      return {
        confidence: 0,
        suggestedDag: undefined,
        bestMatch: undefined,
        canSpeculate: false,
      };
    }

    // Map SuggestedDAG (with dagStructure) to interface format (with tasks)
    const dagStructure = suggestedDag.dagStructure;
    const tasks = dagStructure.tasks.map((task) => ({
      id: task.id,
      callName: task.tool,
      type: "tool" as const,
      inputSchema: task.arguments, // Task uses 'arguments' not 'inputSchema'
      dependsOn: task.dependsOn,
    }));

    // Get confidence from the suggested DAG
    const confidence = suggestedDag.confidence;

    return {
      suggestedDag: { tasks },
      confidence,
      bestMatch: undefined, // SuggestedDAG doesn't have bestMatch
      canSpeculate: confidence >= 0.7,
    };
  };

  /** Access underlying suggester for methods not in interface */
  get underlying(): DAGSuggesterImpl {
    return this.suggester;
  }

  // Configuration delegation
  async initScoringConfig(configPath?: string): Promise<void> {
    return this.suggester.initScoringConfig(configPath);
  }

  setCapabilityStore(store: CapabilityStore): void {
    this.suggester.setCapabilityStore(store);
  }
}
