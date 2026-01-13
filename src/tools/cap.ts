/**
 * Cap Module - Capability Management Tools (MCP HTTP Client)
 *
 * Story 13.5: cap:list, cap:rename, cap:lookup, cap:whois, cap:merge
 *
 * This file provides a lightweight HTTP client for capability management tools.
 * The actual implementation (CapModule, PmlStdServer) has been moved to
 * src/mcp/handlers/cap-handler.ts to support standalone package distribution.
 *
 * When used as part of @casys/mcp-std, these tools call the PML server via HTTP.
 * When used in the main application, the gateway handles calls directly.
 *
 * @module lib/std/cap
 */

import { z } from "zod";
import type { MiniTool } from "./types.ts";

// =============================================================================
// Validation Schemas
// =============================================================================

/**
 * Namespace must be lowercase letters/numbers, start with letter.
 * Examples: "fs", "api", "math", "db"
 * Invalid: "Fs", "api_v2", "my:ns"
 */
export const NamespaceSchema = z
  .string()
  .min(1, "Namespace cannot be empty")
  .max(20, "Namespace too long (max 20 chars)")
  .regex(/^[a-z][a-z0-9]*$/, "Namespace must be lowercase letters/numbers, start with letter")
  .refine((s) => !s.includes("_") && !s.includes(":"), "No underscores or colons allowed");

/**
 * Action must be camelCase or snake_case, no auto-generated prefixes.
 * Examples: "readFile", "list_users", "analyze"
 * Invalid: "exec_abc123", "my:action", "123start"
 */
export const ActionSchema = z
  .string()
  .min(1, "Action cannot be empty")
  .max(50, "Action too long (max 50 chars)")
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Action must be alphanumeric (camelCase/snake_case), start with letter")
  .refine((s) => !s.includes(":"), "No colons allowed in action")
  .refine(
    (s) => !s.startsWith("exec_") && !s.match(/^exec[0-9a-f]{6,}/i),
    "Auto-generated names like 'exec_...' not allowed. Use a descriptive name."
  );

/**
 * Zod schema for cap:merge validation
 */
export const CapMergeOptionsSchema = z.object({
  source: z.string().min(1, "source is required"),
  target: z.string().min(1, "target is required"),
  preferSourceCode: z.boolean().optional(),
});

// =============================================================================
// Types (Public API for package consumers)
// =============================================================================

/**
 * Options for cap:list tool
 */
export interface CapListOptions {
  /** Glob pattern to filter capabilities (e.g., "fs:*", "read_?") */
  pattern?: string;
  /** Only return unnamed_* capabilities */
  unnamedOnly?: boolean;
  /** Maximum number of results (default: 50) */
  limit?: number;
  /** Pagination offset (default: 0) */
  offset?: number;
}

/**
 * Single capability item in list response
 */
export interface CapListItem {
  /** UUID (immutable primary key) */
  id: string;
  /** FQDN (computed: org.project.namespace.action.hash) */
  fqdn: string;
  /** Display name (namespace:action) */
  name: string;
  /** Capability description (from workflow_pattern) */
  description: string | null;
  /** Namespace grouping */
  namespace: string;
  /** Action name */
  action: string;
  /** Total usage count */
  usageCount: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Response from cap:list tool
 */
export interface CapListResponse {
  /** List of capabilities matching the query */
  items: CapListItem[];
  /** Total count (for pagination UI) */
  total: number;
  /** Limit used in query */
  limit: number;
  /** Offset used in query */
  offset: number;
}

/**
 * Options for cap:rename tool
 *
 * Allows updating namespace, action, description, tags, and visibility.
 * The UUID (id) remains immutable. FQDN is recomputed from namespace/action.
 */
export interface CapRenameOptions {
  /** Current name (namespace:action) or UUID to update */
  name: string;
  /** New namespace - must be a clean identifier (lowercase, no special chars) */
  namespace?: string;
  /** New action - must be a clean identifier (camelCase or snake_case, no prefixes like exec_) */
  action?: string;
  /** Optional description update */
  description?: string;
  /** Optional tags update */
  tags?: string[];
  /** Optional visibility update */
  visibility?: "private" | "project" | "org" | "public";
}

/**
 * Response from cap:rename tool
 */
export interface CapRenameResponse {
  /** Whether rename succeeded */
  success: boolean;
  /** UUID (immutable) */
  id: string;
  /** New FQDN (recomputed if namespace/action changed) */
  fqdn: string;
  /** New display name (namespace:action) */
  displayName: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for cap:lookup tool
 */
export interface CapLookupOptions {
  /** Name to look up (display_name or alias) */
  name: string;
}

/**
 * Response from cap:lookup tool
 */
export interface CapLookupResponse {
  /** UUID of the capability */
  id: string;
  /** FQDN of the capability (computed) */
  fqdn: string;
  /** Display name (namespace:action) */
  displayName: string;
  /** Namespace */
  namespace: string;
  /** Action */
  action: string;
  /** Description from workflow_pattern */
  description: string | null;
  /** Tools used by this capability (from dag_structure) */
  toolsUsed: string[] | null;
  /** Total usage count */
  usageCount: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Options for cap:whois tool
 */
export interface CapWhoisOptions {
  /** UUID or FQDN to look up */
  id: string;
}

/**
 * Full capability metadata from cap:whois
 */
export interface CapWhoisResponse {
  /** UUID primary key */
  id: string;
  /** FQDN (computed) */
  fqdn: string;
  /** Display name (namespace:action) */
  displayName: string;
  /** Organization */
  org: string;
  /** Project */
  project: string;
  /** Namespace */
  namespace: string;
  /** Action */
  action: string;
  /** Code hash (4 chars) */
  hash: string;
  /** FK to workflow_pattern */
  workflowPatternId: string | null;
  /** Owner user ID (UUID FK to users, null for legacy/system records) - Migration 039 */
  userId: string | null;
  /** Creation date (ISO string) */
  createdAt: string;
  /** Last update date (ISO string) */
  updatedAt: string | null;
  /** Version number */
  version: number;
  /** Semantic version tag */
  versionTag: string | null;
  /** Whether verified */
  verified: boolean;
  /** Cryptographic signature */
  signature: string | null;
  /** Usage count */
  usageCount: number;
  /** Success count */
  successCount: number;
  /** @deprecated Total latency in ms - removed in migration 034 */
  totalLatencyMs?: number;
  /** Tags */
  tags: string[];
  /** Visibility level */
  visibility: "private" | "project" | "org" | "public";
  /** Execution routing (client/server preferred, local/cloud for legacy) */
  routing: "client" | "server" | "local" | "cloud";
  /** Description from workflow_pattern */
  description?: string | null;
  /** Input parameters schema (JSON Schema) */
  parametersSchema?: Record<string, unknown> | null;
  /** Tools used by this capability (from dag_structure) */
  toolsUsed?: string[] | null;
}

/**
 * Options for cap:merge tool
 *
 * Merges duplicate capabilities into a canonical one.
 * Requires identical tools_used arrays.
 */
export interface CapMergeOptions {
  /** Source capability to merge FROM (name, UUID, or FQDN) - will be deleted */
  source: string;
  /** Target capability to merge INTO (name, UUID, or FQDN) - will be updated */
  target: string;
  /** If true, use source's code_snippet even if older. Default: use newest. */
  preferSourceCode?: boolean;
}

/**
 * Response from cap:merge tool
 */
export interface CapMergeResponse {
  /** Whether merge succeeded */
  success: boolean;
  /** UUID of target capability */
  targetId: string;
  /** FQDN of target capability */
  targetFqdn: string;
  /** Display name of target */
  targetDisplayName: string;
  /** UUID of deleted source */
  deletedSourceId: string;
  /** Display name of deleted source */
  deletedSourceName: string;
  /** workflow_pattern ID of deleted source (for graph invalidation) */
  deletedSourcePatternId: string | null;
  /** workflow_pattern ID of target */
  targetPatternId: string | null;
  /** Merged statistics summary */
  mergedStats: {
    usageCount: number;
    successCount: number;
    totalLatencyMs: number;
  };
  /** Which code_snippet was kept */
  codeSource: "source" | "target";
}

/**
 * Callback type for merge events
 * Used to emit events after successful merge
 */
export type OnCapabilityMerged = (response: CapMergeResponse) => void | Promise<void>;

/**
 * MCP Tool definition for cap:* tools
 */
export interface CapTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool result format for MCP protocol
 */
export interface CapToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

// =============================================================================
// MCP HTTP Client
// =============================================================================

/**
 * Configuration for the MCP HTTP client
 */
interface McpClientConfig {
  /** Base URL for the PML API (default: https://pml.casys.ai) */
  baseUrl: string;
  /** API key for authentication (required for cloud endpoints) */
  apiKey?: string;
}

/**
 * Get MCP client configuration from environment
 */
function getClientConfig(): McpClientConfig {
  const baseUrl = Deno.env.get("PML_API_URL") || "https://pml.casys.ai";
  const apiKey = Deno.env.get("PML_API_KEY");
  return { baseUrl, apiKey };
}

/**
 * Check if URL is a cloud endpoint (requires authentication)
 *
 * Local endpoints (no API key required):
 * - localhost, 127.0.0.1, [::1] (IPv6 loopback)
 * - 127.0.0.0/8 range (127.x.x.x)
 * - 0.0.0.0 (all interfaces, local dev)
 *
 * All other endpoints are considered cloud and require PML_API_KEY.
 */
function isCloudEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // Check for common local patterns
    if (host === "localhost") return false;
    if (host === "0.0.0.0") return false;
    if (host === "::1" || host === "[::1]") return false;

    // Check for IPv4 loopback range 127.x.x.x
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;

    // Everything else is cloud
    return true;
  } catch {
    // Invalid URL - treat as cloud to be safe
    return true;
  }
}

/** Default timeout for MCP calls (30 seconds) */
const MCP_CALL_TIMEOUT_MS = 30000;

/**
 * Make an MCP tool call via HTTP
 *
 * @param tool - The tool name (e.g., "cap:list")
 * @param args - Arguments for the tool
 * @returns The tool result
 * @throws Error if the request fails, times out, or authentication is required
 */
async function mcpCall(tool: string, args: unknown): Promise<unknown> {
  const config = getClientConfig();

  // Require API key for cloud endpoints
  if (isCloudEndpoint(config.baseUrl) && !config.apiKey) {
    throw new Error("PML_API_KEY required for cloud access. Get your key at pml.casys.ai/settings");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
  }

  // F1: Use AbortController for timeout to prevent indefinite hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MCP_CALL_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`MCP call timed out after ${MCP_CALL_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    throw new Error("Invalid API key. Check PML_API_KEY or get a new key at pml.casys.ai/settings");
  }

  if (!response.ok) {
    throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
  }

  // F2: Wrap JSON parsing in try-catch for better error messages
  let result: Record<string, unknown>;
  try {
    result = await response.json();
  } catch {
    throw new Error("Invalid MCP response: failed to parse JSON response body");
  }

  if (result.error) {
    const errorObj = result.error as { message?: string };
    throw new Error(errorObj.message || "MCP call failed");
  }

  // Parse the response content
  const resultContent = result.result as { content?: Array<{ text?: string }> } | undefined;
  const content = resultContent?.content?.[0]?.text;
  if (!content) {
    throw new Error("Invalid MCP response: missing content");
  }

  // F2: Wrap content JSON parsing in try-catch
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Invalid MCP response: failed to parse content as JSON: ${content.substring(0, 100)}...`);
  }
}

// =============================================================================
// pmlTools - MiniTool array for discovery
// =============================================================================

/**
 * PML capability management tools as MiniTool array
 *
 * These tools call the PML server via HTTP when used in the standalone package.
 * When used in the main application, the gateway handles calls directly.
 */
export const pmlTools: MiniTool[] = [
  {
    name: "cap_list",
    description: "List capabilities with optional filtering by pattern and pagination",
    category: "pml",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to filter capabilities (e.g., 'fs:*', 'read_?')",
        },
        unnamedOnly: {
          type: "boolean",
          description: "Only return unnamed_* capabilities",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 50, max: 500)",
        },
        offset: {
          type: "number",
          description: "Pagination offset (default: 0)",
        },
      },
    },
    handler: async (args) => {
      return await mcpCall("cap:list", args);
    },
  },
  {
    name: "cap_rename",
    description:
      "Update a capability's namespace, action, description, tags, or visibility. UUID stays immutable. Validates that namespace/action are clean identifiers.",
    category: "pml",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Current name (namespace:action) or UUID to update",
        },
        namespace: {
          type: "string",
          description: "New namespace - lowercase letters/numbers only (e.g., 'fs', 'api', 'math')",
        },
        action: {
          type: "string",
          description: "New action - camelCase/snake_case, no 'exec_' prefix (e.g., 'readFile', 'list_users')",
        },
        description: {
          type: "string",
          description: "New description",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "New tags array",
        },
        visibility: {
          type: "string",
          enum: ["private", "project", "org", "public"],
          description: "New visibility level",
        },
      },
      required: ["name"],
    },
    handler: async (args) => {
      return await mcpCall("cap:rename", args);
    },
  },
  {
    name: "cap_lookup",
    description: "Resolve a capability name to its details (FQDN, description, usage stats)",
    category: "pml",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name to look up (display_name or alias)",
        },
      },
      required: ["name"],
    },
    handler: async (args) => {
      return await mcpCall("cap:lookup", args);
    },
  },
  {
    name: "cap_whois",
    description: "Get complete metadata for a capability by UUID, FQDN, or name (namespace:action)",
    category: "pml",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "UUID, FQDN, or display name (namespace:action) to look up",
        },
      },
      required: ["name"],
    },
    handler: async (args) => {
      // Support name (namespace:action), UUID, or FQDN
      const { name } = args as { name: string };

      // Try lookup by name first (namespace:action), fall back to whois (UUID/FQDN)
      try {
        const lookupResult = (await mcpCall("cap:lookup", { name })) as Record<string, unknown>;
        if (lookupResult && typeof lookupResult.id === "string" && !("error" in lookupResult)) {
          // Found by name, now get full whois by UUID
          return await mcpCall("cap:whois", { id: lookupResult.id });
        }
      } catch (lookupError) {
        // F7: Log lookup error before falling back to whois
        // Only expected error is "not found", other errors (network, auth) are logged
        const errorMsg = lookupError instanceof Error ? lookupError.message : String(lookupError);
        if (!errorMsg.includes("not found")) {
          console.warn(`[cap_whois] cap:lookup failed for "${name}": ${errorMsg}, trying whois directly`);
        }
      }

      // Fall back to whois directly (UUID or FQDN)
      return await mcpCall("cap:whois", { id: name });
    },
  },
  {
    name: "cap_merge",
    description:
      "Merge duplicate capabilities into one. Combines usage stats, keeps newest code. Requires identical tools_used.",
    category: "pml",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Source capability to merge FROM (name, UUID, or FQDN) - will be deleted",
        },
        target: {
          type: "string",
          description: "Target capability to merge INTO (name, UUID, or FQDN) - will be updated",
        },
        preferSourceCode: {
          type: "boolean",
          description: "If true, use source's code_snippet even if older. Default: use newest.",
        },
      },
      required: ["source", "target"],
    },
    handler: async (args) => {
      return await mcpCall("cap:merge", args);
    },
  },
];
