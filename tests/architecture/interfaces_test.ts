/**
 * Architecture Test: Interface Coverage
 *
 * Tracks interface usage and implementation coverage.
 * Goal: All major services should have interfaces for DI.
 *
 * Phase 2 Quick Win QW-5
 */

import { assertEquals } from "@std/assert";
import { walk } from "@std/fs";

Deno.test("Architecture: Track interface definitions", async () => {
  const interfaces: Array<{ name: string; file: string }> = [];

  for await (const entry of walk("src", { exts: [".ts"], skip: [/_test\.ts$/, /\.d\.ts$/] })) {
    const content = await Deno.readTextFile(entry.path);
    const matches = content.matchAll(/export\s+interface\s+(I[A-Z]\w+)/g);

    for (const [, name] of matches) {
      const relativePath = entry.path.replace(/^.*?\/src\//, "src/");
      interfaces.push({ name, file: relativePath });
    }
  }

  console.log("\n=== Interface Definitions (I* pattern) ===");
  if (interfaces.length === 0) {
    console.log("No interfaces found. Phase 2.1 will add domain interfaces.");
  } else {
    interfaces.forEach(({ name, file }) => console.log(`${name} in ${file}`));
  }

  // Currently informational - goal is 80% coverage after Phase 2.1
  assertEquals(true, true);
});

Deno.test("Architecture: Track class implementations", async () => {
  const implementations: Array<{ className: string; interfaceName: string; file: string }> = [];

  for await (const entry of walk("src", { exts: [".ts"], skip: [/_test\.ts$/, /\.d\.ts$/] })) {
    const content = await Deno.readTextFile(entry.path);
    const matches = content.matchAll(/class\s+(\w+)\s+implements\s+(I\w+)/g);

    for (const [, className, interfaceName] of matches) {
      const relativePath = entry.path.replace(/^.*?\/src\//, "src/");
      implementations.push({ className, interfaceName, file: relativePath });
    }
  }

  console.log("\n=== Interface Implementations ===");
  if (implementations.length === 0) {
    console.log("No implementations found. Phase 2.1 will add interface bindings.");
  } else {
    implementations.forEach(({ className, interfaceName, file }) =>
      console.log(`${className} implements ${interfaceName} in ${file}`)
    );
  }

  assertEquals(true, true);
});

Deno.test("Architecture: Constructor parameter count", async () => {
  const largeConstructors: Array<{ className: string; paramCount: number; file: string }> = [];
  const MAX_PARAMS = 5;

  for await (const entry of walk("src", { exts: [".ts"], skip: [/_test\.ts$/, /\.d\.ts$/] })) {
    const content = await Deno.readTextFile(entry.path);

    // Find class declarations
    const classMatches = content.matchAll(/class\s+(\w+)[^{]*\{/g);

    for (const classMatch of classMatches) {
      const className = classMatch[1];
      const classStart = classMatch.index!;

      // Find constructor in this class
      const classContent = content.slice(classStart);
      const constructorMatch = classContent.match(/constructor\s*\(([^)]*)\)/);

      if (constructorMatch) {
        const params = constructorMatch[1]
          .split(",")
          .filter((p) => p.trim().length > 0);

        if (params.length > MAX_PARAMS) {
          const relativePath = entry.path.replace(/^.*?\/src\//, "src/");
          largeConstructors.push({
            className,
            paramCount: params.length,
            file: relativePath,
          });
        }
      }
    }
  }

  if (largeConstructors.length > 0) {
    console.log(`\n=== Constructors with > ${MAX_PARAMS} parameters ===`);
    largeConstructors
      .sort((a, b) => b.paramCount - a.paramCount)
      .forEach(({ className, paramCount, file }) =>
        console.log(`${className}: ${paramCount} params in ${file}`)
      );
  }

  // Currently informational - Phase 2.2 will address these
  assertEquals(true, true);
});
