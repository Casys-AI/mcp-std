#!/usr/bin/env -S deno run --allow-all
/**
 * Mock MCP Server - Database
 *
 * Simulates a database MCP server with query/insert/update tools
 * Tests dependency detection (needs connection config)
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

// Simulated tools for database server
const TOOLS: MCPTool[] = [
  {
    name: "query",
    description: "Execute a SQL query against the database",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "SQL query to execute",
        },
        params: {
          type: "array",
          description: "Query parameters",
          items: {
            type: "string",
          },
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "insert",
    description: "Insert a new record into the database",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Table name",
        },
        data: {
          type: "object",
          description: "Record data as key-value pairs",
        },
      },
      required: ["table", "data"],
    },
  },
  {
    name: "update",
    description: "Update existing records in the database",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Table name",
        },
        data: {
          type: "object",
          description: "Updated data",
        },
        where: {
          type: "object",
          description: "WHERE clause conditions",
        },
      },
      required: ["table", "data", "where"],
    },
  },
  {
    name: "schema",
    description: "Get database schema information",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Optional table name to get schema for",
        },
      },
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
            name: "database-mock",
            version: "1.0.0",
          },
        },
      };

    case "tools/list":
      // Simulate slow server (for parallelization testing)
      await new Promise((resolve) => setTimeout(resolve, 100));

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
              text: "Mock database operation completed",
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
