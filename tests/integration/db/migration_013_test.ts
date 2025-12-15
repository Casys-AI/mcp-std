/**
 * Integration tests for Migration 013: user_id for workflow_execution
 *
 * Tests:
 * - Column additions (user_id, created_by, updated_by)
 * - Index creation for user_id
 * - Default value backfill
 * - Idempotence (can run multiple times)
 * - Rollback functionality
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { createUserIdWorkflowExecutionMigration } from "../../../src/db/migrations/013_user_id_workflow_execution.ts";
import { createGraphRagTablesMigration } from "../../../src/db/migrations/010_graphrag_tables_migration.ts";

/**
 * Create a test database in memory with base tables
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  await db.connect();

  // Run migration 010 to create workflow_execution table
  const migration010 = createGraphRagTablesMigration();
  await migration010.up(db);

  return db;
}

async function cleanupTestData(db: PGliteClient) {
  // Clean up test data - drop and recreate table
  await db.exec("DROP TABLE IF EXISTS workflow_execution CASCADE");
  await db.exec("DROP INDEX IF EXISTS idx_workflow_execution_user_id");
  await db.exec("DROP INDEX IF EXISTS idx_execution_timestamp");

  // Recreate base table from migration 010
  await db.exec(`
    CREATE TABLE workflow_execution (
      execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      executed_at TIMESTAMP DEFAULT NOW(),
      intent_text TEXT,
      dag_structure JSONB NOT NULL,
      success BOOLEAN NOT NULL,
      execution_time_ms INTEGER NOT NULL,
      error_message TEXT
    )
  `);
  await db.exec(`
    CREATE INDEX idx_execution_timestamp ON workflow_execution(executed_at DESC)
  `);
}

Deno.test("Migration 013 - adds user_id column to workflow_execution", async () => {
  const db = await createTestDb();
  await cleanupTestData(db);

  // Run migration
  const migration = createUserIdWorkflowExecutionMigration();
  await migration.up(db);

  // Verify user_id column exists
  const result = await db.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'workflow_execution' AND column_name = 'user_id'
  `);

  assertEquals(result.length, 1);
  assertEquals(result[0].column_name, "user_id");
  assertEquals(result[0].data_type, "text");
  assertEquals(result[0].is_nullable, "YES"); // Nullable for backward compat

  await cleanupTestData(db);
});

Deno.test("Migration 013 - adds created_by and updated_by columns", async () => {
  const db = await createTestDb();
  await cleanupTestData(db);

  // Run migration
  const migration = createUserIdWorkflowExecutionMigration();
  await migration.up(db);

  // Verify created_by column
  const createdByResult = await db.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'workflow_execution' AND column_name = 'created_by'
  `);
  assertEquals(createdByResult.length, 1);
  assertEquals(createdByResult[0].data_type, "text");

  // Verify updated_by column
  const updatedByResult = await db.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'workflow_execution' AND column_name = 'updated_by'
  `);
  assertEquals(updatedByResult.length, 1);
  assertEquals(updatedByResult[0].data_type, "text");

  await cleanupTestData(db);
});

Deno.test("Migration 013 - creates index on user_id", async () => {
  const db = await createTestDb();
  await cleanupTestData(db);

  // Run migration
  const migration = createUserIdWorkflowExecutionMigration();
  await migration.up(db);

  // Verify index exists
  const result = await db.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'workflow_execution' AND indexname = 'idx_workflow_execution_user_id'
  `);

  assertEquals(result.length, 1);
  assertExists(result[0].indexdef);

  await cleanupTestData(db);
});

Deno.test("Migration 013 - backfills user_id with 'local' for existing data", async () => {
  const db = await createTestDb();
  await cleanupTestData(db);

  // Insert test data WITHOUT user_id (simulate old data)
  await db.exec(`
    INSERT INTO workflow_execution (dag_structure, success, execution_time_ms)
    VALUES
      ('{"tasks": []}', true, 100),
      ('{"tasks": []}', false, 200)
  `);

  // Run migration
  const migration = createUserIdWorkflowExecutionMigration();
  await migration.up(db);

  // Verify user_id backfilled to 'local'
  const result = await db.query(`
    SELECT user_id FROM workflow_execution
  `);

  assertEquals(result.length, 2);
  assertEquals(result[0].user_id, "local");
  assertEquals(result[1].user_id, "local");

  await cleanupTestData(db);
});

Deno.test("Migration 013 - is idempotent (can run multiple times)", async () => {
  const db = await createTestDb();
  await cleanupTestData(db);

  const migration = createUserIdWorkflowExecutionMigration();

  // Run migration twice
  await migration.up(db);
  await migration.up(db); // Should not error

  // Verify still only one user_id column
  const result = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'workflow_execution' AND column_name = 'user_id'
  `);
  assertEquals(result.length, 1);

  await cleanupTestData(db);
});

Deno.test("Migration 013 - rollback removes user_id and index", async () => {
  const db = await createTestDb();
  await cleanupTestData(db);

  const migration = createUserIdWorkflowExecutionMigration();

  // Run migration
  await migration.up(db);

  // Verify columns exist before rollback
  const beforeResult = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'workflow_execution' AND column_name IN ('user_id', 'created_by', 'updated_by')
  `);
  assertEquals(beforeResult.length, 3);

  // Rollback
  await migration.down(db);

  // Verify columns removed
  const afterResult = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'workflow_execution' AND column_name IN ('user_id', 'created_by', 'updated_by')
  `);
  assertEquals(afterResult.length, 0);

  // Verify index removed
  const indexResult = await db.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'workflow_execution' AND indexname = 'idx_workflow_execution_user_id'
  `);
  assertEquals(indexResult.length, 0);

  await cleanupTestData(db);
});

Deno.test("Migration 013 - preserves existing data during rollback", async () => {
  const db = await createTestDb();
  await cleanupTestData(db);

  // Insert test data
  await db.exec(`
    INSERT INTO workflow_execution (dag_structure, success, execution_time_ms)
    VALUES ('{"tasks": []}', true, 100)
  `);

  const migration = createUserIdWorkflowExecutionMigration();
  await migration.up(db);
  await migration.down(db);

  // Verify data still exists
  const result = await db.query(`
    SELECT COUNT(*) as count FROM workflow_execution
  `);
  assertEquals(result[0].count, 1);

  await cleanupTestData(db);
});
