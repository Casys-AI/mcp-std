/**
 * Unit tests for Permission Manager (simplified allow/ask/deny model)
 *
 * Tests the Claude Code style permission system:
 * - isToolAllowed() - tools that auto-execute
 * - isToolDenied() - tools that are blocked
 * - toolRequiresHil() - tools that need human approval
 *
 * @module tests/unit/capabilities/permission_inferrer_test
 */

import { assertEquals } from "@std/assert";
import {
  getToolPermissionConfig,
  initMcpPermissions,
  isToolAllowed,
  isToolDenied,
  reloadMcpPermissions,
  toolRequiresHil,
} from "../../../src/capabilities/permission-inferrer.ts";

// Reset cache before tests
Deno.test("Permission Manager - setup", async () => {
  reloadMcpPermissions();
  await initMcpPermissions();
});

// =============================================================================
// isToolAllowed tests
// =============================================================================

Deno.test("isToolAllowed - json:* tools are allowed", () => {
  assertEquals(isToolAllowed("json:parse"), true);
  assertEquals(isToolAllowed("json:stringify"), true);
  assertEquals(isToolAllowed("json"), true);
});

Deno.test("isToolAllowed - math:* tools are allowed", () => {
  assertEquals(isToolAllowed("math:sum"), true);
  assertEquals(isToolAllowed("math:sqrt"), true);
});

Deno.test("isToolAllowed - crypto:* tools are allowed", () => {
  assertEquals(isToolAllowed("crypto:hash"), true);
  assertEquals(isToolAllowed("crypto:uuid"), true);
});

Deno.test("isToolAllowed - filesystem:* tools are allowed (in default config)", () => {
  assertEquals(isToolAllowed("filesystem:read"), true);
  assertEquals(isToolAllowed("filesystem:write"), true);
});

Deno.test("isToolAllowed - docker:* tools are NOT allowed (in ask list)", () => {
  assertEquals(isToolAllowed("docker:run"), false);
  assertEquals(isToolAllowed("docker:build"), false);
});

// =============================================================================
// isToolDenied tests
// =============================================================================

Deno.test("isToolDenied - returns false for allowed tools", () => {
  assertEquals(isToolDenied("json:parse"), false);
  assertEquals(isToolDenied("math:sum"), false);
});

Deno.test("isToolDenied - returns false for ask tools", () => {
  assertEquals(isToolDenied("docker:run"), false);
  assertEquals(isToolDenied("ssh:execute"), false);
});

Deno.test("isToolDenied - returns false for unknown tools (they go to HIL)", () => {
  assertEquals(isToolDenied("unknown_tool:action"), false);
});

// =============================================================================
// toolRequiresHil tests
// =============================================================================

Deno.test("toolRequiresHil - docker:* requires HIL", () => {
  assertEquals(toolRequiresHil("docker:run"), true);
  assertEquals(toolRequiresHil("docker:build"), true);
});

Deno.test("toolRequiresHil - ssh:* requires HIL", () => {
  assertEquals(toolRequiresHil("ssh:execute"), true);
  assertEquals(toolRequiresHil("ssh:connect"), true);
});

Deno.test("toolRequiresHil - process:* requires HIL", () => {
  assertEquals(toolRequiresHil("process:kill"), true);
  assertEquals(toolRequiresHil("process:spawn"), true);
});

Deno.test("toolRequiresHil - database:* requires HIL", () => {
  assertEquals(toolRequiresHil("database:query"), true);
});

Deno.test("toolRequiresHil - cloud:* requires HIL", () => {
  assertEquals(toolRequiresHil("cloud:deploy"), true);
});

Deno.test("toolRequiresHil - packages:* requires HIL", () => {
  assertEquals(toolRequiresHil("packages:install"), true);
});

Deno.test("toolRequiresHil - kubernetes:* requires HIL", () => {
  assertEquals(toolRequiresHil("kubernetes:apply"), true);
});

Deno.test("toolRequiresHil - json:* does NOT require HIL", () => {
  assertEquals(toolRequiresHil("json:parse"), false);
  assertEquals(toolRequiresHil("json:stringify"), false);
});

Deno.test("toolRequiresHil - math:* does NOT require HIL", () => {
  assertEquals(toolRequiresHil("math:sum"), false);
});

Deno.test("toolRequiresHil - unknown tools require HIL (safety)", () => {
  assertEquals(toolRequiresHil("completely_unknown_tool:action"), true);
  assertEquals(toolRequiresHil("new_dangerous_tool:execute"), true);
});

// =============================================================================
// getToolPermissionConfig tests (legacy API compatibility)
// =============================================================================

Deno.test("getToolPermissionConfig - allowed tool returns auto", () => {
  const config = getToolPermissionConfig("json");
  assertEquals(config?.approvalMode, "auto");
});

Deno.test("getToolPermissionConfig - ask tool returns hil", () => {
  const config = getToolPermissionConfig("docker");
  assertEquals(config?.approvalMode, "hil");
});

Deno.test("getToolPermissionConfig - unknown tool returns hil", () => {
  const config = getToolPermissionConfig("unknown_tool");
  assertEquals(config?.approvalMode, "hil");
});

// =============================================================================
// Pattern matching tests
// =============================================================================

Deno.test("Pattern matching - exact match works", () => {
  assertEquals(isToolAllowed("json"), true);
});

Deno.test("Pattern matching - prefix:action matches prefix:*", () => {
  assertEquals(isToolAllowed("json:parse"), true);
  assertEquals(isToolAllowed("json:any_action"), true);
});

Deno.test("Pattern matching - tool prefix only matches", () => {
  assertEquals(toolRequiresHil("docker"), true);
  assertEquals(toolRequiresHil("ssh"), true);
});
