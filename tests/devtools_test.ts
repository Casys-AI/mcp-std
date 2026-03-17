/**
 * Unit tests for devtools
 *
 * @module lib/std/tests/devtools_test
 */

import { assertEquals } from "@std/assert";
import { devtoolsTools } from "../src/tools/devtools.ts";

// Helper to get tool handler
const getHandler = (name: string) => {
  const tool = devtoolsTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler;
};

// Semver parse tests
Deno.test("semver_parse - parses basic version", () => {
  const handler = getHandler("semver_parse");
  const result = handler({ version: "1.2.3" }) as {
    valid: boolean;
    major: number;
    minor: number;
    patch: number;
  };

  assertEquals(result.valid, true);
  assertEquals(result.major, 1);
  assertEquals(result.minor, 2);
  assertEquals(result.patch, 3);
});

Deno.test("semver_parse - parses with prerelease", () => {
  const handler = getHandler("semver_parse");
  const result = handler({ version: "1.0.0-beta.1" }) as {
    prerelease: string;
  };

  assertEquals(result.prerelease, "beta.1");
});

Deno.test("semver_parse - parses with build metadata", () => {
  const handler = getHandler("semver_parse");
  const result = handler({ version: "1.0.0+build.123" }) as {
    build: string;
  };

  assertEquals(result.build, "build.123");
});

Deno.test("semver_parse - handles v prefix", () => {
  const handler = getHandler("semver_parse");
  const result = handler({ version: "v2.0.0" }) as { valid: boolean; major: number };

  assertEquals(result.valid, true);
  assertEquals(result.major, 2);
});

Deno.test("semver_parse - invalid version", () => {
  const handler = getHandler("semver_parse");
  const result = handler({ version: "not-a-version" }) as { valid: boolean };

  assertEquals(result.valid, false);
});

// Semver compare tests
Deno.test("semver_compare - greater version", () => {
  const handler = getHandler("semver_compare");
  const result = handler({ version1: "2.0.0", version2: "1.0.0" }) as {
    comparison: number;
    isGreater: boolean;
  };

  assertEquals(result.comparison, 1);
  assertEquals(result.isGreater, true);
});

Deno.test("semver_compare - equal versions", () => {
  const handler = getHandler("semver_compare");
  const result = handler({ version1: "1.0.0", version2: "1.0.0" }) as {
    comparison: number;
    isEqual: boolean;
  };

  assertEquals(result.comparison, 0);
  assertEquals(result.isEqual, true);
});

Deno.test("semver_compare - prerelease is less than release", () => {
  const handler = getHandler("semver_compare");
  const result = handler({ version1: "1.0.0-alpha", version2: "1.0.0" }) as {
    isLess: boolean;
  };

  assertEquals(result.isLess, true);
});

// Semver satisfies tests
Deno.test("semver_satisfies - caret range", () => {
  const handler = getHandler("semver_satisfies");
  const result = handler({ version: "1.2.5", range: "^1.2.0" }) as { satisfies: boolean };

  assertEquals(result.satisfies, true);
});

Deno.test("semver_satisfies - caret range out of range", () => {
  const handler = getHandler("semver_satisfies");
  const result = handler({ version: "2.0.0", range: "^1.0.0" }) as { satisfies: boolean };

  assertEquals(result.satisfies, false);
});

Deno.test("semver_satisfies - tilde range", () => {
  const handler = getHandler("semver_satisfies");
  const result = handler({ version: "1.2.9", range: "~1.2.0" }) as { satisfies: boolean };

  assertEquals(result.satisfies, true);
});

Deno.test("semver_satisfies - comparison operators", () => {
  const handler = getHandler("semver_satisfies");
  const result = handler({ version: "1.5.0", range: ">=1.0.0 <2.0.0" }) as { satisfies: boolean };

  assertEquals(result.satisfies, true);
});

// Semver bump tests
Deno.test("semver_bump - major bump", () => {
  const handler = getHandler("semver_bump");
  const result = handler({ version: "1.2.3", type: "major" }) as { to: string };

  assertEquals(result.to, "2.0.0");
});

Deno.test("semver_bump - minor bump", () => {
  const handler = getHandler("semver_bump");
  const result = handler({ version: "1.2.3", type: "minor" }) as { to: string };

  assertEquals(result.to, "1.3.0");
});

Deno.test("semver_bump - patch bump", () => {
  const handler = getHandler("semver_bump");
  const result = handler({ version: "1.2.3", type: "patch" }) as { to: string };

  assertEquals(result.to, "1.2.4");
});

// Roman numerals tests
Deno.test("roman_convert - decimal to roman", () => {
  const handler = getHandler("roman_convert");
  const result = handler({ value: "2024" }) as { roman: string };

  assertEquals(result.roman, "MMXXIV");
});

Deno.test("roman_convert - roman to decimal", () => {
  const handler = getHandler("roman_convert");
  const result = handler({ value: "XIV" }) as { decimal: number };

  assertEquals(result.decimal, 14);
});

Deno.test("roman_convert - complex number", () => {
  const handler = getHandler("roman_convert");
  const result = handler({ value: "3999" }) as { roman: string };

  assertEquals(result.roman, "MMMCMXCIX");
});

// Env parse tests
Deno.test("env_parse - basic parsing", () => {
  const handler = getHandler("env_parse");
  const result = handler({
    content: `
DB_HOST=localhost
DB_PORT=5432
`,
  }) as { variables: Record<string, string>; count: number };

  assertEquals(result.variables.DB_HOST, "localhost");
  assertEquals(result.variables.DB_PORT, "5432");
  assertEquals(result.count, 2);
});

Deno.test("env_parse - handles quotes", () => {
  const handler = getHandler("env_parse");
  const result = handler({
    content: `MESSAGE="Hello World"`,
  }) as { variables: Record<string, string> };

  assertEquals(result.variables.MESSAGE, "Hello World");
});

Deno.test("env_parse - handles comments", () => {
  const handler = getHandler("env_parse");
  const result = handler({
    content: `
# This is a comment
KEY=value
`,
  }) as { variables: Record<string, string>; count: number };

  assertEquals(result.count, 1);
  assertEquals(result.variables.KEY, "value");
});

Deno.test("env_parse - handles export prefix", () => {
  const handler = getHandler("env_parse");
  const result = handler({
    content: `export MY_VAR=test`,
  }) as { variables: Record<string, string> };

  assertEquals(result.variables.MY_VAR, "test");
});

// Env stringify tests
Deno.test("env_stringify - basic stringify", () => {
  const handler = getHandler("env_stringify");
  const result = handler({
    variables: { KEY: "value", NUM: "123" },
  }) as string;

  assertEquals(result.includes("KEY=value"), true);
  assertEquals(result.includes("NUM=123"), true);
});

Deno.test("env_stringify - quotes values with spaces", () => {
  const handler = getHandler("env_stringify");
  const result = handler({
    variables: { MSG: "hello world" },
  }) as string;

  assertEquals(result.includes('"hello world"'), true);
});

// Cron generate tests
Deno.test("cron_generate - preset daily", () => {
  const handler = getHandler("cron_generate");
  const result = handler({ preset: "daily" }) as { cron: string };

  assertEquals(result.cron, "0 0 * * *");
});

Deno.test("cron_generate - preset hourly", () => {
  const handler = getHandler("cron_generate");
  const result = handler({ preset: "hourly" }) as { cron: string };

  assertEquals(result.cron, "0 * * * *");
});

Deno.test("cron_generate - custom fields", () => {
  const handler = getHandler("cron_generate");
  const result = handler({
    minute: "30",
    hour: "9",
    dayOfWeek: "1-5",
  }) as { cron: string };

  assertEquals(result.cron, "30 9 * * 1-5");
});

// Base convert tests
Deno.test("base_convert - decimal to hex", () => {
  const handler = getHandler("base_convert");
  const result = handler({ value: "255", fromBase: 10, toBase: 16 }) as { converted: string };

  assertEquals(result.converted, "FF");
});

Deno.test("base_convert - binary to decimal", () => {
  const handler = getHandler("base_convert");
  const result = handler({ value: "1010", fromBase: 2, toBase: 10 }) as { decimal: number };

  assertEquals(result.decimal, 10);
});

Deno.test("base_convert - hex to binary", () => {
  const handler = getHandler("base_convert");
  const result = handler({ value: "FF", fromBase: 16, toBase: 2 }) as { converted: string };

  assertEquals(result.converted, "11111111");
});

// Regex test tests
Deno.test("regex_test - finds matches", () => {
  const handler = getHandler("regex_test");
  const result = handler({
    pattern: "\\d+",
    text: "abc 123 def 456",
  }) as { matches: Array<{ match: string }>; matchCount: number };

  assertEquals(result.matchCount, 2);
  assertEquals(result.matches[0].match, "123");
  assertEquals(result.matches[1].match, "456");
});

Deno.test("regex_test - captures groups", () => {
  const handler = getHandler("regex_test");
  const result = handler({
    pattern: "(\\w+)@(\\w+)",
    text: "user@example",
  }) as { matches: Array<{ groups: string[] }> };

  assertEquals(result.matches[0].groups[0], "user");
  assertEquals(result.matches[0].groups[1], "example");
});

Deno.test("regex_test - invalid pattern", () => {
  const handler = getHandler("regex_test");
  const result = handler({
    pattern: "[invalid",
    text: "test",
  }) as { valid: boolean; error: string };

  assertEquals(result.valid, false);
});
