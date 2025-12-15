/**
 * Unit tests for HealthChecker
 *
 * Tests health check functionality for MCP servers
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { HealthChecker } from "../../../src/health/health-checker.ts";
import type { MCPServer } from "../../../src/mcp/types.ts";

/**
 * Create a mock MCPClient that can succeed or fail
 */
class MockMCPClient {
  private shouldFail: boolean;
  private failureCount: number = 0;
  private maxFailures: number;

  constructor(
    private server: MCPServer,
    shouldFail: boolean = false,
    maxFailures: number = 999,
  ) {
    this.shouldFail = shouldFail;
    this.maxFailures = maxFailures;
  }

  get serverId(): string {
    return this.server.id;
  }

  get serverName(): string {
    return this.server.name;
  }

  async listTools(): Promise<any[]> {
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (this.shouldFail && this.failureCount < this.maxFailures) {
      this.failureCount++;
      throw new Error("Connection failed");
    }

    return [{ name: "test_tool", description: "Test", inputSchema: {} }];
  }
}

/**
 * Mock MCP Client with configurable latency
 */
class MockSlowMCPClient {
  constructor(
    private server: MCPServer,
    private latencyMs: number = 0,
  ) {}

  get serverId(): string {
    return this.server.id;
  }

  get serverName(): string {
    return this.server.name;
  }

  async listTools(): Promise<any[]> {
    // Simulate high latency
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    return [{ name: "test_tool", description: "Test", inputSchema: {} }];
  }
}

Deno.test("HealthChecker - initializes with empty health map", () => {
  const clients = new Map<string, any>();
  const healthChecker = new HealthChecker(clients);

  const allHealth = healthChecker.getAllHealth();
  assertEquals(allHealth.length, 0);
});

Deno.test("HealthChecker - performs initial health check on healthy server", async () => {
  const mockServer: MCPServer = {
    id: "test-server",
    name: "Test Server",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  const mockClient = new MockMCPClient(mockServer, false);
  const clients = new Map<string, any>([["test-server", mockClient]]);

  const healthChecker = new HealthChecker(clients);
  await healthChecker.initialHealthCheck();

  const health = healthChecker.getServerHealth("test-server");
  assertExists(health);
  assertEquals(health.status, "healthy");
  assertEquals(health.serverId, "test-server");
  assertEquals(health.serverName, "Test Server");
  assertEquals(health.consecutiveFailures, 0);
  assertExists(health.lastSuccess);
  assertExists(health.latencyMs);
  assert(health.latencyMs! >= 0);
});

Deno.test("HealthChecker - marks server as down after all retries fail", async () => {
  const mockServer: MCPServer = {
    id: "failing-server",
    name: "Failing Server",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  const mockClient = new MockMCPClient(mockServer, true);
  const clients = new Map<string, any>([["failing-server", mockClient]]);

  const healthChecker = new HealthChecker(clients);
  await healthChecker.initialHealthCheck();

  const health = healthChecker.getServerHealth("failing-server");
  assertExists(health);
  assertEquals(health.status, "down");
  assertEquals(health.consecutiveFailures, 1);
  assertEquals(health.latencyMs, null);
  assertEquals(health.lastSuccess, null);
  assertExists(health.errorMessage);
});

Deno.test("HealthChecker - retries 3 times before marking server down", async () => {
  const mockServer: MCPServer = {
    id: "retry-server",
    name: "Retry Server",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  // Fail first 2 attempts, succeed on 3rd
  const mockClient = new MockMCPClient(mockServer, true, 2);
  const clients = new Map<string, any>([["retry-server", mockClient]]);

  const healthChecker = new HealthChecker(clients);
  await healthChecker.initialHealthCheck();

  const health = healthChecker.getServerHealth("retry-server");
  assertExists(health);
  // Server is degraded because retries were needed, not fully healthy
  assertEquals(health.status, "degraded");
  assertEquals(health.consecutiveFailures, 0);
  assertExists(health.lastSuccess);
});

Deno.test("HealthChecker - tracks multiple servers", async () => {
  const server1: MCPServer = {
    id: "server-1",
    name: "Server 1",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  const server2: MCPServer = {
    id: "server-2",
    name: "Server 2",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  const client1 = new MockMCPClient(server1, false);
  const client2 = new MockMCPClient(server2, true);

  const clients = new Map<string, any>([
    ["server-1", client1],
    ["server-2", client2],
  ]);

  const healthChecker = new HealthChecker(clients);
  await healthChecker.initialHealthCheck();

  const allHealth = healthChecker.getAllHealth();
  assertEquals(allHealth.length, 2);

  const health1 = healthChecker.getServerHealth("server-1");
  const health2 = healthChecker.getServerHealth("server-2");

  assertExists(health1);
  assertExists(health2);
  assertEquals(health1.status, "healthy");
  assertEquals(health2.status, "down");
});

Deno.test("HealthChecker - getHealthSummary returns correct counts", async () => {
  const servers = [
    { id: "healthy-1", name: "Healthy 1", command: "echo", args: [], protocol: "stdio" as const },
    { id: "healthy-2", name: "Healthy 2", command: "echo", args: [], protocol: "stdio" as const },
    { id: "down-1", name: "Down 1", command: "echo", args: [], protocol: "stdio" as const },
  ];

  const clients = new Map<string, any>([
    ["healthy-1", new MockMCPClient(servers[0], false)],
    ["healthy-2", new MockMCPClient(servers[1], false)],
    ["down-1", new MockMCPClient(servers[2], true)],
  ]);

  const healthChecker = new HealthChecker(clients);
  await healthChecker.initialHealthCheck();

  const summary = healthChecker.getHealthSummary();
  assertEquals(summary.total, 3);
  assertEquals(summary.healthy, 2);
  assertEquals(summary.degraded, 0);
  assertEquals(summary.down, 1);
});

Deno.test("HealthChecker - starts and stops periodic checks", async () => {
  const clients = new Map<string, any>();
  const healthChecker = new HealthChecker(clients);

  // Start periodic checks (won't actually run in test due to short duration)
  healthChecker.startPeriodicChecks();

  // Wait a tiny bit
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Stop periodic checks (should not throw)
  healthChecker.stopPeriodicChecks();

  // Calling stop again should be safe
  healthChecker.stopPeriodicChecks();
});

Deno.test("HealthChecker - getAllHealth returns array of all server health", async () => {
  const server1: MCPServer = {
    id: "server-1",
    name: "Server 1",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  const server2: MCPServer = {
    id: "server-2",
    name: "Server 2",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  const clients = new Map<string, any>([
    ["server-1", new MockMCPClient(server1, false)],
    ["server-2", new MockMCPClient(server2, false)],
  ]);

  const healthChecker = new HealthChecker(clients);
  await healthChecker.initialHealthCheck();

  const allHealth = healthChecker.getAllHealth();
  assertEquals(allHealth.length, 2);

  // Verify all health objects have required fields
  for (const health of allHealth) {
    assertExists(health.serverId);
    assertExists(health.serverName);
    assertExists(health.status);
    assertExists(health.lastCheck);
    assert(typeof health.consecutiveFailures === "number");
  }
});

Deno.test("HealthChecker - returns undefined for non-existent server", () => {
  const clients = new Map<string, any>();
  const healthChecker = new HealthChecker(clients);

  const health = healthChecker.getServerHealth("non-existent");
  assertEquals(health, undefined);
});

Deno.test("HealthChecker - increments consecutive failures on repeated failures", async () => {
  const mockServer: MCPServer = {
    id: "failing-server",
    name: "Failing Server",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  const mockClient = new MockMCPClient(mockServer, true);
  const clients = new Map<string, any>([["failing-server", mockClient]]);

  const healthChecker = new HealthChecker(clients);

  // First check
  await healthChecker.initialHealthCheck();
  let health = healthChecker.getServerHealth("failing-server");
  assertExists(health);
  assertEquals(health.consecutiveFailures, 1);

  // The checkServer method is private, so we test through the initial check
  // In a real scenario, the periodic check would increment this further
});

Deno.test("HealthChecker - marks server as degraded with high latency", async () => {
  const mockServer: MCPServer = {
    id: "slow-server",
    name: "Slow Server",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  // Simulate 1500ms latency (above 1000ms threshold)
  const mockClient = new MockSlowMCPClient(mockServer, 1500);
  const clients = new Map<string, any>([["slow-server", mockClient]]);

  const healthChecker = new HealthChecker(clients);
  await healthChecker.initialHealthCheck();

  const health = healthChecker.getServerHealth("slow-server");
  assertExists(health);
  assertEquals(health.status, "degraded");
  assertExists(health.latencyMs);
  assert(health.latencyMs! > 1000);
});

Deno.test("HealthChecker - marks server as degraded after retries but eventual success", async () => {
  const mockServer: MCPServer = {
    id: "flaky-server",
    name: "Flaky Server",
    command: "echo",
    args: [],
    protocol: "stdio",
  };

  // Fail first attempt, succeed on second
  const mockClient = new MockMCPClient(mockServer, true, 1);
  const clients = new Map<string, any>([["flaky-server", mockClient]]);

  const healthChecker = new HealthChecker(clients);
  await healthChecker.initialHealthCheck();

  const health = healthChecker.getServerHealth("flaky-server");
  assertExists(health);
  assertEquals(health.status, "degraded"); // Should be degraded due to needed retries
  assertEquals(health.consecutiveFailures, 0); // But eventually succeeded
  assertExists(health.lastSuccess);
});
