/**
 * Casys PML - MCP Server Context Optimization Engine
 *
 * Main entry point for the application.
 *
 * @module main
 */

import { load } from "@std/dotenv";
import { Command } from "@cliffy/command";
import { createInitCommand } from "./cli/commands/init.ts";
import { createServeCommand } from "./cli/commands/serve.ts";
import { createStatusCommand } from "./cli/commands/status.ts";
import { createMigrateConfigCommand } from "./cli/commands/migrate-config.ts";
import { createWorkflowsCommand } from "./cli/commands/workflows.ts";
import { setupLogger } from "./telemetry/mod.ts";
import { createDefaultClient } from "./db/client.ts";
import { TelemetryService } from "./telemetry/telemetry.ts";
import { getAllMigrations, MigrationRunner } from "./db/migrations.ts";
import { initSentry } from "./telemetry/sentry.ts";

/**
 * Handle --telemetry and --no-telemetry CLI flags
 *
 * Processes telemetry flags before command execution to enable/disable telemetry.
 * Initializes database and runs migrations if needed.
 */
async function handleTelemetryFlags(): Promise<void> {
  // Check if --telemetry or --no-telemetry is in args
  const hasTelemetryFlag = Deno.args.includes("--telemetry");
  const hasNoTelemetryFlag = Deno.args.includes("--no-telemetry");

  if (!hasTelemetryFlag && !hasNoTelemetryFlag) {
    return; // No telemetry flags, skip
  }

  // Initialize database
  const db = createDefaultClient();
  await db.connect();

  // Run migrations to ensure metrics table exists
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());

  // Create telemetry service
  const telemetry = new TelemetryService(db);

  // Set enabled state (--telemetry enables, --no-telemetry disables)
  const enabled = hasTelemetryFlag;
  await telemetry.setEnabled(enabled);

  console.log(`✓ Telemetry ${enabled ? "enabled" : "disabled"}`);

  await db.close();
}

/**
 * Main CLI application
 */
export async function main(): Promise<void> {
  // Load environment variables based on DENO_ENV
  // Production: .env.production ONLY (no fallback to .env for security)
  // Development: .env only
  const isProduction = Deno.env.get("DENO_ENV") === "production";
  const envFile = isProduction ? ".env.production" : ".env";

  try {
    await load({ export: true, envPath: envFile });
  } catch {
    // Env file not found, continue with system environment
    console.warn(`Warning: ${envFile} not found, using system environment only`);
  }

  // Initialize logging first
  await setupLogger();

  // Initialize Sentry error tracking (ADR-011)
  await initSentry();

  // Handle telemetry flags before command parsing
  await handleTelemetryFlags();

  await new Command()
    .name("pml")
    .version("0.1.0")
    .description("MCP Server Context Optimization Engine")
    .globalOption("--telemetry", "Enable telemetry (opt-in)")
    .globalOption("--no-telemetry", "Disable telemetry")
    .command("init", createInitCommand())
    .command("serve", createServeCommand())
    .command("status", createStatusCommand())
    .command("migrate-config", createMigrateConfigCommand())
    .command("workflows", createWorkflowsCommand())
    .parse(Deno.args);
}

// Run main if this is the entry point
if (import.meta.main) {
  main();
}
