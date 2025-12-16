/**
 * Command Queue Implementation for Dynamic Workflow Control
 *
 * Implements a generic AsyncQueue with FIFO ordering and non-blocking processing.
 * Commands can be injected mid-execution and processed between DAG layers.
 *
 * @module dag/command-queue
 */

import type { Command } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const log = getLogger("command-queue");

/**
 * Generic async queue with FIFO ordering
 *
 * Promise-based queue that waits for items if empty.
 * ~50 LOC, zero external dependencies.
 *
 * @template T - Item type
 */
export class AsyncQueue<T> {
  private queue: T[] = [];
  private waiting: Array<(value: T) => void> = [];

  /**
   * Enqueue an item
   *
   * If there are waiting consumers, immediately fulfills their promise.
   * Otherwise, adds to queue for later consumption.
   *
   * @param item - Item to enqueue
   */
  enqueue(item: T): void {
    if (this.waiting.length > 0) {
      // Fulfill waiting consumer immediately
      const resolve = this.waiting.shift()!;
      resolve(item);
    } else {
      // Add to queue
      this.queue.push(item);
    }
  }

  /**
   * Dequeue an item
   *
   * Returns immediately if items available, otherwise waits for next enqueue.
   * FIFO ordering guaranteed.
   *
   * @returns Promise that resolves to next item
   */
  dequeue(): Promise<T> {
    if (this.queue.length > 0) {
      // Return immediately
      return Promise.resolve(this.queue.shift()!);
    } else {
      // Wait for next enqueue
      return new Promise<T>((resolve) => {
        this.waiting.push(resolve);
      });
    }
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Drain all items synchronously
   *
   * Returns all queued items immediately and clears the queue.
   * Does NOT wait for pending consumers - only returns already-queued items.
   *
   * @returns Array of all queued items (may be empty)
   */
  drainSync(): T[] {
    const items = [...this.queue];
    this.queue = [];
    return items;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.queue = [];
    // Reject waiting promises? Or leave them hanging?
    // For now, leave them - they'll be fulfilled by next enqueue
  }
}

/**
 * Type guard for command validation
 *
 * @param cmd - Unknown command
 * @returns True if valid Command type
 */
export function isValidCommand(cmd: unknown): cmd is Command {
  if (!cmd || typeof cmd !== "object") return false;

  const command = cmd as Record<string, unknown>;

  // Check type field exists
  if (!command.type || typeof command.type !== "string") return false;

  // Validate based on type
  switch (command.type) {
    case "continue":
      // reason is optional
      return true;

    case "abort":
      return typeof command.reason === "string";

    case "inject_tasks":
      return Array.isArray(command.tasks) &&
        typeof command.targetLayer === "number";

    case "replan_dag":
      // Story 2.5-3: Updated fields
      return typeof command.newRequirement === "string" &&
        typeof command.availableContext === "object";

    case "skip_layer":
      return typeof command.layerIndex === "number" &&
        typeof command.reason === "string";

    case "modify_args":
      return typeof command.taskId === "string" &&
        typeof command.updates === "object";

    case "checkpoint_response":
      return typeof command.checkpointId === "string" &&
        (command.decision === "continue" ||
          command.decision === "rollback" ||
          command.decision === "modify");

    case "approval_response":
      // Story 2.5-3: HIL approval response
      return typeof command.checkpointId === "string" &&
        typeof command.approved === "boolean";

    default:
      return false;
  }
}

/**
 * CommandQueue wrapper around AsyncQueue<Command>
 *
 * Features:
 * - FIFO ordering guaranteed
 * - Non-blocking command processing (<10ms P95)
 * - Type validation for safety
 * - Command injection latency tracking
 */
/**
 * Statistics for command queue operations
 */
export interface CommandQueueStats {
  totalCommands: number;
  processedCommands: number;
  rejectedCommands: number;
}

export class CommandQueue {
  private queue: AsyncQueue<Command>;
  private stats: CommandQueueStats = {
    totalCommands: 0,
    processedCommands: 0,
    rejectedCommands: 0,
  };

  constructor() {
    this.queue = new AsyncQueue<Command>();
  }

  /**
   * Enqueue a command
   *
   * Validates command before enqueuing.
   *
   * @param command - Command to enqueue
   * @throws Error if invalid command
   */
  enqueue(command: Command): void {
    if (!isValidCommand(command)) {
      this.stats.rejectedCommands++;
      throw new Error(
        `Invalid command type: ${JSON.stringify(command)}`,
      );
    }

    this.queue.enqueue(command);
    this.stats.totalCommands++;

    log.debug(`Command enqueued: ${command.type}`);
  }

  /**
   * Process all pending commands (non-blocking, synchronous)
   *
   * Drains queue and returns all commands immediately.
   * If queue empty, returns empty array.
   *
   * @returns Array of pending commands (may be empty)
   */
  processCommands(): Command[] {
    // Use drainSync() to avoid race condition (BUG-001 fix)
    // Previous implementation used Promise.resolve().then() which
    // returned before callbacks executed (microtask queue timing)
    const commands = this.queue.drainSync();

    this.stats.processedCommands += commands.length;

    if (commands.length > 0) {
      log.info(`Processed ${commands.length} commands`);
    }

    return commands;
  }

  /**
   * Process all pending commands asynchronously
   *
   * Processes all currently queued commands.
   * Non-blocking - drains queue immediately.
   *
   * @returns Promise of command array
   */
  async processCommandsAsync(): Promise<Command[]> {
    const commands: Command[] = [];

    // Drain queue
    while (!this.queue.isEmpty()) {
      const cmd = await this.queue.dequeue();
      commands.push(cmd);
    }

    this.stats.processedCommands += commands.length;

    if (commands.length > 0) {
      log.info(`Processed ${commands.length} commands`);
    }

    return commands;
  }

  /**
   * Process commands filtered by type
   *
   * Only dequeues and returns commands matching the provided types.
   * Other commands remain in the queue.
   *
   * @param types - Array of command types to process (e.g., ["abort", "pause"])
   * @returns Promise of matching commands
   */
  async processCommandsByType(types: string[]): Promise<Command[]> {
    const matching: Command[] = [];
    const remaining: Command[] = [];

    // Drain entire queue temporarily
    while (!this.queue.isEmpty()) {
      const cmd = await this.queue.dequeue();
      if (types.includes(cmd.type)) {
        matching.push(cmd);
      } else {
        remaining.push(cmd);
      }
    }

    // Re-enqueue non-matching commands (preserves FIFO order)
    for (const cmd of remaining) {
      this.queue.enqueue(cmd);
    }

    this.stats.processedCommands += matching.length;

    if (matching.length > 0) {
      log.info(`Processed ${matching.length} commands of types: ${types.join(", ")}`);
    }

    return matching;
  }

  /**
   * Check if queue has pending commands
   */
  hasPending(): boolean {
    return !this.queue.isEmpty();
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.size();
  }

  /**
   * Clear all pending commands
   */
  clear(): void {
    this.queue.clear();
  }

  /**
   * Get queue statistics
   */
  getStats(): CommandQueueStats {
    return { ...this.stats };
  }

  /**
   * Wait for a command with timeout (non-polling)
   *
   * Uses proper Promise-based waiting instead of CPU-burning polling.
   * Returns immediately if a command is already queued.
   *
   * @param timeout - Timeout in milliseconds
   * @returns Promise of command or null on timeout
   */
  async waitForCommand(timeout: number): Promise<Command | null> {
    // Create a timeout promise
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeout);
    });

    // Race between command arrival and timeout
    const result = await Promise.race([
      this.queue.dequeue(),
      timeoutPromise,
    ]);

    if (result !== null) {
      this.stats.processedCommands++;
      log.debug(`Command received: ${result.type}`);
    }

    return result;
  }
}
