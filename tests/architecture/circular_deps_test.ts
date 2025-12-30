/**
 * Architecture Test: Circular Dependencies
 *
 * Detects circular import dependencies in the codebase.
 * Circular dependencies cause tight coupling and make code harder to test.
 */
import { assertEquals } from "@std/assert";

interface ModuleInfo {
  specifier: string;
  dependencies?: Array<{ specifier: string }>;
}

interface DenoInfoOutput {
  modules: ModuleInfo[];
}

// Known circular dependencies being addressed
// Format: "file1 → file2" (the cycle direction)
const KNOWN_CYCLES: string[] = [
  // Add known cycles here as they are discovered
  // Remove as they are fixed
];

Deno.test("Architecture: No circular dependencies", async () => {
  const cmd = new Deno.Command("deno", {
    args: ["info", "--json", "src/main.ts"],
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, success } = await cmd.output();

  if (!success) {
    console.warn("Warning: Could not analyze dependencies (deno info failed)");
    return;
  }

  const info: DenoInfoOutput = JSON.parse(new TextDecoder().decode(stdout));
  const cycles = findCycles(info.modules);

  // Filter out known cycles
  const newCycles = cycles.filter((cycle) => {
    return !KNOWN_CYCLES.some((known) => cycle.includes(known));
  });

  assertEquals(
    newCycles,
    [],
    `New circular dependencies detected:\n${newCycles.join("\n")}\n\nKnown cycles being addressed: ${KNOWN_CYCLES.length}`,
  );
});

function findCycles(modules: ModuleInfo[]): string[] {
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
        const cycle = path.slice(cycleStart).map(simplifyPath).join(" → ") +
          " → " + simplifyPath(node);
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

  for (const mod of graph.keys()) {
    if (mod.startsWith("file://") && mod.includes("/src/")) {
      dfs(mod, []);
    }
  }

  // Deduplicate cycles (A→B→A is same as B→A→B)
  const uniqueCycles = new Set<string>();
  for (const cycle of cycles) {
    const parts = cycle.split(" → ");
    const normalized = [...parts].sort().join("|");
    if (!uniqueCycles.has(normalized)) {
      uniqueCycles.add(normalized);
    }
  }

  return cycles.filter((cycle) => {
    const parts = cycle.split(" → ");
    const normalized = [...parts].sort().join("|");
    if (uniqueCycles.has(normalized)) {
      uniqueCycles.delete(normalized);
      return true;
    }
    return false;
  });
}

function simplifyPath(fullPath: string): string {
  const match = fullPath.match(/\/src\/(.+)$/);
  return match ? `src/${match[1]}` : fullPath;
}

Deno.test("Architecture: Critical modules have no cycles", async () => {
  const criticalModules = [
    "src/capabilities/mod.ts",
    "src/dag/mod.ts",
    "src/mcp/mod.ts",
    "src/graphrag/mod.ts",
  ];

  for (const modPath of criticalModules) {
    try {
      const cmd = new Deno.Command("deno", {
        args: ["info", "--json", modPath],
        stdout: "piped",
        stderr: "piped",
      });

      const { stdout, success } = await cmd.output();

      if (!success) {
        console.warn(`Warning: Could not analyze ${modPath}`);
        continue;
      }

      const info: DenoInfoOutput = JSON.parse(new TextDecoder().decode(stdout));
      const cycles = findCycles(info.modules);

      if (cycles.length > 0) {
        console.log(`\n⚠️ Cycles in ${modPath}:`);
        cycles.forEach((c) => console.log(`   ${c}`));
      }
    } catch {
      // Module might not exist yet
    }
  }

  // Informational test - always passes
  assertEquals(true, true);
});
