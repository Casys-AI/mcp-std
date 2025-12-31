/**
 * Embedding Strategies Benchmark - Simplified 50 caps
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";
import {
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
} from "../../../src/graphrag/algorithms/shgat.ts";

console.log("=== Embedding Strategies (50 caps) ===\n");

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

// All tools
const allTools = new Set<string>();
caps.forEach(c => (c.toolsUsed || []).forEach(t => allTools.add(t)));
const toolList = [...allTools];
const toolIdx = new Map<string, number>();
toolList.forEach((t, i) => toolIdx.set(t, i));

console.log(`Data: ${caps.length} caps, ${events.length} events, ${queries.length} queries, ${toolList.length} tools\n`);

// Evaluation function
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

  console.log(`${name.padEnd(25)} │ ${mrr.toFixed(3).padStart(6)} │ ${(hit1.toFixed(1) + "%").padStart(6)} │ ${(hit3.toFixed(1) + "%").padStart(6)} │`);
  return { mrr, hit1, hit3 };
}

console.log("Strategy                  │   MRR  │ Hit@1  │ Hit@3  │");
console.log("──────────────────────────┼────────┼────────┼────────┤");

// 1. BGE-M3 baseline
const bgeCaps = caps.map(c => ({
  id: c.id, embedding: c.embedding!, toolsUsed: c.toolsUsed || [],
  successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[],
}));
const bge = evaluate(bgeCaps, "BGE-M3 (baseline)");

// 2. Tool Co-occurrence
const toolCoocCaps = caps.map(c => {
  const emb = new Array(toolList.length).fill(0);
  (c.toolsUsed || []).forEach(t => { const i = toolIdx.get(t); if (i !== undefined) emb[i] = 1; });
  const norm = Math.sqrt(emb.reduce((s, v) => s + v*v, 0)) || 1;
  const padded = [...emb.map(v => v/norm), ...new Array(1024 - emb.length).fill(0)];
  return { id: c.id, embedding: padded, toolsUsed: c.toolsUsed || [], successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[] };
});
const toolCooc = evaluate(toolCoocCaps, "Tool Co-occurrence");

// 3. Jaccard similarity
const capToolSets = new Map<string, Set<string>>();
caps.forEach(c => capToolSets.set(c.id, new Set(c.toolsUsed || [])));
const refCaps = caps.slice(0, 32);

const jaccardCaps = caps.map(c => {
  const capTools = capToolSets.get(c.id)!;
  const emb = refCaps.map(ref => {
    if (ref.id === c.id) return 1;
    const refTools = capToolSets.get(ref.id)!;
    const inter = [...capTools].filter(t => refTools.has(t)).length;
    const union = new Set([...capTools, ...refTools]).size;
    return union > 0 ? inter / union : 0;
  });
  const norm = Math.sqrt(emb.reduce((s, v) => s + v*v, 0)) || 1;
  const padded = [...emb.map(v => v/norm), ...new Array(1024 - emb.length).fill(0)];
  return { id: c.id, embedding: padded, toolsUsed: c.toolsUsed || [], successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[] };
});
const jaccard = evaluate(jaccardCaps, "Jaccard Similarity");

// 4. Hybrid BGE + Tool
const hybridToolCaps = caps.map((c, i) => {
  const bgeEmb = c.embedding!;
  const toolEmb = toolCoocCaps[i].embedding;
  const hybrid = bgeEmb.map((v, j) => v * 0.5 + toolEmb[j] * 0.5);
  const norm = Math.sqrt(hybrid.reduce((s, v) => s + v*v, 0)) || 1;
  return { id: c.id, embedding: hybrid.map(v => v/norm), toolsUsed: c.toolsUsed || [], successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[] };
});
const hybridTool = evaluate(hybridToolCaps, "Hybrid (BGE+Tool)");

// 5. Hybrid BGE + Jaccard
const hybridJaccardCaps = caps.map((c, i) => {
  const bgeEmb = c.embedding!;
  const jaccEmb = jaccardCaps[i].embedding;
  const hybrid = bgeEmb.map((v, j) => v * 0.5 + jaccEmb[j] * 0.5);
  const norm = Math.sqrt(hybrid.reduce((s, v) => s + v*v, 0)) || 1;
  return { id: c.id, embedding: hybrid.map(v => v/norm), toolsUsed: c.toolsUsed || [], successRate: c.successRate || 0.5, parents: [] as string[], children: [] as string[] };
});
const hybridJaccard = evaluate(hybridJaccardCaps, "Hybrid (BGE+Jaccard)");

// Summary
console.log("\n═══════════════════════════════════════════════════════");
const results = [
  { name: "BGE-M3", ...bge },
  { name: "Tool Co-occurrence", ...toolCooc },
  { name: "Jaccard", ...jaccard },
  { name: "Hybrid BGE+Tool", ...hybridTool },
  { name: "Hybrid BGE+Jaccard", ...hybridJaccard },
];

const best = results.reduce((a, b) => a.mrr > b.mrr ? a : b);
console.log(`\n🏆 Best: ${best.name} (MRR=${best.mrr.toFixed(3)}, Hit@3=${best.hit3.toFixed(1)}%)`);
console.log(`   vs baseline: +${((best.mrr / bge.mrr - 1) * 100).toFixed(0)}%`);
