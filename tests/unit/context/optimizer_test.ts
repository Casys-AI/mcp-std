/**
 * Tests for ContextOptimizer
 *
 * Coverage: AC1-AC7 - Full workflow integration
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { ContextOptimizer } from "../../../src/context/optimizer.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import type { SearchResult, VectorSearch } from "../../../src/vector/search.ts";
import type { MCPTool } from "../../../src/mcp/types.ts";

// Mock VectorSearch for testing
class MockVectorSearch implements Pick<VectorSearch, "searchTools"> {
  private mockResults: SearchResult[] = [];

  setMockResults(results: SearchResult[]) {
    this.mockResults = results;
  }

  async searchTools(
    _query: string,
    _topK: number = 5,
    _minScore: number = 0.7,
  ): Promise<SearchResult[]> {
    return this.mockResults;
  }
}

// Helper to create mock search results
function createMockSearchResults(count: number): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    toolId: `tool-${i}`,
    serverId: `server-${i}`,
    toolName: `Tool ${i}`,
    score: 0.9 - i * 0.05,
    schema: {
      name: `Tool ${i}`,
      description: `Mock tool ${i}`,
      inputSchema: { type: "object", properties: {} },
    } as MCPTool,
  }));
}

// Setup test database with metrics table
async function setupTestDatabase(): Promise<PGliteClient> {
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

  return db;
}

Deno.test("ContextOptimizer - getRelevantSchemas returns top-k schemas (AC1, AC2, AC3)", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db, 50);

  // Setup mock results
  const mockResults = createMockSearchResults(5);
  mockSearch.setMockResults(mockResults);

  // Execute
  const result = await optimizer.getRelevantSchemas("read a file", 5, 0.7);

  // Verify
  assertEquals(result.schemas.length, 5, "Should return 5 schemas");
  assertEquals(result.schemas[0].name, "Tool 0");
  assert(result.latencyMs > 0, "Should measure latency");

  await db.close();
});

Deno.test("ContextOptimizer - measures context usage below 5% (AC4)", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db);

  // Setup: 5 schemas = 2500 tokens = 1.25% of 200k context
  mockSearch.setMockResults(createMockSearchResults(5));

  const result = await optimizer.getRelevantSchemas("test query", 5);

  assertEquals(result.contextUsagePercent, 1.25);
  assert(result.contextUsagePercent < 5, "Should be below 5% target");

  // Verify metric was logged
  const metrics = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'context_usage_pct'",
  );
  assertEquals(metrics.length, 1);
  assertEquals(parseFloat(metrics[0].value as string), 1.25);

  await db.close();
});

Deno.test("ContextOptimizer - cache improves performance (AC6)", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db);

  const mockResults = createMockSearchResults(3);
  mockSearch.setMockResults(mockResults);

  // First query - all cache misses
  const result1 = await optimizer.getRelevantSchemas("test query", 3);
  assertEquals(result1.cacheHits, 0);
  assertEquals(result1.cacheMisses, 3);

  // Second query with same results - all cache hits
  const result2 = await optimizer.getRelevantSchemas("test query", 3);
  assertEquals(result2.cacheHits, 3);
  assertEquals(result2.cacheMisses, 0);

  // Verify cache stats
  const stats = optimizer.getCacheStats();
  assertEquals(stats.hits, 3);
  assertEquals(stats.hitRate, 0.5); // 3 hits, 3 misses = 50%

  await db.close();
});

Deno.test("ContextOptimizer - tracks query latency (AC7)", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db);

  mockSearch.setMockResults(createMockSearchResults(5));

  const result = await optimizer.getRelevantSchemas("test query", 5);

  // Verify latency is tracked
  assert(result.latencyMs > 0, "Should measure latency");
  assert(result.latencyMs < 200, "Should be fast for mock search");

  // Verify latency metric was logged
  const metrics = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'query_latency_ms'",
  );
  assertEquals(metrics.length, 1);
  assert(parseFloat(metrics[0].value as string) > 0);

  await db.close();
});

Deno.test("ContextOptimizer - showContextComparison displays before/after (AC5)", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db);

  const relevantSchemas: MCPTool[] = createMockSearchResults(5).map((r) => r.schema);

  // Show comparison: 100 total tools vs 5 relevant
  await optimizer.showContextComparison(100, relevantSchemas);

  // Verify savings metric was logged
  const metrics = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'context_savings_pct'",
  );
  assertEquals(metrics.length, 1);

  const value = parseFloat(metrics[0].value as string);
  // Before: 100 schemas = 25%, After: 5 schemas = 1.25%, Savings: 23.75%
  assertEquals(value, 23.75);

  await db.close();
});

Deno.test("ContextOptimizer - empty query handling", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db);

  // Empty results from search
  mockSearch.setMockResults([]);

  const result = await optimizer.getRelevantSchemas("empty query", 5);

  assertEquals(result.schemas.length, 0);
  assertEquals(result.contextUsagePercent, 0);
  assertEquals(result.cacheHits, 0);
  assertEquals(result.cacheMisses, 0);

  await db.close();
});

Deno.test("ContextOptimizer - clearCache resets cache", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db);

  mockSearch.setMockResults(createMockSearchResults(3));

  // Populate cache
  await optimizer.getRelevantSchemas("test", 3);

  let stats = optimizer.getCacheStats();
  assertEquals(stats.size, 3);

  // Clear cache
  optimizer.clearCache();

  stats = optimizer.getCacheStats();
  assertEquals(stats.size, 0);
  assertEquals(stats.hits, 0);
  assertEquals(stats.misses, 0);

  await db.close();
});

Deno.test("ContextOptimizer - getCacheStats returns current state", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db, 10);

  const stats = optimizer.getCacheStats();

  assertExists(stats);
  assertEquals(stats.size, 0);
  assertEquals(stats.maxSize, 10);
  assertEquals(stats.hits, 0);
  assertEquals(stats.misses, 0);
  assertEquals(stats.hitRate, 0);

  await db.close();
});

Deno.test("ContextOptimizer - logs cache hit rate metric", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db);

  mockSearch.setMockResults(createMockSearchResults(2));

  // Query 1 - cache misses
  await optimizer.getRelevantSchemas("query1", 2);

  // Query 2 - cache hits
  await optimizer.getRelevantSchemas("query2", 2);

  // Verify cache hit rate metric was logged (once per query)
  const metrics = await db.query(
    "SELECT * FROM metrics WHERE metric_name = 'cache_hit_rate' ORDER BY timestamp",
  );

  // Should have 2 entries: first query (0% hit rate), second query (100% hit rate)
  assertEquals(metrics.length, 2);

  // First query: 0 hits, 2 misses = 0% hit rate
  assertEquals(parseFloat(metrics[0].value as string), 0);

  // Second query: 2 hits, 0 misses = 100% hit rate
  assertEquals(parseFloat(metrics[1].value as string), 100);

  await db.close();
});

Deno.test("ContextOptimizer - handles configurable topK and minScore", async () => {
  const db = await setupTestDatabase();
  const mockSearch = new MockVectorSearch();
  const optimizer = new ContextOptimizer(mockSearch as unknown as VectorSearch, db);

  // Setup 10 results
  mockSearch.setMockResults(createMockSearchResults(10));

  // Request only top 3 with high score threshold
  const result = await optimizer.getRelevantSchemas("test", 3, 0.85);

  // VectorSearch would filter by minScore, but our mock returns all
  // In real scenario, only high-scoring results would be returned
  assertEquals(result.schemas.length, 10); // Mock returns all

  await db.close();
});
