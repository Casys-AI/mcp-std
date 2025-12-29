/**
 * SSE HTTP Handler
 *
 * Provides HTTP handlers for Server-Sent Events (SSE) streaming of DAG execution.
 * Includes graceful degradation to batch mode when SSE is not supported.
 *
 * @module server/sse-handler
 */

import type { DAGStructure } from "../graphrag/types.ts";
import type { ToolExecutor } from "../dag/types.ts";
import type { SSEEvent } from "../dag/streaming.ts";
import { StreamingExecutor } from "../dag/streaming.ts";
import { ParallelExecutor } from "../dag/executor.ts";
import { getLogger } from "../telemetry/logger.ts";

const log = getLogger("default");

/**
 * Configuration for SSE handler
 */
export interface SSEHandlerConfig {
  /**
   * Maximum buffer size for event stream (default: 1000)
   */
  maxBufferSize?: number;

  /**
   * Task execution timeout in ms (default: 30000)
   */
  taskTimeout?: number;

  /**
   * Maximum concurrent tasks per layer (default: unlimited)
   */
  maxConcurrency?: number;

  /**
   * Enable verbose logging
   */
  verbose?: boolean;
}

/**
 * Handle SSE request with progressive result streaming
 *
 * Executes DAG workflow and streams results as Server-Sent Events.
 * Events are formatted according to SSE specification:
 * - event: <event_type>
 * - data: <json_data>
 *
 * @param request - HTTP request
 * @param dag - DAG structure to execute
 * @param toolExecutor - Function to execute tools
 * @param config - Optional configuration
 * @returns HTTP response with SSE stream
 */
export async function handleSSERequest(
  _request: Request,
  dag: DAGStructure,
  toolExecutor: ToolExecutor,
  config: SSEHandlerConfig = {},
): Promise<Response> {
  log.info(`Starting SSE request for DAG with ${dag.tasks.length} tasks`);

  // Create transform stream for SSE
  const { readable, writable } = new TransformStream<string, string>();

  // Start execution in background
  (async () => {
    const writer = writable.getWriter();

    try {
      // Create event stream that formats events as SSE
      const eventStream = new WritableStream<SSEEvent>({
        write(event) {
          // Format as SSE specification
          const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          return writer.write(sseData);
        },
      });

      // Execute DAG with streaming
      const executor = new StreamingExecutor(
        toolExecutor,
        {
          maxConcurrency: config.maxConcurrency,
          taskTimeout: config.taskTimeout,
          verbose: config.verbose,
        },
      );

      await executor.executeWithStreaming(
        dag,
        eventStream,
        { maxBufferSize: config.maxBufferSize },
      );

      log.info("SSE request completed successfully");
    } catch (error) {
      // Send error event on critical failure
      const errorData = `event: error\ndata: ${
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        })
      }\n\n`;

      try {
        await writer.write(errorData);
      } catch (writeError) {
        log.error("Failed to write error event to SSE stream", writeError);
      }

      log.error("SSE request failed", error);
    } finally {
      try {
        await writer.close();
      } catch (closeError) {
        log.error("Failed to close SSE writer", closeError);
      }
    }
  })();

  // Transform SSE events to encoded bytes
  const encodedStream = readable.pipeThrough(
    new TransformStream<string, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(new TextEncoder().encode(chunk));
      },
    }),
  );

  return new Response(encodedStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

/**
 * Handle workflow request with graceful degradation
 *
 * If client accepts SSE (text/event-stream), streams results progressively.
 * Otherwise, falls back to batch mode (waits for all results).
 *
 * @param request - HTTP request
 * @param dag - DAG structure to execute
 * @param toolExecutor - Function to execute tools
 * @param config - Optional configuration
 * @returns HTTP response (SSE stream or JSON batch)
 */
export async function handleWorkflowRequest(
  request: Request,
  dag: DAGStructure,
  toolExecutor: ToolExecutor,
  config: SSEHandlerConfig = {},
): Promise<Response> {
  // Check if client supports SSE
  const acceptHeader = request.headers.get("Accept");
  const acceptsSSE = acceptHeader?.includes("text/event-stream");

  if (acceptsSSE) {
    log.info("Client accepts SSE - using streaming mode");
    // SSE streaming mode
    return handleSSERequest(request, dag, toolExecutor, config);
  } else {
    log.info("Client does not accept SSE - using batch mode");
    // Batch mode (graceful degradation)
    return handleBatchRequest(dag, toolExecutor, config);
  }
}

/**
 * Handle batch request (non-SSE fallback)
 *
 * Executes DAG and returns all results in a single JSON response.
 * Used when client doesn't support SSE.
 *
 * @param dag - DAG structure to execute
 * @param toolExecutor - Function to execute tools
 * @param config - Optional configuration
 * @returns HTTP response with JSON result
 */
async function handleBatchRequest(
  dag: DAGStructure,
  toolExecutor: ToolExecutor,
  config: SSEHandlerConfig = {},
): Promise<Response> {
  try {
    const executor = new ParallelExecutor(
      toolExecutor,
      {
        maxConcurrency: config.maxConcurrency,
        taskTimeout: config.taskTimeout,
        verbose: config.verbose,
      },
    );

    const result = await executor.execute(dag);

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    log.error("Batch request failed", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}

/**
 * Create a mock SSE EventSource consumer (for testing)
 *
 * This simulates the client-side EventSource API for consuming SSE streams.
 * In production, clients would use the native EventSource API.
 *
 * @example
 * ```typescript
 * const consumer = createSSEConsumer("/api/workflow");
 *
 * consumer.addEventListener("task_start", (event) => {
 *   console.log("Task started:", event.data);
 * });
 *
 * consumer.addEventListener("task_complete", (event) => {
 *   console.log("Task completed:", event.data);
 * });
 * ```
 */
export interface SSEConsumer {
  addEventListener(
    type: string,
    handler: (event: { data: unknown }) => void,
  ): void;
  close(): void;
}

/**
 * Parse SSE stream for testing purposes
 *
 * Reads Server-Sent Events from a ReadableStream and dispatches them
 * to registered event handlers.
 *
 * @param stream - SSE response stream
 * @returns SSE consumer interface
 */
export async function parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE messages (separated by double newline)
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || ""; // Keep incomplete message in buffer

      for (const message of messages) {
        if (!message.trim()) continue;

        // Parse SSE format: "event: type\ndata: json"
        const lines = message.split("\n");
        let eventType = "";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            eventData = line.slice(5).trim();
          }
        }

        if (eventType && eventData) {
          try {
            const data = JSON.parse(eventData);
            events.push({
              type: eventType,
              data,
            } as SSEEvent);
          } catch (error) {
            log.error("Failed to parse SSE event data", error);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return events;
}
