/**
 * Context Optimization Module
 *
 * Provides on-demand schema loading and context window optimization
 * for Casys PML MCP tool discovery system.
 *
 * @module context
 */

export { ContextOptimizer } from "./optimizer.ts";
export type { RelevantSchemasResult } from "./optimizer.ts";

export { SchemaCache } from "./cache.ts";

export {
  calculateP95Latency,
  calculateUsagePercent,
  compareContextUsage,
  CONTEXT_WINDOWS,
  displayContextComparison,
  estimateTokens,
  getRecentMetrics,
  logCacheHitRate,
  logContextUsage,
  logQueryLatency,
  measureContextUsage,
  TOKENS_PER_SCHEMA,
} from "./metrics.ts";

export type { ContextComparison, ContextUsage } from "./metrics.ts";
