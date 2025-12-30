/**
 * Tests for Routing Resolver (Story 13.9)
 *
 * @module tests/unit/capabilities/routing_resolver_test
 */

import { assertEquals } from "@std/assert";
import {
  extractServerName,
  getToolRouting,
  initRoutingConfig,
  isCloudServer,
  isLocalServer,
  reloadRoutingConfig,
  resolveRouting,
} from "../../../src/capabilities/routing-resolver.ts";

// Initialize config before tests
Deno.test("routing-resolver: init config", async () => {
  await initRoutingConfig();
});

// ============================================
// extractServerName tests
// ============================================

Deno.test("extractServerName: standard format server:action", () => {
  assertEquals(extractServerName("filesystem:read_file"), "filesystem");
  assertEquals(extractServerName("memory:store"), "memory");
  assertEquals(extractServerName("tavily:search"), "tavily");
  assertEquals(extractServerName("pml:execute"), "pml");
});

Deno.test("extractServerName: capability tool format mcp__namespace__action", () => {
  assertEquals(extractServerName("mcp__code__analyze"), "code");
  assertEquals(extractServerName("mcp__data__transform"), "data");
  assertEquals(extractServerName("mcp__fs__read_json"), "fs");
});

Deno.test("extractServerName: server only (no action)", () => {
  assertEquals(extractServerName("memory"), "memory");
  assertEquals(extractServerName("filesystem"), "filesystem");
});

// ============================================
// isLocalServer / isCloudServer tests
// ============================================

Deno.test("isLocalServer: filesystem is local", () => {
  assertEquals(isLocalServer("filesystem"), true);
  assertEquals(isCloudServer("filesystem"), false);
});

Deno.test("isLocalServer: fs is local", () => {
  assertEquals(isLocalServer("fs"), true);
});

Deno.test("isLocalServer: shell is local", () => {
  assertEquals(isLocalServer("shell"), true);
  assertEquals(isLocalServer("process"), true);
});

Deno.test("isLocalServer: docker/kubernetes are local", () => {
  assertEquals(isLocalServer("docker"), true);
  assertEquals(isLocalServer("kubernetes"), true);
});

Deno.test("isCloudServer: memory is cloud", () => {
  assertEquals(isCloudServer("memory"), true);
  assertEquals(isLocalServer("memory"), false);
});

Deno.test("isCloudServer: tavily is cloud", () => {
  assertEquals(isCloudServer("tavily"), true);
});

Deno.test("isCloudServer: pml is cloud", () => {
  assertEquals(isCloudServer("pml"), true);
});

Deno.test("isCloudServer: json/math/crypto are cloud", () => {
  assertEquals(isCloudServer("json"), true);
  assertEquals(isCloudServer("math"), true);
  assertEquals(isCloudServer("crypto"), true);
});

Deno.test("isLocalServer: unknown server defaults to local", () => {
  assertEquals(isLocalServer("unknown_server"), true);
  assertEquals(isCloudServer("unknown_server"), false);
});

// ============================================
// getToolRouting tests
// ============================================

Deno.test("getToolRouting: filesystem:read_file -> local", () => {
  assertEquals(getToolRouting("filesystem:read_file"), "local");
});

Deno.test("getToolRouting: memory:store -> cloud", () => {
  assertEquals(getToolRouting("memory:store"), "cloud");
});

Deno.test("getToolRouting: mcp__fs__read -> local", () => {
  assertEquals(getToolRouting("mcp__fs__read"), "local");
});

// ============================================
// resolveRouting tests
// ============================================

Deno.test("resolveRouting: empty tools -> cloud (pure compute)", () => {
  assertEquals(resolveRouting([]), "cloud");
});

Deno.test("resolveRouting: explicit override takes precedence", () => {
  // Even with filesystem tool, explicit "cloud" wins
  assertEquals(resolveRouting(["filesystem:read"], "cloud"), "cloud");
  // Explicit "local" wins over cloud tools
  assertEquals(resolveRouting(["memory:store"], "local"), "local");
});

Deno.test("resolveRouting: any local tool -> local", () => {
  // Mix of local and cloud -> local wins
  assertEquals(
    resolveRouting(["filesystem:read", "memory:store", "tavily:search"]),
    "local",
  );
});

Deno.test("resolveRouting: all cloud tools -> cloud", () => {
  assertEquals(
    resolveRouting(["memory:store", "tavily:search", "json:parse"]),
    "cloud",
  );
});

Deno.test("resolveRouting: single local tool -> local", () => {
  assertEquals(resolveRouting(["filesystem:read"]), "local");
  assertEquals(resolveRouting(["shell:execute"]), "local");
  assertEquals(resolveRouting(["docker:run"]), "local");
});

Deno.test("resolveRouting: single cloud tool -> cloud", () => {
  assertEquals(resolveRouting(["memory:store"]), "cloud");
  assertEquals(resolveRouting(["pml:search"]), "cloud");
});

Deno.test("resolveRouting: capability tools resolve correctly", () => {
  // mcp__fs__read -> fs -> local
  assertEquals(resolveRouting(["mcp__fs__read"]), "local");
  // mcp__json__parse -> json -> cloud
  assertEquals(resolveRouting(["mcp__json__parse"]), "cloud");
});

// ============================================
// Config reload tests
// ============================================

Deno.test("reloadRoutingConfig: clears cache", async () => {
  // First load
  await initRoutingConfig();
  const result1 = resolveRouting(["memory:store"]);
  assertEquals(result1, "cloud");

  // Reload and verify still works
  reloadRoutingConfig();
  await initRoutingConfig();
  const result2 = resolveRouting(["memory:store"]);
  assertEquals(result2, "cloud");
});

// ============================================
// Edge case tests (Problem 5 fixes)
// ============================================

Deno.test("extractServerName: empty string -> empty string", () => {
  assertEquals(extractServerName(""), "");
});

Deno.test("extractServerName: tool with multiple colons", () => {
  // Takes first segment before colon
  assertEquals(extractServerName("server:sub:action"), "server");
});

Deno.test("extractServerName: colon only", () => {
  // colonIndex is 0, not > 0, so returns original
  assertEquals(extractServerName(":action"), ":action");
});

Deno.test("resolveRouting: null/undefined in array filtered out", () => {
  // @ts-ignore - testing runtime behavior with bad data
  const result = resolveRouting([null, "memory:store", undefined, ""]);
  // memory:store is cloud, invalid entries filtered
  assertEquals(result, "cloud");
});

Deno.test("resolveRouting: all invalid entries -> cloud (pure compute)", () => {
  // @ts-ignore - testing runtime behavior with bad data
  const result = resolveRouting([null, undefined, ""]);
  // All filtered out = no tools = cloud
  assertEquals(result, "cloud");
});

Deno.test("isLocalServer: empty string -> local (safe default)", () => {
  assertEquals(isLocalServer(""), true);
});

Deno.test("isCloudServer: empty string -> false (not cloud)", () => {
  assertEquals(isCloudServer(""), false);
});

Deno.test("getToolRouting: empty string -> local", () => {
  assertEquals(getToolRouting(""), "local");
});

Deno.test("resolveRouting: mixed valid/invalid with local tool -> local", () => {
  // @ts-ignore - testing runtime behavior
  const result = resolveRouting([null, "filesystem:read", "memory:store"]);
  assertEquals(result, "local");
});
