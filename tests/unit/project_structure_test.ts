/**
 * Tests for project structure validation (AC1)
 *
 * Validates that the Deno project structure is correctly initialized
 * with all required directories.
 */

import { assertEquals } from "@std/assert";

Deno.test("AC1: Directory structure - src/ exists", async () => {
  const stat = await Deno.stat("src");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - src/db/ exists", async () => {
  const stat = await Deno.stat("src/db");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - src/mcp/ exists", async () => {
  const stat = await Deno.stat("src/mcp");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - src/vector/ exists", async () => {
  const stat = await Deno.stat("src/vector");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - src/cli/ exists", async () => {
  const stat = await Deno.stat("src/cli");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - tests/ exists", async () => {
  const stat = await Deno.stat("tests");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - tests/unit/ exists", async () => {
  const stat = await Deno.stat("tests/unit");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - tests/integration/ exists", async () => {
  const stat = await Deno.stat("tests/integration");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - docs/ exists", async () => {
  const stat = await Deno.stat("docs");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Directory structure - .github/workflows/ exists", async () => {
  const stat = await Deno.stat(".github/workflows");
  assertEquals(stat.isDirectory, true);
});

Deno.test("AC1: Entry point - src/main.ts exists", async () => {
  const stat = await Deno.stat("src/main.ts");
  assertEquals(stat.isFile, true);
});

Deno.test("AC1: Public API - mod.ts exists", async () => {
  const stat = await Deno.stat("mod.ts");
  assertEquals(stat.isFile, true);
});
