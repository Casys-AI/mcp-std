#!/usr/bin/env -S deno run --allow-all
/**
 * Mock MCP Server - API Client
 *
 * Simulates an API client MCP server with HTTP request tools
 * Tests complex input schemas with nested objects
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

// Simulated tools for API client server
const TOOLS: MCPTool[] = [
  {
    name: "get",
    description: "Make a GET request to an API endpoint",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "API endpoint URL",
        },
        headers: {
          type: "object",
          description: "HTTP headers",
          additionalProperties: {
            type: "string",
          },
        },
        params: {
          type: "object",
          description: "Query parameters",
          additionalProperties: {
            type: "string",
          },
        },
      },
      required: ["url"],
    },
  },
  {
    name: "post",
    description: "Make a POST request to an API endpoint",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "API endpoint URL",
        },
        headers: {
          type: "object",
          description: "HTTP headers",
          additionalProperties: {
            type: "string",
          },
        },
        body: {
          type: "object",
          description: "Request body",
        },
      },
      required: ["url", "body"],
    },
  },
  {
    name: "webhook",
    description: "Register a webhook for API events",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Webhook URL",
        },
        events: {
          type: "array",
          description: "Events to listen for",
          items: {
            type: "string",
            enum: ["created", "updated", "deleted"],
          },
        },
        config: {
          type: "object",
          description: "Webhook configuration",
          properties: {
            retries: {
              type: "number",
              description: "Number of retry attempts",
            },
            timeout: {
              type: "number",
              description: "Timeout in milliseconds",
            },
          },
        },
      },
      required: ["url", "events"],
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
            name: "api-mock",
            version: "1.0.0",
          },
        },
      };

    case "tools/list":
      // Simulate medium-speed server
      await new Promise((resolve) => setTimeout(resolve, 50));

      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS,
        },
      };

    case "tools/call":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Mock API operation completed",
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
