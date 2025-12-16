/**
 * MCP Gateway Tool Definitions
 *
 * Contains the schema definitions for all meta-tools exposed by the gateway.
 * These tools provide the public API for DAG execution, tool search, and code execution.
 *
 * @module mcp/tools/definitions
 */

import type { MCPTool } from "../types.ts";

/**
 * Execute DAG tool (pml:execute_dag)
 *
 * Primary tool for workflow execution with intent-based or explicit mode.
 */
export const executeDagTool: MCPTool = {
  name: "pml:execute_dag",
  description: `Execute a multi-tool DAG workflow. TWO MODES:

1. INTENT MODE (recommended): Just describe what you want → system auto-discovers tools, builds DAG, executes.
   Example: intent="Read config.json, extract version, create GitHub issue with it"

2. EXPLICIT MODE: Define exact workflow with tasks and dependencies.

The system has access to ALL MCP tools (filesystem, github, fetch, databases, etc). Just ask!`,
  inputSchema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        description:
          "RECOMMENDED: Just describe your goal in natural language. System auto-discovers tools and builds the workflow. Example: 'Read package.json and list all dependencies'",
      },
      workflow: {
        type: "object",
        description:
          "ADVANCED: Explicit DAG with tasks array and dependencies. Use only if you need precise control.",
      },
    },
  },
};

/**
 * Search tools tool (pml:search_tools)
 *
 * Tool discovery via semantic search + graph relationships.
 */
export const searchToolsTool: MCPTool = {
  name: "pml:search_tools",
  description: `Discover available MCP tools via semantic search. Use this to explore what's possible before using execute_dag.

Returns tool names, descriptions, and input schemas. Useful for:
- "What tools can read files?" → filesystem:read_file, filesystem:read_multiple_files...
- "How do I interact with GitHub?" → github:create_issue, github:search_repositories...

Tip: Set include_related=true to see tools often used together (from learned patterns).`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "What do you want to do? Example: 'read JSON files', 'interact with GitHub', 'make HTTP requests'",
      },
      limit: {
        type: "number",
        description: "How many tools to return (default: 5)",
      },
      include_related: {
        type: "boolean",
        description: "Also show tools frequently used together with the matches (from usage patterns)",
      },
      context_tools: {
        type: "array",
        items: { type: "string" },
        description: "Tools you're already using - boosts related tools in results",
      },
    },
    required: ["query"],
  },
};

/**
 * Search capabilities tool (pml:search_capabilities)
 *
 * Find proven code patterns from past executions.
 */
export const searchCapabilitiesTool: MCPTool = {
  name: "pml:search_capabilities",
  description: `Search for PROVEN code patterns that worked before. Capabilities are learned from successful executions.

Returns reusable code snippets with success rates. Example:
- intent="create GitHub issue from file" → Returns code that reads file + creates issue (95% success rate)

Use this when you want to reuse existing patterns instead of building from scratch. The returned code can be executed directly via execute_code.`,
  inputSchema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        description: "What do you want to accomplish? System finds similar past successes.",
      },
      include_suggestions: {
        type: "boolean",
        description: "Also show related capabilities (similar tools or patterns)",
      },
    },
    required: ["intent"],
  },
};

/**
 * Execute code tool (pml:execute_code)
 *
 * Sandboxed TypeScript execution with auto-injected MCP tools.
 */
export const executeCodeTool: MCPTool = {
  name: "pml:execute_code",
  description: `Execute TypeScript/JavaScript code in a secure Deno sandbox with MCP tools auto-injected.

KEY FEATURE: If you provide 'intent', the system auto-discovers relevant MCP tools and injects them as 'mcp.serverName.toolName()' functions.

Example:
  intent: "read a file and parse JSON"
  code: \`
    const content = await mcp.filesystem.read_file({ path: "config.json" });
    return JSON.parse(content);
  \`

The sandbox has access to: Deno APIs, fetch, all discovered MCP tools. Simple expressions auto-return; multi-statement code needs explicit 'return'.`,
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "TypeScript code to run. MCP tools available as mcp.server.tool(). Example: await mcp.filesystem.read_file({path: 'x.json'})",
      },
      intent: {
        type: "string",
        description:
          "RECOMMENDED: Describe what you're doing → system injects relevant MCP tools automatically. Example: 'read files and call GitHub API'",
      },
      context: {
        type: "object",
        description: "Custom data to inject into sandbox as 'context' variable",
      },
      sandbox_config: {
        type: "object",
        description: "Optional: timeout (ms), memoryLimit (MB), allowedReadPaths",
        properties: {
          timeout: {
            type: "number",
            description: "Max execution time in ms (default: 30000)",
          },
          memoryLimit: {
            type: "number",
            description: "Max heap memory in MB (default: 512)",
          },
          allowedReadPaths: {
            type: "array",
            items: { type: "string" },
            description: "Extra file paths the sandbox can read",
          },
        },
      },
    },
    required: ["code"],
  },
};

/**
 * Continue tool (pml:continue)
 *
 * Resume paused workflow after layer validation.
 */
export const continueTool: MCPTool = {
  name: "pml:continue",
  description:
    "Resume a paused DAG workflow. Used when execute_dag returns 'layer_complete' status (per-layer validation mode). Call this to proceed to the next layer after reviewing results.",
  inputSchema: {
    type: "object",
    properties: {
      workflow_id: {
        type: "string",
        description: "The workflow_id returned by execute_dag",
      },
      reason: {
        type: "string",
        description: "Why you're continuing (optional, for logging)",
      },
    },
    required: ["workflow_id"],
  },
};

/**
 * Abort tool (pml:abort)
 *
 * Stop a running workflow immediately.
 */
export const abortTool: MCPTool = {
  name: "pml:abort",
  description:
    "Stop a running DAG workflow immediately. Use when you detect issues in intermediate results and want to cancel remaining tasks.",
  inputSchema: {
    type: "object",
    properties: {
      workflow_id: {
        type: "string",
        description: "The workflow_id to stop",
      },
      reason: {
        type: "string",
        description: "Why you're aborting (required for audit trail)",
      },
    },
    required: ["workflow_id", "reason"],
  },
};

/**
 * Replan tool (pml:replan)
 *
 * Modify a running DAG to add new tasks.
 */
export const replanTool: MCPTool = {
  name: "pml:replan",
  description: `Modify a running DAG to add new tasks based on discovered context.

Example: DAG finds XML files unexpectedly → replan to add XML parser task.

The system uses GraphRAG to find appropriate tools for the new requirement and inserts them into the workflow.`,
  inputSchema: {
    type: "object",
    properties: {
      workflow_id: {
        type: "string",
        description: "The workflow_id to modify",
      },
      new_requirement: {
        type: "string",
        description: "What new capability is needed? Example: 'parse the XML files we found'",
      },
      available_context: {
        type: "object",
        description: "Data from previous tasks that informs the replan (e.g., {files: ['a.xml', 'b.xml']})",
      },
    },
    required: ["workflow_id", "new_requirement"],
  },
};

/**
 * Approval response tool (pml:approval_response)
 *
 * Respond to Human-in-the-Loop checkpoints.
 */
export const approvalResponseTool: MCPTool = {
  name: "pml:approval_response",
  description:
    "Respond to a Human-in-the-Loop checkpoint. Some DAG tasks require explicit approval before execution (e.g., destructive operations, external API calls). Use this to approve or reject.",
  inputSchema: {
    type: "object",
    properties: {
      workflow_id: {
        type: "string",
        description: "The workflow_id waiting for approval",
      },
      checkpoint_id: {
        type: "string",
        description: "The specific checkpoint_id from the approval request",
      },
      approved: {
        type: "boolean",
        description: "true = proceed with the operation, false = skip/cancel it",
      },
      feedback: {
        type: "string",
        description: "Optional message explaining your decision",
      },
    },
    required: ["workflow_id", "checkpoint_id", "approved"],
  },
};

/**
 * Get all meta-tools to expose via tools/list
 *
 * @returns Array of tool definitions formatted for MCP response
 */
export function getMetaTools(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const tools = [
    executeDagTool,
    searchToolsTool,
    searchCapabilitiesTool,
    executeCodeTool,
    continueTool,
    abortTool,
    replanTool,
    approvalResponseTool,
  ];

  return tools.map((schema) => ({
    name: schema.name,
    description: schema.description,
    inputSchema: schema.inputSchema,
  }));
}
