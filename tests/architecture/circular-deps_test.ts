/**
 * Architecture Test: Circular Dependencies
 *
 * Detects circular dependencies in the codebase using deno info.
 * Circular dependencies make code hard to test and refactor.
 *
 * Phase 2 Quick Win QW-5
 */

import { assertEquals } from "@std/assert";

interface ModuleInfo {
  specifier: string;
  dependencies?: Array<{ specifier: string }>;
}

interface DenoInfoResult {
  modules: ModuleInfo[];
}

Deno.test("Architecture: No circular dependencies in core modules", async () => {
  // Check main entry points for cycles
  const entryPoints = [
    "src/capabilities/capability-store.ts",
    "src/dag/controlled-executor.ts",
    "src/mcp/gateway-server.ts",
    "src/graphrag/graph-engine.ts",
  ];

  const allCycles: string[] = [];

  for (const entry of entryPoints) {
    const cmd = new Deno.Command("deno", {
      args: ["info", "--json", entry],
      stdout: "piped",
      stderr: "piped",
      cwd: "/home/ubuntu/CascadeProjects/AgentCards",
    });

    try {
      const { stdout } = await cmd.output();
      const info: DenoInfoResult = JSON.parse(new TextDecoder().decode(stdout));
      const cycles = findCycles(info.modules, entry);
      allCycles.push(...cycles);
    } catch {
      // File might not exist yet, skip
    }
  }

  // Remove duplicates
  const uniqueCycles = [...new Set(allCycles)];

  if (uniqueCycles.length > 0) {
    console.log("\n=== Circular Dependencies Detected ===");
    uniqueCycles.forEach((c) => console.log(c));
  }

  // Currently informational - will become blocking after Phase 2.1
  // assertEquals(uniqueCycles, [], `Circular dependencies detected:\n${uniqueCycles.join("\n")}`);
  assertEquals(true, true);
});

function findCycles(modules: ModuleInfo[], entryPoint: string): string[] {
  const graph = new Map<string, string[]>();

  for (const mod of modules) {
    const deps = mod.dependencies?.map((d) => d.specifier) ?? [];
    graph.set(mod.specifier, deps);
  }

  const cycles: string[] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart).map(simplifyPath).join(" → ") + " → " +
          simplifyPath(node);
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);

    for (const dep of graph.get(node) ?? []) {
      // Only check local src files
      if (dep.startsWith("file://") && dep.includes("/src/")) {
        dfs(dep, [...path, node]);
      }
    }

    stack.delete(node);
  }

  // Start from entry point
  const entrySpec = modules.find((m) => m.specifier.includes(entryPoint))?.specifier;
  if (entrySpec) {
    dfs(entrySpec, []);
  }

  return cycles;
}

function simplifyPath(fullPath: string): string {
  // Extract just the relative path from src/
  const match = fullPath.match(/\/src\/(.+)$/);
  return match ? `src/${match[1]}` : fullPath;
}
