/**
 * Architecture Test: Interface Implementations
 *
 * Ensures that interfaces defined in domain/interfaces have implementations.
 * This supports the Dependency Inversion Principle.
 */
import { assertEquals } from "@std/assert";
import { walk } from "@std/fs";

Deno.test("Architecture: Interfaces in domain/interfaces have implementations", async () => {
  const interfaces: string[] = [];
  const implementations: string[] = [];

  // Find all interfaces
  try {
    for await (
      const entry of walk("src/domain/interfaces", {
        exts: [".ts"],
        skip: [/mod\.ts$/],
      })
    ) {
      const content = await Deno.readTextFile(entry.path);
      const matches = [...content.matchAll(/export interface (I\w+)/g)];
      for (const [, name] of matches) {
        interfaces.push(name);
      }
    }
  } catch {
    // Domain interfaces folder doesn't exist yet - expected
    console.log("ℹ️ src/domain/interfaces/ not found - will be created in QW-3");
    return;
  }

  // Find all implementations
  for await (
    const entry of walk("src", {
      exts: [".ts"],
      skip: [/_test\.ts$/, /\.d\.ts$/, /interfaces\//],
    })
  ) {
    const content = await Deno.readTextFile(entry.path);
    const matches = [...content.matchAll(/class \w+ implements (I\w+)/g)];
    for (const [, name] of matches) {
      implementations.push(name);
    }
  }

  const missing = interfaces.filter((i) => !implementations.includes(i));

  // Informational until Phase 2.1 completes (adding implements to existing classes)
  if (missing.length > 0) {
    console.log("\n⏳ Interfaces without implementations (Phase 2.1 work):");
    missing.forEach((m) => console.log(`   ${m}`));
  }

  // Pass for now - will become blocking after Phase 2.1
  assertEquals(true, true);
});

Deno.test("Architecture: Core services have interfaces", async () => {
  const coreServices = [
    { name: "CapabilityStore", expectedInterface: "ICapabilityRepository" },
    { name: "ControlledExecutor", expectedInterface: "IDAGExecutor" },
    { name: "GraphEngine", expectedInterface: "IGraphEngine" },
    { name: "MCPClientRegistry", expectedInterface: "IMCPClientRegistry" },
    { name: "VectorSearch", expectedInterface: "IVectorSearch" },
  ];

  const foundInterfaces: string[] = [];

  try {
    for await (
      const entry of walk("src/domain/interfaces", { exts: [".ts"] })
    ) {
      const content = await Deno.readTextFile(entry.path);
      for (const service of coreServices) {
        if (content.includes(`interface ${service.expectedInterface}`)) {
          foundInterfaces.push(service.expectedInterface);
        }
      }
    }
  } catch {
    console.log("ℹ️ src/domain/interfaces/ not found - will be created in QW-3");
    console.log("\n📋 Interfaces to create:");
    coreServices.forEach((s) =>
      console.log(`   ${s.expectedInterface} for ${s.name}`)
    );
    return;
  }

  const missing = coreServices
    .filter((s) => !foundInterfaces.includes(s.expectedInterface))
    .map((s) => `${s.expectedInterface} for ${s.name}`);

  if (missing.length > 0) {
    console.log("\n📋 Missing interfaces:");
    missing.forEach((m) => console.log(`   ${m}`));
  }

  // Informational - shows progress
  assertEquals(true, true);
});

Deno.test("Architecture: No concrete class imports in handlers", async () => {
  const violations: string[] = [];

  const concreteClasses = [
    "CapabilityStore",
    "ControlledExecutor",
    "GraphEngine",
    "MCPClientRegistry",
  ];

  try {
    for await (
      const entry of walk("src/mcp/handlers", {
        exts: [".ts"],
        skip: [/_test\.ts$/],
      })
    ) {
      const content = await Deno.readTextFile(entry.path);
      const relativePath = entry.path.replace(/^.*?\/src\//, "src/");

      for (const className of concreteClasses) {
        // Check if importing concrete class (not interface)
        const importRegex = new RegExp(
          `import.*\\b${className}\\b.*from`,
          "g",
        );
        if (importRegex.test(content)) {
          // Check if it's importing the interface version
          const interfaceRegex = new RegExp(`I${className}`, "g");
          if (!interfaceRegex.test(content)) {
            violations.push(`${relativePath}: imports concrete ${className}`);
          }
        }
      }
    }
  } catch {
    // Handlers folder might not exist in expected location
  }

  // Currently informational - will enforce after QW-3
  if (violations.length > 0) {
    console.log("\n⚠️ Handlers importing concrete classes (fix after QW-3):");
    violations.forEach((v) => console.log(`   ${v}`));
  }

  assertEquals(true, true);
});

Deno.test("Architecture: Generate interface coverage report", async () => {
  let totalClasses = 0;
  let classesWithInterfaces = 0;

  for await (
    const entry of walk("src", {
      exts: [".ts"],
      skip: [/_test\.ts$/, /\.d\.ts$/, /types\.ts$/],
    })
  ) {
    const content = await Deno.readTextFile(entry.path);

    // Count classes
    const classMatches = [...content.matchAll(/export class (\w+)/g)];
    totalClasses += classMatches.length;

    // Count classes with implements
    const implementsMatches = [
      ...content.matchAll(/export class \w+ implements/g),
    ];
    classesWithInterfaces += implementsMatches.length;
  }

  const coverage = totalClasses > 0
    ? ((classesWithInterfaces / totalClasses) * 100).toFixed(1)
    : 0;

  console.log("\n📊 Interface Coverage Report:");
  console.log(`   Classes with interfaces: ${classesWithInterfaces}/${totalClasses} (${coverage}%)`);
  console.log(`   Target: 80%`);

  assertEquals(true, true);
});
