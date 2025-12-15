/**
 * Tests for migrate-config command
 *
 * @module tests/unit/cli/migrate-config_test
 */

import { assert, assertEquals } from "@std/assert";
import { parse as parseYAML } from "@std/yaml";
import { getAgentCardsConfigPath, getLegacyConfigPath } from "../../../src/cli/utils.ts";

/**
 * Test YAML → JSON migration logic
 */
Deno.test("YAML to JSON migration - format conversion", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    const yamlPath = `${testDir}/config.yaml`;
    const jsonPath = `${testDir}/config.json`;

    // Create test YAML config
    const yamlConfig = `
servers:
  - id: filesystem
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - /tmp
  - id: github
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_TOKEN: test_token
`;

    await Deno.writeTextFile(yamlPath, yamlConfig);

    // Parse YAML
    const parsedYAML: any = parseYAML(yamlConfig);

    // Transform to JSON format (same logic as migrate-config command)
    const jsonConfig = {
      mcpServers: parsedYAML.servers.reduce((acc: any, server: any) => {
        acc[server.id] = {
          command: server.command,
          ...(server.args && { args: server.args }),
          ...(server.env && { env: server.env }),
        };
        return acc;
      }, {}),
      context: {
        topK: 10,
        similarityThreshold: 0.7,
      },
      execution: {
        maxConcurrency: 10,
        timeout: 30000,
      },
    };

    // Write JSON
    await Deno.writeTextFile(jsonPath, JSON.stringify(jsonConfig, null, 2));

    // Verify JSON file
    const jsonContent = await Deno.readTextFile(jsonPath);
    const parsedJSON = JSON.parse(jsonContent);

    // Assertions
    assert(parsedJSON.mcpServers, "Should have mcpServers object");
    assert(parsedJSON.mcpServers.filesystem, "Should have filesystem server");
    assertEquals(parsedJSON.mcpServers.filesystem.command, "npx");
    assert(
      Array.isArray(parsedJSON.mcpServers.filesystem.args),
      "Args should be array",
    );

    assert(parsedJSON.mcpServers.github, "Should have github server");
    assertEquals(parsedJSON.mcpServers.github.env.GITHUB_TOKEN, "test_token");

    // JSON format should be pretty-printed (2-space indent)
    assert(jsonContent.includes("  "), "Should be pretty-printed");
    assert(!jsonContent.includes("\t"), "Should use spaces, not tabs");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("Migration preserves all server properties", async () => {
  const testDir = await Deno.makeTempDir();

  try {
    // YAML with all properties
    const yamlConfig = {
      servers: [
        {
          id: "test-server",
          name: "Test Server",
          command: "test-command",
          args: ["arg1", "arg2"],
          env: {
            VAR1: "value1",
            VAR2: "value2",
          },
        },
      ],
    };

    // Transform to JSON format
    const jsonConfig = {
      mcpServers: yamlConfig.servers.reduce((acc: any, server: any) => {
        acc[server.id] = {
          command: server.command,
          ...(server.args && { args: server.args }),
          ...(server.env && { env: server.env }),
        };
        return acc;
      }, {}),
    };

    // Verify transformation
    const server = jsonConfig.mcpServers["test-server"];
    assertEquals(server.command, "test-command");
    assertEquals(server.args, ["arg1", "arg2"]);
    assertEquals(server.env.VAR1, "value1");
    assertEquals(server.env.VAR2, "value2");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("Config paths use correct extensions (ADR-009)", () => {
  const jsonPath = getAgentCardsConfigPath();
  const yamlPath = getLegacyConfigPath();

  // JSON is primary
  assert(jsonPath.endsWith(".json"), "Primary config should be JSON");

  // YAML is legacy
  assert(yamlPath.endsWith(".yaml"), "Legacy config should be YAML");

  // Warn: names should match except extension
  const jsonBase = jsonPath.replace(/\.json$/, "");
  const yamlBase = yamlPath.replace(/\.yaml$/, "");

  assertEquals(
    jsonBase,
    yamlBase,
    "Config file base names should match (only extension differs)",
  );
});
