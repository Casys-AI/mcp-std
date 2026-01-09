/**
 * Database Access for Auth Operations
 *
 * Provides a shared Drizzle database instance for Fresh auth routes.
 * Supports dual-mode:
 * - Cloud: PostgreSQL (DATABASE_URL set)
 * - Local: PGlite (embedded)
 *
 * @module server/auth/db
 */

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import {
  createDrizzleClient,
  createDrizzlePostgresClient,
  type DrizzleDB,
  type DrizzlePostgresDB,
  runDrizzleMigrations,
} from "../../db/drizzle.ts";
import { getAgentCardsDatabasePath } from "../../cli/utils.ts";
import postgres from "postgres";

// Unified type for both PGlite and Postgres Drizzle instances
type AnyDrizzleDB = DrizzleDB | DrizzlePostgresDB;

let db: AnyDrizzleDB | null = null;
let pgliteInstance: PGlite | null = null;
let postgresInstance: ReturnType<typeof postgres> | null = null;

/**
 * Check if running in cloud mode (DATABASE_URL is set)
 */
function isCloudMode(): boolean {
  return !!Deno.env.get("DATABASE_URL");
}

/**
 * Get shared Drizzle database instance for auth operations
 * Lazily initializes on first call.
 *
 * - Cloud mode: Uses PostgreSQL via DATABASE_URL
 * - Local mode: Uses PGlite (embedded)
 *
 * @returns Drizzle database instance
 */
export async function getDb(): Promise<AnyDrizzleDB> {
  if (!db) {
    if (isCloudMode()) {
      // Cloud mode: PostgreSQL
      const databaseUrl = Deno.env.get("DATABASE_URL")!;
      postgresInstance = postgres(databaseUrl);
      db = createDrizzlePostgresClient(postgresInstance);
      // Note: Migrations should be run separately via runDrizzleMigrationsAuto()
    } else {
      // Local mode: PGlite
      pgliteInstance = new PGlite(getAgentCardsDatabasePath(), {
        extensions: { vector },
      });
      db = createDrizzleClient(pgliteInstance);
      await runDrizzleMigrations(db as DrizzleDB);
    }
  }
  return db;
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDb(): Promise<void> {
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
  if (postgresInstance) {
    await postgresInstance.end();
    postgresInstance = null;
  }
  db = null;
}

/**
 * Get raw database client for SQL queries
 * Used by admin analytics which needs complex aggregations.
 * Works with both PGlite (local) and PostgreSQL (cloud).
 *
 * @returns DbClient interface (query, queryOne)
 */
export async function getRawDb(): Promise<{
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
}> {
  // Use the dual-mode database client from db/mod.ts
  const { getDb: getDbClient } = await import("../../db/mod.ts");
  const client = await getDbClient();

  return {
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      return client.query(sql, params) as Promise<T[]>;
    },
    async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
      return client.queryOne(sql, params) as Promise<T | null>;
    },
  };
}
