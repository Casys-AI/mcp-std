/**
 * Unit tests for security tools
 *
 * @module lib/std/tests/security_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { securityTools } from "../src/tools/security.ts";

// Helper to get tool handler
const getHandler = (name: string) => {
  const tool = securityTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler;
};

// JWT tests
Deno.test("jwt_generate - creates valid JWT", async () => {
  const handler = getHandler("jwt_generate");
  const result = await handler({
    payload: { user: "test" },
    secret: "my-secret-key-at-least-32-chars-long",
  }) as { token: string; header: object; payload: object };

  assertExists(result.token);
  assertEquals(result.token.split(".").length, 3);
  assertExists(result.header);
  assertExists(result.payload);
});

Deno.test("jwt_generate - includes expiration", async () => {
  const handler = getHandler("jwt_generate");
  const result = await handler({
    payload: { user: "test" },
    secret: "my-secret-key-at-least-32-chars-long",
    expiresIn: 3600,
  }) as { payload: { exp: number }; expiresAt: string };

  assertExists(result.payload.exp);
  assertExists(result.expiresAt);
});

Deno.test("jwt_generate - includes issuer and audience", async () => {
  const handler = getHandler("jwt_generate");
  const result = await handler({
    payload: {},
    secret: "my-secret-key-at-least-32-chars-long",
    issuer: "test-issuer",
    audience: "test-audience",
  }) as { payload: { iss: string; aud: string } };

  assertEquals(result.payload.iss, "test-issuer");
  assertEquals(result.payload.aud, "test-audience");
});

Deno.test("jwt_verify - verifies valid token", async () => {
  const generateHandler = getHandler("jwt_generate");
  const verifyHandler = getHandler("jwt_verify");

  const secret = "my-secret-key-at-least-32-chars-long";
  const generated = await generateHandler({
    payload: { user: "test" },
    secret,
  }) as { token: string };

  const result = await verifyHandler({
    token: generated.token,
    secret,
  }) as { valid: boolean; payload: { user: string } };

  assertEquals(result.valid, true);
  assertEquals(result.payload.user, "test");
});

Deno.test("jwt_verify - rejects invalid signature", async () => {
  const generateHandler = getHandler("jwt_generate");
  const verifyHandler = getHandler("jwt_verify");

  const generated = await generateHandler({
    payload: { user: "test" },
    secret: "correct-secret-key-32-chars-long!!",
  }) as { token: string };

  const result = await verifyHandler({
    token: generated.token,
    secret: "wrong-secret-key-32-chars-longggg",
  }) as { valid: boolean; error: string };

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid signature");
});

Deno.test("jwt_verify - rejects malformed token", async () => {
  const handler = getHandler("jwt_verify");
  const result = await handler({
    token: "not.a.valid.jwt.token",
    secret: "secret",
  }) as { valid: boolean; error: string };

  assertEquals(result.valid, false);
});

// Password strength tests
Deno.test("password_strength - weak password", () => {
  const handler = getHandler("password_strength");
  const result = handler({ password: "123456" }) as { score: number; rating: string };

  assertEquals(result.rating, "Very Weak");
  assertEquals(result.score < 30, true);
});

Deno.test("password_strength - strong password", () => {
  const handler = getHandler("password_strength");
  const result = handler({ password: "MyStr0ng!P@ssw0rd123" }) as { score: number; rating: string };

  assertEquals(result.score >= 60, true);
});

Deno.test("password_strength - detects common passwords", () => {
  const handler = getHandler("password_strength");
  const result = handler({ password: "password123" }) as { isCommon: boolean };

  assertEquals(result.isCommon, true);
});

Deno.test("password_strength - provides recommendations", () => {
  const handler = getHandler("password_strength");
  const result = handler({ password: "abc" }) as { recommendations: string[] };

  assertEquals(result.recommendations.length > 0, true);
});

// Hash checksum tests
Deno.test("hash_checksum - SHA-256 hash", async () => {
  const handler = getHandler("hash_checksum");
  const result = await handler({ data: "hello" }) as { hash: string; algorithm: string };

  assertEquals(result.algorithm, "SHA-256");
  assertEquals(result.hash.length, 64); // SHA-256 = 64 hex chars
});

Deno.test("hash_checksum - consistent hash", async () => {
  const handler = getHandler("hash_checksum");
  const result1 = await handler({ data: "test" }) as { hash: string };
  const result2 = await handler({ data: "test" }) as { hash: string };

  assertEquals(result1.hash, result2.hash);
});

Deno.test("hash_checksum - different data different hash", async () => {
  const handler = getHandler("hash_checksum");
  const result1 = await handler({ data: "test1" }) as { hash: string };
  const result2 = await handler({ data: "test2" }) as { hash: string };

  assertEquals(result1.hash !== result2.hash, true);
});

Deno.test("hash_checksum - base64 encoding", async () => {
  const handler = getHandler("hash_checksum");
  const result = await handler({ data: "hello", encoding: "base64" }) as { hash: string; encoding: string };

  assertEquals(result.encoding, "base64");
});

Deno.test("hash_checksum - MD5 hash", async () => {
  const handler = getHandler("hash_checksum");
  const result = await handler({ data: "hello", algorithm: "MD5" }) as { hash: string };

  assertEquals(result.hash.length, 32); // MD5 = 32 hex chars
});

// CRC32 tests
Deno.test("crc32 - calculates checksum", () => {
  const handler = getHandler("crc32");
  const result = handler({ data: "hello" }) as { crc32: string };

  assertExists(result.crc32);
  assertEquals(result.crc32.length, 8);
});

Deno.test("crc32 - consistent checksum", () => {
  const handler = getHandler("crc32");
  const result1 = handler({ data: "test" }) as { crc32: string };
  const result2 = handler({ data: "test" }) as { crc32: string };

  assertEquals(result1.crc32, result2.crc32);
});

Deno.test("crc32 - decimal format", () => {
  const handler = getHandler("crc32");
  const result = handler({ data: "test", format: "decimal" }) as { crc32: number; format: string };

  assertEquals(result.format, "decimal");
  assertEquals(typeof result.crc32, "number");
});

// Random bytes tests
Deno.test("random_bytes - generates correct length", () => {
  const handler = getHandler("random_bytes");
  const result = handler({ length: 16 }) as { bytes: string; length: number };

  assertEquals(result.length, 16);
  assertEquals(result.bytes.length, 32); // 16 bytes = 32 hex chars
});

Deno.test("random_bytes - generates different values", () => {
  const handler = getHandler("random_bytes");
  const result1 = handler({ length: 32 }) as { bytes: string };
  const result2 = handler({ length: 32 }) as { bytes: string };

  assertEquals(result1.bytes !== result2.bytes, true);
});

Deno.test("random_bytes - base64 encoding", () => {
  const handler = getHandler("random_bytes");
  const result = handler({ length: 32, encoding: "base64" }) as { bytes: string; encoding: string };

  assertEquals(result.encoding, "base64");
});

Deno.test("random_bytes - array encoding", () => {
  const handler = getHandler("random_bytes");
  const result = handler({ length: 8, encoding: "array" }) as { bytes: number[] };

  assertEquals(Array.isArray(result.bytes), true);
  assertEquals(result.bytes.length, 8);
});
