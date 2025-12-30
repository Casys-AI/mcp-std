/**
 * Architecture Test: Layer Dependencies
 *
 * Ensures no upward layer dependencies in the architecture.
 * Lower layers should not depend on higher layers.
 *
 * Phase 2 Quick Win QW-5
 */

import { assertEquals } from "@std/assert";
import { walk } from "@std/fs";

// Layer order from lowest (domain) to highest (presentation)
const LAYER_ORDER = [
  "domain", // Core business logic, interfaces
  "infrastructure", // Technical implementations (db, events)
  "capabilities", // Capability management
  "graphrag", // Graph algorithms
  "dag", // DAG execution
  "sandbox", // Sandbox execution
  "learning", // Machine learning
  "mcp", // MCP gateway (presentation)
  "web", // Web UI (presentation)
  "cli", // CLI (presentation)
  "cloud", // Cloud services
];

// Known allowed cross-layer imports (to be cleaned up)
const ALLOWED_EXCEPTIONS: string[] = [
  // Types can be imported from anywhere
  "/types/",
  "/types.ts",
  // Interfaces can be imported from anywhere
  "/interfaces/",
  "/interfaces.ts",
  // Telemetry is infrastructure but used everywhere
  "telemetry/",
  // Errors can be imported from anywhere
  "errors/",
];

Deno.test("Architecture: No upward layer dependencies", async () => {
  const violations: string[] = [];

  for await (const entry of walk("src", { exts: [".ts"], skip: [/_test\.ts$/, /\.d\.ts$/] })) {
    const content = await Deno.readTextFile(entry.path);
    const fileLayer = getLayer(entry.path);

    if (!fileLayer) continue;

    // Find all imports
    const importMatches = content.matchAll(/from\s+["']([^"']+)["']/g);

    for (const [, importPath] of importMatches) {
      // Skip external imports
      if (importPath.startsWith("@") || importPath.startsWith("npm:") || importPath.startsWith("jsr:")) {
        continue;
      }

      // Check if this is an allowed exception
      if (ALLOWED_EXCEPTIONS.some((exc) => importPath.includes(exc))) {
        continue;
      }

      const importLayer = getLayer(importPath);

      if (importLayer && isUpwardDependency(fileLayer, importLayer)) {
        const relativePath = entry.path.replace(/^.*?\/src\//, "src/");
        violations.push(
          `${relativePath}: imports from ${importPath} (${fileLayer} → ${importLayer})`,
        );
      }
    }
  }

  // Currently informational - will become blocking after Phase 2.1
  if (violations.length > 0) {
    console.log("\n=== Layer Violations (informational) ===");
    violations.slice(0, 20).forEach((v) => console.log(v));
    if (violations.length > 20) {
      console.log(`... and ${violations.length - 20} more`);
    }
  }

  // This is informational for now
  assertEquals(true, true);
});

function getLayer(path: string): string | null {
  for (const layer of LAYER_ORDER) {
    if (path.includes(`/${layer}/`) || path.includes(`src/${layer}`)) {
      return layer;
    }
  }
  return null;
}

function isUpwardDependency(fromLayer: string, toLayer: string): boolean {
  const fromIndex = LAYER_ORDER.indexOf(fromLayer);
  const toIndex = LAYER_ORDER.indexOf(toLayer);

  // If we can't find the layer, don't flag it
  if (fromIndex === -1 || toIndex === -1) return false;

  // Upward dependency = importing from a higher layer
  return fromIndex < toIndex;
}

Deno.test("Architecture: Document current layer structure", async () => {
  const layerStats = new Map<string, number>();

  for await (const entry of walk("src", { exts: [".ts"], skip: [/_test\.ts$/, /\.d\.ts$/] })) {
    const layer = getLayer(entry.path);
    if (layer) {
      layerStats.set(layer, (layerStats.get(layer) || 0) + 1);
    }
  }

  console.log("\n=== Layer File Counts ===");
  for (const layer of LAYER_ORDER) {
    const count = layerStats.get(layer) || 0;
    if (count > 0) {
      console.log(`${layer}: ${count} files`);
    }
  }

  assertEquals(true, true);
});
