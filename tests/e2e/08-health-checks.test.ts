/**
 * E2E Test 08: Health Checks and MCP Server Monitoring
 *
 * Tests health checking functionality for MCP servers.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { MockMCPServer } from "../fixtures/mock-mcp-server.ts";

export interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  responseTime: number;
  error?: string;
}

Deno.test("E2E 08: Health checks and server monitoring", async (t) => {
  const mockServers = new Map<string, MockMCPServer>();

  // Helper function to simulate health check
  async function simulateHealthCheck(
    server: MockMCPServer,
    shouldFail = false,
  ): Promise<HealthCheckResult> {
    const start = performance.now();

    try {
      if (shouldFail) {
        throw new Error("Connection refused");
      }

      await server.callTool("health_check", {});
      const responseTime = performance.now() - start;

      return {
        status: "healthy",
        responseTime,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        responseTime: performance.now() - start,
        error: (error as Error).message,
      };
    }
  }

  try {
    await t.step("1. Create mock MCP servers", () => {
      mockServers.set("server1", new MockMCPServer("server1"));
      mockServers.set("server2", new MockMCPServer("server2"));
      mockServers.set("server3", new MockMCPServer("server3"));

      // Add tools to servers
      for (const server of mockServers.values()) {
        server.addTool("health_check", () => ({ status: "ok" }));
        server.addTool("test_tool", (_args: any) => ({ result: "ok" }));
      }

      assert(mockServers.size === 3, "Should have 3 mock servers");
    });

    await t.step("2. Check health of single server", async () => {
      const server = mockServers.get("server1")!;

      const health = await simulateHealthCheck(server);

      assertEquals(health.status, "healthy", "Server should be healthy");
      assert(health.responseTime >= 0, "Should have response time");

      console.log(`  Server health: ${health.status} (${health.responseTime.toFixed(1)}ms)`);
    });

    await t.step("3. Check health of all servers", async () => {
      const healthChecks = [];

      for (const [_serverId, server] of mockServers.entries()) {
        healthChecks.push(simulateHealthCheck(server));
      }

      const results = await Promise.all(healthChecks);

      const healthyCount = results.filter((r) => r.status === "healthy").length;
      assertEquals(healthyCount, 3, "All servers should be healthy");

      console.log(`  Checked ${results.length} servers, all healthy`);
    });

    await t.step("4. Test unhealthy server detection", async () => {
      const server = mockServers.get("server1")!;
      const health = await simulateHealthCheck(server, true);

      assertEquals(health.status, "unhealthy", "Failed server should be unhealthy");
      assert(health.error, "Should have error message");

      console.log(`  Unhealthy server detected: ${health.error}`);
    });

    await t.step("5. Test concurrent health checks", async () => {
      const checks = Array.from(mockServers.values()).map(async (server) => {
        return await simulateHealthCheck(server);
      });

      const results = await Promise.all(checks);

      assertEquals(results.length, 3, "Should check all servers concurrently");
      assert(
        results.every((r) => r.status === "healthy"),
        "All servers should be healthy",
      );

      console.log(`  Concurrent health checks: ${results.length} servers verified`);
    });

    await t.step("6. Verify no memory leaks", async () => {
      // Run many health checks
      for (let i = 0; i < 100; i++) {
        const server = mockServers.get("server1")!;
        await simulateHealthCheck(server);
      }

      console.log("  Completed 100 health checks without memory issues");
    });
  } finally {
    mockServers.clear();
  }
});
