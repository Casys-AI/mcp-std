/**
 * Message Passing Isolated Benchmark
 *
 * Profiles the SHGAT message passing phases in isolation:
 * - V→E (Vertex to Edge): Tools aggregate to capabilities
 * - E→E (Edge to Edge): Capabilities aggregate to higher-level caps
 * - E→V (Edge to Vertex): Capabilities propagate back to tools
 *
 * This helps identify if message passing is the bottleneck in discover/suggestion.
 *
 * Run: deno bench --allow-all tests/benchmarks/strategic/message-passing-isolated.bench.ts
 *
 * @module tests/benchmarks/strategic/message-passing-isolated
 */

import {
  MultiLevelOrchestrator,
  VertexToEdgePhase,
  EdgeToVertexPhase,
  EdgeToEdgePhase,
  type PhaseParameters,
} from "../../../src/graphrag/algorithms/shgat/message-passing/index.ts";
import { loadScenario } from "../fixtures/scenario-loader.ts";

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

// Filter to get valid embeddings
const capsWithEmbeddings = rawCaps.filter((c) => c.embedding && c.embedding.length > 0);
const toolsWithEmbeddings = rawTools.filter((t) => t.embedding && t.embedding.length > 0);

console.log(`📊 Loaded ${capsWithEmbeddings.length} capabilities, ${toolsWithEmbeddings.length} tools with embeddings`);

// Guard: exit early if no valid data for benchmarking
if (capsWithEmbeddings.length === 0) {
  console.warn("⚠️ No capabilities with embeddings found - cannot run message passing benchmarks");
  console.warn("   Run: deno run --allow-all scripts/export-traces-for-benchmark.ts");
  Deno.exit(0);
}

// Build tool embeddings matrix [numTools][embDim]
const embeddingDim = capsWithEmbeddings[0]?.embedding.length ?? 1024;
const H_init: number[][] = toolsWithEmbeddings.length > 0
  ? toolsWithEmbeddings.map((t) => t.embedding)
  : capsWithEmbeddings.slice(0, 10).map((c) => c.embedding); // Fallback: use cap embeddings as "tools"

// Build capability embeddings matrix [numCaps][embDim]
const E_init: number[][] = capsWithEmbeddings.map((c) => c.embedding);

// Build incidence matrix [numTools][numCaps]
// A[t][c] = 1 if tool t is used by capability c
const toolIdToIndex = new Map<string, number>();
toolsWithEmbeddings.forEach((t, i) => toolIdToIndex.set(t.id, i));

const capIdToIndex = new Map<string, number>();
capsWithEmbeddings.forEach((c, i) => capIdToIndex.set(c.id, i));

const incidenceMatrix: number[][] = Array.from(
  { length: toolsWithEmbeddings.length },
  () => Array(capsWithEmbeddings.length).fill(0),
);

for (let cIdx = 0; cIdx < capsWithEmbeddings.length; cIdx++) {
  const cap = capsWithEmbeddings[cIdx];
  for (const toolId of cap.toolsUsed) {
    const tIdx = toolIdToIndex.get(toolId);
    if (tIdx !== undefined) {
      incidenceMatrix[tIdx][cIdx] = 1;
    }
  }
}

console.log(`📐 Incidence matrix: ${incidenceMatrix.length} x ${incidenceMatrix[0]?.length ?? 0}`);

// ============================================================================
// Phase Parameters
// ============================================================================

// Configuration constants (documented for clarity)
const NUM_HEADS = 8;       // K-head attention - matches SHGAT default
const HEAD_DIM = 64;       // Per-head dimension for Q/K projections
const RANDOM_SEED = 42;    // Fixed seed for reproducible benchmarks

// Seeded PRNG for reproducible benchmark results
// Using mulberry32 algorithm - fast, simple, deterministic
function seededRandom(seed: number): () => number {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rng = seededRandom(RANDOM_SEED);

// Initialize deterministic projection matrices for benchmarking
function randomMatrix(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (rng() - 0.5) * 0.1)
  );
}

function randomVector(len: number): number[] {
  return Array.from({ length: len }, () => (rng() - 0.5) * 0.1);
}

// Use documented constants
const numHeads = NUM_HEADS;
const headDim = HEAD_DIM;

// V→E phase parameters
const veParams: PhaseParameters = {
  W_source: randomMatrix(headDim, embeddingDim),
  W_target: randomMatrix(headDim, embeddingDim),
  a_attention: randomVector(2 * headDim),
};

// E→V phase parameters
const evParams: PhaseParameters = {
  W_source: randomMatrix(headDim, embeddingDim),
  W_target: randomMatrix(headDim, embeddingDim),
  a_attention: randomVector(2 * headDim),
};

// ============================================================================
// Phase Instances
// ============================================================================

const vePhase = new VertexToEdgePhase();
const evPhase = new EdgeToVertexPhase();
const eePhase = new EdgeToEdgePhase(0, 1);

// Orchestrator (2-level)
const orchestrator = new MultiLevelOrchestrator(false);

// Layer parameters for orchestrator
const layerParams = [{
  W_v: Array.from({ length: numHeads }, () => randomMatrix(headDim, embeddingDim)),
  W_e: Array.from({ length: numHeads }, () => randomMatrix(headDim, embeddingDim)),
  a_ve: Array.from({ length: numHeads }, () => randomVector(2 * headDim)),
  W_e2: Array.from({ length: numHeads }, () => randomMatrix(headDim, embeddingDim)),
  W_v2: Array.from({ length: numHeads }, () => randomMatrix(headDim, embeddingDim)),
  a_ev: Array.from({ length: numHeads }, () => randomVector(2 * headDim)),
}];

const orchestratorConfig = {
  numHeads,
  numLayers: 1,
  dropout: 0,
  leakyReluSlope: 0.2,
};

// ============================================================================
// Benchmarks: Individual Phases
// ============================================================================

Deno.bench({
  name: "V→E Phase: single head forward",
  group: "message-passing-phases",
  baseline: true,
  fn: () => {
    vePhase.forward(H_init, E_init, incidenceMatrix, veParams, { leakyReluSlope: 0.2 });
  },
});

Deno.bench({
  name: "E→V Phase: single head forward",
  group: "message-passing-phases",
  fn: () => {
    evPhase.forward(E_init, H_init, incidenceMatrix, evParams, { leakyReluSlope: 0.2 });
  },
});

// E→E needs capability-to-capability connectivity (simulate with subset)
const capSubset = E_init.slice(0, Math.min(20, E_init.length));
const capToCapMatrix: number[][] = Array.from(
  { length: capSubset.length },
  (_, i) => Array.from({ length: capSubset.length }, (_, j) => (i !== j && Math.random() > 0.8 ? 1 : 0)),
);

const eeParams: PhaseParameters = {
  W_source: randomMatrix(headDim, embeddingDim),
  W_target: randomMatrix(headDim, embeddingDim),
  a_attention: randomVector(2 * headDim),
};

Deno.bench({
  name: "E→E Phase: single head forward (20 caps)",
  group: "message-passing-phases",
  fn: () => {
    eePhase.forward(capSubset, capSubset, capToCapMatrix, eeParams, { leakyReluSlope: 0.2 });
  },
});

// ============================================================================
// Benchmarks: Full Orchestrator
// ============================================================================

Deno.bench({
  name: "Orchestrator: 2-level forward (V→E→V)",
  group: "message-passing-orchestrator",
  baseline: true,
  fn: () => {
    orchestrator.forward(H_init, E_init, incidenceMatrix, layerParams, orchestratorConfig);
  },
});

// Multi-level orchestrator (if capabilities have hierarchy)
const E_levels_init = new Map<number, number[][]>();
E_levels_init.set(0, E_init);

// Create level-1 capabilities (aggregate of level-0)
const level1Caps = E_init.slice(0, Math.min(10, Math.floor(E_init.length / 5)));
if (level1Caps.length > 0) {
  E_levels_init.set(1, level1Caps);
}

// Tool-to-cap matrix
const toolToCapMatrix = incidenceMatrix;

// Cap-to-cap matrix (level 0 → level 1)
const capToCapMatrices = new Map<number, number[][]>();
if (level1Caps.length > 0) {
  const l0ToL1: number[][] = Array.from(
    { length: E_init.length },
    (_, i) => Array.from({ length: level1Caps.length }, (_, j) => (i % level1Caps.length === j ? 1 : 0)),
  );
  capToCapMatrices.set(1, l0ToL1);
}

// Level parameters for multi-level
const levelParams = new Map<number, {
  W_child: number[][][];
  W_parent: number[][][];
  a_upward: number[][];
  a_downward: number[][];
}>();

levelParams.set(0, {
  W_child: Array.from({ length: numHeads }, () => randomMatrix(headDim, embeddingDim)),
  W_parent: Array.from({ length: numHeads }, () => randomMatrix(headDim, embeddingDim)),
  a_upward: Array.from({ length: numHeads }, () => randomVector(2 * headDim)),
  a_downward: Array.from({ length: numHeads }, () => randomVector(2 * headDim)),
});

if (level1Caps.length > 0) {
  levelParams.set(1, {
    W_child: Array.from({ length: numHeads }, () => randomMatrix(headDim, embeddingDim)),
    W_parent: Array.from({ length: numHeads }, () => randomMatrix(headDim, embeddingDim)),
    a_upward: Array.from({ length: numHeads }, () => randomVector(2 * headDim)),
    a_downward: Array.from({ length: numHeads }, () => randomVector(2 * headDim)),
  });
}

const multiLevelOrchestrator = new MultiLevelOrchestrator(false);

Deno.bench({
  name: "Orchestrator: multi-level forward (V→E^0→E^1→E^0→V)",
  group: "message-passing-orchestrator",
  fn: () => {
    multiLevelOrchestrator.forwardMultiLevel(
      H_init,
      E_levels_init,
      toolToCapMatrix,
      capToCapMatrices,
      levelParams,
      orchestratorConfig,
    );
  },
});

// ============================================================================
// Benchmarks: Scaling by Graph Size
// ============================================================================

// Small subset (10 tools, 5 caps)
const H_small = H_init.slice(0, 10);
const E_small = E_init.slice(0, 5);
const incidence_small: number[][] = Array.from(
  { length: 10 },
  () => Array.from({ length: 5 }, () => (Math.random() > 0.7 ? 1 : 0)),
);

Deno.bench({
  name: "V→E: small (10 tools, 5 caps)",
  group: "message-passing-scaling",
  baseline: true,
  fn: () => {
    vePhase.forward(H_small, E_small, incidence_small, veParams, { leakyReluSlope: 0.2 });
  },
});

// Medium subset (30 tools, 20 caps)
const H_medium = H_init.slice(0, Math.min(30, H_init.length));
const E_medium = E_init.slice(0, Math.min(20, E_init.length));
const incidence_medium: number[][] = Array.from(
  { length: H_medium.length },
  () => Array.from({ length: E_medium.length }, () => (Math.random() > 0.8 ? 1 : 0)),
);

Deno.bench({
  name: "V→E: medium (30 tools, 20 caps)",
  group: "message-passing-scaling",
  fn: () => {
    vePhase.forward(H_medium, E_medium, incidence_medium, veParams, { leakyReluSlope: 0.2 });
  },
});

// Full production data
Deno.bench({
  name: `V→E: production (${H_init.length} tools, ${E_init.length} caps)`,
  group: "message-passing-scaling",
  fn: () => {
    vePhase.forward(H_init, E_init, incidenceMatrix, veParams, { leakyReluSlope: 0.2 });
  },
});

// ============================================================================
// Benchmarks: Multi-Head Scaling
// ============================================================================

Deno.bench({
  name: "Orchestrator: 4 heads",
  group: "message-passing-heads",
  baseline: true,
  fn: () => {
    const config4 = { ...orchestratorConfig, numHeads: 4 };
    const params4 = [{
      W_v: layerParams[0].W_v.slice(0, 4),
      W_e: layerParams[0].W_e.slice(0, 4),
      a_ve: layerParams[0].a_ve.slice(0, 4),
      W_e2: layerParams[0].W_e2.slice(0, 4),
      W_v2: layerParams[0].W_v2.slice(0, 4),
      a_ev: layerParams[0].a_ev.slice(0, 4),
    }];
    orchestrator.forward(H_init, E_init, incidenceMatrix, params4, config4);
  },
});

Deno.bench({
  name: "Orchestrator: 8 heads",
  group: "message-passing-heads",
  fn: () => {
    orchestrator.forward(H_init, E_init, incidenceMatrix, layerParams, orchestratorConfig);
  },
});

// 12 heads
const layerParams12 = [{
  W_v: Array.from({ length: 12 }, () => randomMatrix(headDim, embeddingDim)),
  W_e: Array.from({ length: 12 }, () => randomMatrix(headDim, embeddingDim)),
  a_ve: Array.from({ length: 12 }, () => randomVector(2 * headDim)),
  W_e2: Array.from({ length: 12 }, () => randomMatrix(headDim, embeddingDim)),
  W_v2: Array.from({ length: 12 }, () => randomMatrix(headDim, embeddingDim)),
  a_ev: Array.from({ length: 12 }, () => randomVector(2 * headDim)),
}];

Deno.bench({
  name: "Orchestrator: 12 heads",
  group: "message-passing-heads",
  fn: () => {
    const config12 = { ...orchestratorConfig, numHeads: 12 };
    orchestrator.forward(H_init, E_init, incidenceMatrix, layerParams12, config12);
  },
});

// ============================================================================
// Summary Statistics (printed after benchmarks)
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("MESSAGE PASSING BENCHMARK CONFIGURATION");
console.log("=".repeat(80));
console.log(`Tools (vertices): ${H_init.length}`);
console.log(`Capabilities (edges): ${E_init.length}`);
console.log(`Embedding dimension: ${embeddingDim}`);
console.log(`Incidence matrix density: ${
  (incidenceMatrix.flat().filter((v) => v > 0).length / (H_init.length * E_init.length) * 100).toFixed(1)
}%`);
console.log(`Num heads: ${numHeads}`);
console.log(`Head dimension: ${headDim}`);
console.log("=".repeat(80) + "\n");
