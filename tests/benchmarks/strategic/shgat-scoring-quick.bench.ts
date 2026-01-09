/**
 * SHGAT Scoring Quick Benchmark
 *
 * Fast profiling of SHGAT scoring without full training.
 * Uses minimal training (3 epochs) to test the scoring path.
 *
 * Run: deno bench --allow-all --allow-ffi --unstable-ffi --no-check tests/benchmarks/strategic/shgat-scoring-quick.bench.ts
 *
 * @module tests/benchmarks/strategic/shgat-scoring-quick
 */

import {
  createSHGATFromCapabilities,
  type TrainingExample,
  trainSHGATOnEpisodesKHead,
} from "../../../src/graphrag/algorithms/shgat.ts";
import { loadScenario } from "../fixtures/scenario-loader.ts";
import { initBlasAcceleration } from "../../../src/graphrag/algorithms/shgat/utils/math.ts";

// Initialize BLAS acceleration (OpenBLAS via FFI for ~10x speedup)
console.log("🚀 Initializing BLAS acceleration...");
const blasAvailable = await initBlasAcceleration();
console.log(blasAvailable ? "✅ BLAS available (OpenBLAS)" : "⚠️ BLAS not available, using JS fallback");

console.log("📦 Loading production-traces scenario...");
const scenario = await loadScenario("production-traces");

// deno-lint-ignore no-explicit-any
const prodScenario = scenario as any;
const rawCaps = prodScenario.nodes?.capabilities || [];
const rawTools = prodScenario.nodes?.tools || [];
const rawEvents = prodScenario.episodicEvents || [];
const rawQueries = prodScenario.testQueries || [];

console.log(`📊 Data: ${rawCaps.length} capabilities, ${rawTools.length} tools, ${rawEvents.length} events`);

// Build capabilities
// deno-lint-ignore no-explicit-any
const capabilities = rawCaps.filter((c: any) => c.embedding?.length > 0).map((c: any) => ({
  id: c.id,
  embedding: c.embedding,
  toolsUsed: c.toolsUsed || [],
  successRate: c.successRate || 0.8,
  parents: c.parents || [],
  children: c.children || [],
  description: c.description || c.id,
  level: c.level || 0,
}));

// Build tool embeddings
const toolEmbeddings = new Map<string, number[]>();
// deno-lint-ignore no-explicit-any
for (const t of rawTools.filter((t: any) => t.embedding?.length > 0)) {
  toolEmbeddings.set(t.id, t.embedding);
}

// Training examples (subset for quick benchmark)
// Rationale: 50 examples is enough to initialize K-head attention weights
// without spending minutes on full training. This benchmark tests scoring
// latency, not model accuracy (see shgat-v1-v2-v3-comparison.bench.ts for that).
// deno-lint-ignore no-explicit-any
const trainingExamples: TrainingExample[] = rawEvents.slice(0, 50).map((event: any) => ({
  intentEmbedding: event.intentEmbedding,
  contextTools: event.contextTools || [],
  candidateId: event.selectedCapability,
  outcome: event.outcome === "success" ? 1 : 0,
})).filter((e: TrainingExample) => e.intentEmbedding?.length > 0);

console.log(`🏗️ Creating SHGAT (${capabilities.length} caps, ${toolEmbeddings.size} tools)...`);
const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings);

// Quick training (3 epochs only)
if (trainingExamples.length > 0) {
  console.log("🎓 Quick training (3 epochs)...");
  await trainSHGATOnEpisodesKHead(
    shgat,
    trainingExamples,
    (id) => toolEmbeddings.get(id) || null,
    { epochs: 3, batchSize: 16 },
  );
}
console.log("✅ Ready!");

// Test intent
// deno-lint-ignore no-explicit-any
const testIntent = rawQueries[0]?.intentEmbedding || capabilities[0]?.embedding || new Array(1024).fill(0);

// Benchmarks
Deno.bench({
  name: "SHGAT: scoreAllCapabilities",
  group: "shgat-scoring",
  baseline: true,
  fn: () => {
    shgat.scoreAllCapabilities(testIntent);
  },
});

Deno.bench({
  name: "SHGAT: scoreAllTools",
  group: "shgat-scoring",
  fn: () => {
    shgat.scoreAllTools(testIntent);
  },
});

// Batch queries
// deno-lint-ignore no-explicit-any
const testQueries = rawQueries.slice(0, 10).filter((q: any) => q.intentEmbedding?.length > 0);

if (testQueries.length > 0) {
  Deno.bench({
    name: "SHGAT: batch 10 queries",
    group: "shgat-batch",
    fn: () => {
      for (const q of testQueries) {
        shgat.scoreAllCapabilities(q.intentEmbedding);
      }
    },
  });
}

// Print config
console.log("\n" + "=".repeat(60));
console.log("SHGAT SCORING QUICK BENCHMARK");
console.log("=".repeat(60));
console.log(`Capabilities: ${capabilities.length}`);
console.log(`Tools: ${toolEmbeddings.size}`);
console.log(`Test queries: ${testQueries.length}`);
console.log(`Training examples: ${trainingExamples.length}`);
console.log("=".repeat(60) + "\n");
