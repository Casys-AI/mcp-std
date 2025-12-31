/**
 * Hybrid BGE+Node2Vec Tuning Benchmark
 *
 * Tests multiple configurations of the winning embedding strategy:
 * - Weight ratios (BGE vs Node2Vec)
 * - Node2Vec dimensions
 * - Random walk parameters (length, count, window)
 *
 * Run: deno run --allow-all tests/benchmarks/hybrid-node2vec-tuning.bench.ts
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";
import {
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
} from "../../../src/graphrag/algorithms/shgat.ts";
import Graph from "npm:graphology";
import { Matrix, SingularValueDecomposition } from "npm:ml-matrix";

console.log("=== Hybrid BGE+Node2Vec Tuning Benchmark ===\n");

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

// Get top 50 by frequency
const freq = new Map<string, number>();
for (const e of allEvents) freq.set(e.selectedCapability, (freq.get(e.selectedCapability) || 0) + 1);
const top50Ids = new Set([...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([id]) => id));

const caps = allCaps.filter(c => top50Ids.has(c.id));
const events = allEvents.filter(e => top50Ids.has(e.selectedCapability));
const queries = allQueries.filter(q => top50Ids.has(q.expectedCapability));

// Build tool index
const allTools = new Set<string>();
caps.forEach(c => (c.toolsUsed || []).forEach(t => allTools.add(t)));
const toolList = [...allTools];

console.log(`Data: ${caps.length} caps, ${toolList.length} tools, ${events.length} events, ${queries.length} queries\n`);

// ============================================================================
// Node2Vec Generator with configurable parameters
// ============================================================================

interface Node2VecConfig {
  walkLength: number;
  walksPerNode: number;
  windowSize: number;
  embeddingDim: number;
}

function generateNode2VecEmbeddings(config: Node2VecConfig): Map<string, number[]> {
  const { walkLength, walksPerNode, windowSize, embeddingDim } = config;

  // Build graph
  const graph = new Graph();
  for (const tool of toolList) graph.addNode(tool, { type: "tool" });
  for (const cap of caps) graph.addNode(cap.id, { type: "capability" });
  for (const cap of caps) {
    for (const tool of cap.toolsUsed || []) {
      if (graph.hasNode(tool)) {
        try { graph.addEdge(cap.id, tool); } catch { /* edge exists */ }
      }
    }
  }

  // Capability index
  const capIdx = new Map<string, number>();
  caps.forEach((c, i) => capIdx.set(c.id, i));

  // Random walk function
  function randomWalk(startNode: string, length: number): string[] {
    const walk = [startNode];
    let current = startNode;
    for (let i = 0; i < length - 1; i++) {
      const neighbors = graph.neighbors(current);
      if (neighbors.length === 0) break;
      current = neighbors[Math.floor(Math.random() * neighbors.length)];
      walk.push(current);
    }
    return walk;
  }

  // Build co-occurrence
  const cooccurrence = new Map<string, Map<string, number>>();
  for (const cap of caps) cooccurrence.set(cap.id, new Map());

  for (const cap of caps) {
    for (let w = 0; w < walksPerNode; w++) {
      const walk = randomWalk(cap.id, walkLength);
      for (let i = 0; i < walk.length; i++) {
        if (walk[i] !== cap.id) continue;
        for (let j = Math.max(0, i - windowSize); j < Math.min(walk.length, i + windowSize + 1); j++) {
          if (i === j) continue;
          const other = walk[j];
          if (capIdx.has(other)) {
            const current = cooccurrence.get(cap.id)!.get(other) || 0;
            cooccurrence.get(cap.id)!.set(other, current + 1);
          }
        }
      }
    }
  }

  // PMI matrix
  const capList = caps.map(c => c.id);
  const coocMatrix = new Array(caps.length).fill(0).map(() => new Array(caps.length).fill(0));
  let totalCooc = 0;

  for (let i = 0; i < caps.length; i++) {
    const cooc = cooccurrence.get(capList[i])!;
    for (let j = 0; j < caps.length; j++) {
      const count = cooc.get(capList[j]) || 0;
      coocMatrix[i][j] = count;
      totalCooc += count;
    }
  }

  const rowSums = coocMatrix.map(row => row.reduce((a, b) => a + b, 0));
  const colSums = new Array(caps.length).fill(0);
  for (let j = 0; j < caps.length; j++) {
    for (let i = 0; i < caps.length; i++) {
      colSums[j] += coocMatrix[i][j];
    }
  }

  const pmiMatrix = new Array(caps.length).fill(0).map(() => new Array(caps.length).fill(0));
  for (let i = 0; i < caps.length; i++) {
    for (let j = 0; j < caps.length; j++) {
      if (coocMatrix[i][j] > 0 && rowSums[i] > 0 && colSums[j] > 0 && totalCooc > 0) {
        const pxy = coocMatrix[i][j] / totalCooc;
        const px = rowSums[i] / totalCooc;
        const py = colSums[j] / totalCooc;
        const pmi = Math.log(pxy / (px * py));
        pmiMatrix[i][j] = Math.max(0, pmi);
      }
    }
  }

  // SVD
  const pmiMat = new Matrix(pmiMatrix);
  const svd = new SingularValueDecomposition(pmiMat);
  const U = svd.leftSingularVectors;
  const S = svd.diagonal;

  // Extract embeddings
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

// ============================================================================
// Evaluation Function
// ============================================================================

function evaluate(
  shgatCaps: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents: string[]; children: string[] }>
): { mrr: number; hit1: number; hit3: number } {
  const shgat = createSHGATFromCapabilities(shgatCaps, new Map(), { numHeads: 4, hiddenDim: 64 });

  const trainingExamples = events
    .filter(e => e.intentEmbedding?.length)
    .map(e => ({
      intentEmbedding: e.intentEmbedding!,
      contextTools: e.contextTools || [],
      candidateId: e.selectedCapability,
      outcome: e.outcome === "success" ? 1 : 0,
    }));

  trainSHGATOnEpisodes(shgat, trainingExamples, { epochs: 10, learningRate: 0.01 });

  let hits1 = 0, hits3 = 0, mrrSum = 0, evaluated = 0;

  for (const query of queries) {
    if (!query.intentEmbedding?.length) continue;

    const results = shgat.scoreAllCapabilities(query.intentEmbedding);
    const sorted = results.map(r => ({ id: r.capabilityId, score: r.score })).sort((a, b) => b.score - a.score);
    const idx = sorted.findIndex(s => s.id === query.expectedCapability);
    const rank = idx >= 0 ? idx + 1 : 0;

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

function buildHybridCaps(
  n2vEmbeddings: Map<string, number[]>,
  bgeWeight: number,
  n2vDim: number
): Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents: string[]; children: string[] }> {
  const n2vWeight = 1 - bgeWeight;

  return caps.map(c => {
    const bgeEmb = c.embedding!;
    const n2vEmb = n2vEmbeddings.get(c.id) || new Array(n2vDim).fill(0);
    const n2vPadded = [...n2vEmb, ...new Array(1024 - n2vEmb.length).fill(0)];
    const hybrid = bgeEmb.map((v, i) => v * bgeWeight + n2vPadded[i] * n2vWeight);
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
// Benchmark Configurations
// ============================================================================

interface BenchResult {
  config: string;
  mrr: number;
  hit1: number;
  hit3: number;
}

const results: BenchResult[] = [];

// Header
console.log("Configuration                              │   MRR  │ Hit@1  │ Hit@3  │");
console.log("───────────────────────────────────────────┼────────┼────────┼────────┤");

function logResult(config: string, r: { mrr: number; hit1: number; hit3: number }) {
  console.log(`${config.padEnd(42)} │ ${r.mrr.toFixed(3).padStart(6)} │ ${(r.hit1.toFixed(1) + "%").padStart(6)} │ ${(r.hit3.toFixed(1) + "%").padStart(6)} │`);
  results.push({ config, ...r });
}

// ============================================================================
// 1. BGE-M3 Baseline
// ============================================================================

console.log("\n── Baseline ──");
const bgeCaps = caps.map(c => ({
  id: c.id, embedding: c.embedding!, toolsUsed: c.toolsUsed || [],
  successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[],
}));
const bgeResult = evaluate(bgeCaps);
logResult("BGE-M3 only (baseline)", bgeResult);

// ============================================================================
// 2. Weight Ratio Tuning (with default N2V params)
// ============================================================================

console.log("\n── Weight Ratios (walkLen=10, walks=20, win=3, dim=32) ──");

const defaultN2V = generateNode2VecEmbeddings({
  walkLength: 10,
  walksPerNode: 20,
  windowSize: 3,
  embeddingDim: 32,
});

for (const bgeWeight of [0.3, 0.5, 0.6, 0.7, 0.8, 0.9]) {
  const hybridCaps = buildHybridCaps(defaultN2V, bgeWeight, 32);
  const r = evaluate(hybridCaps);
  logResult(`BGE=${(bgeWeight * 100).toFixed(0)}% / N2V=${((1 - bgeWeight) * 100).toFixed(0)}%`, r);
}

// ============================================================================
// 3. Node2Vec Dimension Tuning
// ============================================================================

console.log("\n── N2V Dimensions (BGE=70%, walkLen=10, walks=20, win=3) ──");

for (const dim of [8, 16, 32, 48, 64]) {
  const n2v = generateNode2VecEmbeddings({
    walkLength: 10,
    walksPerNode: 20,
    windowSize: 3,
    embeddingDim: dim,
  });
  const hybridCaps = buildHybridCaps(n2v, 0.7, dim);
  const r = evaluate(hybridCaps);
  logResult(`dim=${dim}`, r);
}

// ============================================================================
// 4. Walk Length Tuning
// ============================================================================

console.log("\n── Walk Length (BGE=70%, walks=20, win=3, dim=32) ──");

for (const walkLength of [5, 10, 15, 20, 30]) {
  const n2v = generateNode2VecEmbeddings({
    walkLength,
    walksPerNode: 20,
    windowSize: 3,
    embeddingDim: 32,
  });
  const hybridCaps = buildHybridCaps(n2v, 0.7, 32);
  const r = evaluate(hybridCaps);
  logResult(`walkLength=${walkLength}`, r);
}

// ============================================================================
// 5. Walks Per Node Tuning
// ============================================================================

console.log("\n── Walks Per Node (BGE=70%, walkLen=10, win=3, dim=32) ──");

for (const walksPerNode of [5, 10, 20, 40, 80]) {
  const n2v = generateNode2VecEmbeddings({
    walkLength: 10,
    walksPerNode,
    windowSize: 3,
    embeddingDim: 32,
  });
  const hybridCaps = buildHybridCaps(n2v, 0.7, 32);
  const r = evaluate(hybridCaps);
  logResult(`walksPerNode=${walksPerNode}`, r);
}

// ============================================================================
// 6. Window Size Tuning
// ============================================================================

console.log("\n── Window Size (BGE=70%, walkLen=10, walks=20, dim=32) ──");

for (const windowSize of [1, 2, 3, 5, 7]) {
  const n2v = generateNode2VecEmbeddings({
    walkLength: 10,
    walksPerNode: 20,
    windowSize,
    embeddingDim: 32,
  });
  const hybridCaps = buildHybridCaps(n2v, 0.7, 32);
  const r = evaluate(hybridCaps);
  logResult(`windowSize=${windowSize}`, r);
}

// ============================================================================
// 7. Best Combinations
// ============================================================================

console.log("\n── Optimized Combinations ──");

// Try a few promising combinations based on individual results
const combos = [
  { bgeWeight: 0.6, walkLength: 15, walksPerNode: 40, windowSize: 5, embeddingDim: 48 },
  { bgeWeight: 0.5, walkLength: 20, walksPerNode: 40, windowSize: 3, embeddingDim: 32 },
  { bgeWeight: 0.7, walkLength: 10, walksPerNode: 80, windowSize: 3, embeddingDim: 64 },
  { bgeWeight: 0.5, walkLength: 15, walksPerNode: 40, windowSize: 5, embeddingDim: 64 },
];

for (const combo of combos) {
  const n2v = generateNode2VecEmbeddings({
    walkLength: combo.walkLength,
    walksPerNode: combo.walksPerNode,
    windowSize: combo.windowSize,
    embeddingDim: combo.embeddingDim,
  });
  const hybridCaps = buildHybridCaps(n2v, combo.bgeWeight, combo.embeddingDim);
  const r = evaluate(hybridCaps);
  logResult(`B${(combo.bgeWeight * 100).toFixed(0)}/L${combo.walkLength}/W${combo.walksPerNode}/S${combo.windowSize}/D${combo.embeddingDim}`, r);
}

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "═".repeat(70));
console.log("                           SUMMARY");
console.log("═".repeat(70));

// Sort by MRR
const sorted = [...results].sort((a, b) => b.mrr - a.mrr);

console.log("\nTop 5 Configurations:");
console.log("─".repeat(70));
for (let i = 0; i < Math.min(5, sorted.length); i++) {
  const r = sorted[i];
  const improvement = ((r.mrr / bgeResult.mrr - 1) * 100).toFixed(0);
  console.log(`${(i + 1).toString().padStart(2)}. ${r.config.padEnd(40)} MRR=${r.mrr.toFixed(3)} Hit@3=${r.hit3.toFixed(1)}% (+${improvement}%)`);
}

const best = sorted[0];
console.log("\n🏆 Best Configuration:");
console.log(`   ${best.config}`);
console.log(`   MRR=${best.mrr.toFixed(3)}, Hit@1=${best.hit1.toFixed(1)}%, Hit@3=${best.hit3.toFixed(1)}%`);
console.log(`   Improvement vs BGE baseline: +${((best.mrr / bgeResult.mrr - 1) * 100).toFixed(0)}%`);

// Output recommended config
console.log("\n📋 Recommended Config for Production:");
console.log("   Copy this to your SHGAT configuration:");
console.log(`   node2vec: {`);
console.log(`     walkLength: <from best>,`);
console.log(`     walksPerNode: <from best>,`);
console.log(`     windowSize: <from best>,`);
console.log(`     embeddingDim: <from best>,`);
console.log(`     bgeWeight: <from best>`);
console.log(`   }`);
