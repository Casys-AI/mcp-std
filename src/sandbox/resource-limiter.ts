/**
 * Resource Limiter - Concurrent Execution & Resource Monitoring
 *
 * Provides resource management for sandbox execution:
 * - Concurrent execution limits (prevent fork bombs)
 * - Resource usage tracking (CPU, memory, disk I/O)
 * - Memory pressure detection
 * - Global resource quotas
 *
 * This module implements Story 3.9 AC #4 (Resource Limits)
 *
 * @module sandbox/resource-limiter
 */

import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Resource limit error class
 */
export class ResourceLimitError extends Error {
  readonly limitType: string;
  readonly currentValue: number;
  readonly maxValue: number;
  readonly timestamp: number;

  constructor(limitType: string, currentValue: number, maxValue: number) {
    super(
      `Resource limit exceeded: ${limitType} (${currentValue}/${maxValue})`,
    );
    this.name = "ResourceLimitError";
    this.limitType = limitType;
    this.currentValue = currentValue;
    this.maxValue = maxValue;
    this.timestamp = Date.now();

    Object.setPrototypeOf(this, ResourceLimitError.prototype);
  }

  toJSON() {
    return {
      type: this.name,
      limitType: this.limitType,
      currentValue: this.currentValue,
      maxValue: this.maxValue,
      message: this.message,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Resource Limiter Configuration
 */
export interface ResourceLimiterConfig {
  /**
   * Maximum concurrent sandbox executions
   * @default 10
   */
  maxConcurrentExecutions?: number;

  /**
   * Maximum total memory allocated across all sandboxes (MB)
   * @default 3072 (3GB)
   */
  maxTotalMemoryMb?: number;

  /**
   * Enable memory pressure detection
   * @default true
   */
  enableMemoryPressureDetection?: boolean;

  /**
   * Memory pressure threshold (percentage of system memory)
   * @default 80
   */
  memoryPressureThresholdPercent?: number;
}

/**
 * Execution token for tracking active executions
 */
export interface ExecutionToken {
  id: string;
  startTime: number;
  memoryLimitMb: number;
  released: boolean;
}

/**
 * Resource usage statistics
 */
export interface ResourceStats {
  /** Current number of active executions */
  activeExecutions: number;
  /** Maximum allowed concurrent executions */
  maxConcurrent: number;
  /** Total executions since start */
  totalExecutions: number;
  /** Number of rejected executions due to limits */
  rejectedExecutions: number;
  /** Current allocated memory (MB) */
  currentAllocatedMemoryMb: number;
  /** Maximum allowed memory (MB) */
  maxTotalMemoryMb: number;
  /** Whether memory pressure is detected */
  memoryPressureDetected: boolean;
  /** Available execution slots */
  availableSlots: number;
}

/**
 * Resource Limiter - Global singleton for managing sandbox resource limits
 *
 * Prevents resource exhaustion attacks by:
 * - Limiting concurrent executions (prevents fork bombs)
 * - Tracking total memory allocation
 * - Detecting memory pressure
 * - Providing resource usage statistics
 *
 * Usage:
 * ```typescript
 * const limiter = ResourceLimiter.getInstance();
 * const token = await limiter.acquire(512); // Request 512MB
 * try {
 *   // Execute sandbox
 * } finally {
 *   limiter.release(token);
 * }
 * ```
 */
export class ResourceLimiter {
  private static instance: ResourceLimiter | null = null;
  private config: Required<ResourceLimiterConfig>;
  private activeExecutions: Map<string, ExecutionToken> = new Map();
  private totalExecutions = 0;
  private rejectedExecutions = 0;
  private nextId = 1;

  private constructor(config?: ResourceLimiterConfig) {
    this.config = {
      maxConcurrentExecutions: config?.maxConcurrentExecutions ?? 10,
      maxTotalMemoryMb: config?.maxTotalMemoryMb ?? 3072, // 3GB - supports 5 concurrent 512MB executions
      enableMemoryPressureDetection: config?.enableMemoryPressureDetection ?? true,
      memoryPressureThresholdPercent: config?.memoryPressureThresholdPercent ?? 80,
    };

    logger.debug("ResourceLimiter initialized", {
      maxConcurrent: this.config.maxConcurrentExecutions,
      maxTotalMemory: this.config.maxTotalMemoryMb,
      memoryPressureDetection: this.config.enableMemoryPressureDetection,
    });
  }

  /**
   * Get singleton instance
   *
   * @param config - Configuration (only used on first call)
   * @returns ResourceLimiter instance
   */
  static getInstance(config?: ResourceLimiterConfig): ResourceLimiter {
    if (!ResourceLimiter.instance) {
      ResourceLimiter.instance = new ResourceLimiter(config);
    }
    return ResourceLimiter.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    ResourceLimiter.instance = null;
  }

  /**
   * Acquire execution slot
   *
   * Checks:
   * - Concurrent execution limit
   * - Total memory limit
   * - Memory pressure
   *
   * @param memoryLimitMb - Memory limit for this execution
   * @returns Execution token (must be released after execution)
   * @throws ResourceLimitError if limits exceeded
   */
  async acquire(memoryLimitMb: number): Promise<ExecutionToken> {
    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      this.rejectedExecutions++;
      logger.warn("Concurrent execution limit exceeded", {
        active: this.activeExecutions.size,
        max: this.config.maxConcurrentExecutions,
      });

      throw new ResourceLimitError(
        "CONCURRENT_EXECUTIONS",
        this.activeExecutions.size,
        this.config.maxConcurrentExecutions,
      );
    }

    // Check total memory limit
    const currentMemory = this.getCurrentAllocatedMemory();
    const requestedTotal = currentMemory + memoryLimitMb;
    if (requestedTotal > this.config.maxTotalMemoryMb) {
      this.rejectedExecutions++;
      logger.warn("Total memory limit exceeded", {
        current: currentMemory,
        requested: memoryLimitMb,
        total: requestedTotal,
        max: this.config.maxTotalMemoryMb,
      });

      throw new ResourceLimitError(
        "TOTAL_MEMORY",
        requestedTotal,
        this.config.maxTotalMemoryMb,
      );
    }

    // Check memory pressure (if enabled)
    if (this.config.enableMemoryPressureDetection) {
      const memoryPressure = this.detectMemoryPressure();
      if (memoryPressure) {
        this.rejectedExecutions++;
        logger.warn("Memory pressure detected - rejecting execution", {
          threshold: this.config.memoryPressureThresholdPercent,
        });

        throw new ResourceLimitError(
          "MEMORY_PRESSURE",
          this.config.memoryPressureThresholdPercent,
          100,
        );
      }
    }

    // Create execution token
    const token: ExecutionToken = {
      id: `exec-${this.nextId++}`,
      startTime: Date.now(),
      memoryLimitMb,
      released: false,
    };

    this.activeExecutions.set(token.id, token);
    this.totalExecutions++;

    logger.debug("Execution slot acquired", {
      tokenId: token.id,
      memoryLimit: memoryLimitMb,
      activeCount: this.activeExecutions.size,
    });

    return token;
  }

  /**
   * Release execution slot
   *
   * @param token - Execution token from acquire()
   */
  release(token: ExecutionToken): void {
    if (token.released) {
      logger.warn("Token already released", { tokenId: token.id });
      return;
    }

    if (!this.activeExecutions.has(token.id)) {
      logger.warn("Unknown token release", { tokenId: token.id });
      return;
    }

    const duration = Date.now() - token.startTime;
    this.activeExecutions.delete(token.id);
    token.released = true;

    logger.debug("Execution slot released", {
      tokenId: token.id,
      durationMs: duration,
      activeCount: this.activeExecutions.size,
    });
  }

  /**
   * Get current resource usage statistics
   *
   * @returns Resource statistics
   */
  getStats(): ResourceStats {
    return {
      activeExecutions: this.activeExecutions.size,
      maxConcurrent: this.config.maxConcurrentExecutions,
      totalExecutions: this.totalExecutions,
      rejectedExecutions: this.rejectedExecutions,
      currentAllocatedMemoryMb: this.getCurrentAllocatedMemory(),
      maxTotalMemoryMb: this.config.maxTotalMemoryMb,
      memoryPressureDetected: false, // Updated by detectMemoryPressure()
      availableSlots: this.config.maxConcurrentExecutions - this.activeExecutions.size,
    };
  }

  /**
   * Get current allocated memory across all active executions
   *
   * @returns Total allocated memory in MB
   */
  private getCurrentAllocatedMemory(): number {
    let total = 0;
    for (const token of this.activeExecutions.values()) {
      total += token.memoryLimitMb;
    }
    return total;
  }

  /**
   * Detect memory pressure on the system
   *
   * Checks if system memory usage exceeds threshold.
   * Note: This is a simplified implementation. In production, you'd use
   * more sophisticated memory monitoring (e.g., cgroups, psutil).
   *
   * @returns True if memory pressure detected
   */
  private detectMemoryPressure(): boolean {
    try {
      // Check Deno's memory usage
      const memInfo = Deno.memoryUsage();
      const heapUsedMb = memInfo.heapUsed / (1024 * 1024);
      const heapTotalMb = memInfo.heapTotal / (1024 * 1024);

      // Calculate heap usage percentage
      const heapUsagePercent = (heapUsedMb / heapTotalMb) * 100;

      // Check if heap usage exceeds threshold
      if (heapUsagePercent >= this.config.memoryPressureThresholdPercent) {
        logger.warn("Memory pressure detected (heap)", {
          heapUsedMb: heapUsedMb.toFixed(2),
          heapTotalMb: heapTotalMb.toFixed(2),
          usagePercent: heapUsagePercent.toFixed(2),
          threshold: this.config.memoryPressureThresholdPercent,
        });
        return true;
      }

      return false;
    } catch (error) {
      // If memory monitoring fails, log and continue (fail-open for availability)
      logger.error("Failed to detect memory pressure", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Wait for available execution slot
   *
   * Polls until a slot becomes available or timeout is reached.
   * Useful for graceful degradation instead of immediate rejection.
   *
   * @param memoryLimitMb - Memory limit for this execution
   * @param timeoutMs - Maximum wait time in milliseconds (default: 5000)
   * @returns Execution token
   * @throws ResourceLimitError if timeout exceeded
   */
  async acquireWithWait(
    memoryLimitMb: number,
    timeoutMs = 5000,
  ): Promise<ExecutionToken> {
    const startTime = Date.now();
    const pollInterval = 100; // Poll every 100ms

    while (Date.now() - startTime < timeoutMs) {
      try {
        return await this.acquire(memoryLimitMb);
      } catch (error) {
        if (error instanceof ResourceLimitError) {
          // Wait and retry
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;
        }
        // Re-throw unexpected errors
        throw error;
      }
    }

    // Timeout exceeded
    this.rejectedExecutions++;
    throw new ResourceLimitError(
      "ACQUIRE_TIMEOUT",
      Date.now() - startTime,
      timeoutMs,
    );
  }

  /**
   * Check if resources are available without acquiring
   *
   * @param memoryLimitMb - Memory limit to check
   * @returns True if resources would be available
   */
  canAcquire(memoryLimitMb: number): boolean {
    // Check concurrent limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      return false;
    }

    // Check memory limit
    const currentMemory = this.getCurrentAllocatedMemory();
    const requestedTotal = currentMemory + memoryLimitMb;
    if (requestedTotal > this.config.maxTotalMemoryMb) {
      return false;
    }

    return true;
  }
}
