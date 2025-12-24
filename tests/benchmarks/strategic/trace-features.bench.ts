/**
 * Trace Feature Extraction Benchmarks (Phase 5)
 *
 * Tests performance of trace feature extraction for SHGAT v2.
 * Measures latency for single and batch extraction, plus cache hit rates.
 *
 * Run: deno bench --allow-all tests/benchmarks/strategic/trace-features.bench.ts
 *
 * @module tests/benchmarks/strategic/trace-features
 */

import { createClient, type PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";
import { TraceFeatureExtractor } from "../../../src/graphrag/algorithms/trace-feature-extractor.ts";
import { ExecutionTraceStore } from "../../../src/capabilities/execution-trace-store.ts";
import { DEFAULT_TRACE_PRIORITY } from "../../../src/capabilities/types.ts";

// ============================================================================
// Setup
// ============================================================================

let db: PGliteClient;
let traceStore: ExecutionTraceStore;
let extractor: TraceFeatureExtractor;
let toolIds: string[] = [];
let setupDone = false;

async function setup() {
  if (setupDone) return;

  // Create in-memory database
  db = createClient(":memory:");
  await db.connect();
  const migrations = getAllMigrations();
  const runner = new MigrationRunner(db);
  await runner.runUp(migrations);

  traceStore = new ExecutionTraceStore(db);
  extractor = new TraceFeatureExtractor(db);

  // Seed with synthetic traces
  const tools = [
    "mcp__filesystem__read_file",
    "mcp__filesystem__write_file",
    "mcp__github__create_issue",
    "mcp__github__list_repos",
    "mcp__slack__send_message",
    "mcp__jira__create_ticket",
    "mcp__postgres__query",
    "mcp__redis__get",
    "mcp__redis__set",
    "mcp__http__fetch",
  ];

  // Create 100 traces with varied paths
  for (let i = 0; i < 100; i++) {
    const pathLength = 2 + Math.floor(Math.random() * 4); // 2-5 tools
    const path = Array.from(
      { length: pathLength },
      () => tools[Math.floor(Math.random() * tools.length)],
    );

    await traceStore.saveTrace({
      intentText: `Test intent ${i}`,
      success: Math.random() > 0.2, // 80% success
      durationMs: 50 + Math.floor(Math.random() * 200),
      executedAt: new Date(Date.now() - Math.random() * 86400000 * 30), // Last 30 days
      executedPath: path,
      decisions: [],
      taskResults: [],
      priority: DEFAULT_TRACE_PRIORITY,
    });
  }

  toolIds = tools;
  setupDone = true;
}

// ============================================================================
// Benchmarks: Single Tool Extraction
// ============================================================================

Deno.bench({
  name: "TraceFeatureExtractor: getTraceStats (single, cold)",
  group: "trace-single",
  baseline: true,
  async fn() {
    await setup();
    extractor.clearCache();
    const toolId = toolIds[Math.floor(Math.random() * toolIds.length)];
    await extractor.getTraceStats(toolId, []);
  },
});

Deno.bench({
  name: "TraceFeatureExtractor: getTraceStats (single, warm)",
  group: "trace-single",
  async fn() {
    await setup();
    const toolId = toolIds[0];
    await extractor.getTraceStats(toolId, []); // Warm
    await extractor.getTraceStats(toolId, []); // Measure cached
  },
});

// ============================================================================
// Benchmarks: Batch Extraction
// ============================================================================

Deno.bench({
  name: "TraceFeatureExtractor: batch (5 tools)",
  group: "trace-batch",
  baseline: true,
  async fn() {
    await setup();
    extractor.clearCache();
    await extractor.batchExtractTraceStats(toolIds.slice(0, 5));
  },
});

Deno.bench({
  name: "TraceFeatureExtractor: batch (10 tools)",
  group: "trace-batch",
  async fn() {
    await setup();
    extractor.clearCache();
    await extractor.batchExtractTraceStats(toolIds);
  },
});

// ============================================================================
// Benchmarks: Cache Efficiency
// ============================================================================

Deno.bench({
  name: "TraceFeatureExtractor: batch 50% cached",
  group: "trace-cache",
  baseline: true,
  async fn() {
    await setup();
    extractor.clearCache();
    // Warm half
    await extractor.batchExtractTraceStats(toolIds.slice(0, 5));
    // Request all (5 cached, 5 new)
    await extractor.batchExtractTraceStats(toolIds);
  },
});

Deno.bench({
  name: "TraceFeatureExtractor: batch 100% cached",
  group: "trace-cache",
  async fn() {
    await setup();
    extractor.clearCache();
    await extractor.batchExtractTraceStats(toolIds); // Warm all
    extractor.resetCacheStats();
    await extractor.batchExtractTraceStats(toolIds); // All cached
  },
});

// ============================================================================
// Benchmarks: Intent Similarity (requires embeddings)
// ============================================================================

Deno.bench({
  name: "TraceFeatureExtractor: intentSimilarSuccessRate",
  group: "trace-intent",
  async fn() {
    await setup();
    const toolId = toolIds[0];
    const mockEmbedding = Array.from({ length: 1024 }, () => Math.random() * 0.1);
    // This will likely return null due to no embeddings in test data
    await extractor.queryIntentSimilarSuccessRate(toolId, mockEmbedding, 50, 0.7);
  },
});

// ============================================================================
// Summary
// ============================================================================

globalThis.addEventListener("unload", async () => {
  if (extractor) {
    const stats = extractor.getCacheStats();
    console.log("\n=== Trace Feature Benchmark Summary ===");
    console.log(`Tools: ${toolIds.length}`);
    console.log(`Cache: ${stats.size} entries, ${(stats.hitRate * 100).toFixed(1)}% hit rate`);
    console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
  }
  if (db) {
    await db.close();
  }
});
