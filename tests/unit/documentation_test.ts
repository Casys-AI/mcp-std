/**
 * Tests for project documentation (AC4, AC6)
 *
 * Validates that README.md, LICENSE, and CODE_OF_CONDUCT.md
 * exist and contain required content.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("AC4: README.md exists", async () => {
  const stat = await Deno.stat("README.md");
  assertEquals(stat.isFile, true);
});

Deno.test("AC4: README.md - contains CI badge", async () => {
  const content = await Deno.readTextFile("README.md");
  assertStringIncludes(content, "![CI]");
});

Deno.test("AC4: README.md - contains quick start section", async () => {
  const content = await Deno.readTextFile("README.md");
  assertStringIncludes(content.toLowerCase(), "quick start");
});

Deno.test("AC4: README.md - contains installation instructions", async () => {
  const content = await Deno.readTextFile("README.md");
  assertStringIncludes(content.toLowerCase(), "installation");
});

Deno.test("AC4: README.md - contains deno version badge", async () => {
  const content = await Deno.readTextFile("README.md");
  assertStringIncludes(content, "deno");
});

Deno.test("AC6: LICENSE file exists", async () => {
  const stat = await Deno.stat("LICENSE");
  assertEquals(stat.isFile, true);
});

Deno.test("AC6: LICENSE - is AGPL license", async () => {
  const content = await Deno.readTextFile("LICENSE");
  assertStringIncludes(content, "GNU AFFERO GENERAL PUBLIC LICENSE");
});

Deno.test("AC6: LICENSE - contains copyright year", async () => {
  const content = await Deno.readTextFile("LICENSE");
  assertStringIncludes(content, "2007");
});

Deno.test("AC6: CODE_OF_CONDUCT.md exists", async () => {
  const stat = await Deno.stat("CODE_OF_CONDUCT.md");
  assertEquals(stat.isFile, true);
});

Deno.test("AC6: CODE_OF_CONDUCT.md - is Contributor Covenant", async () => {
  const content = await Deno.readTextFile("CODE_OF_CONDUCT.md");
  assertStringIncludes(content, "Contributor Covenant");
});
