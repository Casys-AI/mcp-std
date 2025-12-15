/**
 * Project Path Utilities Tests
 *
 * Tests for src/lib/paths.ts
 *
 * @module tests/unit/lib/paths_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { _clearProjectRootCache, getProjectRoot, resolvePath } from "../../../src/lib/paths.ts";

// Clean cache before each test group
Deno.test("getProjectRoot - finds project root via deno.json", () => {
  _clearProjectRootCache();

  const root = getProjectRoot();

  assertExists(root, "Should return a path");
  assertEquals(root.includes("AgentCards"), true, "Should contain project name");

  // Verify deno.json exists at root
  const stat = Deno.statSync(`${root}/deno.json`);
  assertEquals(stat.isFile, true, "deno.json should exist at project root");
});

Deno.test("getProjectRoot - caches result", () => {
  _clearProjectRootCache();

  const root1 = getProjectRoot();
  const root2 = getProjectRoot();

  assertEquals(root1, root2, "Should return same cached value");
});

Deno.test("getProjectRoot - respects PROJECT_ROOT env var", () => {
  _clearProjectRootCache();

  const originalEnv = Deno.env.get("PROJECT_ROOT");
  try {
    Deno.env.set("PROJECT_ROOT", "/custom/project/root");
    const root = getProjectRoot();
    assertEquals(root, "/custom/project/root");
  } finally {
    _clearProjectRootCache();
    if (originalEnv) {
      Deno.env.set("PROJECT_ROOT", originalEnv);
    } else {
      Deno.env.delete("PROJECT_ROOT");
    }
  }
});

Deno.test("resolvePath - absolute path unchanged", () => {
  const result = resolvePath("/absolute/path/to/file");
  assertEquals(result, "/absolute/path/to/file");
});

Deno.test("resolvePath - relative path resolved against project root", () => {
  _clearProjectRootCache();

  const result = resolvePath("./drizzle");
  const root = getProjectRoot();

  assertEquals(result, `${root}/drizzle`);
});

Deno.test("resolvePath - relative path without ./ prefix", () => {
  _clearProjectRootCache();

  const result = resolvePath(".agentcards-dev.db");
  const root = getProjectRoot();

  assertEquals(result, `${root}/.agentcards-dev.db`);
});

Deno.test("resolvePath - tilde expansion", () => {
  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    console.log("Skipping tilde test - HOME not set");
    return;
  }

  const result = resolvePath("~/some/path");
  assertEquals(result, `${homeDir}/some/path`);
});

Deno.test("resolvePath - tilde only at start", () => {
  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    console.log("Skipping tilde test - HOME not set");
    return;
  }

  // Should only expand ~ at start, not in middle
  const result = resolvePath("~/path/with~tilde");
  assertEquals(result, `${homeDir}/path/with~tilde`);
});
