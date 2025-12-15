/**
 * OPTION 1: VECTOR SEARCH VALIDATION TEST
 *
 * Validation Sprint - Epic 1 Retrospective
 * Tests semantic vector search accuracy and latency with realistic MCP tool schemas
 *
 * Success Criteria:
 * - Accuracy top-5: >= 80% (queries return relevant tool in top 5 results)
 * - Latency P95: <= 150ms (95% of queries complete within 150ms)
 * - Zero crashes: No unhandled errors or exceptions
 *
 * Expected Duration: 2-3 hours
 */

import { PGliteClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import { EmbeddingModel } from "../../src/vector/embeddings.ts";
import { VectorSearch } from "../../src/vector/search.ts";
import type { MCPTool } from "../../src/mcp/types.ts";

/**
 * Test query with expected relevant tools
 */
interface TestQuery {
  query: string;
  expectedTools: string[]; // Tool names that should appear in top-5
  description: string;
}

/**
 * Performance metrics for a single query
 */
interface QueryMetrics {
  query: string;
  latency: number; // milliseconds
  resultsCount: number;
  topResult: string;
  score: number;
  relevant: boolean; // true if expected tool found in top-5
}

/**
 * Overall validation results
 */
interface ValidationResults {
  totalQueries: number;
  relevantQueries: number;
  accuracy: number; // percentage
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  avgLatency: number;
  crashes: number;
  queryMetrics: QueryMetrics[];
}

/**
 * Load realistic MCP tools from JSON fixture
 */
async function loadTestTools(): Promise<MCPTool[]> {
  const json = await Deno.readTextFile(
    new URL("./realistic-mcp-tools.json", import.meta.url).pathname,
  );
  return JSON.parse(json);
}

/**
 * Setup test database with tool schemas and embeddings
 */
async function setupTestDatabase(
  db: PGliteClient,
  model: EmbeddingModel,
  tools: MCPTool[],
): Promise<void> {
  console.log("\n🔧 Setting up test database...");

  // Clear existing data
  await db.query("DELETE FROM tool_embedding");
  await db.query("DELETE FROM tool_schema");

  console.log(`   Loading ${tools.length} tool schemas...`);

  // Insert tool schemas
  for (const tool of tools) {
    const toolId = `test-server:${tool.name}`;

    await db.query(
      `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema, cached_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        toolId,
        "test-server",
        tool.name,
        tool.description || "",
        JSON.stringify(tool.inputSchema),
      ],
    );
  }

  console.log("   Generating embeddings...");
  console.log("   (This may take 60-90s on first run for BGE-Large model download)");

  // Load model (may take time on first run)
  await model.load();

  // Generate embeddings for all tools
  for (const tool of tools) {
    const toolId = `test-server:${tool.name}`;

    // Create text representation
    const parts: string[] = [tool.name];
    if (tool.description) parts.push(tool.description);

    // Add parameter names and descriptions
    if (tool.inputSchema && typeof tool.inputSchema === "object") {
      const props = (tool.inputSchema as any).properties || {};
      for (const [paramName, paramDef] of Object.entries(props)) {
        if (typeof paramDef === "object" && paramDef !== null) {
          const def = paramDef as Record<string, unknown>;
          const desc = def.description as string || "";
          if (desc) parts.push(`${paramName}: ${desc}`);
        }
      }
    }

    const text = parts.join(" | ");

    // Generate embedding
    const embedding = await model.encode(text);

    // Store in database
    await db.query(
      `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        toolId,
        "test-server",
        tool.name,
        `[${embedding.join(",")}]`,
        JSON.stringify({ test: true }),
      ],
    );
  }

  console.log(`   ✓ Setup complete: ${tools.length} tools indexed\n`);
}

/**
 * Define test queries with expected results
 */
function getTestQueries(): TestQuery[] {
  return [
    {
      query: "read a file from disk",
      expectedTools: ["read_file"],
      description: "Simple file read operation",
    },
    {
      query: "write data to a file",
      expectedTools: ["write_file"],
      description: "Simple file write operation",
    },
    {
      query: "show me what files are in a folder",
      expectedTools: ["list_directory"],
      description: "Directory listing",
    },
    {
      query: "search the internet for information",
      expectedTools: ["search_web", "fetch_url"],
      description: "Web search query",
    },
    {
      query: "run a command in terminal",
      expectedTools: ["execute_command", "run_bash_script"],
      description: "Shell command execution",
    },
    {
      query: "create a GitHub issue",
      expectedTools: ["create_github_issue"],
      description: "GitHub issue creation",
    },
    {
      query: "get pull requests from repository",
      expectedTools: ["list_github_prs"],
      description: "GitHub PR listing",
    },
    {
      query: "parse JSON string",
      expectedTools: ["parse_json"],
      description: "JSON parsing",
    },
    {
      query: "execute SQL query on database",
      expectedTools: ["query_database"],
      description: "Database query",
    },
    {
      query: "send message to Slack channel",
      expectedTools: ["send_slack_message"],
      description: "Slack messaging",
    },
    {
      query: "open a website in browser",
      expectedTools: ["navigate_browser"],
      description: "Browser navigation",
    },
    {
      query: "click button on webpage",
      expectedTools: ["click_element"],
      description: "Browser interaction",
    },
    {
      query: "capture screenshot of page",
      expectedTools: ["take_screenshot"],
      description: "Screenshot capture",
    },
    {
      query: "schedule a meeting",
      expectedTools: ["create_calendar_event"],
      description: "Calendar event creation",
    },
    {
      query: "list upcoming events",
      expectedTools: ["list_calendar_events"],
      description: "Calendar event listing",
    },
  ];
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((sortedValues.length * p) / 100) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Run validation test suite
 */
async function runValidation(): Promise<ValidationResults> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🧪 OPTION 1: VECTOR SEARCH VALIDATION");
  console.log("═══════════════════════════════════════════════════════════\n");

  const startTime = performance.now();

  // Initialize components
  const db = new PGliteClient("memory://"); // Use in-memory for test
  await db.connect();

  // Apply migrations
  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  const model = new EmbeddingModel();
  const vectorSearch = new VectorSearch(db, model);

  // Load test data
  const tools = await loadTestTools();
  await setupTestDatabase(db, model, tools);

  // Get test queries
  const testQueries = getTestQueries();

  console.log(`📋 Testing ${testQueries.length} queries\n`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Run queries and collect metrics
  const queryMetrics: QueryMetrics[] = [];
  let crashes = 0;

  for (const testQuery of testQueries) {
    try {
      console.log(`🔍 Query: "${testQuery.query}"`);
      console.log(`   Expected: ${testQuery.expectedTools.join(", ")}`);

      const queryStart = performance.now();
      const results = await vectorSearch.searchTools(testQuery.query, 5, 0.5);
      const queryLatency = performance.now() - queryStart;

      const topResult = results[0]?.toolName || "none";
      const topScore = results[0]?.score || 0;

      // Check if any expected tool is in top-5
      const resultNames = results.map((r) => r.toolName);
      const relevant = testQuery.expectedTools.some((expected) => resultNames.includes(expected));

      console.log(
        `   ✓ Results: ${resultNames.slice(0, 3).join(", ")}${results.length > 3 ? ", ..." : ""}`,
      );
      console.log(`   Top: ${topResult} (score: ${topScore.toFixed(3)})`);
      console.log(`   Latency: ${queryLatency.toFixed(2)}ms`);
      console.log(`   Relevant: ${relevant ? "✅ YES" : "❌ NO"}`);
      console.log("");

      queryMetrics.push({
        query: testQuery.query,
        latency: queryLatency,
        resultsCount: results.length,
        topResult,
        score: topScore,
        relevant,
      });
    } catch (error) {
      console.log(`   ❌ CRASH: ${error}`);
      console.log("");
      crashes++;

      queryMetrics.push({
        query: testQuery.query,
        latency: 0,
        resultsCount: 0,
        topResult: "ERROR",
        score: 0,
        relevant: false,
      });
    }
  }

  // Calculate statistics
  const relevantQueries = queryMetrics.filter((m) => m.relevant).length;
  const accuracy = (relevantQueries / testQueries.length) * 100;

  const latencies = queryMetrics
    .filter((m) => m.latency > 0)
    .map((m) => m.latency)
    .sort((a, b) => a - b);

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length || 0;

  const totalTime = (performance.now() - startTime) / 1000;

  // Close database
  await db.close();

  // Print results
  console.log("═══════════════════════════════════════════════════════════");
  console.log("📊 VALIDATION RESULTS");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log(`Total Queries:     ${testQueries.length}`);
  console.log(`Relevant Results:  ${relevantQueries}`);
  console.log(`Accuracy:          ${accuracy.toFixed(1)}%`);
  console.log("");
  console.log(`Latency P50:       ${p50.toFixed(2)}ms`);
  console.log(`Latency P95:       ${p95.toFixed(2)}ms`);
  console.log(`Latency P99:       ${p99.toFixed(2)}ms`);
  console.log(`Latency Avg:       ${avgLatency.toFixed(2)}ms`);
  console.log("");
  console.log(`Crashes:           ${crashes}`);
  console.log(`Total Time:        ${totalTime.toFixed(1)}s`);
  console.log("");

  // Success criteria evaluation
  console.log("═══════════════════════════════════════════════════════════");
  console.log("✅ SUCCESS CRITERIA EVALUATION");
  console.log("═══════════════════════════════════════════════════════════\n");

  const accuracyPass = accuracy >= 80;
  const latencyPass = p95 <= 150;
  const crashPass = crashes === 0;

  console.log(
    `Accuracy >= 80%:     ${accuracyPass ? "✅ PASS" : "❌ FAIL"} (${accuracy.toFixed(1)}%)`,
  );
  console.log(`P95 Latency <= 150ms: ${latencyPass ? "✅ PASS" : "❌ FAIL"} (${p95.toFixed(2)}ms)`);
  console.log(`Zero Crashes:        ${crashPass ? "✅ PASS" : "❌ FAIL"} (${crashes} crashes)`);
  console.log("");

  const overallPass = accuracyPass && latencyPass && crashPass;
  console.log(`Overall:             ${overallPass ? "✅✅✅ PASS" : "❌ FAIL"}`);
  console.log("");

  console.log("═══════════════════════════════════════════════════════════\n");

  return {
    totalQueries: testQueries.length,
    relevantQueries,
    accuracy,
    latencies,
    p50,
    p95,
    p99,
    avgLatency,
    crashes,
    queryMetrics,
  };
}

// Run validation if executed directly
if (import.meta.main) {
  try {
    const results = await runValidation();

    // Exit with appropriate code
    const pass = results.accuracy >= 80 && results.p95 <= 150 && results.crashes === 0;
    Deno.exit(pass ? 0 : 1);
  } catch (error) {
    console.error("❌ Validation failed with error:", error);
    Deno.exit(1);
  }
}

// Export for testing framework
export { runValidation, type ValidationResults };
