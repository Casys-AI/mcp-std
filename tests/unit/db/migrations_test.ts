/**
 * Tests for Database Migration System
 *
 * Validates AC6: Migration system with up/down operations
 */

import { assertEquals } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { createInitialMigration, Migration, MigrationRunner } from "../../../src/db/migrations.ts";

// Helper to create unique test database using in-memory databases
function getTestDbPath(_testName: string): string {
  // Use in-memory database for tests to avoid file leaks
  return `memory://${crypto.randomUUID()}`;
}

Deno.test("AC6: Migration system - initialization", async () => {
  const client = new PGliteClient(getTestDbPath("mig-init"));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.init();

  // Verify migrations_history table was created
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name = 'migrations_history'",
  );

  assertEquals(tables.length, 1);
  await client.close();
});

Deno.test("AC6: Migration system - run up", async () => {
  const client = new PGliteClient(getTestDbPath("mig-runup"));
  await client.connect();

  const runner = new MigrationRunner(client);
  const migration = createInitialMigration();

  // Run migration
  await runner.runUp([migration]);

  // Verify migration was recorded
  const applied = await runner.getApplied();
  assertEquals(applied.length, 1);
  assertEquals(applied[0].version, 1);
  assertEquals(applied[0].name, "initial_schema");

  await client.close();
});

Deno.test("AC6: Migration system - idempotency", async () => {
  const client = new PGliteClient(getTestDbPath("mig-idempotent"));
  await client.connect();

  const runner = new MigrationRunner(client);
  const migration = createInitialMigration();

  // Run migration twice
  await runner.runUp([migration]);
  await runner.runUp([migration]);

  // Verify it was only applied once
  const applied = await runner.getApplied();
  assertEquals(applied.length, 1);

  await client.close();
});

Deno.test("AC6: Migration system - rollback", async () => {
  const client = new PGliteClient(getTestDbPath("mig-rollback"));
  await client.connect();

  const runner = new MigrationRunner(client);
  const migration = createInitialMigration();

  // Apply migration
  await runner.runUp([migration]);

  // Verify tables exist
  let tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('tool_schema', 'tool_embedding', 'config')",
  );
  assertEquals(tables.length, 3);

  // Rollback migration
  await runner.rollbackTo(0, [migration]);

  // Verify tables are dropped
  tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('tool_schema', 'tool_embedding', 'config')",
  );
  assertEquals(tables.length, 0);

  await client.close();
});

Deno.test("AC6: Migration system - get current version", async () => {
  const client = new PGliteClient(getTestDbPath("mig-version"));
  await client.connect();

  const runner = new MigrationRunner(client);
  const migration = createInitialMigration();

  // Initially should be version 0
  let version = await runner.getCurrentVersion();
  assertEquals(version, 0);

  // Apply migration
  await runner.runUp([migration]);

  // Should now be version 1
  version = await runner.getCurrentVersion();
  assertEquals(version, 1);

  await client.close();
});

Deno.test("AC6: Multiple migrations in sequence", async () => {
  const client = new PGliteClient(getTestDbPath("mig-sequence"));
  await client.connect();

  const migration1 = createInitialMigration();

  // Create second migration
  const migration2: Migration = {
    version: 2,
    name: "add_column",
    up: async (db) => {
      await db.exec(
        "ALTER TABLE config ADD COLUMN IF NOT EXISTS category TEXT;",
      );
    },
    down: async (db) => {
      await db.exec("ALTER TABLE config DROP COLUMN IF EXISTS category;");
    },
  };

  const runner = new MigrationRunner(client);

  // Apply both migrations
  await runner.runUp([migration1, migration2]);

  // Verify both were applied
  const applied = await runner.getApplied();
  assertEquals(applied.length, 2);
  assertEquals(applied[0].version, 1);
  assertEquals(applied[1].version, 2);

  // Verify second migration worked
  const result = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'config' AND column_name = 'category'",
  );
  assertEquals(result.length, 1);

  await client.close();
});
