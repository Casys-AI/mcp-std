/**
 * Weight Ratio Focus Benchmark
 *
 * Tests BGE vs Node2Vec weight ratios with optimal N2V params.
 * Runs multiple times to account for random walk variance.
 *
 * Run: deno run --allow-all tests/benchmarks/shgat-embeddings/weight-ratio-focus.bench.ts
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";
import {
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
} from "../../../src/graphrag/algorithms/shgat.ts";
import Graph from "npm:graphology";
import { Matrix, SingularValueDecomposition } from "npm:ml-matrix";

console.log("=== Weight Ratio Focus Benchmark ===\n");

// Load data
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

const allTools = new Set<string>();
caps.forEach(c => (c.toolsUsed || []).forEach(t => allTools.add(t)));
const toolList = [...allTools];

console.log(`Data: ${caps.length} caps, ${toolList.length} tools, ${queries.length} queries\n`);

// Optimal N2V params from previous benchmark
const N2V_CONFIG = {
  walkLength: 15,
  walksPerNode: 40,
  windowSize: 5,
  embeddingDim: 64,
};

// Node2Vec generator
function generateNode2Vec(): Map<string, number[]> {
  const { walkLength, walksPerNode, windowSize, embeddingDim } = N2V_CONFIG;

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

  const capIdx = new Map<string, number>();
  caps.forEach((c, i) => capIdx.set(c.id, i));

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

  const cooc = new Map<string, Map<string, number>>();
  for (const c of caps) cooc.set(c.id, new Map());

  for (const cap of caps) {
    for (let w = 0; w < walksPerNode; w++) {
      const walk = randomWalk(cap.id, walkLength);
      for (let i = 0; i < walk.length; i++) {
        if (walk[i] !== cap.id) continue;
        for (let j = Math.max(0, i - windowSize); j < Math.min(walk.length, i + windowSize + 1); j++) {
          if (i === j) continue;
          if (capIdx.has(walk[j])) {
            const cur = cooc.get(cap.id)!.get(walk[j]) || 0;
            cooc.get(cap.id)!.set(walk[j], cur + 1);
          }
        }
      }
    }
  }

  const capList = caps.map(c => c.id);
  const coocMat = caps.map(() => caps.map(() => 0));
  let total = 0;

  for (let i = 0; i < caps.length; i++) {
    const c = cooc.get(capList[i])!;
    for (let j = 0; j < caps.length; j++) {
      const cnt = c.get(capList[j]) || 0;
      coocMat[i][j] = cnt;
      total += cnt;
    }
  }

  const rowSums = coocMat.map(r => r.reduce((a, b) => a + b, 0));
  const colSums = caps.map((_, j) => coocMat.reduce((s, r) => s + r[j], 0));

  const pmi = caps.map(() => caps.map(() => 0));
  for (let i = 0; i < caps.length; i++) {
    for (let j = 0; j < caps.length; j++) {
      if (coocMat[i][j] > 0 && rowSums[i] > 0 && colSums[j] > 0 && total > 0) {
        const pxy = coocMat[i][j] / total;
        const px = rowSums[i] / total;
        const py = colSums[j] / total;
        pmi[i][j] = Math.max(0, Math.log(pxy / (px * py)));
      }
    }
  }

  const svd = new SingularValueDecomposition(new Matrix(pmi));
  const U = svd.leftSingularVectors;
  const S = svd.diagonal;

  const embeddings = new Map<string, number[]>();
  for (let i = 0; i < caps.length; i++) {
    const emb: number[] = [];
    for (let d = 0; d < Math.min(embeddingDim, S.length); d++) {
      emb.push(U.get(i, d) * Math.sqrt(S[d]));
    }
    while (emb.length < embeddingDim) emb.push(0);
    const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
    embeddings.set(capList[i], emb.map(v => v / norm));
  }

  return embeddings;
}

// Evaluate
function evaluate(
  shgatCaps: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents: string[]; children: string[] }>
): { mrr: number; hit1: number; hit3: number } {
  const shgat = createSHGATFromCapabilities(shgatCaps, new Map(), { numHeads: 4, hiddenDim: 64 });

  const examples = events
    .filter(e => e.intentEmbedding?.length)
    .map(e => ({
      intentEmbedding: e.intentEmbedding!,
      contextTools: e.contextTools || [],
      candidateId: e.selectedCapability,
      outcome: e.outcome === "success" ? 1 : 0,
    }));

  trainSHGATOnEpisodes(shgat, examples, { epochs: 10, learningRate: 0.01 });

  let hits1 = 0, hits3 = 0, mrrSum = 0, evaluated = 0;

  for (const q of queries) {
    if (!q.intentEmbedding?.length) continue;
    const results = shgat.scoreAllCapabilities(q.intentEmbedding);
    const sorted = results.map(r => ({ id: r.capabilityId, score: r.score })).sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex(s => s.id === q.expectedCapability) + 1;

    if (rank === 1) hits1++;
    if (rank > 0 && rank <= 3) hits3++;
    if (rank > 0) mrrSum += 1 / rank;
    evaluated++;
  }

  return {
    mrr: evaluated > 0 ? mrrSum / evaluated : 0,
    hit1: evaluated > 0 ? hits1 / evaluated * 100 : 0,
    hit3: evaluated > 0 ? hits3 / evaluated * 100 : 0,
  };
}

// Build hybrid caps
function buildHybrid(n2v: Map<string, number[]>, bgeWeight: number) {
  const n2vWeight = 1 - bgeWeight;
  return caps.map(c => {
    const bge = c.embedding!;
    const n2vEmb = n2v.get(c.id) || new Array(N2V_CONFIG.embeddingDim).fill(0);
    const n2vPad = [...n2vEmb, ...new Array(1024 - n2vEmb.length).fill(0)];
    const hybrid = bge.map((v, i) => v * bgeWeight + n2vPad[i] * n2vWeight);
    const norm = Math.sqrt(hybrid.reduce((s, v) => s + v * v, 0)) || 1;
    return {
      id: c.id,
      embedding: hybrid.map(v => v / norm),
      toolsUsed: c.toolsUsed || [],
      successRate: c.successRate || 0.5,
      parents: [] as string[],
      children: [] as string[],
    };
  });
}

// ============================================================================
// Run multiple times per weight ratio
// ============================================================================

const RUNS = 5;
const RATIOS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

console.log(`Testing ${RATIOS.length} weight ratios x ${RUNS} runs each\n`);
console.log("BGE Weight │ Avg MRR │ Avg Hit@1 │ Avg Hit@3 │ Best Hit@3 │");
console.log("───────────┼─────────┼───────────┼───────────┼────────────┤");

const allResults: { bgeWeight: number; avgMrr: number; avgHit1: number; avgHit3: number; bestHit3: number }[] = [];

for (const bgeWeight of RATIOS) {
  const runs: { mrr: number; hit1: number; hit3: number }[] = [];

  for (let run = 0; run < RUNS; run++) {
    const n2v = generateNode2Vec();
    const hybridCaps = buildHybrid(n2v, bgeWeight);
    const r = evaluate(hybridCaps);
    runs.push(r);
  }

  const avgMrr = runs.reduce((s, r) => s + r.mrr, 0) / RUNS;
  const avgHit1 = runs.reduce((s, r) => s + r.hit1, 0) / RUNS;
  const avgHit3 = runs.reduce((s, r) => s + r.hit3, 0) / RUNS;
  const bestHit3 = Math.max(...runs.map(r => r.hit3));

  allResults.push({ bgeWeight, avgMrr, avgHit1, avgHit3, bestHit3 });

  const label = bgeWeight === 0 ? "N2V only" : bgeWeight === 1 ? "BGE only" : `${(bgeWeight * 100).toFixed(0)}%`;
  console.log(
    `${label.padStart(10)} │ ${avgMrr.toFixed(3).padStart(7)} │ ${(avgHit1.toFixed(1) + "%").padStart(9)} │ ${(avgHit3.toFixed(1) + "%").padStart(9)} │ ${(bestHit3.toFixed(1) + "%").padStart(10)} │`
  );
}

// Summary
console.log("\n" + "═".repeat(60));

const bestByMrr = allResults.reduce((a, b) => a.avgMrr > b.avgMrr ? a : b);
const bestByHit3 = allResults.reduce((a, b) => a.avgHit3 > b.avgHit3 ? a : b);

console.log("\n Best by Avg MRR:");
console.log(`   BGE=${(bestByMrr.bgeWeight * 100).toFixed(0)}% / N2V=${((1 - bestByMrr.bgeWeight) * 100).toFixed(0)}%`);
console.log(`   MRR=${bestByMrr.avgMrr.toFixed(3)}, Hit@3=${bestByMrr.avgHit3.toFixed(1)}%`);

console.log("\n Best by Avg Hit@3:");
console.log(`   BGE=${(bestByHit3.bgeWeight * 100).toFixed(0)}% / N2V=${((1 - bestByHit3.bgeWeight) * 100).toFixed(0)}%`);
console.log(`   MRR=${bestByHit3.avgMrr.toFixed(3)}, Hit@3=${bestByHit3.avgHit3.toFixed(1)}%`);

// N2V only vs BGE only
const n2vOnly = allResults.find(r => r.bgeWeight === 0)!;
const bgeOnly = allResults.find(r => r.bgeWeight === 1)!;

console.log("\n Comparison:");
console.log(`   N2V only:  MRR=${n2vOnly.avgMrr.toFixed(3)}, Hit@3=${n2vOnly.avgHit3.toFixed(1)}%`);
console.log(`   BGE only:  MRR=${bgeOnly.avgMrr.toFixed(3)}, Hit@3=${bgeOnly.avgHit3.toFixed(1)}%`);
console.log(`   N2V vs BGE: ${(n2vOnly.avgMrr / bgeOnly.avgMrr).toFixed(1)}x MRR`);
