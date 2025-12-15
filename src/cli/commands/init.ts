/**
 * Init Command
 *
 * CLI command to migrate Claude Desktop MCP configuration to Casys PML
 *
 * @module cli/commands/init
 */

import { Command } from "@cliffy/command";
import { ConfigMigrator } from "../config-migrator.ts";

/**
 * Create init command
 *
 * Usage:
 *   cai init                    # Auto-detect config and migrate
 *   cai init --dry-run          # Preview migration without changes
 *   cai init --config <path>    # Use custom config path
 */
export function createInitCommand() {
  return new Command()
    .name("init")
    .description("Migrate existing MCP configuration to Casys PML")
    .option(
      "--dry-run",
      "Preview changes without applying them",
      { default: false },
    )
    .option(
      "--config <path:string>",
      "Path to MCP config file (auto-detected if not provided)",
    )
    .action(async (options) => {
      const migrator = new ConfigMigrator();

      const result = await migrator.migrate({
        configPath: options.config,
        dryRun: options.dryRun,
      });

      // Exit with error code if migration failed
      if (!result.success) {
        Deno.exit(1);
      }
    });
}
