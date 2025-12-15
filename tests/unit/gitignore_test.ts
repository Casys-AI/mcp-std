/**
 * Tests for .gitignore configuration (AC5)
 *
 * Validates that .gitignore contains appropriate patterns
 * for Deno projects.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("AC5: .gitignore exists", async () => {
  const stat = await Deno.stat(".gitignore");
  assertEquals(stat.isFile, true);
});

Deno.test("AC5: .gitignore - excludes .deno/ cache directory", async () => {
  const content = await Deno.readTextFile(".gitignore");
  assertStringIncludes(content, ".deno/");
});

Deno.test("AC5: .gitignore - excludes coverage directory", async () => {
  const content = await Deno.readTextFile(".gitignore");
  assertStringIncludes(content, "coverage/");
});

Deno.test("AC5: .gitignore - excludes .env files", async () => {
  const content = await Deno.readTextFile(".gitignore");
  assertStringIncludes(content, ".env");
});

Deno.test("AC5: .gitignore - excludes OS-specific files", async () => {
  const content = await Deno.readTextFile(".gitignore");
  assertStringIncludes(content, ".DS_Store");
});

Deno.test("AC5: .gitignore - excludes IDE files", async () => {
  const content = await Deno.readTextFile(".gitignore");
  const hasVscode = content.includes(".vscode/");
  const hasIdea = content.includes(".idea/");
  assertEquals(hasVscode || hasIdea, true, "should exclude at least one IDE directory");
});

Deno.test("AC5: .gitignore - excludes build artifacts", async () => {
  const content = await Deno.readTextFile(".gitignore");
  const hasDist = content.includes("dist/");
  const hasBuild = content.includes("build/");
  assertEquals(hasDist || hasBuild, true, "should exclude build directories");
});
