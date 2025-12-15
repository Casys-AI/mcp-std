/**
 * Tests for LLM API Key Setup Script
 *
 * Run with:
 *   deno test --allow-read --allow-write playground/scripts/setup-api-key_test.ts
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildEnvContent, parseApiError, parseEnvFile } from "./setup-api-key.ts";

// =============================================================================
// Tests: .env Parsing
// =============================================================================

Deno.test("parseEnvFile - parses simple key-value pairs", () => {
  const content = `
FOO=bar
BAZ=qux
`;
  const result = parseEnvFile(content);

  assertEquals(result.get("FOO"), "bar");
  assertEquals(result.get("BAZ"), "qux");
  assertEquals(result.size, 2);
});

Deno.test("parseEnvFile - ignores comments and empty lines", () => {
  const content = `
# This is a comment
FOO=bar

# Another comment
BAZ=qux
`;
  const result = parseEnvFile(content);

  assertEquals(result.get("FOO"), "bar");
  assertEquals(result.get("BAZ"), "qux");
  assertEquals(result.size, 2);
});

Deno.test("parseEnvFile - handles values with equals signs", () => {
  const content = `CONNECTION_STRING=host=localhost;port=5432;db=test`;
  const result = parseEnvFile(content);

  assertEquals(result.get("CONNECTION_STRING"), "host=localhost;port=5432;db=test");
});

Deno.test("parseEnvFile - handles empty values", () => {
  const content = `EMPTY_VAR=`;
  const result = parseEnvFile(content);

  assertEquals(result.get("EMPTY_VAR"), "");
});

Deno.test("parseEnvFile - handles API key formats", () => {
  const content = `
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxx
PORT=3000
`;
  const result = parseEnvFile(content);

  assertEquals(result.get("ANTHROPIC_API_KEY"), "sk-ant-api03-xxxxxxxxxxxx");
  assertEquals(result.get("OPENAI_API_KEY"), "sk-xxxxxxxxxxxxxxxx");
  assertEquals(result.get("GOOGLE_API_KEY"), "AIzaSyxxxxxxxxxxxxxxxxx");
  assertEquals(result.get("PORT"), "3000");
});

// =============================================================================
// Tests: .env Building
// =============================================================================

Deno.test("buildEnvContent - updates existing Anthropic key", () => {
  const existing = `
ANTHROPIC_API_KEY=old-key
PORT=3000
`;
  const result = buildEnvContent(existing, "anthropic", "sk-ant-new-key");

  assertStringIncludes(result, "ANTHROPIC_API_KEY=sk-ant-new-key");
  assertStringIncludes(result, "PORT=3000");
  // Should not contain old key
  assertEquals(result.includes("old-key"), false);
});

Deno.test("buildEnvContent - updates existing OpenAI key", () => {
  const existing = `
OPENAI_API_KEY=sk-old
SANDBOX_TIMEOUT_MS=30000
`;
  const result = buildEnvContent(existing, "openai", "sk-new-key");

  assertStringIncludes(result, "OPENAI_API_KEY=sk-new-key");
  assertStringIncludes(result, "SANDBOX_TIMEOUT_MS=30000");
});

Deno.test("buildEnvContent - updates existing Google key", () => {
  const existing = `
GOOGLE_API_KEY=AIzaOld
PORT=3000
`;
  const result = buildEnvContent(existing, "google", "AIzaNewKey");

  assertStringIncludes(result, "GOOGLE_API_KEY=AIzaNewKey");
  assertStringIncludes(result, "PORT=3000");
});

Deno.test("buildEnvContent - adds new key if not present", () => {
  const existing = `
PORT=3000
SANDBOX_TIMEOUT_MS=30000
`;
  const result = buildEnvContent(existing, "anthropic", "sk-ant-new-key");

  assertStringIncludes(result, "ANTHROPIC_API_KEY=sk-ant-new-key");
  assertStringIncludes(result, "PORT=3000");
  assertStringIncludes(result, "SANDBOX_TIMEOUT_MS=30000");
});

Deno.test("buildEnvContent - preserves comments and structure", () => {
  const existing = `# LLM API Keys
# You only need ONE of these

ANTHROPIC_API_KEY=old-key

# Server configuration
PORT=3000
`;
  const result = buildEnvContent(existing, "anthropic", "sk-ant-new-key");

  assertStringIncludes(result, "# LLM API Keys");
  assertStringIncludes(result, "# You only need ONE of these");
  assertStringIncludes(result, "# Server configuration");
  assertStringIncludes(result, "ANTHROPIC_API_KEY=sk-ant-new-key");
});

Deno.test("buildEnvContent - preserves other provider keys", () => {
  const existing = `
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-yyy
GOOGLE_API_KEY=AIzaZZZ
`;
  const result = buildEnvContent(existing, "openai", "sk-new-openai");

  assertStringIncludes(result, "ANTHROPIC_API_KEY=sk-ant-xxx");
  assertStringIncludes(result, "OPENAI_API_KEY=sk-new-openai");
  assertStringIncludes(result, "GOOGLE_API_KEY=AIzaZZZ");
});

Deno.test("buildEnvContent - handles empty existing content", () => {
  const result = buildEnvContent("", "anthropic", "sk-ant-key");

  assertStringIncludes(result, "ANTHROPIC_API_KEY=sk-ant-key");
});

// =============================================================================
// Tests: Error Message Parsing (pure function, no API calls)
// =============================================================================

Deno.test("parseApiError - handles 401 authentication error", () => {
  const result = parseApiError("401 Unauthorized - Invalid API key");

  assertStringIncludes(result, "Authentication failed");
  assertStringIncludes(result, "invalid or expired");
  assertStringIncludes(result, "Double-check your API key");
});

Deno.test("parseApiError - handles Unauthorized error variant", () => {
  const result = parseApiError("Request failed: Unauthorized");

  assertStringIncludes(result, "Authentication failed");
});

Deno.test("parseApiError - handles 429 rate limit error", () => {
  const result = parseApiError("429 rate limit exceeded");

  assertStringIncludes(result, "Rate limit exceeded");
  assertStringIncludes(result, "Wait a few minutes");
});

Deno.test("parseApiError - handles timeout error", () => {
  const result = parseApiError("Request timeout after 30s");

  assertStringIncludes(result, "timed out");
  assertStringIncludes(result, "network connection");
});

Deno.test("parseApiError - handles AbortError", () => {
  const result = parseApiError("AbortError: The operation was aborted");

  assertStringIncludes(result, "timed out");
});

Deno.test("parseApiError - handles network ECONNREFUSED", () => {
  const result = parseApiError("ECONNREFUSED: Connection refused");

  assertStringIncludes(result, "Network error");
  assertStringIncludes(result, "internet connection");
});

Deno.test("parseApiError - handles generic network error", () => {
  const result = parseApiError("network request failed");

  assertStringIncludes(result, "Network error");
});

Deno.test("parseApiError - handles unknown errors gracefully", () => {
  const result = parseApiError("Something unexpected happened");

  assertStringIncludes(result, "API error");
  assertStringIncludes(result, "Something unexpected happened");
  assertStringIncludes(result, "Verify your API key");
});

// =============================================================================
// Integration Tests: File Operations
// =============================================================================

Deno.test("integration - round-trip env file", async () => {
  const testDir = await Deno.makeTempDir();
  const testEnvPath = `${testDir}/.env`;

  // Create initial file
  const initial = `# Test env file
EXISTING_VAR=value
PORT=3000
`;
  await Deno.writeTextFile(testEnvPath, initial);

  // Read and parse
  const content = await Deno.readTextFile(testEnvPath);
  const parsed = parseEnvFile(content);

  assertEquals(parsed.get("EXISTING_VAR"), "value");
  assertEquals(parsed.get("PORT"), "3000");

  // Build new content
  const updated = buildEnvContent(content, "anthropic", "sk-ant-test-key");

  // Verify structure preserved
  assertStringIncludes(updated, "# Test env file");
  assertStringIncludes(updated, "EXISTING_VAR=value");
  assertStringIncludes(updated, "PORT=3000");
  assertStringIncludes(updated, "ANTHROPIC_API_KEY=sk-ant-test-key");

  // Cleanup
  await Deno.remove(testDir, { recursive: true });
});

Deno.test("integration - create env file from scratch", async () => {
  const testDir = await Deno.makeTempDir();
  const testEnvPath = `${testDir}/.env`;

  // Build content for new file
  const content = buildEnvContent("", "openai", "sk-test-key");

  // Write file
  await Deno.writeTextFile(testEnvPath, content);

  // Read back and verify
  const readBack = await Deno.readTextFile(testEnvPath);
  assertStringIncludes(readBack, "OPENAI_API_KEY=sk-test-key");

  // Cleanup
  await Deno.remove(testDir, { recursive: true });
});

Deno.test("integration - backup existing file", async () => {
  const testDir = await Deno.makeTempDir();
  const testEnvPath = `${testDir}/.env`;
  const testBackupPath = `${testDir}/.env.backup`;

  // Create initial file
  const initial = "ORIGINAL=value\n";
  await Deno.writeTextFile(testEnvPath, initial);

  // Create backup
  const originalContent = await Deno.readTextFile(testEnvPath);
  await Deno.writeTextFile(testBackupPath, originalContent);

  // Modify original
  const modified = buildEnvContent(originalContent, "google", "AIzaTest");
  await Deno.writeTextFile(testEnvPath, modified);

  // Verify backup contains original content
  const backupContent = await Deno.readTextFile(testBackupPath);
  assertEquals(backupContent, initial);

  // Verify original file was modified
  const currentContent = await Deno.readTextFile(testEnvPath);
  assertStringIncludes(currentContent, "GOOGLE_API_KEY=AIzaTest");

  // Cleanup
  await Deno.remove(testDir, { recursive: true });
});
