/**
 * POC: Sandbox Worker
 *
 * Executes user code in isolated Deno worker with MCP tools access.
 */

import { callTool, log, searchTools } from "./agentcards-bridge.ts";

// Listen for code execution requests from host
self.addEventListener("message", async (event: MessageEvent) => {
  const { type } = event.data;

  if (type === "execute_code") {
    try {
      log("Starting code execution...");

      // Execute user code
      // Note: In real implementation, this would use dynamic import or eval
      // For POC, we'll run a predefined test
      await runTestCode();

      postMessage({
        type: "execution_complete",
        success: true,
      });
    } catch (error) {
      postMessage({
        type: "execution_complete",
        success: false,
        error: String(error),
      });
    }
  }
});

/**
 * Test code that uses Casys PML bridge
 */
async function runTestCode() {
  log("Testing vector search...");

  // Test 1: Search for tools
  const tools = await searchTools("read file and parse JSON", 3);

  log(`Found ${tools.length} tools:`);
  for (const tool of tools) {
    log(`  - ${tool.name}: ${tool.description}`);
  }

  // Test 2: Call a tool (if any found)
  if (tools.length > 0) {
    log(`\nCalling tool: ${tools[0].name}`);

    const result = await callTool(tools[0].name, {
      path: "/test/example.txt",
    });

    log(`Tool call result: ${JSON.stringify(result)}`);
  }

  log("\nTest completed successfully!");
}

// Signal ready
postMessage({ type: "worker_ready" });
