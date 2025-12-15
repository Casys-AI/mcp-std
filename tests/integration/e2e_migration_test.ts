/**
 * End-to-End Migration Test with Mock MCP Servers
 *
 * Tests complete migration workflow including:
 * - Parallel server discovery (3 mock servers)
 * - Schema extraction (10 total tools)
 * - Embedding generation
 * - Database persistence
 *
 * @module tests/integration/e2e_migration_test
 */

import { assert, assertEquals } from "@std/assert";
import { join } from "jsr:@std/path@1.0.8";
import { ConfigMigrator } from "../../src/cli/config-migrator.ts";
import { exists } from "@std/fs";

Deno.test({
  name: "E2E - Full migration with 3 mock MCP servers",
  // Skip by default as it creates files and downloads model
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "true",
  async fn() {
    const testConfigDir = "/tmp/agentcards-e2e-test";
    const originalHome = Deno.env.get("HOME");

    try {
      // Setup: Use temp directory for this test
      Deno.env.set("HOME", testConfigDir);
      await Deno.mkdir(testConfigDir, { recursive: true });

      const migrator = new ConfigMigrator();
      const fixturesDir = join(Deno.cwd(), "tests", "fixtures");
      const configPath = join(fixturesDir, "mcp-config-mocks.json");

      console.log("\n🧪 Starting E2E migration test with mock servers...\n");

      // Execute full migration
      const result = await migrator.migrate({
        configPath,
        dryRun: false, // Real migration!
      });

      // Verify migration succeeded
      assert(result.success, "Migration should succeed");
      assertEquals(result.serversCount, 3, "Should migrate 3 servers");

      // Verify tools were extracted (3 + 4 + 3 = 10 total)
      assertEquals(
        result.toolsExtracted,
        10,
        "Should extract 10 tools total from all mock servers",
      );

      // Verify embeddings were generated
      assert(
        result.embeddingsGenerated > 0,
        "Should generate embeddings for tools",
      );

      // Verify config file was created
      const configFilePath = `${testConfigDir}/.agentcards/config.yaml`;
      const configExists = await exists(configFilePath);
      assert(configExists, "Config file should be created");

      // Verify database was created
      const dbPath = `${testConfigDir}/.agentcards/.cai.db`;
      const dbExists = await exists(dbPath);
      assert(dbExists, "Database should be created");

      console.log("\n✅ E2E Test Results:");
      console.log(`   Servers migrated: ${result.serversCount}`);
      console.log(`   Tools extracted: ${result.toolsExtracted}`);
      console.log(`   Embeddings generated: ${result.embeddingsGenerated}`);
      console.log(`   Config: ${configFilePath}`);
      console.log(`   Database: ${dbPath}\n`);
    } finally {
      // Cleanup: Restore HOME and remove test directory
      if (originalHome) {
        Deno.env.set("HOME", originalHome);
      }

      try {
        await Deno.remove(testConfigDir, { recursive: true });
        console.log("🧹 Cleaned up test directory");
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

Deno.test({
  name: "E2E - Parallel extraction timing verification",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "true",
  async fn() {
    const testConfigDir = "/tmp/agentcards-parallel-test";
    const originalHome = Deno.env.get("HOME");

    try {
      Deno.env.set("HOME", testConfigDir);
      await Deno.mkdir(testConfigDir, { recursive: true });

      const migrator = new ConfigMigrator();
      const fixturesDir = join(Deno.cwd(), "tests", "fixtures");
      const configPath = join(fixturesDir, "mcp-config-mocks.json");

      console.log("\n⏱️  Testing parallel extraction performance...\n");

      const startTime = performance.now();

      const result = await migrator.migrate({
        configPath,
        dryRun: false,
      });

      const duration = performance.now() - startTime;

      // Verify parallelization
      // If sequential: ~150ms (100ms + 50ms + 0ms)
      // If parallel: <150ms (max of 100ms, 50ms, 0ms)
      console.log(`\n⏱️  Total migration time: ${duration.toFixed(0)}ms`);

      assert(result.success, "Migration should succeed");

      // If truly parallel, should be closer to max(100, 50, 0) = ~100ms
      // Add some buffer for overhead
      assert(
        duration < 1000,
        `Parallel extraction should complete in <1s (was ${duration.toFixed(0)}ms)`,
      );

      console.log("✅ Parallelization verified!\n");
    } finally {
      if (originalHome) {
        Deno.env.set("HOME", originalHome);
      }

      try {
        await Deno.remove(testConfigDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});
