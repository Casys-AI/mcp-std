/**
 * Graph Embeddings Benchmark - Real algorithms
 *
 * 1. Spectral: Eigendecomposition of Laplacian
 * 2. Node2Vec: Random walks + co-occurrence
 * 3. Hybrid: BGE + Graph
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";
import {
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
} from "../../../src/graphrag/algorithms/shgat.ts";
import Graph from "npm:graphology";
import { Matrix, EigenvalueDecomposition, SingularValueDecomposition } from "npm:ml-matrix";

console.log("=== Graph Embeddings Benchmark (Real Algorithms) ===\n");

// Load and filter to top 50 caps
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

// Build bipartite graph: capabilities <-> tools
const allTools = new Set<string>();
caps.forEach(c => (c.toolsUsed || []).forEach(t => allTools.add(t)));
const toolList = [...allTools];

console.log(`Data: ${caps.length} caps, ${toolList.length} tools, ${events.length} events, ${queries.length} queries\n`);

// ============================================================================
// 1. SPECTRAL EMBEDDINGS (Real Laplacian Eigendecomposition)
// ============================================================================

console.log("━━━ Computing Spectral Embeddings ━━━");

// Build adjacency matrix for bipartite graph
// Nodes: [tools..., caps...]
const n = toolList.length + caps.length;
const adjMatrix = new Array(n).fill(0).map(() => new Array(n).fill(0));

const toolIdx = new Map<string, number>();
toolList.forEach((t, i) => toolIdx.set(t, i));

const capIdx = new Map<string, number>();
caps.forEach((c, i) => capIdx.set(c.id, toolList.length + i));

// Fill adjacency: tool-capability edges
for (const cap of caps) {
  const cIdx = capIdx.get(cap.id)!;
  for (const tool of cap.toolsUsed || []) {
    const tIdx = toolIdx.get(tool);
    if (tIdx !== undefined) {
      adjMatrix[tIdx][cIdx] = 1;
      adjMatrix[cIdx][tIdx] = 1;
    }
  }
}

// Compute degree matrix
const degree = adjMatrix.map(row => row.reduce((a, b) => a + b, 0));

// Compute normalized Laplacian: L = I - D^(-1/2) * A * D^(-1/2)
const laplacian = new Array(n).fill(0).map(() => new Array(n).fill(0));
for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    if (i === j) {
      laplacian[i][j] = 1; // Identity
    } else if (adjMatrix[i][j] > 0 && degree[i] > 0 && degree[j] > 0) {
      laplacian[i][j] = -adjMatrix[i][j] / Math.sqrt(degree[i] * degree[j]);
    }
  }
}

// Eigendecomposition
console.log("   Computing eigendecomposition...");
const L = new Matrix(laplacian);
const eigen = new EigenvalueDecomposition(L);
const eigenvectors = eigen.eigenvectorMatrix;
const eigenvalues = eigen.realEigenvalues;

// Sort by eigenvalue (ascending) and take first k
const k = 32; // embedding dimension
const sortedIndices = eigenvalues
  .map((val, idx) => ({ val, idx }))
  .sort((a, b) => a.val - b.val)
  .slice(1, k + 1) // Skip first (trivial) eigenvector
  .map(x => x.idx);

// Extract spectral embeddings for capabilities
const spectralEmbeddings = new Map<string, number[]>();
for (const cap of caps) {
  const rowIdx = capIdx.get(cap.id)!;
  const emb = sortedIndices.map(colIdx => eigenvectors.get(rowIdx, colIdx));
  // Normalize
  const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
  spectralEmbeddings.set(cap.id, emb.map(v => v / norm));
}

console.log(`   Generated ${spectralEmbeddings.size} spectral embeddings (${k} dims)`);

// ============================================================================
// 2. NODE2VEC EMBEDDINGS (Random Walks + Skip-gram style)
// ============================================================================

console.log("\n━━━ Computing Node2Vec Embeddings ━━━");

// Build graphology graph
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

console.log(`   Graph: ${graph.order} nodes, ${graph.size} edges`);

// Random walk parameters
const walkLength = 10;
const walksPerNode = 20;
const windowSize = 3;

// Generate random walks from each capability
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

// Build co-occurrence counts (skip-gram style)
console.log("   Generating random walks...");
const cooccurrence = new Map<string, Map<string, number>>();
for (const cap of caps) cooccurrence.set(cap.id, new Map());

for (const cap of caps) {
  for (let w = 0; w < walksPerNode; w++) {
    const walk = randomWalk(cap.id, walkLength);

    // Count co-occurrences within window
    for (let i = 0; i < walk.length; i++) {
      if (walk[i] !== cap.id) continue;

      for (let j = Math.max(0, i - windowSize); j < Math.min(walk.length, i + windowSize + 1); j++) {
        if (i === j) continue;
        const other = walk[j];
        // Only count capability co-occurrences
        if (capIdx.has(other)) {
          const current = cooccurrence.get(cap.id)!.get(other) || 0;
          cooccurrence.get(cap.id)!.set(other, current + 1);
        }
      }
    }
  }
}

// Convert co-occurrence to embeddings via SVD-like factorization
// Simple approach: use PMI-weighted co-occurrence matrix
console.log("   Computing PMI matrix...");
const capList = caps.map(c => c.id);
const coocMatrix = new Array(caps.length).fill(0).map(() => new Array(caps.length).fill(0));

// Fill co-occurrence matrix
let totalCooc = 0;
for (let i = 0; i < caps.length; i++) {
  const cooc = cooccurrence.get(capList[i])!;
  for (let j = 0; j < caps.length; j++) {
    const count = cooc.get(capList[j]) || 0;
    coocMatrix[i][j] = count;
    totalCooc += count;
  }
}

// Compute PMI (Pointwise Mutual Information)
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
      pmiMatrix[i][j] = Math.max(0, pmi); // Positive PMI
    }
  }
}

// SVD of PMI matrix for embeddings
console.log("   SVD factorization...");
const pmiMat = new Matrix(pmiMatrix);
const svd = new SingularValueDecomposition(pmiMat);
const U = svd.leftSingularVectors;
const S = svd.diagonal;

// Take first k dimensions, weighted by sqrt(singular values)
const node2vecDim = 32;
const node2vecEmbeddings = new Map<string, number[]>();
for (let i = 0; i < caps.length; i++) {
  const emb: number[] = [];
  for (let d = 0; d < Math.min(node2vecDim, S.length); d++) {
    emb.push(U.get(i, d) * Math.sqrt(S[d]));
  }
  // Pad if needed
  while (emb.length < node2vecDim) emb.push(0);
  // Normalize
  const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
  node2vecEmbeddings.set(capList[i], emb.map(v => v / norm));
}

console.log(`   Generated ${node2vecEmbeddings.size} Node2Vec embeddings (${node2vecDim} dims)`);

// ============================================================================
// Evaluation Function
// ============================================================================

function evaluate(
  shgatCaps: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents: string[]; children: string[] }>,
  name: string
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

  const mrr = evaluated > 0 ? mrrSum / evaluated : 0;
  const hit1 = evaluated > 0 ? hits1 / evaluated * 100 : 0;
  const hit3 = evaluated > 0 ? hits3 / evaluated * 100 : 0;

  return { mrr, hit1, hit3 };
}

// ============================================================================
// Run Benchmarks
// ============================================================================

console.log("\n━━━ Running SHGAT Benchmarks ━━━\n");
console.log("Strategy                  │   MRR  │ Hit@1  │ Hit@3  │");
console.log("──────────────────────────┼────────┼────────┼────────┤");

function padded(name: string, result: { mrr: number; hit1: number; hit3: number }) {
  console.log(`${name.padEnd(25)} │ ${result.mrr.toFixed(3).padStart(6)} │ ${(result.hit1.toFixed(1) + "%").padStart(6)} │ ${(result.hit3.toFixed(1) + "%").padStart(6)} │`);
}

// 1. BGE-M3 baseline
const bgeCaps = caps.map(c => ({
  id: c.id, embedding: c.embedding!, toolsUsed: c.toolsUsed || [],
  successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[],
}));
const bge = evaluate(bgeCaps, "BGE-M3");
padded("BGE-M3 (baseline)", bge);

// 2. Spectral
const spectralCaps = caps.map(c => {
  const emb = spectralEmbeddings.get(c.id) || new Array(k).fill(0);
  const padded = [...emb, ...new Array(1024 - emb.length).fill(0)];
  return { id: c.id, embedding: padded, toolsUsed: c.toolsUsed || [], successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[] };
});
const spectral = evaluate(spectralCaps, "Spectral");
padded("Spectral (Laplacian)", spectral);

// 3. Node2Vec
const n2vCaps = caps.map(c => {
  const emb = node2vecEmbeddings.get(c.id) || new Array(node2vecDim).fill(0);
  const padded = [...emb, ...new Array(1024 - emb.length).fill(0)];
  return { id: c.id, embedding: padded, toolsUsed: c.toolsUsed || [], successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[] };
});
const n2v = evaluate(n2vCaps, "Node2Vec");
padded("Node2Vec (RandomWalk)", n2v);

// 4. Hybrid BGE + Spectral
const hybridSpectralCaps = caps.map(c => {
  const bgeEmb = c.embedding!;
  const specEmb = spectralEmbeddings.get(c.id) || new Array(k).fill(0);
  const specPadded = [...specEmb, ...new Array(1024 - specEmb.length).fill(0)];
  const hybrid = bgeEmb.map((v, i) => v * 0.7 + specPadded[i] * 0.3);
  const norm = Math.sqrt(hybrid.reduce((s, v) => s + v * v, 0)) || 1;
  return { id: c.id, embedding: hybrid.map(v => v / norm), toolsUsed: c.toolsUsed || [], successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[] };
});
const hybridSpec = evaluate(hybridSpectralCaps, "Hybrid-Spectral");
padded("Hybrid (BGE+Spectral)", hybridSpec);

// 5. Hybrid BGE + Node2Vec
const hybridN2VCaps = caps.map(c => {
  const bgeEmb = c.embedding!;
  const n2vEmb = node2vecEmbeddings.get(c.id) || new Array(node2vecDim).fill(0);
  const n2vPadded = [...n2vEmb, ...new Array(1024 - n2vEmb.length).fill(0)];
  const hybrid = bgeEmb.map((v, i) => v * 0.7 + n2vPadded[i] * 0.3);
  const norm = Math.sqrt(hybrid.reduce((s, v) => s + v * v, 0)) || 1;
  return { id: c.id, embedding: hybrid.map(v => v / norm), toolsUsed: c.toolsUsed || [], successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[] };
});
const hybridN2V = evaluate(hybridN2VCaps, "Hybrid-N2V");
padded("Hybrid (BGE+Node2Vec)", hybridN2V);

// Summary
console.log("\n" + "═".repeat(60));
const results = [
  { name: "BGE-M3", ...bge },
  { name: "Spectral", ...spectral },
  { name: "Node2Vec", ...n2v },
  { name: "Hybrid BGE+Spectral", ...hybridSpec },
  { name: "Hybrid BGE+Node2Vec", ...hybridN2V },
];

const best = results.reduce((a, b) => a.mrr > b.mrr ? a : b);
console.log(`\n🏆 Best: ${best.name}`);
console.log(`   MRR=${best.mrr.toFixed(3)}, Hit@1=${best.hit1.toFixed(1)}%, Hit@3=${best.hit3.toFixed(1)}%`);
console.log(`   vs BGE baseline: ${((best.mrr / bge.mrr - 1) * 100).toFixed(0)}%`);
