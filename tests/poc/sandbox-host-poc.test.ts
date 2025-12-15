/**
 * POC Test: Sandbox with MCP Tools Injection
 *
 * Validates that:
 * 1. Sandbox can call vector search via message passing
 * 2. Sandbox can execute MCP tools
 * 3. Works with minimal permissions (none)
 */

import { assert } from "@std/assert";
import { PGliteClient } from "../../src/db/client.ts";

Deno.test("POC: Sandbox with MCP tools injection via message passing", async () => {
  // 1. Setup host components (database with mock data)
  const db = new PGliteClient(":memory:");
  await db.connect();

  // Run migrations (simplified for POC)
  await db.query(`DROP TABLE IF EXISTS tool_schema CASCADE`);
  await db.query(`
    CREATE TABLE tool_schema (
      tool_id SERIAL PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      input_schema TEXT
    )
  `);

  // Insert mock tools
  await db.query(`
    INSERT INTO tool_schema (server_id, name, description, input_schema)
    VALUES
      ('filesystem', 'read', 'Read file contents from disk', '{"type": "object"}'),
      ('filesystem', 'write', 'Write contents to a file', '{"type": "object"}'),
      ('filesystem', 'list', 'List directory contents', '{"type": "object"}'),
      ('json', 'parse', 'Parse JSON string into object', '{"type": "object"}'),
      ('json', 'stringify', 'Convert object to JSON string', '{"type": "object"}')
  `);

  // Mock vector search function (simplified for POC)
  async function mockVectorSearch(query: string, limit: number) {
    // For POC: just return tools with keyword matching
    const results = await db.query(
      `
      SELECT
        tool_id,
        server_id,
        name as tool_name,
        description,
        input_schema
      FROM tool_schema
      WHERE description ILIKE $1
      LIMIT $2
    `,
      [`%${query.split(" ")[0]}%`, limit],
    );

    return results.map((row: any) => ({
      toolId: row.tool_id,
      serverId: row.server_id,
      toolName: row.tool_name,
      schema: {
        name: row.tool_name,
        description: row.description,
        inputSchema: row.input_schema,
      },
    }));
  }

  // Mock MCP clients
  const mockMCPClients = new Map([
    ["filesystem", {
      callTool: async (name: string, _args: Record<string, unknown>) => ({
        success: true,
        result: `Mock result from filesystem:${name}`,
      }),
    }],
    ["json", {
      callTool: async (name: string, _args: Record<string, unknown>) => ({
        success: true,
        result: `Mock result from json:${name}`,
      }),
    }],
  ]);

  // 2. Create sandbox worker
  const workerUrl = new URL("./sandbox-worker.ts", import.meta.url).href;
  console.log("Creating worker:", workerUrl);

  const worker = new Worker(workerUrl, {
    type: "module",
    deno: {
      permissions: {
        // ⚠️ Critical: NO permissions (fully isolated)
        read: false,
        write: false,
        net: false,
        env: false,
        run: false,
        ffi: false,
      },
    },
  });

  // Track worker state
  let workerReady = false;
  let executionComplete = false;
  const logs: string[] = [];

  // 3. Setup message handler (host side)
  worker.addEventListener("message", async (event: MessageEvent) => {
    const { type, requestId, query, limit, name, args, message } = event.data;

    console.log("Host received message:", type);

    // Handle different message types
    switch (type) {
      case "worker_ready":
        workerReady = true;
        break;

      case "search_tools": {
        try {
          console.log(`Vector search: "${query}" (limit: ${limit})`);
          const results = await mockVectorSearch(query, limit ?? 10);

          const tools = results.map((r) => ({
            name: `${r.serverId}:${r.toolName}`,
            description: r.schema.description,
            inputSchema: r.schema.inputSchema,
          }));

          console.log(`Found ${tools.length} tools`);

          worker.postMessage({
            requestId,
            tools,
          });
        } catch (error) {
          console.error("Vector search error:", error);
          worker.postMessage({
            requestId,
            error: String(error),
          });
        }
        break;
      }

      case "call_tool": {
        try {
          console.log(`Tool call: ${name}`);
          const [serverId, toolName] = name.split(":");

          const client = mockMCPClients.get(serverId);
          if (!client) {
            throw new Error(`Unknown server: ${serverId}`);
          }

          const result = await client.callTool(toolName, args);

          worker.postMessage({
            requestId,
            result,
          });
        } catch (error) {
          console.error("Tool call error:", error);
          worker.postMessage({
            requestId,
            error: String(error),
          });
        }
        break;
      }

      case "log":
        console.log(`[Sandbox] ${message}`);
        logs.push(message);
        break;

      case "execution_complete":
        executionComplete = true;
        console.log("Execution complete:", event.data.success ? "✅" : "❌");
        if (event.data.error) {
          console.error("Error:", event.data.error);
        }
        break;
    }
  });

  // 4. Wait for worker ready
  console.log("Waiting for worker ready...");
  await new Promise<void>((resolve) => {
    const checkReady = setInterval(() => {
      if (workerReady) {
        clearInterval(checkReady);
        resolve();
      }
    }, 100);
  });

  console.log("Worker ready! Sending execution request...");

  // 5. Send execution request
  worker.postMessage({
    type: "execute_code",
    code: "// Test code (predefined in worker)",
  });

  // 6. Wait for execution complete
  await new Promise<void>((resolve) => {
    const checkComplete = setInterval(() => {
      if (executionComplete) {
        clearInterval(checkComplete);
        resolve();
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkComplete);
      resolve();
    }, 10000);
  });

  // 7. Assertions
  console.log("\n=== Validation ===");

  assert(logs.length > 0, "Should have logged messages");
  assert(logs.some((log) => log.includes("Found")), "Should have found tools");
  assert(logs.some((log) => log.includes("completed")), "Should have completed execution");

  console.log("✅ All validations passed!");
  console.log("\nLogs:");
  logs.forEach((log) => console.log(`  ${log}`));

  // Cleanup
  worker.terminate();
  await db.close();
});
