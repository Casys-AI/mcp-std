/**
 * Tests for metrics visualization helpers
 *
 * @module playground/lib/metrics_test
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.11";
import {
  compareMetrics,
  isJupyter,
  metricLine,
  progressBar,
  reductionSummary,
  speedupChart,
} from "./metrics.ts";

// ============================================================================
// progressBar Tests
// ============================================================================

Deno.test("progressBar - 0% shows empty bar", () => {
  const result = progressBar(0, 100);
  assertStringIncludes(result, "[");
  assertStringIncludes(result, "]");
  assertStringIncludes(result, "0%");
  assertStringIncludes(result, "░░░░░░░░░░░░░░░░░░░░"); // All empty
});

Deno.test("progressBar - 50% shows half-filled bar", () => {
  const result = progressBar(50, 100);
  assertStringIncludes(result, "50%");
  assertStringIncludes(result, "██████████"); // ~10 filled chars
});

Deno.test("progressBar - 100% shows full bar", () => {
  const result = progressBar(100, 100);
  assertStringIncludes(result, "100%");
  assertStringIncludes(result, "████████████████████"); // All filled
});

Deno.test("progressBar - handles overflow (>100%)", () => {
  const result = progressBar(150, 100);
  assertStringIncludes(result, "100%"); // Clamped to 100%
});

Deno.test("progressBar - handles zero total", () => {
  const result = progressBar(50, 0);
  assertStringIncludes(result, "0%");
});

Deno.test("progressBar - shows label", () => {
  const result = progressBar(66, 100, "Loading...");
  assertStringIncludes(result, "66%");
  assertStringIncludes(result, "Loading...");
});

Deno.test("progressBar - custom width option", () => {
  const result = progressBar(50, 100, undefined, { width: 10 });
  // Should have 10 total chars in bar (5 filled, 5 empty)
  assert(result.includes("[") && result.includes("]"));
});

Deno.test("progressBar - hide percentage option", () => {
  const result = progressBar(50, 100, undefined, { showPercent: false });
  assert(!result.includes("%"));
});

// ============================================================================
// compareMetrics Tests
// ============================================================================

Deno.test("compareMetrics - shows before and after values", () => {
  const result = compareMetrics(
    { tokens: 45000 },
    { tokens: 12000 },
  );
  assertStringIncludes(result, "tokens");
  assertStringIncludes(result, "45,000");
  assertStringIncludes(result, "12,000");
});

Deno.test("compareMetrics - calculates delta", () => {
  const result = compareMetrics(
    { latency: 2500 },
    { latency: 1800 },
  );
  assertStringIncludes(result, "-700"); // 1800 - 2500 = -700
});

Deno.test("compareMetrics - shows percentage change", () => {
  const result = compareMetrics(
    { tokens: 100 },
    { tokens: 50 },
  );
  assertStringIncludes(result, "-50"); // Delta
  assertStringIncludes(result, "-50.0%"); // Percentage
});

Deno.test("compareMetrics - custom labels", () => {
  const result = compareMetrics(
    { x: 10 },
    { x: 5 },
    { labels: { before: "Without Gateway", after: "With Gateway" } },
  );
  assertStringIncludes(result, "Without Gateway");
  assertStringIncludes(result, "With Gateway");
});

Deno.test("compareMetrics - handles multiple metrics", () => {
  const result = compareMetrics(
    { tokens: 45000, latency: 2500, tools: 25 },
    { tokens: 12000, latency: 1800, tools: 3 },
  );
  assertStringIncludes(result, "tokens");
  assertStringIncludes(result, "latency");
  assertStringIncludes(result, "tools");
});

Deno.test("compareMetrics - handles zero before value", () => {
  const result = compareMetrics(
    { x: 0 },
    { x: 10 },
  );
  assertStringIncludes(result, "+10");
});

// ============================================================================
// speedupChart Tests
// ============================================================================

Deno.test("speedupChart - shows sequential and parallel bars", () => {
  const result = speedupChart(2500, 1800);
  assertStringIncludes(result, "Sequential:");
  assertStringIncludes(result, "Parallel:");
  assertStringIncludes(result, "2,500ms");
  assertStringIncludes(result, "1,800ms");
});

Deno.test("speedupChart - calculates speedup factor", () => {
  const result = speedupChart(2000, 1000);
  assertStringIncludes(result, "2.00x faster");
});

Deno.test("speedupChart - shows time saved", () => {
  const result = speedupChart(2500, 1800);
  assertStringIncludes(result, "Time saved:");
  assertStringIncludes(result, "700ms");
});

Deno.test("speedupChart - handles slowdown case", () => {
  const result = speedupChart(1000, 2000);
  assertStringIncludes(result, "Slowdown:");
  assertStringIncludes(result, "slower");
});

Deno.test("speedupChart - handles equal times", () => {
  const result = speedupChart(1000, 1000);
  assertStringIncludes(result, "1.00x");
});

Deno.test("speedupChart - custom unit", () => {
  const result = speedupChart(2500, 1800, { unit: "s" });
  assertStringIncludes(result, "2,500s");
  assertStringIncludes(result, "1,800s");
});

// ============================================================================
// metricLine Tests
// ============================================================================

Deno.test("metricLine - basic format", () => {
  const result = metricLine("Tokens saved", 33000);
  assertStringIncludes(result, "Tokens saved:");
  assertStringIncludes(result, "33,000");
});

Deno.test("metricLine - with unit", () => {
  const result = metricLine("Latency", 250, "ms");
  assertStringIncludes(result, "250");
  assertStringIncludes(result, "ms");
});

// ============================================================================
// reductionSummary Tests
// ============================================================================

Deno.test("reductionSummary - calculates reduction percentage", () => {
  const result = reductionSummary(25, 3, "tools");
  assertStringIncludes(result, "25 tools");
  assertStringIncludes(result, "3 tools");
  assertStringIncludes(result, "88%"); // (25-3)/25 = 88%
});

Deno.test("reductionSummary - shows arrow", () => {
  const result = reductionSummary(100, 50, "items");
  assertStringIncludes(result, "→");
});

Deno.test("reductionSummary - handles zero before", () => {
  const result = reductionSummary(0, 10, "items");
  assertStringIncludes(result, "0%");
});

// ============================================================================
// isJupyter Tests
// ============================================================================

Deno.test("isJupyter - returns boolean", () => {
  const result = isJupyter();
  assertEquals(typeof result, "boolean");
});
