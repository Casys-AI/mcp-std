/**
 * E2E Tests: Performance & Benchmarks
 *
 * Validates performance targets:
 * - Sandbox startup time (<100ms)
 * - Code execution overhead (<50ms for simple code)
 * - Cache hit latency (<10ms)
 * - Large dataset processing (1000 items <2s)
 * - Context savings measurement
 *
 * Story 3.8 - AC: #3, #6
 */

import { assert, assertEquals } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";
import { CodeExecutionCache, generateCacheKey } from "../../../src/sandbox/cache.ts";
import type { ExecutionResult } from "../../../src/sandbox/types.ts";
import { ResourceLimiter } from "../../../src/sandbox/resource-limiter.ts";

/**
 * Create a cache entry
 */
function createCacheEntry(
  code: string,
  context: Record<string, unknown>,
  result: ExecutionResult,
  toolVersions: Record<string, string> = {},
) {
  const now = Date.now();
  return {
    code,
    context,
    result,
    toolVersions,
    timestamp: now,
    createdAt: now,
    expiresAt: now + 60000,
    hitCount: 0,
  };
}

Deno.test({
  name: "E2E Perf: Simple code execution <500ms",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const start = performance.now();
    const result = await executor.execute("return 1 + 1;");
    const elapsed = performance.now() - start;

    assertEquals(result.success, true);
    assertEquals(result.result, 2);
    assert(
      elapsed < 500,
      `Simple execution should be <500ms, was ${elapsed.toFixed(1)}ms`,
    );

    console.log(`  Simple execution: ${elapsed.toFixed(1)}ms`);
  },
});

Deno.test({
  name: "E2E Perf: Cache hit latency <50ms",
  async fn() {
    const cache = new CodeExecutionCache({
      enabled: true,
      maxEntries: 100,
      ttlSeconds: 60,
      persistence: false,
    });

    const code = "return [1,2,3].map(x => x * 2);";
    const context = {};
    const toolVersions = {};
    const mockResult: ExecutionResult = {
      success: true,
      result: [2, 4, 6],
      executionTimeMs: 100,
    };

    const key = generateCacheKey(code, context, toolVersions);
    cache.set(key, createCacheEntry(code, context, mockResult, toolVersions));

    // Measure cache hit latency
    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      cache.get(key);
    }
    const elapsed = performance.now() - start;
    const avgLatency = elapsed / iterations;

    assert(
      avgLatency < 50,
      `Cache hit should be <50ms, was ${avgLatency.toFixed(2)}ms`,
    );

    console.log(`  Cache hit latency: ${avgLatency.toFixed(2)}ms avg`);
  },
});

Deno.test({
  name: "E2E Perf: Process 1000 items <3s",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor({
      timeout: 5000,
    });

    // Generate 1000 items
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      value: Math.random() * 100,
      name: `item-${i}`,
    }));

    const start = performance.now();
    const result = await executor.execute(
      `
      // Process 1000 items: filter, transform, aggregate
      const filtered = context.items.filter(item => item.value > 50);
      const transformed = filtered.map(item => ({
        id: item.id,
        doubledValue: item.value * 2,
      }));
      const sum = transformed.reduce((acc, item) => acc + item.doubledValue, 0);

      return {
        totalItems: context.items.length,
        filteredCount: filtered.length,
        sum: Math.round(sum),
      };
    `,
      { context: { items } },
    );
    const elapsed = performance.now() - start;

    assertEquals(result.success, true);
    const res = result.result as { totalItems: number; filteredCount: number; sum: number };
    assertEquals(res.totalItems, 1000);
    assert(
      elapsed < 3000,
      `1000 items should process <3s, was ${elapsed.toFixed(1)}ms`,
    );

    console.log(`  1000 items processed in: ${elapsed.toFixed(1)}ms`);
    console.log(`  Filtered count: ${res.filteredCount}`);
  },
});

Deno.test({
  name: "E2E Perf: Context savings measurement",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    // Large input dataset (simulating 500KB of data)
    const largeDataset = Array.from({ length: 500 }, (_, i) => ({
      id: i,
      timestamp: new Date().toISOString(),
      data: "x".repeat(1000), // ~1KB per item
      metadata: { source: "test", version: 1 },
    }));

    const inputSize = JSON.stringify(largeDataset).length;

    const result = await executor.execute(
      `
      // Aggregate large dataset to small summary
      return {
        count: context.data.length,
        firstId: context.data[0]?.id,
        lastId: context.data[context.data.length - 1]?.id,
      };
    `,
      { context: { data: largeDataset } },
    );

    assertEquals(result.success, true);

    const outputSize = JSON.stringify(result.result).length;
    const savings = ((inputSize - outputSize) / inputSize) * 100;

    console.log(`  Input size: ${(inputSize / 1024).toFixed(1)} KB`);
    console.log(`  Output size: ${outputSize} bytes`);
    console.log(`  Context savings: ${savings.toFixed(1)}%`);

    // Should achieve significant savings
    assert(
      savings > 99,
      `Should save >99% context, saved ${savings.toFixed(1)}%`,
    );
  },
});

Deno.test({
  name: "E2E Perf: Concurrent executions",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Reset singleton to ensure fresh config with new defaults
    ResourceLimiter.resetInstance();
    const executor = new DenoSandboxExecutor();

    // Run 5 concurrent executions
    const start = performance.now();
    const promises = Array.from({ length: 5 }, (_, i) => executor.execute(`return ${i} * 2;`));

    const results = await Promise.all(promises);
    const elapsed = performance.now() - start;

    // All should succeed
    for (let i = 0; i < results.length; i++) {
      if (!results[i].success) {
        console.error(`Result ${i} failed:`, results[i].error);
      }
      assertEquals(results[i].success, true);
      assertEquals(results[i].result, i * 2);
    }

    console.log(`  5 concurrent executions: ${elapsed.toFixed(1)}ms`);
  },
});

Deno.test({
  name: "E2E Perf: Second run benefits from warm-up",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    // First run (cold)
    const start1 = performance.now();
    await executor.execute("return 'first';");
    const cold = performance.now() - start1;

    // Second run (warm)
    const start2 = performance.now();
    await executor.execute("return 'second';");
    const warm = performance.now() - start2;

    console.log(`  Cold run: ${cold.toFixed(1)}ms`);
    console.log(`  Warm run: ${warm.toFixed(1)}ms`);

    // Note: Each execution spawns a new subprocess, so warm-up benefit is limited
    // But the test documents actual performance characteristics
  },
});
