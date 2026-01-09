/**
 * SHGAT Training Subscriber
 *
 * Subscribes to capability.shgat.registered events (emitted AFTER SHGAT registration)
 * and triggers SHGAT training. Fetches cached embeddings from KV.
 *
 * Phase 3.2: Event-driven training architecture
 *
 * @module telemetry/subscribers/training-subscriber
 */

import type { CapabilitySHGATRegisteredPayload, EventHandler } from "../../events/types.ts";
import { eventBus } from "../../events/mod.ts";
import { getLogger } from "../logger.ts";

const logger = getLogger("default");

// ============================================================================
// Interfaces
// ============================================================================

/**
 * SHGAT trainer interface
 */
export interface ISHGATTrainer {
  shouldTrain(): boolean;
  train(
    input: {
      traces: Array<{ type: string; tool?: string; success?: boolean }>;
      intentEmbedding?: number[];
      success: boolean;
      executionTimeMs: number;
      capabilityId?: string;
    },
    config?: {
      minTraces?: number;
      maxTraces?: number;
    },
  ): Promise<{
    trained: boolean;
    tracesProcessed: number;
    examplesGenerated: number;
    loss: number;
  }>;
}

/**
 * Embedding cache interface (Deno.Kv compatible)
 */
export interface IEmbeddingCache {
  get<T>(key: string[]): Promise<{ value: T | null; versionstamp: string | null }>;
  delete(key: string[]): Promise<void>;
}

/**
 * Dependencies for TrainingSubscriber
 */
export interface TrainingSubscriberDeps {
  trainer: ISHGATTrainer;
  embeddingCache: IEmbeddingCache;
}

// ============================================================================
// Subscriber Implementation
// ============================================================================

/**
 * SHGAT Training Subscriber
 *
 * Listens to capability.learned events and triggers background training.
 * Uses KV cache to fetch pre-computed embeddings.
 */
export class TrainingSubscriber {
  private unsubscribe: (() => void) | null = null;
  private pendingTraining: Promise<void> | null = null;
  private trainedCount = 0;
  private skippedCount = 0;

  constructor(private readonly deps: TrainingSubscriberDeps) {}

  /**
   * Start subscribing to capability.shgat.registered events
   * This event fires AFTER GraphSyncController registers the capability in SHGAT
   */
  start(): void {
    const handler: EventHandler<"capability.shgat.registered"> = (event) => {
      logger.info("[TrainingSubscriber] Handler called!", { eventType: event.type });
      const payload = event.payload as CapabilitySHGATRegisteredPayload;
      // Fire and forget - don't block event processing
      this.handleCapabilityRegistered(payload).catch((err) => {
        logger.warn("[TrainingSubscriber] Training error", { error: String(err) });
      });
    };

    this.unsubscribe = eventBus.on("capability.shgat.registered", handler);
    logger.info("[TrainingSubscriber] Started listening for capability.shgat.registered events");
    logger.info("[TrainingSubscriber] Handler count:", { count: eventBus.getHandlerCount("capability.shgat.registered") });
  }

  /**
   * Stop subscribing and wait for pending training
   */
  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Wait for any pending training to complete
    if (this.pendingTraining) {
      await this.pendingTraining;
    }

    logger.info("[TrainingSubscriber] Stopped", {
      trained: this.trainedCount,
      skipped: this.skippedCount,
    });
  }

  /**
   * Get training statistics
   */
  getStats(): { trained: number; skipped: number } {
    return {
      trained: this.trainedCount,
      skipped: this.skippedCount,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async handleCapabilityRegistered(payload: CapabilitySHGATRegisteredPayload): Promise<void> {
    const { capabilityId, toolIds } = payload;

    logger.debug("[TrainingSubscriber] Received capability.shgat.registered", { capabilityId, toolCount: toolIds.length });

    // Check if we should train
    if (!this.deps.trainer.shouldTrain()) {
      logger.debug("[TrainingSubscriber] Training locked, skipping", { capabilityId });
      this.skippedCount++;
      return;
    }

    // Fetch embedding from cache (keyed by capabilityId)
    const embeddingKey = ["pml", "embedding", "cap", capabilityId];
    const cached = await this.deps.embeddingCache.get<number[]>(embeddingKey);

    if (!cached.value) {
      logger.debug("[TrainingSubscriber] Embedding not in cache, skipping", { capabilityId });
      this.skippedCount++;
      return;
    }

    const intentEmbedding = cached.value;

    // Build traces from toolIds
    const traces = toolIds.map((tool) => ({
      type: "tool_call",
      tool,
      success: true,
    }));

    // Train SHGAT
    logger.debug("[TrainingSubscriber] Starting SHGAT training", {
      capabilityId,
      toolsCount: toolIds.length,
    });

    this.pendingTraining = this.trainAsync(
      traces,
      intentEmbedding,
      capabilityId,
      embeddingKey,
    );

    await this.pendingTraining;
    this.pendingTraining = null;
  }

  private async trainAsync(
    traces: Array<{ type: string; tool?: string; success?: boolean }>,
    intentEmbedding: number[],
    capabilityId: string,
    embeddingKey: string[],
  ): Promise<void> {
    try {
      const result = await this.deps.trainer.train(
        {
          traces,
          intentEmbedding,
          success: true,
          executionTimeMs: 0, // Not needed for SHGAT training
          capabilityId,
        },
        {
          minTraces: 1,
          maxTraces: 100,
        },
      );

      if (result.trained) {
        this.trainedCount++;
        logger.info("[TrainingSubscriber] SHGAT training completed", {
          capabilityId,
          loss: result.loss.toFixed(4),
          tracesProcessed: result.tracesProcessed,
        });
      } else {
        this.skippedCount++;
        logger.debug("[TrainingSubscriber] Training skipped by trainer", { capabilityId });
      }

      // Cleanup: delete embedding from cache after training
      await this.deps.embeddingCache.delete(embeddingKey);
    } catch (err) {
      logger.warn("[TrainingSubscriber] Training failed", {
        capabilityId,
        error: String(err),
      });
      this.skippedCount++;
    }
  }
}
