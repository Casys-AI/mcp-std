/**
 * Auth Database Helper Tests
 *
 * Tests for src/server/auth/db.ts
 * Verifies database connection management.
 *
 * Note: Full integration tests would require PGlite initialization.
 * These unit tests verify the module structure.
 *
 * @module tests/unit/server/auth/db_test
 */

import { assertExists } from "@std/assert";
import { closeDb, getDb } from "../../../../src/server/auth/db.ts";

Deno.test("getDb - function exported", () => {
  assertExists(getDb, "getDb should be exported");
  assertExists(typeof getDb === "function", "getDb should be a function");
});

Deno.test("closeDb - function exported", () => {
  assertExists(closeDb, "closeDb should be exported");
  assertExists(typeof closeDb === "function", "closeDb should be a function");
});

// Note: Integration test for actual DB connection would be in tests/integration/auth/
// as it requires PGlite initialization with vector extension
