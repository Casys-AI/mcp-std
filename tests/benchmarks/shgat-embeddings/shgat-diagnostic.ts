/**
 * SHGAT Diagnostic - Debug score variance + simplified test
 *
 * Run: deno run --allow-all tests/benchmarks/shgat-diagnostic.ts
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";
import {
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
} from "../../../src/graphrag/algorithms/shgat.ts";

console.log("=== SHGAT Diagnostic ===\n");

// Load data
const scenario = await loadScenario("production-traces");

interface Cap {
  id: string;
  embedding?: number[];
  toolsUsed?: string[];
  successRate?: number;
}

interface Event {
  intentEmbedding?: number[];
  contextTools?: string[];
  selectedCapability: string;
  outcome: string;
}

interface Query {
  intentEmbedding?: number[];
  expectedCapability: string;
}

const allCaps: Cap[] = scenario.nodes.capabilities.filter((c: Cap) => c.embedding?.length);
const allEvents: Event[] = scenario.episodicEvents || [];
const allQueries: Query[] = scenario.testQueries || [];

// ============================================================================
// Part 1: Simplified test with 50 capabilities
// ============================================================================

console.log("━━━ Part 1: Simplified Test (50 caps) ━━━\n");

// Take top 50 most frequent capabilities
const capFreq = new Map<string, number>();
for (const e of allEvents) {
  capFreq.set(e.selectedCapability, (capFreq.get(e.selectedCapability) || 0) + 1);
}
const topCapIds = [...capFreq.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50)
  .map(([id]) => id);

const topCapSet = new Set(topCapIds);
const simpleCaps = allCaps.filter(c => topCapSet.has(c.id));
const simpleEvents = allEvents.filter(e => topCapSet.has(e.selectedCapability));
const simpleQueries = allQueries.filter(q => topCapSet.has(q.expectedCapability));

console.log(`Filtered to ${simpleCaps.length} caps, ${simpleEvents.length} events, ${simpleQueries.length} queries`);

// Build SHGAT caps
const shgatCaps = simpleCaps.map(c => ({
  id: c.id,
  embedding: c.embedding!,
  toolsUsed: c.toolsUsed || [],
  successRate: c.successRate || 0.5,
  parents: [] as string[],
  children: [] as string[],
}));

// Create and train
console.log("\nCreating SHGAT (4 heads, hiddenDim=64)...");
const shgat = createSHGATFromCapabilities(shgatCaps, new Map(), { numHeads: 4, hiddenDim: 64 });

const trainingExamples = simpleEvents
  .filter(e => e.intentEmbedding?.length)
  .map(e => ({
    intentEmbedding: e.intentEmbedding!,
    contextTools: e.contextTools || [],
    candidateId: e.selectedCapability,
    outcome: e.outcome === "success" ? 1 : 0,
  }));

console.log(`Training on ${trainingExamples.length} examples, 10 epochs...`);
trainSHGATOnEpisodes(shgat, trainingExamples, { epochs: 10, learningRate: 0.01 });

// ============================================================================
// Part 2: Debug Score Variance
// ============================================================================

console.log("\n━━━ Part 2: Score Variance Analysis ━━━\n");

// Build index mapping
const idxToId = new Map<number, string>();
shgatCaps.forEach((c, i) => idxToId.set(i, c.id));

// Analyze scores for a few queries
const testQ = simpleQueries.filter(q => q.intentEmbedding?.length).slice(0, 5);

for (let i = 0; i < testQ.length; i++) {
  const query = testQ[i];
  const results = shgat.scoreAllCapabilities(query.intentEmbedding!);

  // Debug: check what scores contains
  if (i === 0) {
    console.log(`  Raw results: Array of ${results.length} AttentionResult`);
    const first = results[0];
    console.log(`  First entry: capabilityId=${first?.capabilityId?.slice(0,8)}, score=${first?.score}`);
  }

  // Convert AttentionResult[] to scoreArr
  const scoreArr = results.map(r => ({
    id: r.capabilityId,
    score: r.score,
  }));

  // Stats
  const values = scoreArr.map(s => s.score).filter(v => !isNaN(v));
  if (values.length === 0) {
    console.log(`Query ${i + 1}: No valid scores!`);
    continue;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  // Sort and find expected rank
  scoreArr.sort((a, b) => b.score - a.score);
  const expectedRank = scoreArr.findIndex(s => s.id === query.expectedCapability) + 1;

  console.log(`Query ${i + 1}:`);
  console.log(`  Expected: ${query.expectedCapability.slice(0, 8)}... (rank: ${expectedRank})`);
  console.log(`  Score stats: min=${min.toFixed(4)} max=${max.toFixed(4)} mean=${mean.toFixed(4)} std=${std.toFixed(4)}`);
  console.log(`  Score range: ${(max - min).toFixed(4)} (spread)`);
  console.log(`  Top 3: ${scoreArr.slice(0, 3).map(s => `${s.id.slice(0,8)}:${s.score.toFixed(3)}`).join(", ")}`);
  const expScore = scoreArr.find(s => s.id === query.expectedCapability);
  console.log(`  Expected score: ${expScore ? expScore.score.toFixed(4) : "N/A"}`);
  console.log();
}

// ============================================================================
// Part 3: Check if scores are collapsing
// ============================================================================

console.log("━━━ Part 3: Score Collapse Detection ━━━\n");

// Get all scores for all queries
let totalVariance = 0;
let collapseCount = 0;
let validQueries = 0;

for (const query of simpleQueries.filter(q => q.intentEmbedding?.length)) {
  const results = shgat.scoreAllCapabilities(query.intentEmbedding!);
  const values = results.map(r => r.score).filter(v => !isNaN(v));

  if (values.length === 0) continue;
  validQueries++;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  totalVariance += variance;

  // Collapse = variance < 0.001 (all scores nearly identical)
  if (variance < 0.001) collapseCount++;
}

const avgVariance = totalVariance / simpleQueries.filter(q => q.intentEmbedding?.length).length;
console.log(`Average score variance: ${avgVariance.toFixed(6)}`);
console.log(`Collapsed queries (var < 0.001): ${collapseCount}/${simpleQueries.filter(q => q.intentEmbedding?.length).length}`);

if (avgVariance < 0.01) {
  console.log("\n⚠️  SCORE COLLAPSE DETECTED!");
  console.log("   Scores are nearly identical across capabilities.");
  console.log("   SHGAT is not discriminating between candidates.");
} else {
  console.log("\n✓ Score variance is healthy");
}

// ============================================================================
// Part 4: Evaluate simplified model
// ============================================================================

console.log("\n━━━ Part 4: Simplified Evaluation ━━━\n");

let hits1 = 0, hits3 = 0, mrrSum = 0, evaluated = 0;

for (const query of simpleQueries) {
  if (!query.intentEmbedding?.length) continue;

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

console.log(`Results on ${evaluated} queries (${simpleCaps.length} caps):`);
console.log(`  MRR:   ${(mrrSum / evaluated).toFixed(3)}`);
console.log(`  Hit@1: ${(hits1 / evaluated * 100).toFixed(1)}%`);
console.log(`  Hit@3: ${(hits3 / evaluated * 100).toFixed(1)}%`);

// ============================================================================
// Part 5: Compare with random baseline
// ============================================================================

console.log("\n━━━ Part 5: Random Baseline Comparison ━━━\n");

// Random baseline for 50 caps
const randomMRR = 1 / simpleCaps.length * (1 + 1/2 + 1/3 + 1/4 + 1/5); // Expected MRR approx
const randomHit1 = 1 / simpleCaps.length * 100;
const randomHit3 = 3 / simpleCaps.length * 100;

console.log(`Random baseline (${simpleCaps.length} caps):`);
console.log(`  MRR:   ~${randomMRR.toFixed(3)}`);
console.log(`  Hit@1: ~${randomHit1.toFixed(1)}%`);
console.log(`  Hit@3: ~${randomHit3.toFixed(1)}%`);

const mrrImprovement = (mrrSum / evaluated) / randomMRR;
console.log(`\nSHGAT vs Random: ${mrrImprovement.toFixed(1)}x MRR`);

if (mrrImprovement < 1.5) {
  console.log("⚠️  SHGAT is barely better than random guessing!");
} else {
  console.log("✓ SHGAT shows meaningful learning");
}
