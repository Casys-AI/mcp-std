/**
 * Shared test helpers for E2E tests
 */

import { ControlledExecutor } from "../../src/dag/controlled-executor.ts";
import { createDefaultClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import type { PGliteClient } from "../../src/db/client.ts";

/**
 * Shared test context (initialized once)
 */
let sharedDb: PGliteClient;

/**
 * Initialize shared resources once for all tests
 */
export async function initializeOnce() {
  if (!sharedDb) {
    sharedDb = createDefaultClient();
    await sharedDb.connect();

    const runner = new MigrationRunner(sharedDb);
    await runner.runUp(getAllMigrations());
  }
}

/**
 * Helper to create test executor with checkpointing support
 */
export async function createTestExecutor(toolExecutor: any) {
  await initializeOnce();

  const executor = new ControlledExecutor(toolExecutor, {
    verbose: true,
  });

  // Enable checkpointing
  executor.setCheckpointManager(sharedDb);

  return executor;
}
