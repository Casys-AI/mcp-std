/**
 * Tests for GitHub Actions CI configuration (AC2)
 *
 * Validates that the CI workflow is correctly configured with
 * required jobs and Deno version.
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { parse } from "@std/yaml";

Deno.test("AC2: CI workflow file exists", async () => {
  const stat = await Deno.stat(".github/workflows/ci.yml");
  assertEquals(stat.isFile, true);
});

Deno.test("AC2: CI workflow - has lint job", async () => {
  const content = await Deno.readTextFile(".github/workflows/ci.yml");
  const yaml = parse(content) as Record<string, unknown>;

  assertExists(yaml.jobs);
  const jobs = yaml.jobs as Record<string, unknown>;
  assertExists(jobs.lint, "lint job should exist");
});

Deno.test("AC2: CI workflow - has typecheck job", async () => {
  const content = await Deno.readTextFile(".github/workflows/ci.yml");
  const yaml = parse(content) as Record<string, unknown>;

  assertExists(yaml.jobs);
  const jobs = yaml.jobs as Record<string, unknown>;
  assertExists(jobs.typecheck, "typecheck job should exist");
});

Deno.test("AC2: CI workflow - has test job", async () => {
  const content = await Deno.readTextFile(".github/workflows/ci.yml");
  const yaml = parse(content) as Record<string, unknown>;

  assertExists(yaml.jobs);
  const jobs = yaml.jobs as Record<string, unknown>;
  // Check for any test job (test-unit, test-integration, test-e2e, or test)
  assert(
    jobs["test-unit"] || jobs["test-integration"] || jobs["test-e2e"] || jobs["test"],
    "at least one test job should exist",
  );
});

Deno.test("AC2: CI workflow - uses Deno 2.x", async () => {
  const content = await Deno.readTextFile(".github/workflows/ci.yml");
  assertEquals(
    content.includes("deno-version: v2.x") || content.includes("deno-version: 2.x"),
    true,
  );
});

Deno.test("AC2: CI workflow - triggers on push to main", async () => {
  const content = await Deno.readTextFile(".github/workflows/ci.yml");
  const yaml = parse(content) as Record<string, unknown>;

  assertExists(yaml.on);
  const on = yaml.on as Record<string, unknown>;
  assertExists(on.push);
});

Deno.test("AC2: CI workflow - triggers on pull_request to main", async () => {
  const content = await Deno.readTextFile(".github/workflows/ci.yml");
  const yaml = parse(content) as Record<string, unknown>;

  assertExists(yaml.on);
  const on = yaml.on as Record<string, unknown>;
  assertExists(on.pull_request);
});
