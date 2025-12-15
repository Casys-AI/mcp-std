/**
 * Tests for deno.json configuration (AC3)
 *
 * Validates that deno.json is correctly configured with required
 * tasks, formatting options, and linting rules.
 */

import { assertEquals, assertExists } from "@std/assert";

interface DenoConfig {
  tasks?: Record<string, string>;
  fmt?: {
    useTabs?: boolean;
    lineWidth?: number;
    semiColons?: boolean;
    indentWidth?: number;
  };
  lint?: {
    rules?: {
      tags?: string[];
    };
  };
}

Deno.test("AC3: deno.json exists", async () => {
  const stat = await Deno.stat("deno.json");
  assertEquals(stat.isFile, true);
});

Deno.test("AC3: deno.json - has dev task", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.tasks);
  assertExists(config.tasks.dev, "dev task should exist");
});

Deno.test("AC3: deno.json - has test task", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.tasks);
  assertExists(config.tasks.test, "test task should exist");
});

Deno.test("AC3: deno.json - has lint task", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.tasks);
  assertExists(config.tasks.lint, "lint task should exist");
});

Deno.test("AC3: deno.json - has fmt task", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.tasks);
  assertExists(config.tasks.fmt, "fmt task should exist");
});

Deno.test("AC3: deno.json - has check task", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.tasks);
  assertExists(config.tasks.check, "check task should exist");
});

Deno.test("AC3: deno.json - formatting useTabs=false", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.fmt);
  assertEquals(config.fmt.useTabs, false);
});

Deno.test("AC3: deno.json - formatting lineWidth=100", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.fmt);
  assertEquals(config.fmt.lineWidth, 100);
});

Deno.test("AC3: deno.json - formatting semiColons=true", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.fmt);
  assertEquals(config.fmt.semiColons, true);
});

Deno.test("AC3: deno.json - lint rules include recommended", async () => {
  const content = await Deno.readTextFile("deno.json");
  const config: DenoConfig = JSON.parse(content);

  assertExists(config.lint);
  assertExists(config.lint.rules);
  assertExists(config.lint.rules.tags);
  assertEquals(config.lint.rules.tags.includes("recommended"), true);
});
