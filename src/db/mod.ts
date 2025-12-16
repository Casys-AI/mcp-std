/**
 * Database Module
 *
 * Provides database client and migration management for PGlite.
 *
 * @module db
 */

// Database client
export { createClient, createDefaultClient } from "./client.ts";

// Migrations
export { getAllMigrations, MigrationRunner } from "./migrations.ts";

// Drizzle ORM integration
export { createDrizzleClient, runDrizzleMigrations } from "./drizzle.ts";
export type { DrizzleDB } from "./drizzle.ts";
