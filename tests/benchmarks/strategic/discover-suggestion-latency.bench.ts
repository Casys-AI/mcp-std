/**
 * Discover/Suggestion Latency Benchmark
 *
 * End-to-end profiling of the discover and suggestion commands to identify
 * performance bottlenecks. Breaks down latency by component:
 *
 * 1. Embedding generation (BGE-M3)
 * 2. SHGAT scoring (message passing + K-head attention)
 * 3. DR-DSP pathfinding (optional)
 * 4. DB lookups
 *
 * Run: deno bench --allow-all tests/benchmarks/strategic/discover-suggestion-latency.bench.ts
 *
 * @module tests/benchmarks/strategic/discover-suggestion-latency
 */

import {
  createSHGATFromCapabilities,
  type TrainingExample,
  trainSHGATOnEpisodesKHead,
} from "../../../src/graphrag/algorithms/shgat.ts";
import { initBlasAcceleration } from "../../../src/graphrag/algorithms/shgat/utils/math.ts";
import { loadScenario } from "../fixtures/scenario-loader.ts";

// Initialize BLAS acceleration (ADR-058)
const blasAvailable = await initBlasAcceleration();
console.log(blasAvailable ? "⚡ BLAS acceleration enabled" : "⚠️ BLAS not available (JS fallback)");

// ============================================================================
// Setup Test Data
// ============================================================================

console.log("📦 Loading production-traces scenario...");
const scenario = await loadScenario("production-traces");

// Extended types for production data with embeddings
// deno-lint-ignore no-explicit-any
type ProductionScenario = any;

const prodScenario = scenario as unknown as ProductionScenario;
const rawCaps = prodScenario.nodes?.capabilities || [];
const rawTools = prodScenario.nodes?.tools || [];
const rawEvents = prodScenario.episodicEvents || [];
const rawQueries = prodScenario.testQueries || [];

// Build capabilities with embeddings
console.log("🧮 Loading embeddings...");
const capabilities = rawCaps.map((c) => ({
  id: c.id,
  embedding: c.embedding,
  toolsUsed: c.toolsUsed,
  successRate: c.successRate,
  parents: c.parents || [],
  children: c.children || [],
  description: c.description || c.id,
  level: c.level,
}));

// Build tool embeddings map
const toolEmbeddings = new Map<string, number[]>();
for (const t of rawTools) {
  if (t.embedding) {
    toolEmbeddings.set(t.id, t.embedding);
  }
}

// Build training examples
const trainingExamples: TrainingExample[] = rawEvents.map((event) => ({
  intentEmbedding: event.intentEmbedding,
  contextTools: event.contextTools,
  candidateId: event.selectedCapability,
  outcome: event.outcome === "success" ? 1 : 0,
}));

// Create and train SHGAT
console.log("🏗️ Creating SHGAT model...");
const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings);

console.log("🎓 Training SHGAT K-head (30 epochs, batch=16)...");
await trainSHGATOnEpisodesKHead(
  shgat,
  trainingExamples,
  (id) => toolEmbeddings.get(id) || null,
  { epochs: 30, batchSize: 16 },
);
console.log("✅ Training complete!");

// Test queries
const testQueries = rawQueries.map((q) => ({
  intent: q.intentEmbedding,
  expectedCapabilityId: q.expectedCapability,
  description: q.intent,
}));

// Use a realistic query for single-shot benchmarks
const testIntent = testQueries[0]?.intent || new Array(1024).fill(0);

// ============================================================================
// Timing Utilities
// ============================================================================

interface TimingResult {
  name: string;
  samples: number[];
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

function computeStats(samples: number[]): Omit<TimingResult, "name" | "samples"> {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  // Use Math.ceil - 1 for correct percentile calculation
  // For n=100: p99 = sorted[98] (99th value, 0-indexed)
  const percentile = (p: number) => sorted[Math.min(Math.ceil(n * p) - 1, n - 1)];
  return {
    mean: samples.reduce((a, b) => a + b, 0) / n,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    min: sorted[0],
    max: sorted[n - 1],
  };
}

async function benchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations: number = 100,
): Promise<TimingResult> {
  const samples: number[] = [];

  // Warmup
  for (let i = 0; i < 5; i++) {
    await fn();
  }

  // Actual measurements
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }

  return { name, samples, ...computeStats(samples) };
}

// ============================================================================
// Component Benchmarks
// ============================================================================

// Store results for final report
const results: TimingResult[] = [];

// 1. SHGAT scoreAllCapabilities (the core operation)
const shgatCapResult = await benchmark(
  "SHGAT scoreAllCapabilities",
  () => {
    shgat.scoreAllCapabilities(testIntent);
  },
  200,
);
results.push(shgatCapResult);

// 2. SHGAT scoreAllTools (if tools exist)
const shgatToolResult = await benchmark(
  "SHGAT scoreAllTools",
  () => {
    shgat.scoreAllTools(testIntent);
  },
  200,
);
results.push(shgatToolResult);

// 3. SHGAT v2 scoring (with TraceFeatures - richer but potentially slower)
import {
  DEFAULT_TRACE_STATS,
  type TraceFeatures,
} from "../../../src/graphrag/algorithms/shgat/types.ts";

const traceFeaturesMap = new Map<string, TraceFeatures>();
for (const cap of capabilities) {
  traceFeaturesMap.set(cap.id, {
    intentEmbedding: testIntent,
    candidateEmbedding: cap.embedding,
    contextEmbeddings: [],
    contextAggregated: new Array(1024).fill(0),
    traceStats: {
      ...DEFAULT_TRACE_STATS,
      historicalSuccessRate: cap.successRate,
    },
  });
}

const shgatV2Result = await benchmark(
  "SHGAT scoreAllCapabilitiesV2 (TraceFeatures)",
  () => {
    shgat.scoreAllCapabilitiesV2(testIntent, traceFeaturesMap);
  },
  200,
);
results.push(shgatV2Result);

// 4. SHGAT v3 scoring (hybrid: message passing + TraceFeatures)
const shgatV3Result = await benchmark(
  "SHGAT scoreAllCapabilitiesV3 (Hybrid)",
  () => {
    shgat.scoreAllCapabilitiesV3(testIntent, traceFeaturesMap);
  },
  200,
);
results.push(shgatV3Result);

// 5. Full discover simulation (multiple queries)
const discoverResult = await benchmark(
  "Full discover simulation (score + rank + top-10)",
  () => {
    const scores = shgat.scoreAllCapabilities(testIntent);
    // Simulate ranking and returning top 10
    const ranked = scores.sort((a, b) => b.score - a.score).slice(0, 10);
    // Simulate result formatting
    void ranked.map((r) => ({
      id: r.capabilityId,
      score: r.score,
      confidence: r.score > 0.7 ? "high" : r.score > 0.4 ? "medium" : "low",
    }));
  },
  200,
);
results.push(discoverResult);

// 6. Batch queries (simulating real workload)
const batchResult = await benchmark(
  "Batch 10 queries (discover simulation)",
  () => {
    for (let i = 0; i < Math.min(10, testQueries.length); i++) {
      const q = testQueries[i];
      shgat.scoreAllCapabilities(q.intent);
    }
  },
  50,
);
results.push(batchResult);

// ============================================================================
// Print Results
// ============================================================================

console.log("\n" + "=".repeat(100));
console.log("DISCOVER/SUGGESTION LATENCY BENCHMARK - COMPONENT BREAKDOWN");
console.log("=".repeat(100));
console.log(`Capabilities: ${capabilities.length}`);
console.log(`Tools: ${toolEmbeddings.size}`);
console.log(`Test queries: ${testQueries.length}`);
console.log("-".repeat(100));
console.log(
  "Component".padEnd(50) +
    "Mean (ms)".padEnd(12) +
    "P50".padEnd(10) +
    "P95".padEnd(10) +
    "P99".padEnd(10) +
    "Min".padEnd(10) +
    "Max".padEnd(10),
);
console.log("-".repeat(100));

for (const r of results) {
  console.log(
    r.name.padEnd(50) +
      r.mean.toFixed(2).padEnd(12) +
      r.p50.toFixed(2).padEnd(10) +
      r.p95.toFixed(2).padEnd(10) +
      r.p99.toFixed(2).padEnd(10) +
      r.min.toFixed(2).padEnd(10) +
      r.max.toFixed(2).padEnd(10),
  );
}

console.log("-".repeat(100));

// Identify slowest component
const slowest = results.reduce((a, b) => (a.mean > b.mean ? a : b));
console.log(`\n🐢 Slowest component: ${slowest.name} (${slowest.mean.toFixed(2)}ms mean)`);

// Calculate throughput
const singleQueryMs = shgatCapResult.mean;
console.log(`\n📊 Throughput estimates:`);
console.log(`   Single query: ${singleQueryMs.toFixed(2)}ms`);
console.log(`   Queries/second: ${(1000 / singleQueryMs).toFixed(0)}`);
console.log(`   10 concurrent: ~${(singleQueryMs * 10).toFixed(0)}ms (serial)`);

console.log("=".repeat(100) + "\n");

// ============================================================================
// Deno Benchmarks (for `deno bench` integration)
// ============================================================================

Deno.bench({
  name: "SHGAT: scoreAllCapabilities (production data)",
  group: "discover-latency",
  baseline: true,
  fn: () => {
    shgat.scoreAllCapabilities(testIntent);
  },
});

Deno.bench({
  name: "SHGAT: scoreAllTools (production data)",
  group: "discover-latency",
  fn: () => {
    shgat.scoreAllTools(testIntent);
  },
});

Deno.bench({
  name: "SHGAT: scoreAllCapabilitiesV2 (TraceFeatures)",
  group: "discover-latency",
  fn: () => {
    shgat.scoreAllCapabilitiesV2(testIntent, traceFeaturesMap);
  },
});

Deno.bench({
  name: "SHGAT: scoreAllCapabilitiesV3 (Hybrid)",
  group: "discover-latency",
  fn: () => {
    shgat.scoreAllCapabilitiesV3(testIntent, traceFeaturesMap);
  },
});

Deno.bench({
  name: "Full discover (score + rank + top-10)",
  group: "discover-latency",
  fn: () => {
    const scores = shgat.scoreAllCapabilities(testIntent);
    scores.sort((a, b) => b.score - a.score).slice(0, 10);
  },
});

// Scaling benchmarks (only if testQueries available)
if (testQueries.length > 0) {
  Deno.bench({
    name: "Batch 5 queries",
    group: "discover-scaling",
    baseline: true,
    fn: () => {
      for (let i = 0; i < 5; i++) {
        shgat.scoreAllCapabilities(testQueries[i % testQueries.length].intent);
      }
    },
  });

  Deno.bench({
    name: "Batch 10 queries",
    group: "discover-scaling",
    fn: () => {
      for (let i = 0; i < 10; i++) {
        shgat.scoreAllCapabilities(testQueries[i % testQueries.length].intent);
      }
    },
  });

  Deno.bench({
    name: "Batch 20 queries",
    group: "discover-scaling",
    fn: () => {
      for (let i = 0; i < 20; i++) {
        shgat.scoreAllCapabilities(testQueries[i % testQueries.length].intent);
      }
    },
  });
}
