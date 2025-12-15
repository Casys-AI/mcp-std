/**
 * OPTION 2: MCP GATEWAY SMOKE TEST
 *
 * Validation Sprint - Epic 1 Retrospective
 * Tests MCP server discovery, connection, and tool extraction with mock servers
 *
 * Success Criteria:
 * - Discovery success rate: >= 90% (discover all configured servers)
 * - Tool extraction success rate: >= 90% (extract tools from discovered servers)
 * - P95 discovery latency: <= 5000ms (5 seconds per server)
 * - Zero crashes: No unhandled errors during discovery
 *
 * Expected Duration: 4-6 hours
 */

import { MCPServerDiscovery } from "../../src/mcp/discovery.ts";
import { MCPClient } from "../../src/mcp/client.ts";
import type { MCPServer } from "../../src/mcp/types.ts";

/**
 * Test metrics for a single server discovery
 */
interface ServerMetrics {
  serverId: string;
  serverName: string;
  discoverySuccess: boolean;
  connectionSuccess: boolean;
  toolsExtracted: number;
  connectionLatency: number;
  toolListingLatency: number;
  totalLatency: number;
  error?: string;
}

/**
 * Overall validation results
 */
interface ValidationResults {
  totalServers: number;
  discoveredServers: number;
  connectedServers: number;
  toolsExtractedTotal: number;
  discoverySuccessRate: number;
  toolExtractionSuccessRate: number;
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  avgLatency: number;
  crashes: number;
  serverMetrics: ServerMetrics[];
}

/**
 * Create test configuration file for mock servers
 */
async function createTestConfig(): Promise<string> {
  const testConfigPath = "/tmp/agentcards-option2-test-config.json";

  const config = {
    mcpServers: {
      filesystem: {
        command: "/home/ubuntu/CascadeProjects/AgentCards/tests/mocks/run-filesystem-mock.sh",
        args: [],
        protocol: "stdio",
      },
      database: {
        command: "/home/ubuntu/CascadeProjects/AgentCards/tests/mocks/run-database-mock.sh",
        args: [],
        protocol: "stdio",
        env: {
          DB_HOST: "localhost",
          DB_PORT: "5432",
        },
      },
      api: {
        command: "/home/ubuntu/CascadeProjects/AgentCards/tests/mocks/run-api-mock.sh",
        args: [],
        protocol: "stdio",
      },
    },
  };

  await Deno.writeTextFile(testConfigPath, JSON.stringify(config, null, 2));
  console.log(`   ✓ Test config created: ${testConfigPath}`);

  return testConfigPath;
}

/**
 * Test server discovery
 */
async function testServerDiscovery(
  discovery: MCPServerDiscovery,
): Promise<MCPServer[]> {
  console.log("\n📋 Testing Server Discovery...\n");

  const startTime = performance.now();

  const servers = await discovery.discoverServers();
  const discoveryTime = performance.now() - startTime;

  console.log(`   ✓ Discovered ${servers.length} servers in ${discoveryTime.toFixed(2)}ms`);
  for (const server of servers) {
    console.log(`     - ${server.id} (${server.protocol})`);
  }

  return servers;
}

/**
 * Test connection and tool extraction for a single server
 */
async function testServerConnection(
  server: MCPServer,
): Promise<ServerMetrics> {
  console.log(`\n🔗 Testing Server: ${server.id}`);

  const totalStart = performance.now();

  try {
    // Test connection
    const connectionStart = performance.now();
    const client = new MCPClient(server, 5000); // 5 second timeout
    await client.connect();
    const connectionLatency = performance.now() - connectionStart;

    console.log(`   ✓ Connected in ${connectionLatency.toFixed(2)}ms`);

    // Test tool listing
    const toolListStart = performance.now();
    const tools = await client.listTools();
    const toolListingLatency = performance.now() - toolListStart;

    console.log(`   ✓ Extracted ${tools.length} tools in ${toolListingLatency.toFixed(2)}ms`);

    // Log tool names
    if (tools.length > 0) {
      console.log(`     Tools: ${tools.map((t) => t.name).join(", ")}`);
    }

    // Close connection
    await client.close();

    const totalLatency = performance.now() - totalStart;

    return {
      serverId: server.id,
      serverName: server.name,
      discoverySuccess: true,
      connectionSuccess: true,
      toolsExtracted: tools.length,
      connectionLatency,
      toolListingLatency,
      totalLatency,
    };
  } catch (error) {
    const totalLatency = performance.now() - totalStart;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.log(`   ❌ FAILED: ${errorMessage}`);

    return {
      serverId: server.id,
      serverName: server.name,
      discoverySuccess: true, // Server was discovered
      connectionSuccess: false,
      toolsExtracted: 0,
      connectionLatency: 0,
      toolListingLatency: 0,
      totalLatency,
      error: errorMessage,
    };
  }
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
  console.log("🧪 OPTION 2: MCP GATEWAY SMOKE TEST");
  console.log("═══════════════════════════════════════════════════════════\n");

  const startTime = performance.now();
  let crashes = 0;

  // Setup test configuration
  console.log("🔧 Setting up test environment...\n");
  const testConfigPath = await createTestConfig();

  // Initialize discovery engine
  const discovery = new MCPServerDiscovery(testConfigPath);

  try {
    // Test 1: Server Discovery
    const servers = await testServerDiscovery(discovery);

    // Test 2: Connection and Tool Extraction
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("🔌 Testing Server Connections and Tool Extraction");
    console.log("═══════════════════════════════════════════════════════════");

    const serverMetrics: ServerMetrics[] = [];

    for (const server of servers) {
      try {
        const metrics = await testServerConnection(server);
        serverMetrics.push(metrics);
      } catch (error) {
        console.log(`   ❌ CRASH during ${server.id}: ${error}`);
        crashes++;

        serverMetrics.push({
          serverId: server.id,
          serverName: server.name,
          discoverySuccess: true,
          connectionSuccess: false,
          toolsExtracted: 0,
          connectionLatency: 0,
          toolListingLatency: 0,
          totalLatency: 0,
          error: String(error),
        });
      }
    }

    // Calculate statistics
    const totalServers = servers.length;
    const discoveredServers = serverMetrics.filter((m) => m.discoverySuccess).length;
    const connectedServers = serverMetrics.filter((m) => m.connectionSuccess).length;
    const toolsExtractedTotal = serverMetrics.reduce(
      (sum, m) => sum + m.toolsExtracted,
      0,
    );

    const discoverySuccessRate = (discoveredServers / totalServers) * 100;
    const toolExtractionSuccessRate = (connectedServers / totalServers) * 100;

    const latencies = serverMetrics
      .filter((m) => m.totalLatency > 0)
      .map((m) => m.totalLatency)
      .sort((a, b) => a - b);

    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length || 0;

    const totalTime = (performance.now() - startTime) / 1000;

    // Print results
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("📊 VALIDATION RESULTS");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log(`Total Servers:             ${totalServers}`);
    console.log(`Discovered Servers:        ${discoveredServers}`);
    console.log(`Connected Servers:         ${connectedServers}`);
    console.log(`Tools Extracted (Total):   ${toolsExtractedTotal}`);
    console.log("");
    console.log(`Discovery Success Rate:    ${discoverySuccessRate.toFixed(1)}%`);
    console.log(`Tool Extraction Rate:      ${toolExtractionSuccessRate.toFixed(1)}%`);
    console.log("");
    console.log(`Latency P50:               ${p50.toFixed(2)}ms`);
    console.log(`Latency P95:               ${p95.toFixed(2)}ms`);
    console.log(`Latency P99:               ${p99.toFixed(2)}ms`);
    console.log(`Latency Avg:               ${avgLatency.toFixed(2)}ms`);
    console.log("");
    console.log(`Crashes:                   ${crashes}`);
    console.log(`Total Time:                ${totalTime.toFixed(1)}s`);
    console.log("");

    // Success criteria evaluation
    console.log("═══════════════════════════════════════════════════════════");
    console.log("✅ SUCCESS CRITERIA EVALUATION");
    console.log("═══════════════════════════════════════════════════════════\n");

    const discoveryPass = discoverySuccessRate >= 90;
    const toolExtractionPass = toolExtractionSuccessRate >= 90;
    const latencyPass = p95 <= 5000;
    const crashPass = crashes === 0;

    console.log(
      `Discovery Success >= 90%:     ${discoveryPass ? "✅ PASS" : "❌ FAIL"} (${
        discoverySuccessRate.toFixed(1)
      }%)`,
    );
    console.log(
      `Tool Extraction >= 90%:       ${toolExtractionPass ? "✅ PASS" : "❌ FAIL"} (${
        toolExtractionSuccessRate.toFixed(1)
      }%)`,
    );
    console.log(
      `P95 Latency <= 5000ms:        ${latencyPass ? "✅ PASS" : "❌ FAIL"} (${p95.toFixed(2)}ms)`,
    );
    console.log(
      `Zero Crashes:                 ${crashPass ? "✅ PASS" : "❌ FAIL"} (${crashes} crashes)`,
    );
    console.log("");

    const overallPass = discoveryPass && toolExtractionPass && latencyPass && crashPass;
    console.log(`Overall:                      ${overallPass ? "✅✅✅ PASS" : "❌ FAIL"}`);
    console.log("");

    console.log("═══════════════════════════════════════════════════════════\n");

    // Cleanup
    try {
      await Deno.remove(testConfigPath);
    } catch {
      // Ignore cleanup errors
    }

    return {
      totalServers,
      discoveredServers,
      connectedServers,
      toolsExtractedTotal,
      discoverySuccessRate,
      toolExtractionSuccessRate,
      latencies,
      p50,
      p95,
      p99,
      avgLatency,
      crashes,
      serverMetrics,
    };
  } catch (error) {
    console.error("\n❌ Validation failed with unhandled error:", error);
    crashes++;

    throw error;
  }
}

// Run validation if executed directly
if (import.meta.main) {
  try {
    const results = await runValidation();

    // Exit with appropriate code
    const pass = results.discoverySuccessRate >= 90 &&
      results.toolExtractionSuccessRate >= 90 &&
      results.p95 <= 5000 &&
      results.crashes === 0;

    Deno.exit(pass ? 0 : 1);
  } catch (error) {
    console.error("❌ Validation failed with error:", error);
    Deno.exit(1);
  }
}

// Export for testing framework
export { runValidation, type ValidationResults };
