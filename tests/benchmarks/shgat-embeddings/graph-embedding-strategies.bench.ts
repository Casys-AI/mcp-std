/**
 * Graph Embedding Strategies Benchmark
 *
 * Compares different approaches for integrating graph structure into SHGAT:
 *
 * 1. Baseline: BGE only (no graph)
 * 2. Pre-concat: BGE + Node2Vec concatenated before SHGAT
 * 3. Init: Node2Vec initializes SHGAT, then train
 * 4. Multi-view: Separate BGE and Node2Vec paths with attention fusion
 * 5. Positional: BGE + Laplacian eigenvectors as positional encodings
 * 6. Hybrid weighted: BGE * 0.3 + Node2Vec * 0.7 (previous best)
 *
 * Run: deno run --allow-all tests/benchmarks/shgat-embeddings/graph-embedding-strategies.bench.ts
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";
import {
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
} from "../../../src/graphrag/algorithms/shgat.ts";
import Graph from "npm:graphology";
import { Matrix, EigenvalueDecomposition, SingularValueDecomposition } from "npm:ml-matrix";

console.log("=== Graph Embedding Strategies Benchmark ===\n");

// ============================================================================
// Load Data
// ============================================================================

const scenario = await loadScenario("production-traces");

interface Cap { id: string; embedding?: number[]; toolsUsed?: string[]; successRate?: number; }
interface Event { intentEmbedding?: number[]; contextTools?: string[]; selectedCapability: string; outcome: string; }
interface Query { intentEmbedding?: number[]; expectedCapability: string; }

const allCaps: Cap[] = scenario.nodes.capabilities.filter((c: Cap) => c.embedding?.length);
const allEvents: Event[] = scenario.episodicEvents || [];
const allQueries: Query[] = scenario.testQueries || [];

// Top 50 caps
const freq = new Map<string, number>();
for (const e of allEvents) freq.set(e.selectedCapability, (freq.get(e.selectedCapability) || 0) + 1);
const top50Ids = new Set([...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([id]) => id));

const caps = allCaps.filter(c => top50Ids.has(c.id));
const events = allEvents.filter(e => top50Ids.has(e.selectedCapability));
const queries = allQueries.filter(q => top50Ids.has(q.expectedCapability));

// Tools
const allTools = new Set<string>();
caps.forEach(c => (c.toolsUsed || []).forEach(t => allTools.add(t)));
const toolList = [...allTools];
const toolIdx = new Map<string, number>();
toolList.forEach((t, i) => toolIdx.set(t, i));

const capList = caps.map(c => c.id);
const capIdx = new Map<string, number>();
caps.forEach((c, i) => capIdx.set(c.id, i));

console.log(`Data: ${caps.length} caps, ${toolList.length} tools, ${events.length} events, ${queries.length} queries\n`);

// ============================================================================
// Graph Building Utilities
// ============================================================================

function buildBipartiteGraph(): Graph {
  const graph = new Graph();
  for (const tool of toolList) graph.addNode(tool, { type: "tool" });
  for (const cap of caps) graph.addNode(cap.id, { type: "capability" });
  for (const cap of caps) {
    for (const tool of cap.toolsUsed || []) {
      if (graph.hasNode(tool)) {
        try { graph.addEdge(cap.id, tool); } catch { /* exists */ }
      }
    }
  }
  return graph;
}

// ============================================================================
// Embedding Generators
// ============================================================================

/**
 * Generate Node2Vec embeddings via random walks + PMI + SVD
 */
function generateNode2Vec(dim: number = 64): Map<string, number[]> {
  const graph = buildBipartiteGraph();
  const walkLength = 15, walksPerNode = 40, windowSize = 5;

  function randomWalk(start: string, len: number): string[] {
    const walk = [start];
    let cur = start;
    for (let i = 0; i < len - 1; i++) {
      const neighbors = graph.neighbors(cur);
      if (!neighbors.length) break;
      cur = neighbors[Math.floor(Math.random() * neighbors.length)];
      walk.push(cur);
    }
    return walk;
  }

  // Co-occurrence matrix
  const cooc: number[][] = caps.map(() => caps.map(() => 0));

  for (const cap of caps) {
    for (let w = 0; w < walksPerNode; w++) {
      const walk = randomWalk(cap.id, walkLength);
      for (let i = 0; i < walk.length; i++) {
        const iIdx = capIdx.get(walk[i]);
        if (iIdx === undefined) continue;
        for (let j = Math.max(0, i - windowSize); j < Math.min(walk.length, i + windowSize + 1); j++) {
          if (i === j) continue;
          const jIdx = capIdx.get(walk[j]);
          if (jIdx !== undefined) cooc[iIdx][jIdx]++;
        }
      }
    }
  }

  // PMI
  let total = 0;
  const rowSums = cooc.map(r => { const s = r.reduce((a, b) => a + b, 0); total += s; return s; });
  const colSums = caps.map((_, j) => cooc.reduce((s, r) => s + r[j], 0));

  const pmi: number[][] = caps.map(() => caps.map(() => 0));
  for (let i = 0; i < caps.length; i++) {
    for (let j = 0; j < caps.length; j++) {
      if (cooc[i][j] > 0 && rowSums[i] > 0 && colSums[j] > 0 && total > 0) {
        const pxy = cooc[i][j] / total;
        const px = rowSums[i] / total;
        const py = colSums[j] / total;
        pmi[i][j] = Math.max(0, Math.log(pxy / (px * py)));
      }
    }
  }

  // SVD
  const svd = new SingularValueDecomposition(new Matrix(pmi));
  const U = svd.leftSingularVectors;
  const S = svd.diagonal;

  const embeddings = new Map<string, number[]>();
  for (let i = 0; i < caps.length; i++) {
    const emb: number[] = [];
    for (let d = 0; d < Math.min(dim, S.length); d++) {
      emb.push(U.get(i, d) * Math.sqrt(S[d]));
    }
    while (emb.length < dim) emb.push(0);
    const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
    embeddings.set(capList[i], emb.map(v => v / norm));
  }
  return embeddings;
}

/**
 * Generate Laplacian eigenvectors (positional encodings)
 */
function generateLaplacianPositional(dim: number = 32): Map<string, number[]> {
  const n = toolList.length + caps.length;
  const adj: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  const capOffset = toolList.length;

  for (const cap of caps) {
    const cIdx = capOffset + capIdx.get(cap.id)!;
    for (const tool of cap.toolsUsed || []) {
      const tIdx = toolIdx.get(tool);
      if (tIdx !== undefined) {
        adj[tIdx][cIdx] = 1;
        adj[cIdx][tIdx] = 1;
      }
    }
  }

  // Degree and normalized Laplacian
  const degree = adj.map(row => row.reduce((a, b) => a + b, 0));
  const laplacian: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        laplacian[i][j] = 1;
      } else if (adj[i][j] > 0 && degree[i] > 0 && degree[j] > 0) {
        laplacian[i][j] = -adj[i][j] / Math.sqrt(degree[i] * degree[j]);
      }
    }
  }

  // Eigendecomposition
  const eigen = new EigenvalueDecomposition(new Matrix(laplacian));
  const eigenvectors = eigen.eigenvectorMatrix;
  const eigenvalues = eigen.realEigenvalues;

  // Sort by eigenvalue (ascending), skip first trivial
  const sortedIndices = eigenvalues
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val)
    .slice(1, dim + 1)
    .map(x => x.idx);

  const embeddings = new Map<string, number[]>();
  for (const cap of caps) {
    const rowIdx = capOffset + capIdx.get(cap.id)!;
    const emb = sortedIndices.map(colIdx => eigenvectors.get(rowIdx, colIdx));
    const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
    embeddings.set(cap.id, emb.map(v => v / norm));
  }
  return embeddings;
}

// ============================================================================
// Evaluation
// ============================================================================

function evaluate(
  shgatCaps: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents: string[]; children: string[] }>,
  trainEpochs: number = 10
): { mrr: number; hit1: number; hit3: number; hit5: number } {
  const shgat = createSHGATFromCapabilities(shgatCaps, new Map(), { numHeads: 4, hiddenDim: 64 });

  const trainingExamples = events
    .filter(e => e.intentEmbedding?.length)
    .map(e => ({
      intentEmbedding: e.intentEmbedding!,
      contextTools: e.contextTools || [],
      candidateId: e.selectedCapability,
      outcome: e.outcome === "success" ? 1 : 0,
    }));

  trainSHGATOnEpisodes(shgat, trainingExamples, { epochs: trainEpochs, learningRate: 0.01 });

  let hits1 = 0, hits3 = 0, hits5 = 0, mrrSum = 0, evaluated = 0;

  for (const query of queries) {
    if (!query.intentEmbedding?.length) continue;
    const results = shgat.scoreAllCapabilities(query.intentEmbedding);
    const sorted = results.map(r => ({ id: r.capabilityId, score: r.score })).sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex(s => s.id === query.expectedCapability) + 1;

    if (rank === 1) hits1++;
    if (rank > 0 && rank <= 3) hits3++;
    if (rank > 0 && rank <= 5) hits5++;
    if (rank > 0) mrrSum += 1 / rank;
    evaluated++;
  }

  return {
    mrr: evaluated > 0 ? mrrSum / evaluated : 0,
    hit1: evaluated > 0 ? hits1 / evaluated * 100 : 0,
    hit3: evaluated > 0 ? hits3 / evaluated * 100 : 0,
    hit5: evaluated > 0 ? hits5 / evaluated * 100 : 0,
  };
}

function toCaps(embeddings: Map<string, number[]> | null, transform: (cap: Cap, emb: number[] | null) => number[]): Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents: string[]; children: string[] }> {
  return caps.map(c => ({
    id: c.id,
    embedding: transform(c, embeddings?.get(c.id) ?? null),
    toolsUsed: c.toolsUsed || [],
    successRate: c.successRate || 0.5,
    parents: [] as string[],
    children: [] as string[],
  }));
}

function normalize(emb: number[]): number[] {
  const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
  return emb.map(v => v / norm);
}

function pad(emb: number[], targetLen: number): number[] {
  if (emb.length >= targetLen) return emb.slice(0, targetLen);
  return [...emb, ...Array(targetLen - emb.length).fill(0)];
}

// ============================================================================
// Run Benchmarks
// ============================================================================

interface Result { name: string; mrr: number; hit1: number; hit3: number; hit5: number; }
const results: Result[] = [];
const RUNS = 3;

async function bench(name: string, capsFn: () => ReturnType<typeof toCaps>): Promise<void> {
  const runs: { mrr: number; hit1: number; hit3: number; hit5: number }[] = [];

  for (let r = 0; r < RUNS; r++) {
    const result = evaluate(capsFn());
    runs.push(result);
  }

  const avg = {
    mrr: runs.reduce((s, r) => s + r.mrr, 0) / RUNS,
    hit1: runs.reduce((s, r) => s + r.hit1, 0) / RUNS,
    hit3: runs.reduce((s, r) => s + r.hit3, 0) / RUNS,
    hit5: runs.reduce((s, r) => s + r.hit5, 0) / RUNS,
  };

  results.push({ name, ...avg });
  console.log(`${name.padEnd(35)} │ ${avg.mrr.toFixed(3).padStart(6)} │ ${(avg.hit1.toFixed(1) + "%").padStart(6)} │ ${(avg.hit3.toFixed(1) + "%").padStart(6)} │ ${(avg.hit5.toFixed(1) + "%").padStart(6)} │`);
}

console.log("Strategy                            │   MRR  │ Hit@1  │ Hit@3  │ Hit@5  │");
console.log("────────────────────────────────────┼────────┼────────┼────────┼────────┤");

// 1. Baseline: BGE only
await bench("1. BGE only (baseline)", () =>
  toCaps(null, (c, _) => c.embedding!)
);

// Pre-generate embeddings for reuse
console.log("\nGenerating graph embeddings...");
const n2v64 = generateNode2Vec(64);
const n2v128 = generateNode2Vec(128);
const lap32 = generateLaplacianPositional(32);
const lap64 = generateLaplacianPositional(64);
console.log("Done.\n");

console.log("Strategy                            │   MRR  │ Hit@1  │ Hit@3  │ Hit@5  │");
console.log("────────────────────────────────────┼────────┼────────┼────────┼────────┤");

// 2. Hybrid weighted (previous best): BGE * 0.3 + N2V * 0.7
await bench("2. Hybrid 30/70 (prev best)", () =>
  toCaps(n2v64, (c, n2v) => {
    const bge = c.embedding!;
    const n2vPad = pad(n2v || Array(64).fill(0), 1024);
    const hybrid = bge.map((v, i) => v * 0.3 + n2vPad[i] * 0.7);
    return normalize(hybrid);
  })
);

// 3. Concat: BGE (1024) + N2V (128) = 1152, truncate to 1024
await bench("3. Concat BGE+N2V (truncate)", () =>
  toCaps(n2v128, (c, n2v) => {
    const concat = [...c.embedding!, ...(n2v || Array(128).fill(0))];
    return normalize(concat.slice(0, 1024));
  })
);

// 4. Concat with projection simulation: mean of BGE and padded N2V
await bench("4. Concat mean (BGE, N2V)", () =>
  toCaps(n2v64, (c, n2v) => {
    const bge = c.embedding!;
    const n2vPad = pad(n2v || Array(64).fill(0), 1024);
    const mean = bge.map((v, i) => (v + n2vPad[i]) / 2);
    return normalize(mean);
  })
);

// 5. Init strategy: Use N2V as base, add small BGE component
await bench("5. Init N2V + BGE residual", () =>
  toCaps(n2v64, (c, n2v) => {
    const n2vPad = pad(n2v || Array(64).fill(0), 1024);
    const bge = c.embedding!;
    // N2V as main signal, BGE as residual
    const init = n2vPad.map((v, i) => v + bge[i] * 0.1);
    return normalize(init);
  })
);

// 6. Positional: BGE + Laplacian eigenvectors
await bench("6. BGE + Laplacian pos (32d)", () =>
  toCaps(lap32, (c, lap) => {
    const bge = c.embedding!;
    const lapPad = pad(lap || Array(32).fill(0), 1024);
    const combined = bge.map((v, i) => v + lapPad[i] * 0.5);
    return normalize(combined);
  })
);

await bench("7. BGE + Laplacian pos (64d)", () =>
  toCaps(lap64, (c, lap) => {
    const bge = c.embedding!;
    const lapPad = pad(lap || Array(64).fill(0), 1024);
    const combined = bge.map((v, i) => v + lapPad[i] * 0.5);
    return normalize(combined);
  })
);

// 7. Multi-view simulation: alternate dimensions
await bench("8. Multi-view interleave", () =>
  toCaps(n2v64, (c, n2v) => {
    const bge = c.embedding!;
    const n2vPad = pad(n2v || Array(64).fill(0), 1024);
    // Interleave: even dims = BGE, odd dims = N2V
    const interleaved = bge.map((v, i) => i % 2 === 0 ? v : n2vPad[i]);
    return normalize(interleaved);
  })
);

// 8. Gated combination: learn-like weighting per dimension
await bench("9. Dim-wise gate (cosine)", () =>
  toCaps(n2v64, (c, n2v) => {
    const bge = c.embedding!;
    const n2vPad = pad(n2v || Array(64).fill(0), 1024);
    // Gate based on magnitude: higher magnitude wins
    const gated = bge.map((v, i) => {
      const gate = Math.abs(v) / (Math.abs(v) + Math.abs(n2vPad[i]) + 1e-6);
      return v * gate + n2vPad[i] * (1 - gate);
    });
    return normalize(gated);
  })
);

// 9. N2V only (no BGE)
await bench("10. N2V only (no BGE)", () =>
  toCaps(n2v64, (_, n2v) => {
    return normalize(pad(n2v || Array(64).fill(0), 1024));
  })
);

// 10. Laplacian only
await bench("11. Laplacian only (no BGE)", () =>
  toCaps(lap64, (_, lap) => {
    return normalize(pad(lap || Array(64).fill(0), 1024));
  })
);

// 11. Different hybrid ratios
await bench("12. Hybrid 50/50", () =>
  toCaps(n2v64, (c, n2v) => {
    const bge = c.embedding!;
    const n2vPad = pad(n2v || Array(64).fill(0), 1024);
    return normalize(bge.map((v, i) => v * 0.5 + n2vPad[i] * 0.5));
  })
);

await bench("13. Hybrid 70/30 (BGE heavy)", () =>
  toCaps(n2v64, (c, n2v) => {
    const bge = c.embedding!;
    const n2vPad = pad(n2v || Array(64).fill(0), 1024);
    return normalize(bge.map((v, i) => v * 0.7 + n2vPad[i] * 0.3));
  })
);

// 12. Laplacian + N2V (no BGE, pure graph)
await bench("14. Lap + N2V (pure graph)", () => {
  return caps.map(c => {
    const lap = lap64.get(c.id) || Array(64).fill(0);
    const n2v = n2v64.get(c.id) || Array(64).fill(0);
    const combined = [...lap, ...n2v];
    return {
      id: c.id,
      embedding: normalize(pad(combined, 1024)),
      toolsUsed: c.toolsUsed || [],
      successRate: c.successRate || 0.5,
      parents: [] as string[],
      children: [] as string[],
    };
  });
});

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "═".repeat(75));
console.log("                              SUMMARY");
console.log("═".repeat(75));

const sorted = [...results].sort((a, b) => b.mrr - a.mrr);
const baseline = results[0];

console.log("\nRanked by MRR:");
console.log("─".repeat(75));
for (let i = 0; i < sorted.length; i++) {
  const r = sorted[i];
  const improvement = ((r.mrr / baseline.mrr - 1) * 100).toFixed(0);
  const sign = r.mrr >= baseline.mrr ? "+" : "";
  console.log(`${(i + 1).toString().padStart(2)}. ${r.name.padEnd(35)} MRR=${r.mrr.toFixed(3)} Hit@3=${r.hit3.toFixed(1)}% (${sign}${improvement}%)`);
}

const best = sorted[0];
console.log("\n🏆 Best Strategy:");
console.log(`   ${best.name}`);
console.log(`   MRR=${best.mrr.toFixed(3)}, Hit@1=${best.hit1.toFixed(1)}%, Hit@3=${best.hit3.toFixed(1)}%, Hit@5=${best.hit5.toFixed(1)}%`);
console.log(`   vs Baseline: +${((best.mrr / baseline.mrr - 1) * 100).toFixed(0)}%`);

// Group analysis
console.log("\n📊 Strategy Groups:");
const groups = {
  "Pure BGE": results.filter(r => r.name.includes("BGE only")),
  "Pure Graph": results.filter(r => r.name.includes("only") && !r.name.includes("BGE")),
  "Hybrid": results.filter(r => r.name.includes("Hybrid")),
  "Positional": results.filter(r => r.name.includes("Laplacian") && r.name.includes("BGE")),
  "Concat/Init": results.filter(r => r.name.includes("Concat") || r.name.includes("Init")),
};

for (const [group, items] of Object.entries(groups)) {
  if (items.length === 0) continue;
  const avgMrr = items.reduce((s, r) => s + r.mrr, 0) / items.length;
  const bestInGroup = items.reduce((a, b) => a.mrr > b.mrr ? a : b);
  console.log(`   ${group.padEnd(15)}: avg MRR=${avgMrr.toFixed(3)}, best=${bestInGroup.name.split(".")[1]?.trim() || bestInGroup.name}`);
}
