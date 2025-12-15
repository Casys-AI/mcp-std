/**
 * Unit tests for src/web/routes/_middleware.ts
 * Story 9.3: Auth Middleware & Mode Detection
 *
 * Tests route classification and middleware behavior.
 *
 * @module tests/unit/web/middleware_test
 */

import { assertEquals } from "@std/assert";
import { isProtectedRoute, isPublicRoute } from "../../../src/web/route-guards.ts";

// ============================================
// isProtectedRoute() Tests
// ============================================

Deno.test("isProtectedRoute - /dashboard is protected", () => {
  assertEquals(isProtectedRoute("/dashboard"), true);
});

Deno.test("isProtectedRoute - /dashboard/graph is protected", () => {
  assertEquals(isProtectedRoute("/dashboard/graph"), true);
});

Deno.test("isProtectedRoute - /settings is protected", () => {
  assertEquals(isProtectedRoute("/settings"), true);
});

Deno.test("isProtectedRoute - /settings/api-keys is protected", () => {
  assertEquals(isProtectedRoute("/settings/api-keys"), true);
});

Deno.test("isProtectedRoute - / is not protected", () => {
  assertEquals(isProtectedRoute("/"), false);
});

Deno.test("isProtectedRoute - /auth/signin is not protected", () => {
  assertEquals(isProtectedRoute("/auth/signin"), false);
});

Deno.test("isProtectedRoute - /blog is not protected", () => {
  assertEquals(isProtectedRoute("/blog"), false);
});

// ============================================
// isPublicRoute() Tests
// ============================================

Deno.test("isPublicRoute - / is public", () => {
  assertEquals(isPublicRoute("/"), true);
});

Deno.test("isPublicRoute - /auth/signin is public", () => {
  assertEquals(isPublicRoute("/auth/signin"), true);
});

Deno.test("isPublicRoute - /auth/callback is public", () => {
  assertEquals(isPublicRoute("/auth/callback"), true);
});

Deno.test("isPublicRoute - /blog is public", () => {
  assertEquals(isPublicRoute("/blog"), true);
});

Deno.test("isPublicRoute - /blog/post-1 is public", () => {
  assertEquals(isPublicRoute("/blog/post-1"), true);
});

Deno.test("isPublicRoute - /_frsh/refresh is public", () => {
  assertEquals(isPublicRoute("/_frsh/refresh"), true);
});

Deno.test("isPublicRoute - /dashboard is not public", () => {
  assertEquals(isPublicRoute("/dashboard"), false);
});

Deno.test("isPublicRoute - /settings is not public", () => {
  assertEquals(isPublicRoute("/settings"), false);
});

Deno.test("isPublicRoute - /api/test is not public", () => {
  assertEquals(isPublicRoute("/api/test"), false);
});
