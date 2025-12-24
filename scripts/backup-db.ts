#!/usr/bin/env -S deno run --allow-all
/**
 * Database Backup Script with Integrity Check
 *
 * Verifies PGlite database is not corrupted before backing up.
 * Usage: deno run --allow-all scripts/backup-db.ts [source] [destination]
 *
 * Defaults:
 *   source: .pml-dev.db
 *   destination: .pml-dev.db.last
 */

import { PGlite } from "@electric-sql/pglite";
import { copy } from "@std/fs";
import { exists } from "@std/fs";

const INTEGRITY_QUERY = "SELECT COUNT(*) as count FROM tool_schema";
const TIMEOUT_MS = 10_000;

interface BackupResult {
  success: boolean;
  message: string;
  source?: string;
  destination?: string;
}

async function checkIntegrity(dbPath: string): Promise<boolean> {
  let db: PGlite | null = null;

  try {
    // Timeout wrapper
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS);
    });

    const checkPromise = (async () => {
      db = new PGlite(dbPath);
      const result = await db.query(INTEGRITY_QUERY);
      return result.rows.length > 0;
    })();

    await Promise.race([checkPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.error(`[backup-db] Integrity check failed: ${error}`);
    return false;
  } finally {
    if (db) {
      try {
        await db.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

async function backupDatabase(
  source: string,
  destination: string,
): Promise<BackupResult> {
  // Check source exists
  if (!await exists(source)) {
    return {
      success: false,
      message: `Source database not found: ${source}`,
    };
  }

  // Check integrity
  console.log(`[backup-db] Checking integrity of ${source}...`);
  const isHealthy = await checkIntegrity(source);

  if (!isHealthy) {
    return {
      success: false,
      message: `Database corrupted, backup skipped: ${source}`,
      source,
    };
  }

  // Remove old backup if exists
  if (await exists(destination)) {
    await Deno.remove(destination, { recursive: true });
  }

  // Copy database
  console.log(`[backup-db] Copying ${source} -> ${destination}...`);
  await copy(source, destination, { overwrite: true });

  return {
    success: true,
    message: `Backup successful`,
    source,
    destination,
  };
}

// Main
if (import.meta.main) {
  const source = Deno.args[0] || ".pml-dev.db";
  const destination = Deno.args[1] || ".pml-dev.db.last";

  const result = await backupDatabase(source, destination);

  if (result.success) {
    console.log(`✅ ${result.message}: ${result.source} -> ${result.destination}`);
    Deno.exit(0);
  } else {
    console.error(`❌ ${result.message}`);
    Deno.exit(1);
  }
}

export { backupDatabase, checkIntegrity };
