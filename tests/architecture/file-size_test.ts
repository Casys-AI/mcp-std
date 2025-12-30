/**
 * Architecture Test: File Size Limits
 *
 * Ensures no source files exceed the maximum line count.
 * This prevents "god classes" and encourages modular design.
 *
 * Phase 2 Quick Win QW-5
 */

import { assertEquals } from "@std/assert";
import { walk } from "@std/fs";

const MAX_FILE_LINES = 600;
const MAX_TYPE_FILE_LINES = 300;

// Files currently exceeding limits (to be reduced over time)
// Phase 2.2 will address the P0 files first
const KNOWN_VIOLATIONS: Record<string, number> = {
  // P0 - Critical (Phase 2.2)
  "src/capabilities/static-structure-builder.ts": 2400,
  "src/mcp/handlers/execute-handler.ts": 1841,
  "src/dag/controlled-executor.ts": 1556,
  "src/graphrag/algorithms/shgat.ts": 1554,
  "src/capabilities/capability-store.ts": 1441,
  "src/sandbox/executor.ts": 1302,
  "src/mcp/gateway-server.ts": 1215,
  "src/sandbox/worker-bridge.ts": 1039,
  "src/mcp/routing/handlers/graph.ts": 1028,
  "src/graphrag/local-alpha.ts": 984,
  "src/graphrag/algorithms/trace-feature-extractor.ts": 928,
  "src/graphrag/spectral-clustering.ts": 858,
  "src/graphrag/algorithms/shgat/training/multi-level-trainer.ts": 836,
  "src/telemetry/algorithm-tracer.ts": 809,
  "src/graphrag/dag-suggester.ts": 784,
  "src/graphrag/provides-edge-calculator.ts": 763,
  "src/mcp/client.ts": 733,
  "src/capabilities/schema-inferrer.ts": 727,
  "src/capabilities/permission-inferrer.ts": 713,
  "src/graphrag/algorithms/thompson.ts": 710,
  "src/dag/executor.ts": 701,
  "src/graphrag/learning/per-training.ts": 705,
  "src/capabilities/execution-trace-store.ts": 682,
  "src/mcp/handlers/code-execution-handler.ts": 692,
  "src/mcp/handlers/workflow-execution-handler.ts": 646,
  "src/mcp/adaptive-threshold.ts": 645,
  "src/graphrag/dag-scoring-config.ts": 620,
  "src/graphrag/algorithms/shgat/initialization/parameters.ts": 614,
  // Type files (also counted as source files)
  "src/graphrag/algorithms/shgat/types.ts": 706,
  "src/graphrag/types.ts": 696,
  "src/events/types.ts": 648,
};

Deno.test("Architecture: No source file exceeds 600 lines (except known violations)", async () => {
  const violations: string[] = [];

  for await (const entry of walk("src", { exts: [".ts"], skip: [/_test\.ts$/, /\.d\.ts$/] })) {
    // Skip known violations that are tracked separately
    const relativePath = entry.path.replace(/^.*?\/src\//, "src/");
    if (Object.keys(KNOWN_VIOLATIONS).some((k) => relativePath.endsWith(k.replace("src/", "")))) {
      continue;
    }

    const content = await Deno.readTextFile(entry.path);
    const lines = content.split("\n").length;
    if (lines > MAX_FILE_LINES) {
      violations.push(`${relativePath} (${lines} lines)`);
    }
  }

  assertEquals(
    violations,
    [],
    `Files exceeding ${MAX_FILE_LINES} lines:\n${violations.join("\n")}`,
  );
});

// Type files exceeding 300 lines (Phase 2.3 will split these)
const KNOWN_TYPE_VIOLATIONS: Record<string, number> = {
  "src/graphrag/algorithms/shgat/types.ts": 706,
  "src/graphrag/types.ts": 696,
  "src/events/types.ts": 648,
  "src/dag/types.ts": 386,
  "src/sandbox/types.ts": 358,
};

Deno.test("Architecture: No type file exceeds 300 lines (except known violations)", async () => {
  const violations: string[] = [];

  for await (const entry of walk("src", { exts: [".ts"], match: [/types\.ts$/, /types\/.*\.ts$/] })) {
    const content = await Deno.readTextFile(entry.path);
    const lines = content.split("\n").length;

    // Skip the backward-compat re-export file
    if (entry.path.endsWith("capabilities/types.ts") && lines < 20) {
      continue;
    }

    // Skip known violations
    const relativePath = entry.path.replace(/^.*?\/src\//, "src/");
    if (Object.keys(KNOWN_TYPE_VIOLATIONS).some((k) => relativePath.endsWith(k.replace("src/", "")))) {
      continue;
    }

    if (lines > MAX_TYPE_FILE_LINES) {
      violations.push(`${relativePath} (${lines} lines)`);
    }
  }

  assertEquals(
    violations,
    [],
    `Type files exceeding ${MAX_TYPE_FILE_LINES} lines:\n${violations.join("\n")}`,
  );
});

Deno.test("Architecture: Track known violations progress", async () => {
  const progress: string[] = [];
  const stillViolating: string[] = [];

  for (const [filePath, expectedLines] of Object.entries(KNOWN_VIOLATIONS)) {
    try {
      const fullPath = filePath.startsWith("/") ? filePath : `/home/ubuntu/CascadeProjects/AgentCards/${filePath}`;
      const content = await Deno.readTextFile(fullPath);
      const actualLines = content.split("\n").length;

      if (actualLines <= MAX_FILE_LINES) {
        progress.push(`✅ ${filePath}: Fixed! (${actualLines} lines, was ${expectedLines})`);
      } else if (actualLines < expectedLines) {
        progress.push(`📉 ${filePath}: Progress! ${actualLines} lines (was ${expectedLines})`);
        stillViolating.push(`${filePath} (${actualLines} lines)`);
      } else {
        stillViolating.push(`${filePath} (${actualLines} lines, expected ${expectedLines})`);
      }
    } catch {
      progress.push(`⚠️ ${filePath}: File not found (may have been refactored)`);
    }
  }

  // Log progress for visibility
  if (progress.length > 0) {
    console.log("\n=== Known Violations Progress ===");
    progress.forEach((p) => console.log(p));
  }

  // This test always passes - it's for tracking, not blocking
  assertEquals(true, true);
});
