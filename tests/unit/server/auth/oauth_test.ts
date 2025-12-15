/**
 * OAuth Helpers Tests
 *
 * Tests for src/server/auth/oauth.ts
 * Verifies OAuth helper functions are exported and configured correctly.
 *
 * @module tests/unit/server/auth/oauth_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  getSessionId,
  handleCallback,
  signIn,
  signOut,
} from "../../../../src/server/auth/oauth.ts";

Deno.test("OAuth helpers - all functions exported", () => {
  // Verify all OAuth helper functions are properly exported
  assertExists(signIn, "signIn should be exported");
  assertExists(handleCallback, "handleCallback should be exported");
  assertExists(signOut, "signOut should be exported");
  assertExists(getSessionId, "getSessionId should be exported");
});

Deno.test("OAuth helpers - signIn is a function", () => {
  assertEquals(typeof signIn, "function", "signIn should be a function");
});

Deno.test("OAuth helpers - handleCallback is a function", () => {
  assertEquals(typeof handleCallback, "function", "handleCallback should be a function");
});

Deno.test("OAuth helpers - signOut is a function", () => {
  assertEquals(typeof signOut, "function", "signOut should be a function");
});

Deno.test("OAuth helpers - getSessionId is a function", () => {
  assertEquals(typeof getSessionId, "function", "getSessionId should be a function");
});

// Note: Behavioral tests for OAuth helpers require GITHUB_CLIENT_ID/SECRET env vars
// and are covered in integration tests with proper mocking.
