/**
 * Embedding Strategies Benchmark
 *
 * Compares 3 embedding approaches for SHGAT:
 * 1. BGE-M3 only (semantic, current)
 * 2. Spectral (graph structure)
 * 3. Hybrid (BGE + spectral concatenated)
 *
 * Run: deno run --allow-all tests/benchmarks/embedding-strategies.bench.ts
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";
import {
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
} from "../../../src/graphrag/algorithms/shgat.ts";
import { SpectralClusteringManager } from "../../../src/graphrag/spectral-clustering.ts";
import Graph from "npm:graphology";

console.log("=== Embedding Strategies Benchmark ===\n");

// Load production traces
console.log("📥 Loading production traces...");
const scenario = await loadScenario("production-traces");

interface Cap {
  id: string;
  embedding?: number[];
  toolsUsed?: string[];
  successRate?: number;
  description?: string;
}

interface EpisodicEvent {
  intentEmbedding?: number[];
  contextTools?: string[];
  selectedCapability: string;
  outcome: string;
}

interface TestQuery {
  intentEmbedding?: number[];
  expectedCapability: string;
}

const rawCaps: Cap[] = scenario.nodes.capabilities;
const capsWithBGE = rawCaps.filter(c => c.embedding && c.embedding.length > 0);
const events: EpisodicEvent[] = scenario.episodicEvents || [];
const testQueries: TestQuery[] = scenario.testQueries || [];

console.log(`   Capabilities: ${capsWithBGE.length}`);
console.log(`   Training events: ${events.length}`);
console.log(`   Test queries: ${testQueries.length}`);

// Extract all unique tools
const allTools = new Set<string>();
for (const cap of capsWithBGE) {
  for (const tool of cap.toolsUsed || []) {
    allTools.add(tool);
  }
}
const toolList = Array.from(allTools);
console.log(`   Unique tools: ${toolList.length}`);

// ============================================================================
// Strategy 1: BGE-M3 Only (baseline)
// ============================================================================

console.log("\n━━━ Strategy 1: BGE-M3 Only (baseline) ━━━");

function evaluateSHGAT(
  caps: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents: string[]; children: string[] }>,
  events: EpisodicEvent[],
  testQueries: TestQuery[],
  name: string
): { mrr: number; hit1: number; hit3: number } {
  // Create SHGAT
  const shgat = createSHGATFromCapabilities(caps, new Map(), { numHeads: 4, hiddenDim: 64 });

  // Build training examples
  const trainingExamples = events
    .filter(e => e.intentEmbedding && e.intentEmbedding.length > 0)
    .slice(0, 100)
    .map(e => ({
      intentEmbedding: e.intentEmbedding!,
      contextTools: e.contextTools || [],
      candidateId: e.selectedCapability,
      outcome: e.outcome === "success" ? 1 : 0,
    }));

  // Train (reduced epochs for benchmark speed)
  trainSHGATOnEpisodes(shgat, trainingExamples, { epochs: 5, learningRate: 0.01 });

  // Evaluate - scoreAllCapabilities returns AttentionResult[]
  let hits1 = 0, hits3 = 0, mrrSum = 0, evaluated = 0;

  for (const query of testQueries) {
    if (!query.intentEmbedding || query.intentEmbedding.length === 0) continue;

    const results = shgat.scoreAllCapabilities(query.intentEmbedding);
    const sorted = results
      .map(r => ({ id: r.capabilityId, score: r.score }))
      .sort((a, b) => b.score - a.score);

    const idx = sorted.findIndex(s => s.id === query.expectedCapability);
    const rank = idx >= 0 ? idx + 1 : 0;

    if (rank === 1) hits1++;
    if (rank > 0 && rank <= 3) hits3++;
    if (rank > 0) mrrSum += 1 / rank;
    evaluated++;
  }

  const mrr = mrrSum / evaluated;
  const hit1 = hits1 / evaluated * 100;
  const hit3 = hits3 / evaluated * 100;

  console.log(`   ${name}: MRR=${mrr.toFixed(3)} Hit@1=${hit1.toFixed(1)}% Hit@3=${hit3.toFixed(1)}%`);

  return { mrr, hit1, hit3 };
}

// BGE-M3 baseline
const bgeCaps = capsWithBGE.map(c => ({
  id: c.id,
  embedding: c.embedding!,
  toolsUsed: c.toolsUsed || [],
  successRate: c.successRate || 0.5,
  parents: [] as string[],
  children: [] as string[],
}));

const bgeResults = evaluateSHGAT(bgeCaps, events, testQueries, "BGE-M3");

// ============================================================================
// Strategy 2: Tool Co-occurrence Embeddings (fast alternative to spectral)
// ============================================================================

console.log("\n━━━ Strategy 2: Tool Co-occurrence Embeddings ━━━");

// Build tool co-occurrence embeddings: each cap gets a vector of which tools it uses
const numClusters = toolList.length; // Use all tools as dimensions
const spectralEmbeddings = new Map<string, number[]>();

// Tool index map
const toolIdx = new Map<string, number>();
toolList.forEach((t, i) => toolIdx.set(t, i));

for (const cap of capsWithBGE) {
  const embedding = new Array(numClusters).fill(0);
  for (const tool of cap.toolsUsed || []) {
    const idx = toolIdx.get(tool);
    if (idx !== undefined) {
      embedding[idx] = 1;
    }
  }
  // Normalize
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
  spectralEmbeddings.set(cap.id, embedding.map(v => v / norm));
}

console.log(`   Generated ${spectralEmbeddings.size} tool-cooc embeddings (${numClusters} dims)`);

// Pad spectral embeddings to 1024 dims for SHGAT compatibility
const spectralCaps = capsWithBGE.map(c => {
  const spectral = spectralEmbeddings.get(c.id) || [];
  const padded = [...spectral, ...new Array(1024 - spectral.length).fill(0)];
  return {
    id: c.id,
    embedding: padded,
    toolsUsed: c.toolsUsed || [],
    successRate: c.successRate || 0.5,
    parents: [] as string[],
    children: [] as string[],
  };
});

const spectralResults = evaluateSHGAT(spectralCaps, events, testQueries, "Spectral");

// ============================================================================
// Strategy 3: Tool Jaccard Similarity Embeddings (fast graph-based)
// ============================================================================

console.log("\n━━━ Strategy 3: Tool Jaccard Embeddings ━━━");

// Build embeddings based on Jaccard similarity with other capabilities
const embeddingDim = 32;
const node2vecEmbeddings = new Map<string, number[]>();

// Pre-compute tool sets
const capToolSets = new Map<string, Set<string>>();
for (const cap of capsWithBGE) {
  capToolSets.set(cap.id, new Set(cap.toolsUsed || []));
}

// For each capability, compute similarity to k reference capabilities
const refCaps = capsWithBGE.slice(0, embeddingDim); // Use first k caps as reference

for (const cap of capsWithBGE) {
  const capTools = capToolSets.get(cap.id)!;
  const embedding: number[] = [];

  for (const ref of refCaps) {
    if (ref.id === cap.id) {
      embedding.push(1); // Self-similarity
    } else {
      const refTools = capToolSets.get(ref.id)!;
      // Jaccard similarity
      const intersection = [...capTools].filter(t => refTools.has(t)).length;
      const union = new Set([...capTools, ...refTools]).size;
      embedding.push(union > 0 ? intersection / union : 0);
    }
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
  node2vecEmbeddings.set(cap.id, embedding.map(v => v / norm));
}

console.log(`   Generated ${node2vecEmbeddings.size} Jaccard embeddings (${embeddingDim} dims)`);

// Pad to 1024 dims
const node2vecCaps = capsWithBGE.map(c => {
  const n2v = node2vecEmbeddings.get(c.id) || [];
  const padded = [...n2v, ...new Array(1024 - n2v.length).fill(0)];
  return {
    id: c.id,
    embedding: padded,
    toolsUsed: c.toolsUsed || [],
    successRate: c.successRate || 0.5,
    parents: [] as string[],
    children: [] as string[],
  };
});

const node2vecResults = evaluateSHGAT(node2vecCaps, events, testQueries, "Node2Vec");

// ============================================================================
// Strategy 4: Hybrid (BGE + Spectral)
// ============================================================================

console.log("\n━━━ Strategy 4: Hybrid (BGE-M3 + Spectral) ━━━");

// Concatenate BGE (1024) + Spectral (64) → 1088 dims, then project to 1024
const hybridCaps = capsWithBGE.map(c => {
  const bge = c.embedding!;
  const spectral = spectralEmbeddings.get(c.id) || new Array(numClusters).fill(0);

  // Weight: 0.7 BGE + 0.3 Spectral (normalized)
  const bgeWeight = 0.7;
  const spectralWeight = 0.3;

  // Pad spectral to match BGE length for weighted average
  const spectralPadded = [...spectral, ...new Array(1024 - spectral.length).fill(0)];

  const hybrid = bge.map((v, i) => v * bgeWeight + spectralPadded[i] * spectralWeight);

  // Normalize
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

const hybridResults = evaluateSHGAT(hybridCaps, events, testQueries, "Hybrid");

// ============================================================================
// Strategy 5: Hybrid (BGE + Node2Vec)
// ============================================================================

console.log("\n━━━ Strategy 5: Hybrid (BGE-M3 + Node2Vec) ━━━");

const hybridN2VCaps = capsWithBGE.map(c => {
  const bge = c.embedding!;
  const n2v = node2vecEmbeddings.get(c.id) || new Array(embeddingDim).fill(0);

  const bgeWeight = 0.7;
  const n2vWeight = 0.3;

  const n2vPadded = [...n2v, ...new Array(1024 - n2v.length).fill(0)];
  const hybrid = bge.map((v, i) => v * bgeWeight + n2vPadded[i] * n2vWeight);

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

const hybridN2VResults = evaluateSHGAT(hybridN2VCaps, events, testQueries, "Hybrid-N2V");

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "═".repeat(60));
console.log("                    BENCHMARK SUMMARY");
console.log("═".repeat(60));

const results = [
  { name: "BGE-M3 (baseline)", ...bgeResults },
  { name: "Spectral", ...spectralResults },
  { name: "Node2Vec", ...node2vecResults },
  { name: "Hybrid (BGE+Spectral)", ...hybridResults },
  { name: "Hybrid (BGE+Node2Vec)", ...hybridN2VResults },
];

console.log("\n Strategy                  │   MRR   │ Hit@1  │ Hit@3  │");
console.log("───────────────────────────┼─────────┼────────┼────────┤");

for (const r of results) {
  const name = r.name.padEnd(25);
  const mrr = r.mrr.toFixed(3).padStart(6);
  const hit1 = (r.hit1.toFixed(1) + "%").padStart(6);
  const hit3 = (r.hit3.toFixed(1) + "%").padStart(6);
  console.log(` ${name} │ ${mrr}  │ ${hit1} │ ${hit3} │`);
}

// Find best
const bestMRR = results.reduce((best, r) => r.mrr > best.mrr ? r : best, results[0]);
console.log(`\n🏆 Best MRR: ${bestMRR.name} (${bestMRR.mrr.toFixed(3)})`);

// Improvement over baseline
const improvement = ((bestMRR.mrr - bgeResults.mrr) / bgeResults.mrr * 100);
if (improvement > 0) {
  console.log(`   +${improvement.toFixed(1)}% vs baseline`);
}
