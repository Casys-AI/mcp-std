/**
 * Unit tests for rate limiter helpers
 *
 * Tests getRateLimitKey() function for cloud and local modes
 */

import { assertEquals } from "@std/assert";
import { getRateLimitKey } from "../../../src/lib/rate-limiter-helpers.ts";
import type { AuthResult } from "../../../src/lib/auth.ts";

Deno.test("getRateLimitKey - cloud mode uses user_id", () => {
  const authResult: AuthResult = {
    user_id: "user-123",
    username: "alice",
  };

  const key = getRateLimitKey(authResult, "192.168.1.1");
  assertEquals(key, "user:user-123");
});

Deno.test("getRateLimitKey - cloud mode with different user", () => {
  const authResult: AuthResult = {
    user_id: "uuid-456-def",
    username: "bob",
  };

  const key = getRateLimitKey(authResult, "10.0.0.1");
  assertEquals(key, "user:uuid-456-def");
});

Deno.test("getRateLimitKey - local mode disabled returns shared key", () => {
  const authResult: AuthResult = {
    user_id: "local",
    username: "local",
  };

  // Default behavior (no env var)
  const key = getRateLimitKey(authResult, "127.0.0.1");
  assertEquals(key, "local:shared");
});

Deno.test("getRateLimitKey - local mode disabled with null auth", () => {
  // null auth in local mode
  const key = getRateLimitKey(null, "192.168.1.100");
  assertEquals(key, "local:shared");
});

Deno.test("getRateLimitKey - local mode IP uses IP address", () => {
  // Set env var for IP mode
  Deno.env.set("RATE_LIMIT_LOCAL_MODE", "ip");

  try {
    const authResult: AuthResult = {
      user_id: "local",
      username: "local",
    };

    const key = getRateLimitKey(authResult, "192.168.1.1");
    assertEquals(key, "ip:192.168.1.1");
  } finally {
    Deno.env.delete("RATE_LIMIT_LOCAL_MODE");
  }
});

Deno.test("getRateLimitKey - local mode IP with different IP", () => {
  Deno.env.set("RATE_LIMIT_LOCAL_MODE", "ip");

  try {
    const authResult: AuthResult = {
      user_id: "local",
      username: "local",
    };

    const key = getRateLimitKey(authResult, "10.20.30.40");
    assertEquals(key, "ip:10.20.30.40");
  } finally {
    Deno.env.delete("RATE_LIMIT_LOCAL_MODE");
  }
});

Deno.test("getRateLimitKey - local mode IP without IP provided falls back to shared", () => {
  Deno.env.set("RATE_LIMIT_LOCAL_MODE", "ip");

  try {
    const authResult: AuthResult = {
      user_id: "local",
      username: "local",
    };

    const key = getRateLimitKey(authResult); // no IP
    assertEquals(key, "local:shared");
  } finally {
    Deno.env.delete("RATE_LIMIT_LOCAL_MODE");
  }
});

Deno.test("getRateLimitKey - explicitly disabled mode", () => {
  Deno.env.set("RATE_LIMIT_LOCAL_MODE", "disabled");

  try {
    const authResult: AuthResult = {
      user_id: "local",
      username: "local",
    };

    const key = getRateLimitKey(authResult, "1.2.3.4");
    assertEquals(key, "local:shared");
  } finally {
    Deno.env.delete("RATE_LIMIT_LOCAL_MODE");
  }
});
