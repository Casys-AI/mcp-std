/**
 * Speculative Executor
 *
 * Executes predicted tasks speculatively in isolated sandbox environments.
 * Caches results for instant retrieval when predictions are correct.
 *
 * Story 3.5-1: DAG Suggester & Speculative Execution
 * Story 3.5-2: Confidence-Based Speculation & Rollback
 *
 * Features:
 * - Parallel speculative execution of predicted tools
 * - Sandbox isolation (no side effects on incorrect predictions)
 * - Result caching with confidence metadata
 * - Cache hit/miss tracking
 * - AbortController-based timeout handling (Story 3.5-2)
 *
 * @module speculation/speculative-executor
 */

import * as log from "@std/log";
import { DenoSandboxExecutor } from "../sandbox/executor.ts";
import type { PredictedNode, SpeculationCache } from "../graphrag/types.ts";
import type { SpeculationManager, SpeculationOutcome } from "./speculation-manager.ts";

/**
 * Configuration for SpeculativeExecutor
 */
export interface SpeculativeExecutorConfig {
  timeout: number;
  memoryLimit: number;
  maxConcurrent: number;
  cacheCleanupIntervalMs: number;
  cacheTtlMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SpeculativeExecutorConfig = {
  timeout: 30000, // 30s per speculation
  memoryLimit: 256, // 256MB per sandbox (lighter than default)
  maxConcurrent: 3, // Max 3 concurrent speculations
  cacheCleanupIntervalMs: 60000, // Cleanup every minute
  cacheTtlMs: 300000, // 5 minute cache TTL
};

/**
 * Speculative Executor
 *
 * Manages speculative execution of predicted tools in isolated sandboxes.
 * Results are cached and can be retrieved when predictions match actual requests.
 */
export class SpeculativeExecutor {
  private config: SpeculativeExecutorConfig;
  private speculationCache: Map<string, SpeculationCache> = new Map();
  private activeSpeculations: Map<string, Promise<void>> = new Map();
  private activeAbortControllers: Map<string, AbortController> = new Map();
  private sandbox: DenoSandboxExecutor;
  private speculationManager: SpeculationManager | null = null;
  private cleanupIntervalId: number | null = null;

  constructor(config?: Partial<SpeculativeExecutorConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Initialize sandbox with lighter configuration for speculation
    this.sandbox = new DenoSandboxExecutor({
      timeout: this.config.timeout,
      memoryLimit: this.config.memoryLimit,
      cacheConfig: {
        enabled: false, // Speculation has its own cache
      },
    });

    // Start cache cleanup timer
    this.startCacheCleanup();
  }

  /**
   * Set SpeculationManager for outcome feedback
   */
  setSpeculationManager(manager: SpeculationManager): void {
    this.speculationManager = manager;
  }

  /**
   * Start speculative execution for predicted nodes (AC #5)
   *
   * Executes predictions in parallel sandboxes. Non-blocking.
   * Results are cached for later retrieval.
   *
   * @param predictions - Predicted nodes to execute speculatively
   * @param executionContext - Context to inject into sandbox
   * @returns Promise resolving when all speculations are started (not completed)
   */
  async startSpeculations(
    predictions: PredictedNode[],
    executionContext: Record<string, unknown>,
  ): Promise<void> {
    // Filter to max concurrent limit
    const toExecute = predictions.slice(0, this.config.maxConcurrent);

    if (toExecute.length === 0) {
      log.debug("[SpeculativeExecutor] No predictions to execute");
      return;
    }

    log.info(
      `[SpeculativeExecutor] Starting ${toExecute.length} speculative executions`,
    );

    // Start all speculations in parallel (fire-and-forget)
    for (const prediction of toExecute) {
      // Skip if already speculating for this tool
      if (this.activeSpeculations.has(prediction.toolId)) {
        log.debug(
          `[SpeculativeExecutor] Already speculating for ${prediction.toolId}`,
        );
        continue;
      }

      // Start speculation
      const speculationPromise = this.executeSpeculation(prediction, executionContext);
      this.activeSpeculations.set(prediction.toolId, speculationPromise);

      // Clean up when done
      speculationPromise.finally(() => {
        this.activeSpeculations.delete(prediction.toolId);
      });
    }
  }

  /**
   * Execute a single speculation in sandbox with AbortController timeout
   *
   * Story 3.5-2: Uses AbortController for clean timeout termination
   *
   * @param prediction - Predicted node
   * @param context - Execution context
   */
  private async executeSpeculation(
    prediction: PredictedNode,
    context: Record<string, unknown>,
  ): Promise<void> {
    const startTime = performance.now();
    const predictionId = `spec_${Date.now()}_${prediction.toolId}`;

    // Create AbortController for timeout handling (Story 3.5-2)
    const abortController = new AbortController();
    this.activeAbortControllers.set(prediction.toolId, abortController);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
      log.warn(
        `[SpeculativeExecutor] Speculation timeout for ${prediction.toolId} after ${this.config.timeout}ms`,
      );
    }, this.config.timeout);

    log.debug(
      `[SpeculativeExecutor] Executing speculation: ${prediction.toolId} (confidence: ${
        prediction.confidence.toFixed(2)
      }, timeout: ${this.config.timeout}ms)`,
    );

    try {
      // Check if already aborted
      if (abortController.signal.aborted) {
        log.debug(`[SpeculativeExecutor] Speculation aborted before start: ${prediction.toolId}`);
        return;
      }

      // Build speculation code
      // For MCP tools, we generate a mock execution
      // Real MCP execution would require tool-specific code generation
      const speculationCode = this.generateSpeculationCode(prediction, context);

      // Execute in sandbox with abort signal
      // Wrap in a race between execution and abort signal
      const result = await Promise.race([
        this.sandbox.execute(speculationCode, context),
        new Promise<never>((_, reject) => {
          abortController.signal.addEventListener("abort", () => {
            reject(new Error("Speculation aborted due to timeout"));
          });
        }),
      ]);

      const executionTimeMs = performance.now() - startTime;

      if (result.success) {
        // Cache successful result
        this.speculationCache.set(prediction.toolId, {
          predictionId: predictionId,
          toolId: prediction.toolId,
          result: result.result ?? null,
          confidence: prediction.confidence,
          timestamp: Date.now(),
          executionTimeMs,
        });

        log.info(
          `[SpeculativeExecutor] Cached speculation result: ${prediction.toolId} (${
            executionTimeMs.toFixed(1)
          }ms)`,
        );
      } else {
        log.debug(
          `[SpeculativeExecutor] Speculation failed for ${prediction.toolId}: ${result.error?.message}`,
        );
      }
    } catch (error) {
      // Check if this was an abort error
      if (
        abortController.signal.aborted ||
        (error instanceof Error && error.message.includes("aborted"))
      ) {
        log.debug(
          `[SpeculativeExecutor] Speculation aborted for ${prediction.toolId} (timeout reached)`,
        );
      } else {
        log.error(
          `[SpeculativeExecutor] Speculation error for ${prediction.toolId}: ${error}`,
        );
      }
    } finally {
      // Clean up
      clearTimeout(timeoutId);
      this.activeAbortControllers.delete(prediction.toolId);
    }
  }

  /**
   * Generate code for speculation execution
   *
   * For now, generates a placeholder that returns tool metadata.
   * In production, this would generate tool-specific execution code.
   *
   * @param prediction - Predicted node
   * @param context - Execution context
   * @returns TypeScript code to execute
   */
  private generateSpeculationCode(
    prediction: PredictedNode,
    _context: Record<string, unknown>,
  ): string {
    // Generate code that prepares tool execution
    // The actual execution would happen when the agent confirms the prediction
    return `
      // Speculative preparation for tool: ${prediction.toolId}
      // Confidence: ${prediction.confidence}
      // Source: ${prediction.source}

      const preparation = {
        toolId: "${prediction.toolId}",
        confidence: ${prediction.confidence},
        prepared: true,
        timestamp: Date.now(),
        reasoning: "${prediction.reasoning.replace(/"/g, '\\"')}",
      };

      return preparation;
    `;
  }

  /**
   * Check speculation cache for a tool (AC #5)
   *
   * Returns cached result if available and not expired.
   *
   * @param toolId - Tool to check
   * @returns Cached result or null
   */
  checkCache(toolId: string): SpeculationCache | null {
    const cached = this.speculationCache.get(toolId);

    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() - cached.timestamp > this.config.cacheTtlMs) {
      this.speculationCache.delete(toolId);
      log.debug(`[SpeculativeExecutor] Cache expired for ${toolId}`);
      return null;
    }

    log.info(
      `[SpeculativeExecutor] Cache HIT for ${toolId} (confidence: ${cached.confidence.toFixed(2)})`,
    );

    return cached;
  }

  /**
   * Validate speculation result against actual request (AC #5)
   *
   * Called when agent actually requests a tool. Records outcome
   * and either returns cached result (HIT) or signals cache miss.
   *
   * @param toolId - Actual tool requested
   * @param fromToolId - Previous tool (for pattern reinforcement)
   * @returns Cached result if prediction was correct, null otherwise
   */
  async validateAndConsume(
    toolId: string,
    fromToolId?: string,
  ): Promise<SpeculationCache | null> {
    const cached = this.checkCache(toolId);

    if (cached) {
      // HIT: Prediction was correct
      log.info(
        `[SpeculativeExecutor] SPECULATION HIT: ${toolId} (saved ${
          cached.executionTimeMs.toFixed(1)
        }ms)`,
      );

      // Remove from cache (consumed)
      this.speculationCache.delete(toolId);

      // Record outcome for learning
      if (this.speculationManager) {
        const outcome: SpeculationOutcome = {
          predictionId: cached.predictionId,
          toolId: cached.toolId,
          wasCorrect: true,
          executionTimeMs: cached.executionTimeMs,
          confidence: cached.confidence,
        };
        await this.speculationManager.recordOutcome(outcome, fromToolId);
      }

      return cached;
    }

    // MISS: Check if we had a different speculation
    for (const [speculatedToolId, speculatedCache] of this.speculationCache) {
      // Record miss for this incorrect speculation
      if (this.speculationManager) {
        const outcome: SpeculationOutcome = {
          predictionId: speculatedCache.predictionId,
          toolId: speculatedCache.toolId,
          wasCorrect: false,
          executionTimeMs: speculatedCache.executionTimeMs,
          confidence: speculatedCache.confidence,
        };
        await this.speculationManager.recordOutcome(outcome, fromToolId);
      }

      log.debug(
        `[SpeculativeExecutor] SPECULATION MISS: predicted ${speculatedToolId}, actual ${toolId}`,
      );
    }

    // Clear all speculations (they were wrong)
    this.speculationCache.clear();

    return null;
  }

  /**
   * Discard all cached speculations (AC #5)
   *
   * Called when predictions are known to be incorrect.
   * No side effects since all execution happened in sandbox.
   */
  discardCache(): void {
    const count = this.speculationCache.size;
    this.speculationCache.clear();
    log.debug(`[SpeculativeExecutor] Discarded ${count} speculation cache entries`);
  }

  /**
   * Get current cache entries (for debugging)
   */
  getCacheEntries(): SpeculationCache[] {
    return Array.from(this.speculationCache.values());
  }

  /**
   * Get number of active speculations
   */
  getActiveCount(): number {
    return this.activeSpeculations.size;
  }

  /**
   * Start periodic cache cleanup
   */
  private startCacheCleanup(): void {
    this.cleanupIntervalId = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [toolId, cached] of this.speculationCache) {
        if (now - cached.timestamp > this.config.cacheTtlMs) {
          this.speculationCache.delete(toolId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        log.debug(`[SpeculativeExecutor] Cleaned ${cleaned} expired cache entries`);
      }
    }, this.config.cacheCleanupIntervalMs);
  }

  /**
   * Stop cache cleanup timer (for cleanup)
   */
  stopCleanup(): void {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Abort active speculation by tool ID (Story 3.5-2)
   *
   * @param toolId - Tool ID to abort
   * @returns true if speculation was aborted, false if not found
   */
  abortSpeculation(toolId: string): boolean {
    const controller = this.activeAbortControllers.get(toolId);
    if (controller) {
      controller.abort();
      log.debug(`[SpeculativeExecutor] Manually aborted speculation for ${toolId}`);
      return true;
    }
    return false;
  }

  /**
   * Abort all active speculations (Story 3.5-2)
   *
   * Clean termination of all active speculations.
   *
   * @returns Number of speculations aborted
   */
  abortAllSpeculations(): number {
    let aborted = 0;
    for (const [toolId, controller] of this.activeAbortControllers) {
      controller.abort();
      log.debug(`[SpeculativeExecutor] Aborted speculation for ${toolId}`);
      aborted++;
    }
    this.activeAbortControllers.clear();
    return aborted;
  }

  /**
   * Update timeout configuration (Story 3.5-2)
   *
   * @param timeout - New timeout in milliseconds
   */
  updateTimeout(timeout: number): void {
    if (timeout > 0) {
      this.config.timeout = timeout;
      log.debug(`[SpeculativeExecutor] Timeout updated to ${timeout}ms`);
    }
  }

  /**
   * Get current configuration (Story 3.5-2)
   */
  getConfig(): SpeculativeExecutorConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Abort all active speculations first
    this.abortAllSpeculations();
    this.stopCleanup();
    this.speculationCache.clear();
    this.activeSpeculations.clear();
  }
}
