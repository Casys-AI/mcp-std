/**
 * SHGAT vs SHGAT+DR-DSP Comparison Benchmark
 *
 * Tests the impact of adding DR-DSP pathfinding to SHGAT scoring
 * using REAL embeddings from BGE-M3 on the medium-graph dataset.
 *
 * - SHGAT Only: Score capabilities, pick top-K, suggest first tool
 * - SHGAT + DR-DSP: Score + validate paths exist + optimize execution order
 *
 * Run manually (generates embeddings, ~90s first time):
 *   deno run --allow-all tests/benchmarks/ablation/shgat-drdsp-comparison.bench.ts
 *
 * @module tests/benchmarks/ablation/shgat-drdsp-comparison
 */

import { assertEquals, assertGreater } from "@std/assert";
import {
  SHGAT,
  createSHGATFromCapabilities,
} from "../../../src/graphrag/algorithms/shgat.ts";
import {
  DRDSP,
  type Hyperedge,
} from "../../../src/graphrag/algorithms/dr-dsp.ts";
import { EmbeddingModel } from "../../../src/vector/embeddings.ts";
import { loadScenario, type ScenarioData } from "../fixtures/scenario-loader.ts";

// ============================================================================
// Types
// ============================================================================

interface CapabilityWithEmbedding {
  id: string;
  description: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
  hypergraphFeatures?: {
    spectralCluster: number;
    hypergraphPageRank: number;
    cooccurrence: number;
    recency: number;
    adamicAdar: number;
    heatDiffusion: number;
  };
}

interface TestQuery {
  intent: string;
  intentEmbedding?: number[];
  contextTool: string | null;
  expectedCapability: string;
  expectedNextTool: string;
  alternatives?: string[];
}

interface PredictionResult {
  capability: string;
  capabilityScore: number;
  nextTool: string | null;
  path: string[];
  pathFound: boolean;
  pathWeight: number;
}

interface ComparisonResult {
  query: string;
  shgatOnly: {
    capability: string;
    capCorrect: boolean;
    nextTool: string | null;
    toolCorrect: boolean;
  };
  shgatDrdsp: {
    capability: string;
    capCorrect: boolean;
    nextTool: string | null;
    pathContainsExpected: boolean;
    pathValid: boolean;
    pathFound: boolean;
    pathWeight: number;
  };
  winner: "shgat" | "drdsp" | "tie";
}

// ============================================================================
// Data Loading with Real Embeddings
// ============================================================================

async function loadDataWithEmbeddings(embedder: EmbeddingModel): Promise<{
  capabilities: CapabilityWithEmbedding[];
  toolEmbeddings: Map<string, number[]>;
  testQueries: TestQuery[];
}> {
  const scenario: ScenarioData = await loadScenario("medium-graph");

  console.log("  Generating embeddings for capabilities...");
  const capabilities: CapabilityWithEmbedding[] = [];
  for (const cap of scenario.nodes.capabilities as Array<{
    id: string;
    description: string;
    toolsUsed: string[];
    successRate: number;
    hypergraphFeatures?: {
      spectralCluster: number;
      hypergraphPageRank: number;
      cooccurrence: number;
      recency: number;
      adamicAdar: number;
      heatDiffusion: number;
    };
  }>) {
    const embedding = await embedder.encode(cap.description);
    capabilities.push({
      id: cap.id,
      description: cap.description,
      embedding,
      toolsUsed: cap.toolsUsed,
      successRate: cap.successRate,
      hypergraphFeatures: cap.hypergraphFeatures,
    });
  }

  console.log("  Generating embeddings for tools...");
  const toolEmbeddings = new Map<string, number[]>();
  for (const tool of scenario.nodes.tools) {
    const description = tool.id.replace(/__/g, " ").replace(/_/g, " ");
    const embedding = await embedder.encode(description);
    toolEmbeddings.set(tool.id, embedding);
  }

  // Generate test queries with context
  const testQueries: TestQuery[] = [
    // Cold start scenarios
    { intent: "read file contents from disk", contextTool: null, expectedCapability: "cap__file_ops", expectedNextTool: "fs__read", alternatives: [] },
    { intent: "query database records", contextTool: null, expectedCapability: "cap__db_crud", expectedNextTool: "db__query", alternatives: [] },
    { intent: "call REST API endpoint", contextTool: null, expectedCapability: "cap__rest_api", expectedNextTool: "http__get", alternatives: [] },

    // With context (in-progress scenarios)
    { intent: "write to file after reading", contextTool: "fs__read", expectedCapability: "cap__file_ops", expectedNextTool: "fs__write", alternatives: [] },
    { intent: "insert record after query", contextTool: "db__query", expectedCapability: "cap__db_crud", expectedNextTool: "db__insert", alternatives: [] },
    { intent: "parse JSON from API response", contextTool: "http__get", expectedCapability: "cap__rest_api", expectedNextTool: "json__parse", alternatives: [] },

    // Cross-domain scenarios
    { intent: "cache the database query result", contextTool: "db__query", expectedCapability: "cap__caching", expectedNextTool: "cache__set", alternatives: ["cap__db_crud"] },
    { intent: "log the API response", contextTool: "http__post", expectedCapability: "cap__logging", expectedNextTool: "log__info", alternatives: ["cap__rest_api"] },

    // Authentication flow
    { intent: "validate user session token", contextTool: "auth__login", expectedCapability: "cap__auth_flow", expectedNextTool: "auth__validate", alternatives: [] },
    { intent: "refresh expired authentication", contextTool: "auth__validate", expectedCapability: "cap__auth_flow", expectedNextTool: "auth__refresh", alternatives: [] },
  ];

  console.log("  Generating embeddings for test queries...");
  for (const query of testQueries) {
    query.intentEmbedding = await embedder.encode(query.intent);
  }

  return { capabilities, toolEmbeddings, testQueries };
}

// ============================================================================
// SHGAT & DR-DSP Builders
// ============================================================================

function buildSHGAT(
  capabilities: CapabilityWithEmbedding[],
  toolEmbeddings: Map<string, number[]>
): SHGAT {
  const capData = capabilities.map((cap) => ({
    id: cap.id,
    embedding: cap.embedding,
    toolsUsed: cap.toolsUsed,
    successRate: cap.successRate,
    parents: [],
    children: [],
    hypergraphFeatures: cap.hypergraphFeatures,
  }));

  return createSHGATFromCapabilities(capData, toolEmbeddings, {
    numHeads: 4,
    hiddenDim: 64,
    embeddingDim: 1024,
  });
}

function buildDRDSP(capabilities: CapabilityWithEmbedding[]): DRDSP {
  const hyperedges: Hyperedge[] = capabilities.map((cap) => {
    const mid = Math.ceil(cap.toolsUsed.length / 2);
    return {
      id: cap.id,
      sources: cap.toolsUsed.slice(0, mid),
      targets: cap.toolsUsed.slice(mid),
      weight: 1 / cap.successRate,
    };
  });
  return new DRDSP(hyperedges);
}

// ============================================================================
// Prediction Functions
// ============================================================================

function predictWithSHGATOnly(
  shgat: SHGAT,
  capabilities: CapabilityWithEmbedding[],
  intentEmbedding: number[],
  contextTool: string | null
): PredictionResult {
  const scores = shgat.scoreAllCapabilities(intentEmbedding);
  const best = scores[0];
  const cap = capabilities.find((c) => c.id === best.capabilityId)!;

  let nextTool: string | null = null;
  let path: string[] = cap.toolsUsed;

  if (contextTool) {
    const idx = cap.toolsUsed.indexOf(contextTool);
    if (idx >= 0 && idx < cap.toolsUsed.length - 1) {
      nextTool = cap.toolsUsed[idx + 1];
      path = cap.toolsUsed.slice(idx);
    } else {
      nextTool = cap.toolsUsed[0];
    }
  } else {
    nextTool = cap.toolsUsed[0];
  }

  return {
    capability: best.capabilityId,
    capabilityScore: best.score,
    nextTool,
    path,
    pathFound: true,
    pathWeight: 0,
  };
}

function predictWithSHGATAndDRDSP(
  shgat: SHGAT,
  drdsp: DRDSP,
  capabilities: CapabilityWithEmbedding[],
  intentEmbedding: number[],
  contextTool: string | null
): PredictionResult {
  const scores = shgat.scoreAllCapabilities(intentEmbedding);

  for (const candidate of scores) {
    const cap = capabilities.find((c) => c.id === candidate.capabilityId)!;
    const targetTool = cap.toolsUsed[cap.toolsUsed.length - 1];
    const sourceTool = contextTool || cap.toolsUsed[0];

    const pathResult = drdsp.findShortestHyperpath(sourceTool, targetTool);

    if (pathResult.found) {
      const nextTool = pathResult.nodeSequence.length > 1
        ? pathResult.nodeSequence[1]
        : cap.toolsUsed[0];

      return {
        capability: candidate.capabilityId,
        capabilityScore: candidate.score,
        nextTool,
        path: pathResult.nodeSequence,
        pathFound: true,
        pathWeight: pathResult.totalWeight,
      };
    }
  }

  // Fallback
  const best = scores[0];
  const cap = capabilities.find((c) => c.id === best.capabilityId)!;

  return {
    capability: best.capabilityId,
    capabilityScore: best.score,
    nextTool: cap.toolsUsed[0],
    path: cap.toolsUsed,
    pathFound: false,
    pathWeight: Infinity,
  };
}

// ============================================================================
// Comparison Runner
// ============================================================================

function runComparison(
  shgat: SHGAT,
  drdsp: DRDSP,
  capabilities: CapabilityWithEmbedding[],
  testQueries: TestQuery[]
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  for (const query of testQueries) {
    if (!query.intentEmbedding) continue;

    const shgatResult = predictWithSHGATOnly(shgat, capabilities, query.intentEmbedding, query.contextTool);
    const drdspResult = predictWithSHGATAndDRDSP(shgat, drdsp, capabilities, query.intentEmbedding, query.contextTool);

    const expectedCaps = [query.expectedCapability, ...(query.alternatives || [])];

    const shgatCapCorrect = expectedCaps.includes(shgatResult.capability);
    const shgatToolCorrect = shgatResult.nextTool === query.expectedNextTool;

    const drdspCapCorrect = expectedCaps.includes(drdspResult.capability);
    // For DR-DSP: check if expected tool is IN the path (not necessarily next)
    // DR-DSP optimizes path order, so next tool may differ from sequential order
    const drdspPathContainsExpected = drdspResult.path.includes(query.expectedNextTool);
    // Also check if path leads to capability's target (last tool)
    const expectedCap = capabilities.find((c) => c.id === query.expectedCapability);
    const capTarget = expectedCap?.toolsUsed[expectedCap.toolsUsed.length - 1];
    const drdspPathValid = drdspResult.pathFound && capTarget && drdspResult.path.includes(capTarget);

    const shgatScore = (shgatCapCorrect ? 2 : 0) + (shgatToolCorrect ? 1 : 0);
    // DR-DSP: capability (2) + path contains expected tool (1) + valid path to target (1)
    const drdspScore = (drdspCapCorrect ? 2 : 0) + (drdspPathContainsExpected ? 1 : 0) + (drdspPathValid ? 1 : 0);

    let winner: "shgat" | "drdsp" | "tie" = "tie";
    if (drdspScore > shgatScore) winner = "drdsp";
    else if (shgatScore > drdspScore) winner = "shgat";

    results.push({
      query: query.intent.substring(0, 35),
      shgatOnly: {
        capability: shgatResult.capability,
        capCorrect: shgatCapCorrect,
        nextTool: shgatResult.nextTool,
        toolCorrect: shgatToolCorrect,
      },
      shgatDrdsp: {
        capability: drdspResult.capability,
        capCorrect: drdspCapCorrect,
        nextTool: drdspResult.nextTool,
        pathContainsExpected: drdspPathContainsExpected,
        pathValid: !!drdspPathValid,
        pathFound: drdspResult.pathFound,
        pathWeight: drdspResult.pathWeight,
      },
      winner,
    });
  }

  return results;
}

// ============================================================================
// Main Comparison
// ============================================================================

if (import.meta.main) {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║   SHGAT vs SHGAT+DR-DSP (Real BGE-M3 Embeddings)           ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log("Loading BGE-M3 model (may take 60-90s first time)...");
  const embedder = new EmbeddingModel();
  await embedder.load();
  console.log("Model loaded!\n");

  try {
    console.log("Loading data and generating embeddings...");
    const { capabilities, toolEmbeddings, testQueries } = await loadDataWithEmbeddings(embedder);
    console.log(`  ${capabilities.length} capabilities, ${toolEmbeddings.size} tools, ${testQueries.length} queries\n`);

    const shgat = buildSHGAT(capabilities, toolEmbeddings);
    const drdsp = buildDRDSP(capabilities);

    console.log("Running comparison...\n");
    const results = runComparison(shgat, drdsp, capabilities, testQueries);

    // Results table
    console.log("═".repeat(120));
    console.log("SCENARIO COMPARISON");
    console.log("═".repeat(120));
    console.log(`\n${"Query".padEnd(36)} | ${"SHGAT".padEnd(10)} | ${"Tool".padEnd(5)} | ${"DR-DSP".padEnd(10)} | ${"InPath".padEnd(6)} | ${"Valid".padEnd(5)} | Winner`);
    console.log("-".repeat(100));

    let shgatWins = 0, drdspWins = 0, ties = 0;

    for (const r of results) {
      const sc = r.shgatOnly.capCorrect ? "✅" : "❌";
      const st = r.shgatOnly.toolCorrect ? "✅" : "❌";
      const dc = r.shgatDrdsp.capCorrect ? "✅" : "❌";
      const dp = r.shgatDrdsp.pathContainsExpected ? "✅" : "❌";
      const dv = r.shgatDrdsp.pathValid ? "✅" : "❌";
      const winnerIcon = r.winner === "drdsp" ? "DR-DSP ✨" : r.winner === "shgat" ? "SHGAT" : "Tie";

      console.log(`${r.query.padEnd(36)} | ${sc.padEnd(10)} | ${st.padEnd(5)} | ${dc.padEnd(10)} | ${dp.padEnd(6)} | ${dv.padEnd(5)} | ${winnerIcon}`);

      if (r.winner === "shgat") shgatWins++;
      else if (r.winner === "drdsp") drdspWins++;
      else ties++;
    }

    console.log("-".repeat(100));

    // Aggregated stats
    const shgatCapAcc = results.filter((r) => r.shgatOnly.capCorrect).length / results.length;
    const shgatToolAcc = results.filter((r) => r.shgatOnly.toolCorrect).length / results.length;
    const drdspCapAcc = results.filter((r) => r.shgatDrdsp.capCorrect).length / results.length;
    const drdspPathContains = results.filter((r) => r.shgatDrdsp.pathContainsExpected).length / results.length;
    const drdspPathValid = results.filter((r) => r.shgatDrdsp.pathValid).length / results.length;

    console.log("\n" + "═".repeat(100));
    console.log("AGGREGATED METRICS");
    console.log("═".repeat(100));

    console.log(`\n${"Metric".padEnd(25)} | ${"SHGAT Only".padEnd(15)} | ${"SHGAT+DR-DSP".padEnd(15)}`);
    console.log("-".repeat(60));
    console.log(`${"Capability Accuracy".padEnd(25)} | ${(shgatCapAcc * 100).toFixed(0)}%`.padEnd(42) + ` | ${(drdspCapAcc * 100).toFixed(0)}%`);
    console.log(`${"Tool in Seq/Path".padEnd(25)} | ${(shgatToolAcc * 100).toFixed(0)}%`.padEnd(42) + ` | ${(drdspPathContains * 100).toFixed(0)}%`);
    console.log(`${"Path Valid".padEnd(25)} | N/A`.padEnd(42) + ` | ${(drdspPathValid * 100).toFixed(0)}%`);

    console.log("\n" + "═".repeat(110));
    console.log("WINNER DISTRIBUTION");
    console.log("═".repeat(110));
    console.log(`  SHGAT wins:   ${shgatWins}`);
    console.log(`  DR-DSP wins:  ${drdspWins}`);
    console.log(`  Ties:         ${ties}`);

    const overall = drdspWins > shgatWins ? "SHGAT+DR-DSP" : drdspWins < shgatWins ? "SHGAT Only" : "Tie";
    console.log(`\n  OVERALL: ${overall}`);

    console.log("═".repeat(110));

    // ========================================================================
    // TOOL SCORING COMPARISON
    // ========================================================================
    console.log("\n" + "═".repeat(110));
    console.log("TOOL SCORING COMPARISON (Direct Tool Ranking)");
    console.log("═".repeat(110));

    // Test queries specifically for tool scoring (with context)
    const toolQueries = [
      { intent: "read file contents", context: ["fs__open"], expectedTool: "fs__read", expectedCap: "cap__file_read" },
      { intent: "write data to file", context: ["fs__open", "fs__read"], expectedTool: "fs__write", expectedCap: "cap__file_write" },
      { intent: "query database records", context: ["db__connect"], expectedTool: "db__query", expectedCap: "cap__db_query" },
      { intent: "insert new record", context: ["db__connect", "db__query"], expectedTool: "db__insert", expectedCap: "cap__db_insert" },
      { intent: "call API endpoint", context: ["http__init"], expectedTool: "http__get", expectedCap: "cap__api_call" },
      { intent: "parse response", context: ["http__init", "http__get"], expectedTool: "json__parse", expectedCap: "cap__api_call" },
      { intent: "authenticate user", context: [], expectedTool: "auth__validate", expectedCap: "cap__auth_flow" },
      { intent: "refresh token", context: ["auth__validate"], expectedTool: "auth__refresh", expectedCap: "cap__auth_flow" },
    ];

    console.log(`\n${"Intent".padEnd(25)} | ${"Context".padEnd(25)} | ${"Expected".padEnd(15)} | ${"SHGAT Top-1".padEnd(15)} | ${"SHGAT+DR-DSP".padEnd(15)} | Winner`);
    console.log("-".repeat(120));

    let toolShgatWins = 0, toolDrdspWins = 0, toolTies = 0;
    let shgatToolTop1 = 0, shgatToolTop3 = 0;
    let drdspToolTop1 = 0, drdspToolTop3 = 0;

    for (const tq of toolQueries) {
      const intentEmb = await embedder.encode(tq.intent);

      // SHGAT direct tool scoring
      const toolScores = shgat.scoreAllTools(intentEmb, tq.context);
      const shgatTop1 = toolScores[0]?.toolId || "none";
      const shgatTop3Tools = toolScores.slice(0, 3).map(t => t.toolId);
      const shgatCorrect = shgatTop1 === tq.expectedTool;
      const shgatIn3 = shgatTop3Tools.includes(tq.expectedTool);

      // SHGAT+DR-DSP: score tools, then validate paths
      let drdspBest = "none";
      let drdspCorrect = false;

      for (const ts of toolScores.slice(0, 5)) {
        const lastContext = tq.context.length > 0 ? tq.context[tq.context.length - 1] : null;
        if (lastContext) {
          const pathResult = drdsp.findShortestHyperpath(lastContext, ts.toolId);
          if (pathResult.found) {
            drdspBest = ts.toolId;
            drdspCorrect = drdspBest === tq.expectedTool;
            break;
          }
        } else {
          // No context, take SHGAT top
          drdspBest = ts.toolId;
          drdspCorrect = drdspBest === tq.expectedTool;
          break;
        }
      }

      // Fallback to SHGAT if no path found
      if (drdspBest === "none") {
        drdspBest = shgatTop1;
        drdspCorrect = drdspBest === tq.expectedTool;
      }

      if (shgatCorrect) shgatToolTop1++;
      if (shgatIn3) shgatToolTop3++;
      if (drdspCorrect) drdspToolTop1++;
      // DR-DSP top-3 not directly comparable (path validation)

      const winner = drdspCorrect && !shgatCorrect ? "DR-DSP ✨" :
                     shgatCorrect && !drdspCorrect ? "SHGAT ✨" : "Tie";

      if (drdspCorrect && !shgatCorrect) toolDrdspWins++;
      else if (shgatCorrect && !drdspCorrect) toolShgatWins++;
      else toolTies++;

      const contextStr = tq.context.length > 0 ? tq.context.slice(-1)[0] : "(start)";
      const shgatIcon = shgatCorrect ? "✅ " + shgatTop1 : "❌ " + shgatTop1;
      const drdspIcon = drdspCorrect ? "✅ " + drdspBest : "❌ " + drdspBest;

      console.log(`${tq.intent.padEnd(25)} | ${contextStr.padEnd(25)} | ${tq.expectedTool.padEnd(15)} | ${shgatIcon.padEnd(15)} | ${drdspIcon.padEnd(15)} | ${winner}`);
    }

    console.log("-".repeat(120));

    console.log("\n" + "═".repeat(80));
    console.log("TOOL SCORING METRICS");
    console.log("═".repeat(80));
    console.log(`\n${"Metric".padEnd(25)} | ${"SHGAT".padEnd(15)} | ${"SHGAT+DR-DSP".padEnd(15)}`);
    console.log("-".repeat(60));
    console.log(`${"Top-1 Accuracy".padEnd(25)} | ${((shgatToolTop1 / toolQueries.length) * 100).toFixed(0)}%`.padEnd(42) + ` | ${((drdspToolTop1 / toolQueries.length) * 100).toFixed(0)}%`);
    console.log(`${"Top-3 Accuracy".padEnd(25)} | ${((shgatToolTop3 / toolQueries.length) * 100).toFixed(0)}%`.padEnd(42) + ` | N/A (path-based)`);

    console.log("\n" + "═".repeat(80));
    console.log("TOOL WINNER DISTRIBUTION");
    console.log("═".repeat(80));
    console.log(`  SHGAT wins:   ${toolShgatWins}`);
    console.log(`  DR-DSP wins:  ${toolDrdspWins}`);
    console.log(`  Ties:         ${toolTies}`);

    const toolOverall = toolDrdspWins > toolShgatWins ? "SHGAT+DR-DSP" : toolDrdspWins < toolShgatWins ? "SHGAT Only" : "Tie";
    console.log(`\n  TOOL SCORING WINNER: ${toolOverall}`);
    console.log("═".repeat(80));

  } finally {
    console.log("\nDisposing embedding model...");
    await embedder.dispose();
  }
}

// ============================================================================
// Tests (mock embeddings for CI)
// ============================================================================

function mockEmbedding(text: string, dim: number = 1024): number[] {
  const emb = new Array(dim).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < dim; i++) {
    hash = (hash * 1103515245 + 12345) | 0;
    emb[i] = (hash % 1000) / 1000 - 0.5;
  }
  const norm = Math.sqrt(emb.reduce((s, x) => s + x * x, 0));
  return emb.map((x) => x / norm);
}

Deno.test("Comparison: Both methods produce valid results", async () => {
  const scenario = await loadScenario("medium-graph");

  const capabilities = (scenario.nodes.capabilities as Array<{
    id: string;
    description: string;
    toolsUsed: string[];
    successRate: number;
  }>).map((c) => ({
    ...c,
    embedding: mockEmbedding(c.description),
  }));

  const toolEmbeddings = new Map<string, number[]>();
  for (const t of scenario.nodes.tools) {
    toolEmbeddings.set(t.id, mockEmbedding(t.id));
  }

  const shgat = buildSHGAT(capabilities, toolEmbeddings);
  const drdsp = buildDRDSP(capabilities);

  const intentEmb = mockEmbedding("read file from disk");

  const shgatResult = predictWithSHGATOnly(shgat, capabilities, intentEmb, null);
  const drdspResult = predictWithSHGATAndDRDSP(shgat, drdsp, capabilities, intentEmb, null);

  assertEquals(shgatResult.capability !== "", true, "SHGAT should pick capability");
  assertEquals(drdspResult.capability !== "", true, "DR-DSP should pick capability");
  assertEquals(shgatResult.nextTool !== null, true, "SHGAT should suggest tool");
  assertEquals(drdspResult.nextTool !== null, true, "DR-DSP should suggest tool");
});

Deno.test("Comparison: DR-DSP reports path status", async () => {
  const scenario = await loadScenario("medium-graph");

  const capabilities = (scenario.nodes.capabilities as Array<{
    id: string;
    description: string;
    toolsUsed: string[];
    successRate: number;
  }>).map((c) => ({
    ...c,
    embedding: mockEmbedding(c.description),
  }));

  const toolEmbeddings = new Map<string, number[]>();
  for (const t of scenario.nodes.tools) {
    toolEmbeddings.set(t.id, mockEmbedding(t.id));
  }

  const shgat = buildSHGAT(capabilities, toolEmbeddings);
  const drdsp = buildDRDSP(capabilities);

  const result = predictWithSHGATAndDRDSP(
    shgat, drdsp, capabilities,
    mockEmbedding("test intent"),
    "fs__read"
  );

  assertEquals(typeof result.pathFound, "boolean", "Should report path status");
  if (result.pathFound) {
    assertGreater(result.path.length, 0, "Found path should have nodes");
  }
});

// ============================================================================
// Benchmarks
// ============================================================================

const benchScenario = JSON.parse(
  await Deno.readTextFile("tests/benchmarks/fixtures/scenarios/medium-graph.json")
);

const benchCaps = (benchScenario.nodes.capabilities as Array<{
  id: string;
  description: string;
  toolsUsed: string[];
  successRate: number;
}>).map((c) => ({
  ...c,
  embedding: mockEmbedding(c.description),
}));

const benchToolEmbs = new Map<string, number[]>();
for (const t of benchScenario.nodes.tools) {
  benchToolEmbs.set(t.id, mockEmbedding(t.id));
}

const benchShgat = buildSHGAT(benchCaps, benchToolEmbs);
const benchDrdsp = buildDRDSP(benchCaps);
const benchIntent = mockEmbedding("query database records");

Deno.bench({
  name: "Pipeline: SHGAT only",
  group: "shgat-vs-drdsp",
  baseline: true,
  fn: () => {
    predictWithSHGATOnly(benchShgat, benchCaps, benchIntent, null);
  },
});

Deno.bench({
  name: "Pipeline: SHGAT + DR-DSP",
  group: "shgat-vs-drdsp",
  fn: () => {
    predictWithSHGATAndDRDSP(benchShgat, benchDrdsp, benchCaps, benchIntent, null);
  },
});

Deno.bench({
  name: "Pipeline: SHGAT + DR-DSP (with context)",
  group: "shgat-vs-drdsp",
  fn: () => {
    predictWithSHGATAndDRDSP(benchShgat, benchDrdsp, benchCaps, benchIntent, "db__query");
  },
});
