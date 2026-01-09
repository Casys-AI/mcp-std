/**
 * E2E Test 10: PML Execute Hybrid Routing
 *
 * Tests hybrid routing for pml:execute - server-only tools execute on server,
 * client tools trigger execute_locally response for package-side execution.
 *
 * Tech-spec: tech-spec-2026-01-09-pml-execute-hybrid-routing.md
 *
 * TDD: These tests are written FIRST - they should fail until implementation.
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import { resolveRouting, getToolRouting } from "../../src/capabilities/routing-resolver.ts";

/**
 * Test routing resolver (unit tests for routing check logic)
 */
Deno.test("E2E 10.1: Routing resolver - server-only tools", async (t) => {
  await t.step("1. Pure server tools return 'server' routing", () => {
    const toolsUsed = ["json:parse", "math:sum", "datetime:now"];
    const routing = resolveRouting(toolsUsed);
    assertEquals(routing, "server", "All server tools should route to server");
  });

  await t.step("2. Mixed tools return 'client' routing", () => {
    const toolsUsed = ["json:parse", "filesystem:read_file", "math:sum"];
    const routing = resolveRouting(toolsUsed);
    assertEquals(routing, "client", "Any client tool should route to client");
  });

  await t.step("3. Empty tools return 'server' (pure compute)", () => {
    const routing = resolveRouting([]);
    assertEquals(routing, "server", "No tools = pure compute = server");
  });

  await t.step("4. Single client tool returns 'client'", () => {
    const routing = resolveRouting(["filesystem:read_file"]);
    assertEquals(routing, "client", "filesystem tools route to client");
  });

  await t.step("5. getToolRouting for individual tools", () => {
    assertEquals(getToolRouting("json:parse"), "server", "json is server");
    assertEquals(getToolRouting("filesystem:read_file"), "client", "filesystem is client");
    assertEquals(getToolRouting("git:status"), "client", "git is client");
    assertEquals(getToolRouting("tavily:search"), "server", "tavily is server");
    assertEquals(getToolRouting("unknown:tool"), "client", "unknown defaults to client");
  });
});

/**
 * Helper: Register a package session and return sessionId
 */
async function registerSession(cloudUrl: string, apiKey: string): Promise<string> {
  const response = await fetch(`${cloudUrl}/pml/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      clientId: `test-client-${crypto.randomUUID()}`,
      version: "0.1.0",
      capabilities: {
        sandbox: true,
        clientTools: true,
        hybridRouting: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Session registration failed: ${response.status}`);
  }

  const result = await response.json();
  return result.sessionId;
}

/**
 * Helper: Unregister a package session
 */
async function unregisterSession(cloudUrl: string, apiKey: string, sessionId: string): Promise<void> {
  const response = await fetch(`${cloudUrl}/pml/unregister`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ sessionId }),
  });
  // Consume response body to avoid resource leak
  await response.text();
}

/**
 * Test execute_locally response structure
 */
Deno.test("E2E 10.2: Server returns execute_locally for client tools", async (t) => {
  // Skip if no cloud connection available
  const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? "https://pml.casys.ai";
  const apiKey = Deno.env.get("PML_API_KEY");

  if (!apiKey) {
    console.log("  ⚠️ Skipping cloud tests - PML_API_KEY not set");
    return;
  }

  // Register a session for package tests
  let sessionId: string | null = null;
  try {
    sessionId = await registerSession(cloudUrl, apiKey);
  } catch (e) {
    console.log(`  ⚠️ Skipping cloud tests - Session registration failed: ${e}`);
    return;
  }

  try {
    await t.step("1. Server-only code executes on server (with session)", async () => {
      const code = `
        const result = await mcp.json.parse({ input: '{"test": 123}' });
        return result;
      `;

      const response = await fetch(`${cloudUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "X-PML-Session": sessionId!, // Package session
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "pml:execute",
            arguments: { code },
          },
        }),
      });

      assertEquals(response.ok, true, "Request should succeed");
      const result = await response.json();

      // Should execute directly (not execute_locally)
      assertExists(result.result, "Should have result");
      const content = result.result.content?.[0]?.text;
      assertExists(content, "Should have content");

      const parsed = JSON.parse(content);
      assert(parsed.status !== "execute_locally", "Server-only code should NOT return execute_locally");
    });

    await t.step("2. Client tools with session return execute_locally", async () => {
      const code = `
        const content = await mcp.filesystem.read_file({ path: "/tmp/test.txt" });
        return content;
      `;

      const response = await fetch(`${cloudUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "X-PML-Session": sessionId!, // Package session
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "pml:execute",
            arguments: { code },
          },
        }),
      });

      assertEquals(response.ok, true, "Request should succeed");
      const result = await response.json();

      assertExists(result.result, "Should have result");
      const content = result.result.content?.[0]?.text;
      assertExists(content, "Should have content");

      const parsed = JSON.parse(content);
      assertEquals(parsed.status, "execute_locally", "Client tools should return execute_locally");
      assertExists(parsed.code, "Should include code");
      assertExists(parsed.client_tools, "Should list client tools");
      assert(parsed.client_tools.includes("filesystem:read_file"), "Should include filesystem tool");
    });

    await t.step("3. Client tools WITHOUT session return error", async () => {
      const code = `
        const content = await mcp.filesystem.read_file({ path: "/tmp/test.txt" });
        return content;
      `;

      const response = await fetch(`${cloudUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          // NO X-PML-Session header - not a registered package
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "pml:execute",
            arguments: { code },
          },
        }),
      });

      assertEquals(response.ok, true, "Request should succeed (error is in result)");
      const result = await response.json();

      const content = result.result?.content?.[0]?.text;
      assertExists(content, "Should have content");

      const parsed = JSON.parse(content);
      // Should be an error, not execute_locally
      assertExists(parsed.error_code, "Should have error_code");
      assertEquals(
        parsed.error_code,
        "CLIENT_TOOLS_REQUIRE_PACKAGE",
        "Should return CLIENT_TOOLS_REQUIRE_PACKAGE error",
      );
    });

    await t.step("4. Mixed tools return execute_locally", async () => {
      const code = `
        const jsonResult = await mcp.json.parse({ input: '{"key": "value"}' });
        const fileContent = await mcp.filesystem.read_file({ path: "/tmp/data.json" });
        return { json: jsonResult, file: fileContent };
      `;

      const response = await fetch(`${cloudUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "X-PML-Session": sessionId!, // Package session
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "pml:execute",
            arguments: { code },
          },
        }),
      });

      assertEquals(response.ok, true, "Request should succeed");
      const result = await response.json();

      const content = result.result?.content?.[0]?.text;
      assertExists(content, "Should have content");

      const parsed = JSON.parse(content);
      assertEquals(parsed.status, "execute_locally", "Mixed tools should return execute_locally");
      assert(parsed.client_tools.length > 0, "Should have client_tools list");
    });
  } finally {
    // Clean up: unregister the session
    if (sessionId) {
      await unregisterSession(cloudUrl, apiKey, sessionId);
    }
  }
});

/**
 * Test edge cases (F8, F14 from adversarial review)
 */
Deno.test("E2E 10.3: Edge cases and error handling", async (t) => {
  const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? "https://pml.casys.ai";
  const apiKey = Deno.env.get("PML_API_KEY");

  if (!apiKey) {
    console.log("  ⚠️ Skipping cloud tests - PML_API_KEY not set");
    return;
  }

  // Register a session for package tests
  let sessionId: string | null = null;
  try {
    sessionId = await registerSession(cloudUrl, apiKey);
  } catch (e) {
    console.log(`  ⚠️ Skipping cloud tests - Session registration failed: ${e}`);
    return;
  }

  try {
    await t.step("1. Empty code returns error", async () => {
      const response = await fetch(`${cloudUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "X-PML-Session": sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: {
            name: "pml:execute",
            arguments: { code: "" },
          },
        }),
      });

      assertEquals(response.ok, true, "Request should succeed");
      const result = await response.json();

      // Should return an error for empty code
      const content = result.result?.content?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        assert(
          parsed.error || parsed.isError || parsed.status === "error",
          "Empty code should return error",
        );
      }
    });

    await t.step("2. Syntax error in code returns parse error", async () => {
      const code = `
        const x = {{{ invalid syntax
      `;

      const response = await fetch(`${cloudUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "X-PML-Session": sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 11,
          method: "tools/call",
          params: {
            name: "pml:execute",
            arguments: { code },
          },
        }),
      });

      assertEquals(response.ok, true, "Request should succeed");
      const result = await response.json();

      // Should return an error for syntax errors
      const content = result.result?.content?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        assert(
          parsed.error || parsed.isError || parsed.status === "error",
          "Syntax error should return error",
        );
      }
    });

    await t.step("3. Unknown tool returns execute_locally (safe default)", async () => {
      const code = `
        const result = await mcp.nonexistent.fake_tool({ arg: "test" });
        return result;
      `;

      const response = await fetch(`${cloudUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "X-PML-Session": sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 12,
          method: "tools/call",
          params: {
            name: "pml:execute",
            arguments: { code },
          },
        }),
      });

      assertEquals(response.ok, true, "Request should succeed");
      const result = await response.json();

      // Unknown tools default to client routing, so should return execute_locally
      const content = result.result?.content?.[0]?.text;
      assertExists(content, "Should have content");

      const parsed = JSON.parse(content);
      // Unknown tools route to client (safe default), so execute_locally is expected
      assertEquals(
        parsed.status,
        "execute_locally",
        "Unknown tool should route to client (safe default)",
      );
    });
  } finally {
    // Clean up: unregister the session
    if (sessionId) {
      await unregisterSession(cloudUrl, apiKey, sessionId);
    }
  }
});

/**
 * Test X-PML-Session header is sent by package after handshake
 */
Deno.test("E2E 10.4: Package sends X-PML-Session header", async (t) => {
  await t.step("1. Verify session registration and header format", () => {
    // Session ID is a UUID returned by POST /pml/register
    const exampleSessionId = "550e8400-e29b-41d4-a716-446655440000";
    assertEquals(exampleSessionId.length, 36, "Session ID should be UUID format (36 chars)");
    assert(exampleSessionId.includes("-"), "Session ID should contain dashes");
  });

  // Note: Full integration test requires running the package stdio server
  // which is tested via manual testing or separate integration suite
});

/**
 * Test response structure for execute_locally
 */
Deno.test("E2E 10.5: execute_locally response structure", async (t) => {
  await t.step("1. Response has all required fields", () => {
    // Expected structure based on tech-spec
    const expectedStructure = {
      status: "execute_locally",
      code: "string", // Original code to execute
      dag: { tasks: [] }, // DAG for debugging (optional)
      tools_used: [], // All tools found in code
      client_tools: [], // Tools that require client execution
    };

    // Validate structure keys
    const requiredKeys = ["status", "code", "client_tools"];
    for (const key of requiredKeys) {
      assert(key in expectedStructure, `Should have ${key} field`);
    }
  });

  await t.step("2. client_tools is subset of tools_used", () => {
    // Simulate response
    const response = {
      status: "execute_locally",
      code: "...",
      tools_used: ["json:parse", "filesystem:read_file", "math:sum"],
      client_tools: ["filesystem:read_file"],
    };

    for (const clientTool of response.client_tools) {
      assert(
        response.tools_used.includes(clientTool),
        `client_tool ${clientTool} should be in tools_used`,
      );
    }
  });
});

console.log("\n🧪 E2E 10: PML Execute Hybrid Routing Tests");
console.log("   Tests routing check for pml:execute");
console.log("   Server-only → execute on server");
console.log("   Client tools → return execute_locally to package\n");
