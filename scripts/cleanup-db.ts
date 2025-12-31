#!/usr/bin/env -S deno run --allow-all
/**
 * Database Cleanup Script
 *
 * Cleans capability and trace data while preserving:
 * - Schema (migrations)
 * - MCP tool definitions (tool_schema)
 *
 * Usage:
 *   deno task cleanup-db          # Dry run (shows what will be deleted)
 *   deno task cleanup-db --execute # Actually delete
 */

import { getDb } from "../src/db/client.ts";

const EXECUTE = Deno.args.includes("--execute");

async function main() {
  const db = await getDb();

  console.log("╔════════════════════════════════════════╗");
  console.log("║     Database Cleanup Script            ║");
  console.log("╚════════════════════════════════════════╝\n");

  // Tables to clean (order matters for FK constraints)
  const tablesToClean = [
    "capability_dependency",
    "execution_trace",
    "workflow_execution",
    "capability_records",
    "workflow_pattern",
    "algorithm_traces",
    "entropy_history",
  ];

  // Get current counts
  console.log("📊 Current state:\n");
  for (const table of tablesToClean) {
    try {
      const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = result[0]?.count ?? 0;
      console.log(`   ${table}: ${count} rows`);
    } catch {
      console.log(`   ${table}: (table doesn't exist)`);
    }
  }

  // Check tool_schema (will be kept)
  try {
    const toolCount = await db.query(`SELECT COUNT(*) as count FROM tool_schema`);
    console.log(`\n   tool_schema: ${toolCount[0]?.count ?? 0} rows (KEPT)`);
  } catch {
    console.log(`\n   tool_schema: (table doesn't exist)`);
  }

  if (!EXECUTE) {
    console.log("\n⚠️  DRY RUN - No changes made");
    console.log("   Run with --execute to actually clean the database\n");
    console.log("   Example: deno task cleanup-db --execute\n");
    await db.close();
    return;
  }

  console.log("\n🧹 Cleaning tables...\n");

  for (const table of tablesToClean) {
    try {
      await db.query(`DELETE FROM ${table}`);
      console.log(`   ✓ ${table} cleaned`);
    } catch (e) {
      console.log(`   ⚠ ${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Verify cleanup
  console.log("\n📊 After cleanup:\n");
  for (const table of tablesToClean) {
    try {
      const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = result[0]?.count ?? 0;
      console.log(`   ${table}: ${count} rows`);
    } catch {
      // Skip
    }
  }

  console.log("\n✅ Cleanup complete!");
  console.log("   - Schema preserved");
  console.log("   - tool_schema preserved");
  console.log("   - Ready for fresh capability learning\n");

  await db.close();
}

main().catch(console.error);
