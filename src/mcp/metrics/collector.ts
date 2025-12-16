/**
 * Metrics Collector
 *
 * Collects and exposes metrics for the MCP Gateway.
 *
 * @module mcp/metrics/collector
 */

import * as log from "@std/log";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";

/**
 * Time range for metrics queries
 */
export type MetricsTimeRange = "1h" | "24h" | "7d";

/**
 * Metrics response structure
 */
export interface MetricsResponse {
  range: MetricsTimeRange;
  timestamp: string;
  data: unknown;
}

/**
 * Metrics Collector
 *
 * Collects and aggregates metrics from various sources.
 */
export class MetricsCollector {
  constructor(private graphEngine?: GraphRAGEngine) {}

  /**
   * Get metrics for the specified time range
   */
  async getMetrics(range: MetricsTimeRange): Promise<MetricsResponse> {
    try {
      let data: unknown = {};

      if (this.graphEngine) {
        data = await this.graphEngine.getMetrics(range);
      }

      return {
        range,
        timestamp: new Date().toISOString(),
        data,
      };
    } catch (error) {
      log.error(`Failed to collect metrics: ${error}`);
      throw error;
    }
  }

  /**
   * Set the graph engine (for lazy initialization)
   */
  setGraphEngine(engine: GraphRAGEngine): void {
    this.graphEngine = engine;
  }
}

/**
 * JSON response helper
 */
function jsonResponse(
  data: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Error response helper
 */
function errorResponse(
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return jsonResponse({ error: message }, status, corsHeaders);
}

/**
 * Handle GET /api/metrics
 *
 * Returns graph metrics for the specified time range
 */
export async function handleMetrics(
  _req: Request,
  url: URL,
  graphEngine: GraphRAGEngine,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const range = url.searchParams.get("range") || "24h";

    // Validate range parameter
    if (range !== "1h" && range !== "24h" && range !== "7d") {
      return errorResponse(
        `Invalid range parameter: ${range}. Must be one of: 1h, 24h, 7d`,
        400,
        corsHeaders,
      );
    }

    const metrics = await graphEngine.getMetrics(range as MetricsTimeRange);
    return jsonResponse(metrics, 200, corsHeaders);
  } catch (error) {
    log.error(`Failed to get metrics: ${error}`);
    return errorResponse(`Failed to get metrics: ${error}`, 500, corsHeaders);
  }
}
