/**
 * Configuration Migration Service
 *
 * Migrates Claude Desktop MCP configuration to Casys PML format
 * and triggers schema discovery and embedding generation.
 *
 * @module cli/config-migrator
 */

import * as log from "@std/log";
import { ensureDir } from "@std/fs";
import { PGliteClient } from "../db/client.ts";
import { getAllMigrations, MigrationRunner } from "../db/migrations.ts";
import { MCPServerDiscovery } from "../mcp/discovery.ts";
import { SchemaExtractor } from "../mcp/schema-extractor.ts";
import { EmbeddingModel, generateEmbeddings } from "../vector/embeddings.ts";
import {
  detectMCPConfigPath,
  getAgentCardsConfigDir,
  getAgentCardsConfigPath,
  getAgentCardsDatabasePath,
} from "./utils.ts";

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  configPath: string;
  serversCount: number;
  toolsExtracted: number;
  embeddingsGenerated: number;
  error?: string;
}

/**
 * Migration options
 */
export interface MigrationOptions {
  /** Custom MCP config path (overrides auto-detection) */
  configPath?: string;
  /** Dry-run mode: preview changes without applying */
  dryRun?: boolean;
}

/**
 * Configuration Migrator
 *
 * Orchestrates the full migration workflow:
 * 1. Detect/load Claude Desktop MCP config
 * 2. Parse and validate config
 * 3. Generate Casys PML config.yaml
 * 4. Discover servers and extract schemas
 * 5. Generate embeddings
 * 6. Display instructions for updating Claude Desktop config
 */
export class ConfigMigrator {
  /**
   * Execute migration workflow
   */
  async migrate(options: MigrationOptions = {}): Promise<MigrationResult> {
    const { configPath, dryRun = false } = options;

    if (dryRun) {
      return await this.previewMigration(configPath);
    }

    console.log("🔄 Starting Casys PML migration...\n");

    try {
      // Step 1: Detect MCP config path
      const mcpConfigPath = configPath || detectMCPConfigPath();
      console.log(`✓ Found MCP config: ${mcpConfigPath}`);

      // Check if file exists
      try {
        await Deno.stat(mcpConfigPath);
      } catch {
        throw new Error(`MCP config file not found: ${mcpConfigPath}`);
      }

      // Step 2: Parse existing config
      const discovery = new MCPServerDiscovery(mcpConfigPath);
      const mcpConfig = await discovery.loadConfig();
      const serversCount = mcpConfig.servers.length;

      console.log(`✓ Parsed ${serversCount} servers\n`);

      if (serversCount === 0) {
        console.log("⚠️  No servers found in MCP config");
        return {
          success: true,
          configPath: mcpConfigPath,
          serversCount: 0,
          toolsExtracted: 0,
          embeddingsGenerated: 0,
        };
      }

      // Step 3: Generate Casys PML config (JSON format per ADR-009)
      const configDir = getAgentCardsConfigDir();
      const agentCardsConfigPath = getAgentCardsConfigPath(); // Now returns .json

      // Create config directory
      await ensureDir(configDir);

      // Write config.json (not YAML - ADR-009)
      // Clean undefined values for consistent JSON output
      const cleanConfig = {
        mcpServers: mcpConfig.servers.reduce((acc, server) => {
          acc[server.id] = {
            command: server.command,
            ...(server.args !== undefined && { args: server.args }),
            ...(server.env !== undefined && { env: server.env }),
          };
          return acc;
        }, {} as Record<string, any>),
        context: {
          topK: 10,
          similarityThreshold: 0.7,
        },
        execution: {
          maxConcurrency: 10,
          timeout: 30000,
        },
      };

      // Write JSON with pretty-printing (2-space indent)
      const configJSON = JSON.stringify(cleanConfig, null, 2);
      await Deno.writeTextFile(agentCardsConfigPath, configJSON);

      console.log(`✓ Generated Casys PML config: ${agentCardsConfigPath}`);
      console.log(`  Format: JSON (MCP ecosystem compatible) ✅\n`);

      // Step 4: Initialize database and discover servers
      console.log("🔍 Discovering MCP servers and extracting schemas...");

      const dbPath = getAgentCardsDatabasePath();
      const db = new PGliteClient(dbPath);
      await db.connect();

      // Run database migrations to create tables
      const runner = new MigrationRunner(db);
      await runner.runUp(getAllMigrations());

      const extractor = new SchemaExtractor(agentCardsConfigPath, db);
      const discoveryStats = await extractor.extractAndStore();

      console.log(
        `\n✓ Extracted ${discoveryStats.totalToolsExtracted} tools from ${discoveryStats.successfulServers}/${discoveryStats.totalServers} servers`,
      );

      // Step 5: Generate embeddings
      console.log("\n🧠 Generating embeddings...");

      const model = new EmbeddingModel();
      const embeddingStats = await generateEmbeddings(db, model);

      console.log(
        `✓ Generated ${embeddingStats.newlyGenerated} new embeddings (${embeddingStats.cachedCount} cached)`,
      );

      // Step 6: Display new MCP config template
      console.log("\n✅ Migration complete!\n");
      this.displayNewMCPConfig();

      // Close database
      await db.close();

      return {
        success: true,
        configPath: agentCardsConfigPath,
        serversCount,
        toolsExtracted: discoveryStats.totalToolsExtracted,
        embeddingsGenerated: embeddingStats.newlyGenerated,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Migration failed: ${errorMessage}`);
      log.error(`Migration error: ${error}`);

      // Attempt rollback
      await this.rollback();

      return {
        success: false,
        configPath: "",
        serversCount: 0,
        toolsExtracted: 0,
        embeddingsGenerated: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Preview migration without making changes
   */
  async previewMigration(configPath?: string): Promise<MigrationResult> {
    console.log("🔍 DRY RUN - No changes will be made\n");

    try {
      // Detect MCP config path
      const mcpConfigPath = configPath || detectMCPConfigPath();

      // Check if file exists
      try {
        await Deno.stat(mcpConfigPath);
      } catch {
        throw new Error(`MCP config file not found: ${mcpConfigPath}`);
      }

      // Parse config
      const discovery = new MCPServerDiscovery(mcpConfigPath);
      const mcpConfig = await discovery.loadConfig();

      // Display preview
      console.log("📊 Migration Preview:\n");
      console.log(`  MCP Config: ${mcpConfigPath}`);
      console.log(`  Servers to migrate: ${mcpConfig.servers.length}\n`);

      if (mcpConfig.servers.length > 0) {
        console.log("  Servers:");
        mcpConfig.servers.forEach((server) => {
          console.log(`    - ${server.name} (${server.command})`);
        });
      }

      console.log(`\n  Casys PML config will be created at:`);
      console.log(`    ${getAgentCardsConfigPath()}`);
      console.log(`\n  Run without --dry-run to apply migration`);

      return {
        success: true,
        configPath: mcpConfigPath,
        serversCount: mcpConfig.servers.length,
        toolsExtracted: 0,
        embeddingsGenerated: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Preview failed: ${errorMessage}`);

      return {
        success: false,
        configPath: "",
        serversCount: 0,
        toolsExtracted: 0,
        embeddingsGenerated: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Display template for new Claude Desktop MCP config
   */
  private displayNewMCPConfig(): void {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📝 Update your Claude Desktop MCP config with:\n");

    const newConfig = {
      mcpServers: {
        pml: {
          command: "cai",
          args: ["serve"],
        },
      },
    };

    console.log(JSON.stringify(newConfig, null, 2));

    console.log("\n💡 Casys PML now acts as a gateway to all your MCP servers!");
    console.log("   All tool schemas are indexed with semantic search.");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }

  /**
   * Rollback migration by removing Casys PML directory
   */
  private async rollback(): Promise<void> {
    console.log("🔄 Rolling back migration...");

    const configDir = getAgentCardsConfigDir();

    try {
      await Deno.remove(configDir, { recursive: true });
      console.log("✓ Rollback complete - Casys PML config removed");
    } catch (error) {
      // Ignore errors if directory doesn't exist
      if (!(error instanceof Deno.errors.NotFound)) {
        log.warn(`Rollback warning: ${error}`);
      }
    }
  }
}
