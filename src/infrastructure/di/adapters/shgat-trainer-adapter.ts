/**
 * SHGATTrainer Adapter
 *
 * Wraps the SHGAT class to implement the ISHGATTrainer interface.
 * Provides SHGAT training capabilities through DI.
 *
 * Phase 3.2: DI Container Expansion
 *
 * @module infrastructure/di/adapters/shgat-trainer-adapter
 */

import { SHGATTrainer as SHGATTrainerToken } from "../container.ts";
import { SHGAT, type SHGATConfig, type TrainingExample } from "../../../graphrag/algorithms/shgat.ts";
import type {
  CapabilityScore,
  SHGATTrainingConfig,
  SHGATTrainingResult,
  TrainFromTracesInput,
} from "../../../domain/interfaces/shgat-trainer.ts";

/**
 * Adapter that wraps SHGAT for DI registration.
 *
 * Maps the ISHGATTrainer interface to the actual SHGAT implementation.
 */
export class SHGATTrainerAdapter extends SHGATTrainerToken {
  private readonly shgat: SHGAT;
  private traceAccumulator: TrainFromTracesInput[] = [];
  private minTracesForTraining = 10;
  private isTraining = false;

  constructor(config?: Partial<SHGATConfig>) {
    super();
    this.shgat = new SHGAT(config);
  }

  /**
   * Check if training should be triggered
   */
  shouldTrain = (): boolean => {
    return !this.isTraining && this.traceAccumulator.length >= this.minTracesForTraining;
  };

  /**
   * Train SHGAT from execution traces
   */
  train = async (
    input: TrainFromTracesInput,
    config?: SHGATTrainingConfig,
  ): Promise<SHGATTrainingResult> => {
    // Accumulate traces
    this.traceAccumulator.push(input);

    const minTraces = config?.minTraces ?? this.minTracesForTraining;
    if (this.traceAccumulator.length < minTraces) {
      return {
        trained: false,
        tracesProcessed: 0,
        examplesGenerated: 0,
        loss: 0,
        prioritiesUpdated: 0,
      };
    }

    // Lock training
    this.isTraining = true;

    try {
      const maxTraces = config?.maxTraces ?? 100;
      const tracesToProcess = this.traceAccumulator.slice(0, maxTraces);
      this.traceAccumulator = this.traceAccumulator.slice(maxTraces);

      // Convert traces to training examples
      const examples = this.convertTracesToExamples(tracesToProcess);
      if (examples.length === 0) {
        return {
          trained: false,
          tracesProcessed: tracesToProcess.length,
          examplesGenerated: 0,
          loss: 0,
          prioritiesUpdated: 0,
        };
      }

      // Run batch training
      const batchSize = config?.batchSize ?? 32;
      const epochs = config?.epochs ?? 1;

      let totalLoss = 0;
      let totalTdErrors: number[] = [];

      for (let epoch = 0; epoch < epochs; epoch++) {
        for (let i = 0; i < examples.length; i += batchSize) {
          const batch = examples.slice(i, i + batchSize);
          const result = this.shgat.trainBatch(batch);
          totalLoss += result.loss;
          totalTdErrors = totalTdErrors.concat(result.tdErrors);
        }
      }

      return {
        trained: true,
        tracesProcessed: tracesToProcess.length,
        examplesGenerated: examples.length,
        loss: totalLoss / epochs,
        prioritiesUpdated: totalTdErrors.filter((e) => Math.abs(e) > 0.1).length,
      };
    } finally {
      this.isTraining = false;
    }
  };

  /**
   * Record tool outcome for Thompson Sampling (optional)
   * Not directly supported by SHGAT public API.
   */
  recordToolOutcome = (_toolId: string, _success: boolean): void => {
    // SHGAT doesn't expose public API for individual tool outcome recording
    // This would be tracked externally or via a separate Thompson Sampling service
  };

  /**
   * Register a capability in the SHGAT graph (optional)
   * Uses SHGAT's public registerCapability method.
   */
  registerCapability = async (
    capabilityId: string,
    embedding: number[],
    toolsUsed: string[],
  ): Promise<void> => {
    // Convert string[] to Member[]
    const members = toolsUsed.map((id) => ({ type: "tool" as const, id }));

    // Use SHGAT's public API for registration
    this.shgat.registerCapability({
      id: capabilityId,
      embedding,
      members,
      hierarchyLevel: 0, // Will be recomputed by SHGAT
      successRate: 0.5,
    });

    // Register associated tools
    for (const toolId of toolsUsed) {
      if (!this.shgat.hasToolNode(toolId)) {
        this.shgat.registerTool({
          id: toolId, // ToolNode uses 'id' not 'toolId'
          embedding: [], // Will be computed
        });
      }
    }
  };

  /**
   * Score all capabilities for an intent using K-head attention
   *
   * Delegates to SHGAT.scoreAllCapabilities() and converts to CapabilityScore[].
   */
  scoreCapabilities = (intentEmbedding: number[]): CapabilityScore[] => {
    const results = this.shgat.scoreAllCapabilities(intentEmbedding);

    return results.map((r) => ({
      capabilityId: r.capabilityId,
      score: r.score,
      headScores: r.headScores,
      headWeights: r.headWeights,
    }));
  };

  /** Access underlying SHGAT instance */
  get underlying(): SHGAT {
    return this.shgat;
  }

  /**
   * Convert execution traces to training examples
   */
  private convertTracesToExamples(traces: TrainFromTracesInput[]): TrainingExample[] {
    const examples: TrainingExample[] = [];

    for (const trace of traces) {
      if (!trace.intentEmbedding || !trace.capabilityId) {
        continue;
      }

      // Extract tool IDs from traces
      const toolIds = trace.traces
        .filter((t) => t.type === "tool_end" && t.tool)
        .map((t) => t.tool!)
        .filter((t, i, arr) => arr.indexOf(t) === i);

      examples.push({
        intentEmbedding: trace.intentEmbedding,
        candidateId: trace.capabilityId,
        outcome: trace.success ? 1 : 0,
        contextTools: toolIds,
      });
    }

    return examples;
  }
}
