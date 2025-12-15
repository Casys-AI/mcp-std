/**
 * Workflows Command (Story 5.2)
 *
 * CLI command to manage workflow templates for graph bootstrap.
 *
 * @module cli/commands/workflows
 */

import { Command } from "@cliffy/command";
import * as log from "@std/log";
import { createDefaultClient } from "../../db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../db/migrations.ts";
import { WorkflowSyncService } from "../../graphrag/workflow-sync.ts";
import { WorkflowLoader } from "../../graphrag/workflow-loader.ts";
import { getWorkflowTemplatesPath } from "../utils.ts";

/**
 * Default workflow templates path
 */
const DEFAULT_WORKFLOW_PATH = getWorkflowTemplatesPath();

/**
 * Create workflows command group
 *
 * Usage:
 *   cai workflows sync              # Sync workflow templates to graph
 *   cai workflows sync --force      # Force sync even if unchanged
 *   cai workflows validate          # Validate YAML without syncing
 *   cai workflows stats             # Show edge statistics
 */
export function createWorkflowsCommand() {
  return new Command()
    .name("workflows")
    .description("Manage workflow templates for graph bootstrap (Story 5.2)")
    .command("sync", createSyncSubcommand())
    .command("validate", createValidateSubcommand())
    .command("stats", createStatsSubcommand());
}

/**
 * Create sync subcommand
 *
 * Syncs workflow templates from YAML to tool_dependency table.
 * Uses checksum to skip sync if file unchanged (AC #4).
 */
function createSyncSubcommand() {
  return new Command()
    .name("sync")
    .description("Sync workflow templates from YAML to graph database")
    .option(
      "--file <path:string>",
      "Path to workflow templates YAML",
      { default: DEFAULT_WORKFLOW_PATH },
    )
    .option(
      "--force",
      "Force sync even if file unchanged",
      { default: false },
    )
    .action(async (options) => {
      try {
        log.info("🔄 Syncing workflow templates...\n");

        // Initialize database
        const db = createDefaultClient();
        await db.connect();

        // Run migrations to ensure schema is up to date
        const runner = new MigrationRunner(db);
        await runner.runUp(getAllMigrations());

        // Create sync service
        const syncService = new WorkflowSyncService(db);

        // Perform sync
        const result = await syncService.sync(options.file, options.force);

        if (result.success) {
          console.log("\n✅ Sync complete!");
          console.log(`   Workflows processed: ${result.workflowsProcessed}`);
          console.log(`   Edges created: ${result.edgesCreated}`);
          console.log(`   Edges updated: ${result.edgesUpdated}`);

          if (result.warnings.length > 0) {
            console.log("\n⚠️  Warnings:");
            for (const warning of result.warnings) {
              console.log(`   - ${warning}`);
            }
          }
        } else {
          console.error(`\n❌ Sync failed: ${result.error}`);
          Deno.exit(1);
        }

        await db.close();
      } catch (error) {
        log.error(`❌ Sync failed: ${error}`);
        Deno.exit(1);
      }
    });
}

/**
 * Create validate subcommand
 *
 * Validates workflow YAML without syncing to database.
 */
function createValidateSubcommand() {
  return new Command()
    .name("validate")
    .description("Validate workflow templates YAML without syncing")
    .option(
      "--file <path:string>",
      "Path to workflow templates YAML",
      { default: DEFAULT_WORKFLOW_PATH },
    )
    .action(async (options) => {
      try {
        log.info("🔍 Validating workflow templates...\n");

        const loader = new WorkflowLoader();
        const { workflows, validationResults, edges } = await loader.loadAndProcess(options.file);

        const valid = validationResults.filter((r) => r.valid);
        const invalid = validationResults.filter((r) => !r.valid);
        const warningCount = validationResults.reduce((sum, r) => sum + r.warnings.length, 0);

        console.log(`\n📋 Validation Results:`);
        console.log(`   Total workflows: ${workflows.length}`);
        console.log(`   Valid: ${valid.length}`);
        console.log(`   Invalid: ${invalid.length}`);
        console.log(`   Warnings: ${warningCount}`);
        console.log(`   Edges to create: ${edges.length}`);

        if (invalid.length > 0) {
          console.log("\n❌ Invalid workflows:");
          for (const result of invalid) {
            console.log(`   ${result.workflow.name || "(unnamed)"}:`);
            for (const error of result.errors) {
              console.log(`     - ${error}`);
            }
          }
        }

        if (warningCount > 0) {
          console.log("\n⚠️  Warnings:");
          for (const result of validationResults) {
            for (const warning of result.warnings) {
              console.log(`   - ${warning}`);
            }
          }
        }

        if (invalid.length === 0) {
          console.log("\n✅ All workflows are valid!");
        } else {
          Deno.exit(1);
        }
      } catch (error) {
        log.error(`❌ Validation failed: ${error}`);
        Deno.exit(1);
      }
    });
}

/**
 * Create stats subcommand
 *
 * Shows statistics about workflow edges in the database.
 */
function createStatsSubcommand() {
  return new Command()
    .name("stats")
    .description("Show workflow edge statistics from database")
    .action(async () => {
      try {
        log.info("📊 Loading edge statistics...\n");

        // Initialize database
        const db = createDefaultClient();
        await db.connect();

        // Run migrations to ensure schema is up to date
        const runner = new MigrationRunner(db);
        await runner.runUp(getAllMigrations());

        // Get stats
        const syncService = new WorkflowSyncService(db);
        const stats = await syncService.getEdgeStats();

        console.log(`\n📊 Edge Statistics:`);
        console.log(`   Total edges: ${stats.total}`);
        console.log(`   User-defined (from YAML): ${stats.user}`);
        console.log(`   Learned (from executions): ${stats.learned}`);

        const userPct = stats.total > 0 ? ((stats.user / stats.total) * 100).toFixed(1) : "0.0";
        console.log(`   User-defined percentage: ${userPct}%`);

        // Check if graph is empty
        if (stats.total === 0) {
          console.log("\n⚠️  Graph is empty. Run 'cai workflows sync' to bootstrap.");
        }

        await db.close();
      } catch (error) {
        log.error(`❌ Stats failed: ${error}`);
        Deno.exit(1);
      }
    });
}
