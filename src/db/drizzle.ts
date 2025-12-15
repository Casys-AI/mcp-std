/**
 * Drizzle ORM Client for PGlite
 *
 * Wraps the existing PGlite instance with Drizzle ORM.
 * Used for Epic 9+ tables (users, sessions, etc.)
 * Coexists with manual migrations for legacy tables.
 *
 * @module db/drizzle
 */

import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema/mod.ts";
import { resolvePath } from "../lib/paths.ts";

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Create a Drizzle client instance from a PGlite connection
 * @param client PGlite client instance
 * @returns Drizzle database instance
 */
export function createDrizzleClient(client: PGlite): DrizzleDB {
  // Type cast needed due to private member mismatch between PGlite versions
  // deno-lint-ignore no-explicit-any
  return drizzle(client as any, { schema });
}

/**
 * Run Drizzle migrations
 * Safe to run multiple times (idempotent)
 * @param db Drizzle database instance
 */
export async function runDrizzleMigrations(db: DrizzleDB): Promise<void> {
  await migrate(db, { migrationsFolder: resolvePath("./drizzle") });
}
