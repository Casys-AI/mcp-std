/**
 * Unit tests for code hashing functions
 *
 * Story: 7.2a Capability Storage - Migration & Eager Learning (AC6)
 *
 * @module tests/unit/capabilities/hash_test
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { hashCode, hashCodeSync, normalizeCode } from "../../../src/capabilities/hash.ts";

Deno.test("normalizeCode - trims whitespace", () => {
  const input = "  const x = 1;  ";
  const expected = "const x = 1;";
  assertEquals(normalizeCode(input), expected);
});

Deno.test("normalizeCode - collapses consecutive whitespace", () => {
  const input = "const   x  =   1;";
  const expected = "const x = 1;";
  assertEquals(normalizeCode(input), expected);
});

Deno.test("normalizeCode - handles newlines and tabs", () => {
  const input = `const x = 1;
  const y = 2;
  return x + y;`;
  const expected = "const x = 1; const y = 2; return x + y;";
  assertEquals(normalizeCode(input), expected);
});

Deno.test("hashCode - generates consistent SHA-256 hash", async () => {
  const code = "const x = 1;";
  const hash1 = await hashCode(code);
  const hash2 = await hashCode(code);

  assertEquals(hash1, hash2, "Same code should produce same hash");
  assertEquals(hash1.length, 64, "SHA-256 should produce 64 hex chars");
});

Deno.test("hashCode - different code produces different hash", async () => {
  const hash1 = await hashCode("const x = 1;");
  const hash2 = await hashCode("const x = 2;");

  assertNotEquals(hash1, hash2, "Different code should produce different hash");
});

Deno.test("hashCode - whitespace variations produce same hash", async () => {
  const hash1 = await hashCode("const x = 1;");
  const hash2 = await hashCode("  const   x   =   1;  ");
  const hash3 = await hashCode("const x = 1;\n");

  assertEquals(hash1, hash2, "Whitespace variations should normalize to same hash");
  assertEquals(hash1, hash3, "Trailing newline should not affect hash");
});

Deno.test("hashCode - handles empty code", async () => {
  const hash = await hashCode("");
  assertEquals(hash.length, 64, "Empty code should still produce valid SHA-256 hash");
});

Deno.test("hashCode - handles unicode characters", async () => {
  const hash1 = await hashCode('const msg = "Hello 世界";');
  const hash2 = await hashCode('const msg = "Hello 世界";');

  assertEquals(hash1, hash2, "Unicode characters should hash consistently");
  assertEquals(hash1.length, 64);
});

Deno.test("hashCodeSync - generates consistent djb2 hash", () => {
  const code = "const x = 1;";
  const hash1 = hashCodeSync(code);
  const hash2 = hashCodeSync(code);

  assertEquals(hash1, hash2, "Same code should produce same sync hash");
  assertEquals(hash1.length, 8, "djb2 should produce 8 hex chars");
});

Deno.test("hashCodeSync - different code produces different hash", () => {
  const hash1 = hashCodeSync("const x = 1;");
  const hash2 = hashCodeSync("const x = 2;");

  assertNotEquals(hash1, hash2);
});

Deno.test("hashCodeSync - whitespace variations produce same hash", () => {
  const hash1 = hashCodeSync("const x = 1;");
  const hash2 = hashCodeSync("  const   x   =   1;  ");

  assertEquals(hash1, hash2);
});

Deno.test("hashCode vs hashCodeSync - same input produces different algorithm results", async () => {
  const code = "const x = 1;";
  const sha256Hash = await hashCode(code);
  const djb2Hash = hashCodeSync(code);

  // Different algorithms = different outputs
  assertNotEquals(sha256Hash, djb2Hash);
  // SHA-256 is longer
  assertEquals(sha256Hash.length > djb2Hash.length, true);
});
