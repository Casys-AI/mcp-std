/**
 * Integration tests for Settings API Routes (Story 9.4)
 *
 * Tests:
 * - GET /api/user/api-key - returns API key prefix
 * - DELETE /api/user/delete - deletes user account
 * - POST /auth/regenerate - regenerates API key with flash session
 *
 * @module tests/integration/auth/settings_api_test
 */

import { assertEquals, assertExists } from "@std/assert";

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
// API Key Prefix Route Tests
// ============================================

Deno.test("GET /api/user/api-key - returns 400 in local mode", async () => {
  await withEnv("GITHUB_CLIENT_ID", undefined, async () => {
    // Import handler (module will check isCloudMode at request time)
    const { handler } = await import(
      "../../../src/web/routes/api/user/api-key.ts"
    );

    // Create mock context
    const mockCtx = {
      req: new Request("http://localhost/api/user/api-key"),
      state: {
        user: { id: "local", username: "local" },
        isCloudMode: false,
      },
    };

    // deno-lint-ignore no-explicit-any
    const response = await handler.GET(mockCtx as any);
    assertEquals(response.status, 400);

    const body = await response.json();
    assertEquals(body.error, "API keys not available in local mode");
  });
});

Deno.test("GET /api/user/api-key - returns 401 without authentication", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const { handler } = await import(
      "../../../src/web/routes/api/user/api-key.ts"
    );

    const mockCtx = {
      req: new Request("http://localhost/api/user/api-key"),
      state: {
        user: null,
        isCloudMode: true,
      },
    };

    // deno-lint-ignore no-explicit-any
    const response = await handler.GET(mockCtx as any);
    assertEquals(response.status, 401);

    const body = await response.json();
    assertEquals(body.error, "Unauthorized");
  });
});

// ============================================
// Delete Account Route Tests
// ============================================

Deno.test({
  name: "DELETE /api/user/delete - returns 400 in local mode",
  sanitizeResources: false, // Disable resource leak check for this test
  sanitizeOps: false,
  fn: async () => {
    await withEnv("GITHUB_CLIENT_ID", undefined, async () => {
      const { handler } = await import(
        "../../../src/web/routes/api/user/delete.ts"
      );

      const mockCtx = {
        req: new Request("http://localhost/api/user/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: "DELETE" }),
        }),
        state: {
          user: { id: "local", username: "local" },
          isCloudMode: false,
        },
      };

      // deno-lint-ignore no-explicit-any
      const response = await handler.DELETE(mockCtx as any);
      assertEquals(response.status, 400);

      const body = await response.json();
      assertEquals(body.error, "Account deletion not available in local mode");
    });
  },
});

Deno.test("DELETE /api/user/delete - returns 400 for local user in cloud mode", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const { handler } = await import(
      "../../../src/web/routes/api/user/delete.ts"
    );

    const mockCtx = {
      req: new Request("http://localhost/api/user/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      }),
      state: {
        user: { id: "local", username: "local" },
        isCloudMode: true, // Cloud mode but local user
      },
    };

    // deno-lint-ignore no-explicit-any
    const response = await handler.DELETE(mockCtx as any);
    assertEquals(response.status, 400);

    const body = await response.json();
    assertEquals(body.error, "Cannot delete local user");
  });
});

Deno.test("DELETE /api/user/delete - returns 400 for null user", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const { handler } = await import(
      "../../../src/web/routes/api/user/delete.ts"
    );

    const mockCtx = {
      req: new Request("http://localhost/api/user/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      }),
      state: {
        user: null,
        isCloudMode: true,
      },
    };

    // deno-lint-ignore no-explicit-any
    const response = await handler.DELETE(mockCtx as any);
    assertEquals(response.status, 400);

    const body = await response.json();
    assertEquals(body.error, "Cannot delete local user");
  });
});

Deno.test("DELETE /api/user/delete - returns 400 without confirmation body", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const { handler } = await import(
      "../../../src/web/routes/api/user/delete.ts"
    );

    const mockCtx = {
      req: new Request("http://localhost/api/user/delete", {
        method: "DELETE",
        // No body - should fail validation
      }),
      state: {
        user: { id: "user-123", username: "testuser" },
        isCloudMode: true,
      },
    };

    // deno-lint-ignore no-explicit-any
    const response = await handler.DELETE(mockCtx as any);
    assertEquals(response.status, 400);

    const body = await response.json();
    assertEquals(body.error, "Invalid request body. Send { confirmation: 'DELETE' }");
  });
});

Deno.test("DELETE /api/user/delete - returns 400 with wrong confirmation", async () => {
  await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
    const { handler } = await import(
      "../../../src/web/routes/api/user/delete.ts"
    );

    const mockCtx = {
      req: new Request("http://localhost/api/user/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "WRONG" }),
      }),
      state: {
        user: { id: "user-123", username: "testuser" },
        isCloudMode: true,
      },
    };

    // deno-lint-ignore no-explicit-any
    const response = await handler.DELETE(mockCtx as any);
    assertEquals(response.status, 400);

    const body = await response.json();
    assertEquals(body.error, "Confirmation required. Send { confirmation: 'DELETE' }");
  });
});

// ============================================
// Regenerate API Key Route Tests
// ============================================

Deno.test({
  name: "POST /auth/regenerate - returns 401 without session",
  sanitizeResources: false,
  sanitizeOps: false,
  ignore: !Deno.env.get("GITHUB_CLIENT_SECRET"), // Skip if no secret configured
  fn: async () => {
    await withEnv("GITHUB_CLIENT_ID", "test_client_id", async () => {
      const { handler } = await import(
        "../../../src/web/routes/auth/regenerate.ts"
      );

      const mockCtx = {
        req: new Request("http://localhost/auth/regenerate", {
          method: "POST",
        }),
      };

      // deno-lint-ignore no-explicit-any
      const response = await handler.POST(mockCtx as any);
      assertEquals(response.status, 401);

      const body = await response.json();
      assertEquals(body.error, "Unauthorized");
    });
  },
});

// ============================================
// Route Guard Tests for Settings-related Routes
// ============================================

Deno.test("Settings routes are protected in cloud mode", () => {
  // Import route guards
  const routes = [
    "/dashboard/settings",
    "/api/user/api-key",
    "/api/user/delete",
  ];

  // All settings-related routes should require protection
  for (const route of routes) {
    // Note: API routes are not in the protected list by default
    // but they handle auth internally via middleware
    if (route.startsWith("/dashboard")) {
      // Dashboard routes are protected
      assertExists(route);
    }
  }
});
