/**
 * SSE Streaming for Progressive DAG Results
 *
 * Provides Server-Sent Events (SSE) streaming for real-time workflow execution feedback.
 * Results are streamed as tasks complete instead of waiting for all tasks to finish.
 *
 * @module dag/streaming
 */

import type { DAGStructure } from "../graphrag/types.ts";
import type { DAGExecutionResult, TaskError, TaskResult } from "./types.ts";
import { ParallelExecutor } from "./executor.ts";
import { getLogger } from "../telemetry/logger.ts";

const log = getLogger("default");

/**
 * SSE Event Types
 */
export type SSEEvent =
  | TaskStartEvent
  | TaskCompleteEvent
  | ExecutionCompleteEvent
  | ErrorEvent;

/**
 * Event sent when a task starts execution
 */
export interface TaskStartEvent {
  type: "task_start";
  data: {
    taskId: string;
    tool: string;
    timestamp: string;
  };
}

/**
 * Event sent when a task completes (success or error)
 */
export interface TaskCompleteEvent {
  type: "task_complete";
  data: {
    taskId: string;
    tool: string;
    status: "success" | "error";
    output?: unknown;
    error?: string;
    executionTimeMs: number;
    timestamp: string;
  };
}

/**
 * Event sent when entire workflow execution completes
 */
export interface ExecutionCompleteEvent {
  type: "execution_complete";
  data: {
    totalTasks: number;
    successCount: number;
    errorCount: number;
    totalExecutionTimeMs: number;
    speedup: number;
    timestamp: string;
  };
}

/**
 * Event sent on critical errors
 */
export interface ErrorEvent {
  type: "error";
  data: {
    taskId?: string;
    error: string;
    timestamp: string;
  };
}

/**
 * Configuration for buffered event stream
 */
export interface BufferedStreamConfig {
  /**
   * Maximum number of events to buffer before flushing (default: 1000)
   */
  maxBufferSize?: number;

  /**
   * Optional callback for buffer flush events
   */
  onFlush?: (events: SSEEvent[]) => void;
}

/**
 * Buffered event stream to prevent memory leaks
 *
 * Maintains a circular buffer of events and flushes when limit is reached.
 */
export class BufferedEventStream {
  private buffer: SSEEvent[] = [];
  private readonly maxBufferSize: number;
  private readonly onFlush?: (events: SSEEvent[]) => void;

  constructor(
    private downstream: WritableStreamDefaultWriter<SSEEvent>,
    config: BufferedStreamConfig = {},
  ) {
    this.maxBufferSize = config.maxBufferSize ?? 1000;
    this.onFlush = config.onFlush;
  }

  /**
   * Write event to stream with buffering
   */
  async write(event: SSEEvent): Promise<void> {
    // Add to buffer
    this.buffer.push(event);

    // Flush if buffer full
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }

    // Write to downstream
    await this.downstream.write(event);
  }

  /**
   * Flush buffer (for memory management)
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    if (this.onFlush) {
      this.onFlush([...this.buffer]);
    }

    log.warn(
      `Event buffer flushed (${this.buffer.length} events) - consider adjusting buffer size`,
    );

    this.buffer = [];
  }

  /**
   * Close stream
   */
  async close(): Promise<void> {
    await this.flush();
    await this.downstream.close();
  }
}

/**
 * Streaming executor that extends ParallelExecutor with SSE support
 *
 * Streams task events in real-time as they complete instead of waiting
 * for all tasks to finish.
 */
export class StreamingExecutor extends ParallelExecutor {
  /**
   * Execute DAG with SSE streaming
   *
   * @param dag - DAG structure to execute
   * @param eventStream - Writable stream for SSE events
   * @param bufferConfig - Optional buffer configuration
   * @returns Execution result with metrics
   */
  async executeWithStreaming(
    dag: DAGStructure,
    eventStream: WritableStream<SSEEvent>,
    bufferConfig?: BufferedStreamConfig,
  ): Promise<DAGExecutionResult> {
    const writer = eventStream.getWriter();
    const bufferedStream = new BufferedEventStream(writer, bufferConfig);

    const startTime = performance.now();

    try {
      // 1. Topological sort to identify parallel execution layers
      const layers = this.topologicalSort(dag);
      const results = new Map<string, TaskResult>();
      const errors: TaskError[] = [];

      // 2. Execute layer by layer with streaming
      for (const layer of layers) {
        // Execute layer in parallel with event streaming
        const layerPromises = layer.map(async (task) => {
          // Send task_start event
          await bufferedStream.write({
            type: "task_start",
            data: {
              taskId: task.id,
              tool: task.tool,
              timestamp: new Date().toISOString(),
            },
          });

          const taskStartTime = performance.now();

          try {
            // Execute task
            const result = await this.executeTask(task, results);

            // Send task_complete event (success)
            await bufferedStream.write({
              type: "task_complete",
              data: {
                taskId: task.id,
                tool: task.tool,
                status: "success",
                output: result.output,
                executionTimeMs: result.executionTimeMs,
                timestamp: new Date().toISOString(),
              },
            });

            return { task, result, status: "success" as const };
          } catch (error) {
            const executionTime = performance.now() - taskStartTime;

            // Send task_complete event (error)
            await bufferedStream.write({
              type: "task_complete",
              data: {
                taskId: task.id,
                tool: task.tool,
                status: "error",
                error: error instanceof Error ? error.message : String(error),
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
              },
            });

            return {
              task,
              error: error instanceof Error ? error : new Error(String(error)),
              status: "error" as const,
            };
          }
        });

        // Wait for layer to complete
        const layerResults = await Promise.allSettled(layerPromises);

        // Collect results
        for (const settledResult of layerResults) {
          if (settledResult.status === "fulfilled") {
            const { task, result, status, error } = settledResult.value;

            if (status === "success" && result) {
              results.set(task.id, {
                taskId: task.id,
                status: "success",
                output: result.output,
                executionTimeMs: result.executionTimeMs,
              });
            } else if (status === "error" && error) {
              const taskError: TaskError = {
                taskId: task.id,
                error: error.message,
                status: "error",
              };

              errors.push(taskError);
              results.set(task.id, {
                taskId: task.id,
                status: "error",
                error: error.message,
              });
            }
          }
        }
      }

      const totalTime = performance.now() - startTime;

      // Calculate speedup
      const executionResult: DAGExecutionResult = {
        results: Array.from(results.values()),
        executionTimeMs: totalTime,
        parallelizationLayers: layers.length,
        errors,
        totalTasks: dag.tasks.length,
        successfulTasks: results.size - errors.length,
        failedTasks: errors.length,
      };

      const speedup = this.calculateSpeedup(executionResult);

      // Send execution_complete event
      await bufferedStream.write({
        type: "execution_complete",
        data: {
          totalTasks: dag.tasks.length,
          successCount: results.size - errors.length,
          errorCount: errors.length,
          totalExecutionTimeMs: totalTime,
          speedup,
          timestamp: new Date().toISOString(),
        },
      });

      return executionResult;
    } catch (error) {
      // Send error event on critical failure
      await bufferedStream.write({
        type: "error",
        data: {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      });

      throw error;
    } finally {
      await bufferedStream.close();
    }
  }
}
