/**
 * Tests for MCP Server Discovery
 *
 * Validates AC1: MCP server discovery via stdio et SSE protocols
 */

import { assertEquals, assertExists } from "@std/assert";
import { MCPServerDiscovery } from "../../../src/mcp/discovery.ts";

// Helper to create temporary config files
function getTempConfigPath(testName: string): string {
  return `/tmp/pml-test-config-${testName}-${Date.now()}.yaml`;
}

// Sample YAML config
const sampleYamlConfig = `servers:
  - id: filesystem-server
    name: Filesystem Server
    command: python
    args:
      - -m
      - mcp.server.filesystem
    protocol: stdio
  - id: github-server
    name: GitHub Server
    command: python
    args:
      - -m
      - mcp.server.github
    protocol: stdio
`;

Deno.test("AC1: Load YAML config with stdio servers", async () => {
  const configPath = getTempConfigPath("yaml-stdio");
  try {
    // Write test config
    await Deno.writeTextFile(configPath, sampleYamlConfig);

    // Load config
    const discovery = new MCPServerDiscovery(configPath);
    const config = await discovery.loadConfig();

    // Verify
    assertEquals(config.servers.length, 2);
    assertEquals(config.servers[0].id, "filesystem-server");
    assertEquals(config.servers[0].protocol, "stdio");
    assertEquals(config.servers[1].id, "github-server");
  } finally {
    await Deno.remove(configPath).catch(() => {});
  }
});

Deno.test("AC1: Discover multiple stdio servers", async () => {
  const configPath = getTempConfigPath("discover-stdio");
  try {
    await Deno.writeTextFile(configPath, sampleYamlConfig);

    const discovery = new MCPServerDiscovery(configPath);
    const servers = await discovery.discoverServers();

    assertEquals(servers.length, 2);
    assertEquals(servers[0].name, "Filesystem Server");
    assertEquals(servers[1].name, "GitHub Server");
  } finally {
    await Deno.remove(configPath).catch(() => {});
  }
});

Deno.test("AC1: Get servers by protocol", async () => {
  const configPath = getTempConfigPath("filter-protocol");
  try {
    const mixedConfig = `servers:
  - id: stdio-server
    name: Stdio Server
    command: python
    protocol: stdio
  - id: sse-server
    name: SSE Server
    command: python
    protocol: sse
`;

    await Deno.writeTextFile(configPath, mixedConfig);

    const discovery = new MCPServerDiscovery(configPath);
    await discovery.discoverServers();

    const stdioServers = discovery.getServersByProtocol("stdio");
    const sseServers = discovery.getServersByProtocol("sse");

    assertEquals(stdioServers.length, 1);
    assertEquals(stdioServers[0].id, "stdio-server");
    assertEquals(sseServers.length, 1);
    assertEquals(sseServers[0].id, "sse-server");
  } finally {
    await Deno.remove(configPath).catch(() => {});
  }
});

Deno.test("AC1: Get specific server by ID", async () => {
  const configPath = getTempConfigPath("get-server");
  try {
    await Deno.writeTextFile(configPath, sampleYamlConfig);

    const discovery = new MCPServerDiscovery(configPath);
    await discovery.discoverServers();

    const server = discovery.getServer("github-server");

    assertExists(server);
    assertEquals(server!.id, "github-server");
    assertEquals(server!.name, "GitHub Server");
  } finally {
    await Deno.remove(configPath).catch(() => {});
  }
});

Deno.test("AC1: Server configuration includes all fields", async () => {
  const configPath = getTempConfigPath("all-fields");
  try {
    const fullConfig = `servers:
  - id: complete-server
    name: Complete Server
    command: python
    args:
      - arg1
      - arg2
    env:
      VAR1: value1
      VAR2: value2
    protocol: stdio
`;

    await Deno.writeTextFile(configPath, fullConfig);

    const discovery = new MCPServerDiscovery(configPath);
    const servers = await discovery.discoverServers();

    assertEquals(servers.length, 1);
    const server = servers[0];
    assertEquals(server.id, "complete-server");
    assertEquals(server.command, "python");
    assertEquals(server.args?.length, 2);
    assertEquals(server.env?.VAR1, "value1");
    assertEquals(server.protocol, "stdio");
  } finally {
    await Deno.remove(configPath).catch(() => {});
  }
});
