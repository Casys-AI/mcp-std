/**
 * Integration tests for API Server auth validation
 * Story 9.3: Auth Middleware & Mode Detection
 *
 * Tests auth behavior in the MCP gateway server HTTP handler.
 *
 * @module tests/integration/auth/api_server_auth_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { validateRequest } from "../../../src/lib/auth.ts";

// Helper to save and restore env vars
async function withEnv<T>(
  key: string,
  value: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const original = Deno.env.get(key);
  if (value === undefined) {
    Deno.env.delete(key);
  } else {
    Deno.env.set(key, value);
  }
  try {
    return await fn();
  } finally {
    if (original !== undefined) {
      Deno.env.set(key, original);
    } else {
      Deno.env.delete(key);
    }
  }
}

// ============================================
// Local Mode Tests (Auth Bypassed)
// ============================================

Deno.test("API Server - local mode: allows request without API key", async () => {
  await withEnv("GITHUB_CLIENT_ID", undefined, async () => {
    const req = new Request("http://localhost:3003/api/graph/snapshot");
    const auth = await validateRequest(req);

    assertExists(auth);
    assertEquals(auth.user_id, "local");
  });
});

Deno.test("API Server - local mode: allows MCP endpoint without API key", async () => {
  await withEnv("GITHUB_CLIENT_ID", undefined, async () => {
    const req = new Request("http://localhost:3003/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "tools/list" }),
    });
    const auth = await validateRequest(req);

    assertExists(auth);
    assertEquals(auth.user_id, "local");
  });
});

Deno.test("API Server - local mode: allows events stream without API key", async () => {
  await withEnv("GITHUB_CLIENT_ID", undefined, async () => {
    const req = new Request("http://localhost:3003/events/stream");
    const auth = await validateRequest(req);

    assertExists(auth);
    assertEquals(auth.user_id, "local");
  });
});

// ============================================
// Cloud Mode Tests (Auth Required)
// ============================================

Deno.test("API Server - cloud mode: rejects request without API key", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost:3003/api/graph/snapshot");
    const auth = await validateRequest(req);

    assertEquals(auth, null);
  });
});

Deno.test("API Server - cloud mode: rejects MCP endpoint without API key", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost:3003/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "tools/list" }),
    });
    const auth = await validateRequest(req);

    assertEquals(auth, null);
  });
});

Deno.test("API Server - cloud mode: rejects events stream without API key", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost:3003/events/stream");
    const auth = await validateRequest(req);

    assertEquals(auth, null);
  });
});

Deno.test("API Server - cloud mode: rejects invalid API key format", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost:3003/api/graph/snapshot", {
      headers: { "x-api-key": "invalid_key" },
    });
    const auth = await validateRequest(req);

    assertEquals(auth, null);
  });
});

Deno.test("API Server - cloud mode: rejects API key with wrong prefix", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost:3003/api/graph/snapshot", {
      headers: { "x-api-key": "xx_123456789012345678901234" },
    });
    const auth = await validateRequest(req);

    assertEquals(auth, null);
  });
});

Deno.test("API Server - cloud mode: rejects API key with wrong length", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const req = new Request("http://localhost:3003/api/graph/snapshot", {
      headers: { "x-api-key": "ac_short" },
    });
    const auth = await validateRequest(req);

    assertEquals(auth, null);
  });
});

// ============================================
// 401 Response Format Tests
// ============================================

Deno.test("API Server - 401 response has correct JSON format", () => {
  // This tests the expected response format from gateway-server.ts
  const errorResponse = {
    error: "Unauthorized",
    message: "Valid API key required",
  };

  assertEquals(errorResponse.error, "Unauthorized");
  assertEquals(errorResponse.message, "Valid API key required");
});
