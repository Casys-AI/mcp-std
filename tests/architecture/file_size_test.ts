/**
 * Architecture Test: File Size Limits
 *
 * Ensures no source file exceeds the maximum allowed lines.
 * This prevents "god class" anti-pattern and keeps files maintainable.
 */
import { assertEquals } from "@std/assert";
import { walk } from "@std/fs";

const MAX_FILE_LINES = 600;
const MAX_TYPE_FILE_LINES = 300;

// Files that are known to exceed limits and are being refactored
// Remove entries as they are fixed (Phase 2 targets: all files < 600 lines)
const KNOWN_VIOLATIONS: Record<string, number> = {
  // P0 - Critical (> 1500 lines)
  "src/capabilities/static-structure-builder.ts": 2399,
  "src/mcp/handlers/execute-handler.ts": 1841,
  "src/dag/controlled-executor.ts": 1556,
  "src/graphrag/algorithms/shgat.ts": 1553,
  // P1 - High (> 1000 lines)
  "src/capabilities/capability-store.ts": 1467,
  "src/sandbox/executor.ts": 1302,
  "src/mcp/gateway-server.ts": 1216,
  "src/sandbox/worker-bridge.ts": 1038,
  "src/mcp/routing/handlers/graph.ts": 1027,
  // P2 - Medium (> 700 lines)
  "src/graphrag/local-alpha.ts": 983,
  "src/graphrag/algorithms/trace-feature-extractor.ts": 927,
  "src/graphrag/spectral-clustering.ts": 857,
  "src/graphrag/algorithms/shgat/training/multi-level-trainer.ts": 835,
  "src/telemetry/algorithm-tracer.ts": 808,
  "src/graphrag/dag-suggester.ts": 783,
  "src/graphrag/provides-edge-calculator.ts": 762,
  "src/mcp/client.ts": 732,
  "src/capabilities/schema-inferrer.ts": 726,
  "src/graphrag/algorithms/thompson.ts": 709,
  "src/graphrag/learning/per-training.ts": 705,
  "src/dag/executor.ts": 701,
  "src/mcp/handlers/code-execution-handler.ts": 692,
  "src/capabilities/execution-trace-store.ts": 682,
  "src/mcp/handlers/workflow-execution-handler.ts": 646,
  "src/mcp/adaptive-threshold.ts": 645,
  "src/graphrag/dag-scoring-config.ts": 620,
  "src/graphrag/algorithms/shgat/initialization/parameters.ts": 614,
  "src/graphrag/algorithms/tensor-entropy.ts": 976,
  "src/mcp/routing/handlers/emergence.ts": 602,
};

const KNOWN_TYPE_VIOLATIONS: Record<string, number> = {
  // Type files exceeding 300 lines (target: split into domain-specific files)
  "src/graphrag/algorithms/shgat/types.ts": 705,
  "src/graphrag/types.ts": 695,
  "src/events/types.ts": 647,
  "src/dag/types.ts": 385,
  "src/sandbox/types.ts": 357,
};

Deno.test("Architecture: No source file exceeds 600 lines", async () => {
  const violations: string[] = [];

  for await (
    const entry of walk("src", {
      exts: [".ts"],
      skip: [/_test\.ts$/, /\.d\.ts$/, /types\.ts$/], // types.ts checked separately
    })
  ) {
    const relativePath = entry.path.replace(/^.*?\/src\//, "src/");
    const content = await Deno.readTextFile(entry.path);
    const lines = content.split("\n").length;

    // Skip known violations that are being addressed
    if (KNOWN_VIOLATIONS[relativePath]) {
      continue;
    }

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

Deno.test("Architecture: No type file exceeds 300 lines", async () => {
  const violations: string[] = [];

  for await (
    const entry of walk("src", {
      match: [/types\.ts$/],
      skip: [/_test\.ts$/],
    })
  ) {
    const relativePath = entry.path.replace(/^.*?\/src\//, "src/");
    const content = await Deno.readTextFile(entry.path);
    const lines = content.split("\n").length;

    // Skip known violations that are being addressed
    if (KNOWN_TYPE_VIOLATIONS[relativePath]) {
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

Deno.test("Architecture: Track known violations for reduction", async () => {
  const stillViolating: string[] = [];
  const fixed: string[] = [];

  for (const [path, expectedLines] of Object.entries(KNOWN_VIOLATIONS)) {
    try {
      const fullPath = path.replace("src/", "");
      const content = await Deno.readTextFile(`src/${fullPath}`);
      const lines = content.split("\n").length;

      if (lines <= MAX_FILE_LINES) {
        fixed.push(`${path}: Was ${expectedLines}, now ${lines} lines - FIXED!`);
      } else if (lines < expectedLines) {
        stillViolating.push(
          `${path}: ${lines} lines (was ${expectedLines}, reduced by ${expectedLines - lines})`,
        );
      } else {
        stillViolating.push(`${path}: ${lines} lines (target: ${MAX_FILE_LINES})`);
      }
    } catch {
      fixed.push(`${path}: File no longer exists - FIXED!`);
    }
  }

  if (fixed.length > 0) {
    console.log("\n✅ Fixed violations (remove from KNOWN_VIOLATIONS):");
    fixed.forEach((f) => console.log(`   ${f}`));
  }

  if (stillViolating.length > 0) {
    console.log("\n⏳ Remaining violations to fix:");
    stillViolating.forEach((v) => console.log(`   ${v}`));
  }

  // This test always passes - it's informational
  assertEquals(true, true);
});
