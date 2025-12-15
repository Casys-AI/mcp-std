/**
 * Tests for Context Metrics Module
 *
 * Coverage: AC4, AC5 - Context usage measurement and comparison
 */

import { assert, assertEquals } from "@std/assert";
import {
  calculateP95Latency,
  calculateUsagePercent,
  compareContextUsage,
  CONTEXT_WINDOWS,
  estimateTokens,
  getRecentMetrics,
  logCacheHitRate,
  logContextUsage,
  logQueryLatency,
  measureContextUsage,
  TOKENS_PER_SCHEMA,
} from "../../../src/context/metrics.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import type { MCPTool } from "../../../src/mcp/types.ts";

// Helper to create mock schemas
function createMockSchemas(count: number): MCPTool[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `tool-${i}`,
    description: `Mock tool ${i}`,
    inputSchema: { type: "object", properties: {} },
  }));
}

Deno.test("estimateTokens - calculates token count correctly", () => {
  const schemas = createMockSchemas(10);
  const tokens = estimateTokens(schemas);

  assertEquals(tokens, 10 * TOKENS_PER_SCHEMA);
  assertEquals(tokens, 5000); // 10 * 500
});

Deno.test("calculateUsagePercent - computes percentage correctly", () => {
  const schemas = createMockSchemas(10); // 5000 tokens
  const usagePercent = calculateUsagePercent(schemas, CONTEXT_WINDOWS.default);

  assertEquals(usagePercent, 2.5); // 5000 / 200000 * 100 = 2.5%
});

Deno.test("calculateUsagePercent - handles empty schemas", () => {
  const schemas: MCPTool[] = [];
  const usagePercent = calculateUsagePercent(schemas);

  assertEquals(usagePercent, 0);
});

Deno.test("measureContextUsage - returns complete metrics", () => {
  const schemas = createMockSchemas(5);
  const usage = measureContextUsage(schemas);

  assertEquals(usage.schemaCount, 5);
  assertEquals(usage.estimatedTokens, 2500);
  assertEquals(usage.contextWindowSize, CONTEXT_WINDOWS.default);
  assertEquals(usage.usagePercent, 1.25); // 2500 / 200000 * 100
});

Deno.test("compareContextUsage - shows before/after savings", () => {
  const allSchemas = createMockSchemas(100); // Simulate 100 total tools
  const relevantSchemas = createMockSchemas(5); // On-demand: only 5 loaded

  const comparison = compareContextUsage(allSchemas, relevantSchemas);

  // Before: 100 schemas = 50,000 tokens = 25%
  assertEquals(comparison.before.schemaCount, 100);
  assertEquals(comparison.before.estimatedTokens, 50000);
  assertEquals(comparison.before.usagePercent, 25);

  // After: 5 schemas = 2,500 tokens = 1.25%
  assertEquals(comparison.after.schemaCount, 5);
  assertEquals(comparison.after.estimatedTokens, 2500);
  assertEquals(comparison.after.usagePercent, 1.25);

  // Savings
  assertEquals(comparison.savingsTokens, 47500);
  assertEquals(comparison.savingsPercent, 23.75);
});

Deno.test("logContextUsage - stores metric in database", async () => {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  // Create metrics table
  await db.exec(`
    CREATE TABLE metrics (
      id SERIAL PRIMARY KEY,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB
    )
  `);

  const usage = measureContextUsage(createMockSchemas(5));
  await logContextUsage(db, usage, { query: "test query" });

  // Verify metric was logged
  const rows = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'context_usage_pct'",
  );

  assertEquals(rows.length, 1);
  assertEquals(parseFloat(rows[0].value as string), 1.25);

  // PGlite returns JSONB as object, not string
  const metadata = typeof rows[0].metadata === "string"
    ? JSON.parse(rows[0].metadata)
    : rows[0].metadata as Record<string, unknown>;
  assertEquals(metadata.schema_count, 5);
  assertEquals(metadata.query, "test query");

  await db.close();
});

Deno.test("logQueryLatency - stores latency metric in database", async () => {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  await db.exec(`
    CREATE TABLE metrics (
      id SERIAL PRIMARY KEY,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB
    )
  `);

  await logQueryLatency(db, 150.5, { query: "test query", schema_count: 5 });

  const rows = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'query_latency_ms'",
  );

  assertEquals(rows.length, 1);
  assertEquals(parseFloat(rows[0].value as string), 150.5);

  // PGlite returns JSONB as object, not string
  const metadata = typeof rows[0].metadata === "string"
    ? JSON.parse(rows[0].metadata)
    : rows[0].metadata as Record<string, unknown>;
  assertEquals(metadata.query, "test query");
  assertEquals(metadata.schema_count, 5);

  await db.close();
});

Deno.test("logCacheHitRate - stores hit rate metric", async () => {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  await db.exec(`
    CREATE TABLE metrics (
      id SERIAL PRIMARY KEY,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB
    )
  `);

  await logCacheHitRate(db, 0.75, { hits: 3, misses: 1 });

  const rows = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'cache_hit_rate'",
  );

  assertEquals(rows.length, 1);
  assertEquals(parseFloat(rows[0].value as string), 75); // Converted to percentage

  await db.close();
});

Deno.test("getRecentMetrics - retrieves metrics from database", async () => {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  await db.exec(`
    CREATE TABLE metrics (
      id SERIAL PRIMARY KEY,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB
    )
  `);

  // Insert test metrics with explicit timestamps to ensure ordering
  const now = new Date();
  await db.query(
    "INSERT INTO metrics (metric_name, value, metadata, timestamp) VALUES ($1, $2, $3, $4)",
    ["query_latency_ms", 100, JSON.stringify({ test: "data1" }), new Date(now.getTime() - 2000)],
  );
  await db.query(
    "INSERT INTO metrics (metric_name, value, metadata, timestamp) VALUES ($1, $2, $3, $4)",
    ["query_latency_ms", 150, JSON.stringify({ test: "data2" }), new Date(now.getTime() - 1000)],
  );
  await db.query(
    "INSERT INTO metrics (metric_name, value, metadata, timestamp) VALUES ($1, $2, $3, $4)",
    ["context_usage_pct", 2.5, JSON.stringify({ test: "data3" }), now],
  );

  const metrics = await getRecentMetrics(db, "query_latency_ms", 10);

  assertEquals(metrics.length, 2);
  assertEquals(metrics[0].value, 150); // Most recent first
  assertEquals(metrics[1].value, 100);
  assertEquals(metrics[0].metadata.test, "data2");

  await db.close();
});

Deno.test("calculateP95Latency - computes 95th percentile correctly", async () => {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  await db.exec(`
    CREATE TABLE metrics (
      id SERIAL PRIMARY KEY,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB
    )
  `);

  // Insert 100 latency measurements (1-100ms)
  for (let i = 1; i <= 100; i++) {
    await db.query(
      "INSERT INTO metrics (metric_name, value, metadata) VALUES ($1, $2, $3)",
      ["query_latency_ms", i, JSON.stringify({})],
    );
  }

  const p95 = await calculateP95Latency(db, 100);

  assert(p95 !== null);
  // P95 of 1-100 should be 95
  assertEquals(p95, 95);

  await db.close();
});

Deno.test("calculateP95Latency - returns null when no data", async () => {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  await db.exec(`
    CREATE TABLE metrics (
      id SERIAL PRIMARY KEY,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB
    )
  `);

  const p95 = await calculateP95Latency(db, 100);

  assertEquals(p95, null);

  await db.close();
});

Deno.test("CONTEXT_WINDOWS - has correct values", () => {
  assertEquals(CONTEXT_WINDOWS.default, 200_000);
  assertEquals(CONTEXT_WINDOWS["claude-3-opus"], 200_000);
  assertEquals(CONTEXT_WINDOWS["claude-3-sonnet"], 200_000);
});

Deno.test("TOKENS_PER_SCHEMA - is correct constant", () => {
  assertEquals(TOKENS_PER_SCHEMA, 500);
});
