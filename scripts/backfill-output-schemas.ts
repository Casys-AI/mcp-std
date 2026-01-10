#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Backfill Output Schemas from Historical Traces (ADR-061)
 *
 * One-shot script to populate tool_schema.output_schema from existing
 * execution_trace.task_results data.
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/backfill-output-schemas.ts
 *
 * Options:
 *   --limit=N     Process only N traces (default: all)
 *   --dry-run     Show what would be updated without writing
 *
 * @module scripts/backfill-output-schemas
 */

import postgres from "postgres";
import { backfillOutputSchemas } from "../src/capabilities/output-schema-inferrer.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

async function main() {
  if (!DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable not set");
    Deno.exit(1);
  }

  // Parse args
  const args = Deno.args;
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const dryRun = args.includes("--dry-run");

  console.log("=== Output Schema Backfill (ADR-061) ===\n");
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`Limit: ${limit ?? "all"}`);
  console.log(`Dry run: ${dryRun}\n`);

  // Connect to database
  const sql = postgres(DATABASE_URL, {
    max: 1,
    idle_timeout: 60,
    connect_timeout: 30,
  });

  // Create a DbClient wrapper
  const db = {
    query: async (queryText: string, params?: unknown[]) => {
      const result = await sql.unsafe(queryText, params as never[]);
      return result;
    },
  };

  try {
    // Check current state
    const beforeStats = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(output_schema) as with_output
      FROM tool_schema
    `;
    console.log(`Before: ${beforeStats[0].with_output}/${beforeStats[0].total} tools have output_schema\n`);

    // Check traces available
    const traceCount = await sql`
      SELECT COUNT(*) as count FROM execution_trace WHERE task_results IS NOT NULL
    `;
    console.log(`Traces with task_results: ${traceCount[0].count}\n`);

    if (dryRun) {
      console.log("[DRY RUN] Would process traces and update schemas.");
      console.log("[DRY RUN] Run without --dry-run to actually update.");
    } else {
      console.log("Starting backfill...\n");

      const result = await backfillOutputSchemas(db, limit);

      console.log("\n=== Results ===");
      console.log(`Traces processed: ${result.tracesProcessed}`);
      console.log(`Tools updated: ${result.toolsUpdated}`);
      console.log(`Provides edges created: ${result.edgesCreated}`);

      // Check final state
      const afterStats = await sql`
        SELECT
          COUNT(*) as total,
          COUNT(output_schema) as with_output
        FROM tool_schema
      `;
      console.log(`\nAfter: ${afterStats[0].with_output}/${afterStats[0].total} tools have output_schema`);

      // Check provides edges
      const edgeCount = await sql`
        SELECT COUNT(*) as count FROM tool_dependency WHERE edge_type = 'provides'
      `;
      console.log(`Provides edges in DB: ${edgeCount[0].count}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error("Backfill failed:", err);
  Deno.exit(1);
});
