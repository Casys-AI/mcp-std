#!/usr/bin/env -S deno run --allow-all
/**
 * Mock MCP Server - Filesystem
 *
 * Simulates a filesystem MCP server with read/write tools
 * Implements stdio MCP protocol for testing
 */

interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Simulated tools for filesystem server
const TOOLS: MCPTool[] = [
  {
    name: "read_file",
    description: "Read contents of a file from the filesystem",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to read",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write contents to a file on the filesystem",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to write",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and directories in a given path",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list",
        },
      },
      required: ["path"],
    },
  },
];

async function handleRequest(request: MCPRequest): Promise<MCPResponse> {
  const { id, method } = request;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "filesystem-mock",
            version: "1.0.0",
          },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS,
        },
      };

    case "tools/call":
      // Simulate tool execution (for testing purposes)
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Mock filesystem operation completed",
            },
          ],
        },
      };

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
  }
}

// Main stdio loop
async function main() {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  for await (const chunk of Deno.stdin.readable) {
    const text = decoder.decode(chunk);
    const lines = text.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const request: MCPRequest = JSON.parse(line);
        const response = await handleRequest(request);
        const responseText = JSON.stringify(response) + "\n";
        await Deno.stdout.write(encoder.encode(responseText));
      } catch (error) {
        console.error("Error processing request:", error);
      }
    }
  }
}

if (import.meta.main) {
  main();
}
