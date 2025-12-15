/**
 * Unit Tests for Telemetry Service
 *
 * Tests AC4, AC5, AC6: Telemetry tracking, opt-in, metrics
 */

import { assertEquals } from "@std/assert";
import { TelemetryService } from "../../../src/telemetry/telemetry.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

// Helper to create test database
async function createTestDb(): Promise<PGliteClient> {
  const testDb = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await testDb.connect();

  // Run migrations
  const runner = new MigrationRunner(testDb);
  await runner.runUp(getAllMigrations());

  return testDb;
}

Deno.test("AC4: Metrics table exists with correct schema", async () => {
  const db = await createTestDb();

  // Query table schema
  const tables = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'metrics'",
  );

  assertEquals(tables.length, 1);
  assertEquals(tables[0].table_name, "metrics");

  // Check columns
  const columns = await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'metrics'
     ORDER BY ordinal_position`,
  );

  const columnNames = columns.map((c) => c.column_name);
  assertEquals(columnNames.includes("id"), true);
  assertEquals(columnNames.includes("metric_name"), true);
  assertEquals(columnNames.includes("value"), true);
  assertEquals(columnNames.includes("metadata"), true);
  assertEquals(columnNames.includes("timestamp"), true);

  await db.close();
});

Deno.test("AC5: Telemetry service can track metrics", async () => {
  const db = await createTestDb();
  const configPath = `/tmp/pml-test-config-${Date.now()}.yaml`;

  const telemetry = new TelemetryService(db, configPath);

  // Enable telemetry manually for test
  await telemetry.setEnabled(true);

  // Track a metric
  await telemetry.track("test_metric", 42, { test: true });

  // Verify metric was recorded
  const metrics = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'test_metric'",
  );

  assertEquals(metrics.length, 1);
  assertEquals(metrics[0].metric_name, "test_metric");
  assertEquals(parseFloat(metrics[0].value as string), 42);

  // Clean up
  try {
    await Deno.remove(configPath);
  } catch {
    // File might not exist
  }
  await db.close();
});

Deno.test("AC6: Telemetry is disabled by default (opt-in)", async () => {
  const db = await createTestDb();
  const configPath = `/tmp/pml-test-config-${Date.now()}.yaml`;

  const telemetry = new TelemetryService(db, configPath);
  await telemetry.initialize();

  // Should be disabled by default
  assertEquals(telemetry.isEnabled(), false);

  // Track should not record when disabled
  await telemetry.track("test_metric_disabled", 100);

  const metrics = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'test_metric_disabled'",
  );

  // No metrics should be recorded
  assertEquals(metrics.length, 0);

  // Clean up
  try {
    await Deno.remove(configPath);
  } catch {
    // File might not exist
  }
  await db.close();
});

Deno.test("AC5: Key metrics can be tracked (context_usage_pct, query_latency_ms, tools_loaded_count)", async () => {
  const db = await createTestDb();
  const configPath = `/tmp/pml-test-config-${Date.now()}.yaml`;

  const telemetry = new TelemetryService(db, configPath);
  await telemetry.setEnabled(true);

  // Track the 3 required metrics from AC5
  await telemetry.track("context_usage_pct", 2.5, { toolsLoaded: 5 });
  await telemetry.track("query_latency_ms", 85, { phase: "vector_search" });
  await telemetry.track("tools_loaded_count", 5);

  // Verify all 3 metrics were recorded
  const contextMetric = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'context_usage_pct'",
  );
  const latencyMetric = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'query_latency_ms'",
  );
  const toolsMetric = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'tools_loaded_count'",
  );

  assertEquals(contextMetric.length, 1);
  assertEquals(latencyMetric.length, 1);
  assertEquals(toolsMetric.length, 1);

  // Clean up
  try {
    await Deno.remove(configPath);
  } catch {
    // File might not exist
  }
  await db.close();
});
