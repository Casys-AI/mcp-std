/**
 * Unit tests for src/lib/auth.ts
 * Story 9.3: Auth Middleware & Mode Detection
 *
 * @module tests/unit/lib/auth_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  getDefaultUserId,
  isCloudMode,
  logAuthMode,
  validateRequest,
} from "../../../src/lib/auth.ts";

// Helper to save and restore env vars
function withEnv(
  key: string,
  value: string | undefined,
  fn: () => void | Promise<void>,
): void | Promise<void> {
  const original = Deno.env.get(key);
  const restore = () => {
    if (original !== undefined) {
      Deno.env.set(key, original);
    } else {
      Deno.env.delete(key);
    }
  };

  if (value === undefined) {
    Deno.env.delete(key);
  } else {
    Deno.env.set(key, value);
  }

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
  } catch (e) {
    restore();
    throw e;
  }
}

// ============================================
// isCloudMode() Tests
// ============================================

Deno.test("isCloudMode - returns false when GITHUB_CLIENT_ID not set", () => {
  withEnv("GITHUB_CLIENT_ID", undefined, () => {
    assertEquals(isCloudMode(), false);
  });
});

Deno.test("isCloudMode - returns true when GITHUB_CLIENT_ID is set", () => {
  withEnv("GITHUB_CLIENT_ID", "test_client_id", () => {
    assertEquals(isCloudMode(), true);
  });
});

Deno.test("isCloudMode - returns true for any non-empty value", () => {
  withEnv("GITHUB_CLIENT_ID", "x", () => {
    assertEquals(isCloudMode(), true);
  });
});

// ============================================
// getDefaultUserId() Tests
// ============================================

Deno.test("getDefaultUserId - returns 'local' in local mode", () => {
  withEnv("GITHUB_CLIENT_ID", undefined, () => {
    assertEquals(getDefaultUserId(), "local");
  });
});

Deno.test("getDefaultUserId - returns null in cloud mode", () => {
  withEnv("GITHUB_CLIENT_ID", "test_client_id", () => {
    assertEquals(getDefaultUserId(), null);
  });
});

// ============================================
// validateRequest() Tests
// ============================================

Deno.test("validateRequest - returns local user in local mode", async () => {
  await withEnv("GITHUB_CLIENT_ID", undefined, async () => {
    const req = new Request("http://localhost/api/test");
    const result = await validateRequest(req);

    assertExists(result);
    assertEquals(result.user_id, "local");
    assertEquals(result.username, "local");
  });
});

Deno.test("validateRequest - returns null without API key in cloud mode", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost/api/test");
    const result = await validateRequest(req);

    assertEquals(result, null);
  });
});

Deno.test("validateRequest - returns null for invalid API key format (too short)", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-api-key": "ac_tooshort" },
    });
    const result = await validateRequest(req);

    assertEquals(result, null);
  });
});

Deno.test("validateRequest - returns null for invalid API key format (wrong prefix)", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-api-key": "xx_123456789012345678901234" },
    });
    const result = await validateRequest(req);

    assertEquals(result, null);
  });
});

// ============================================
// logAuthMode() Tests
// ============================================

Deno.test("logAuthMode - logs LOCAL mode in local mode", () => {
  withEnv("GITHUB_CLIENT_ID", undefined, () => {
    // This test just verifies it doesn't throw
    logAuthMode("Test Server");
    // Log output should contain "LOCAL" but we don't have easy way to capture logs
  });
});

Deno.test("logAuthMode - logs CLOUD mode in cloud mode", () => {
  withEnv("GITHUB_CLIENT_ID", "test_client_id", () => {
    // This test just verifies it doesn't throw
    logAuthMode("Test Server");
    // Log output should contain "CLOUD"
  });
});
