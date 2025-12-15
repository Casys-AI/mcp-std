/**
 * Integration tests for full migration workflow
 *
 * @module tests/integration/migration_test
 */

import { assert, assertEquals } from "@std/assert";
import { join } from "jsr:@std/path@1.0.8";
import { ConfigMigrator } from "../../src/cli/config-migrator.ts";

/**
 * NOTE: Full migration tests require actual MCP server executables
 * These tests focus on dry-run mode and config parsing.
 * Full end-to-end testing would require:
 * - Mock MCP servers
 * - Database cleanup
 * - Model download (400MB)
 */

Deno.test("Integration - Full dry-run workflow", async () => {
  const migrator = new ConfigMigrator();

  const fixturesDir = join(Deno.cwd(), "tests", "fixtures");
  const configPath = join(fixturesDir, "mcp-config-sample.json");

  // Test full preview workflow
  const result = await migrator.migrate({
    configPath,
    dryRun: true,
  });

  // Verify complete workflow
  assert(result.success, "Migration preview should succeed");
  assertEquals(result.serversCount, 3, "Should parse 3 servers");
  assertEquals(result.configPath, configPath, "Should reference input config");

  // In dry-run, no actual migration happens
  assertEquals(result.toolsExtracted, 0);
  assertEquals(result.embeddingsGenerated, 0);
});

Deno.test("Integration - CLI command registration", async () => {
  // Test that init command is properly registered
  const { createInitCommand } = await import("../../src/cli/commands/init.ts");

  const command = createInitCommand();

  assertEquals(command.getName(), "init", "Command should be named 'init'");
  assertEquals(
    command.getDescription(),
    "Migrate existing MCP configuration to Casys PML",
    "Command should have correct description",
  );

  // Verify options
  const options = command.getOptions();
  const optionNames = options.map((opt) => opt.name);

  assert(optionNames.includes("dry-run"), "Should have --dry-run option");
  assert(optionNames.includes("config"), "Should have --config option");
});

Deno.test("Integration - Error handling for missing config", async () => {
  const migrator = new ConfigMigrator();

  const result = await migrator.migrate({
    configPath: "/totally/fake/path.json",
    dryRun: true,
  });

  // Should handle error gracefully
  assertEquals(result.success, false, "Should fail gracefully");
  assert(result.error, "Should provide error message");
  assert(
    result.error.includes("not found") || result.error.includes("No such file"),
    "Error should indicate file not found",
  );
});
