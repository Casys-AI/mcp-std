/**
 * Permission Manager (simplified)
 *
 * Simple allow/ask/deny permission model (Claude Code style).
 * Loaded from config/mcp-permissions.json.
 *
 * Note: Worker sandbox always runs with permissions: "none".
 * These permissions control HIL (Human-in-the-Loop) requirements only.
 *
 * @module capabilities/permission-inferrer
 */

import { getLogger } from "../telemetry/logger.ts";
import type { PermissionConfig } from "./types.ts";

const logger = getLogger("default");

// Re-export types for convenience
export type { PermissionConfig } from "./types.ts";

/**
 * Permissions structure (loaded from config/mcp-permissions.json)
 */
interface McpPermissionsJson {
  permissions: {
    allow: string[];
    deny: string[];
    ask: string[];
  };
}

/**
 * Cached permissions from JSON config
 */
let PERMISSIONS_CACHE: McpPermissionsJson | null = null;

/**
 * Default permissions if config not found
 */
const DEFAULT_PERMISSIONS: McpPermissionsJson = {
  permissions: {
    allow: [
      "json:*", "math:*", "datetime:*", "crypto:*", "collections:*",
      "validation:*", "format:*", "transform:*", "string:*", "path:*",
    ],
    deny: [],
    ask: [
      "process:*", "ssh:*", "database:*", "cloud:*", "packages:*",
      "kubernetes:*", "docker:*",
    ],
  },
};

/**
 * Load permissions from JSON config file
 */
async function loadPermissionsJson(): Promise<McpPermissionsJson> {
  if (PERMISSIONS_CACHE !== null) {
    return PERMISSIONS_CACHE;
  }

  const configPaths = [
    "./config/mcp-permissions.json",
    "../config/mcp-permissions.json",
    "../../config/mcp-permissions.json",
  ];

  for (const configPath of configPaths) {
    try {
      const content = await Deno.readTextFile(configPath);
      PERMISSIONS_CACHE = JSON.parse(content) as McpPermissionsJson;
      logger.debug("MCP permissions loaded from JSON config", {
        path: configPath,
        allowCount: PERMISSIONS_CACHE.permissions.allow.length,
        denyCount: PERMISSIONS_CACHE.permissions.deny.length,
        askCount: PERMISSIONS_CACHE.permissions.ask.length,
      });
      return PERMISSIONS_CACHE;
    } catch {
      // Try next path
    }
  }

  logger.debug("MCP permissions config not found, using defaults");
  PERMISSIONS_CACHE = DEFAULT_PERMISSIONS;
  return PERMISSIONS_CACHE;
}

/**
 * Get cached permissions (sync)
 */
function getPermissions(): McpPermissionsJson {
  return PERMISSIONS_CACHE ?? DEFAULT_PERMISSIONS;
}

/**
 * Check if a tool matches a pattern (supports wildcards)
 * e.g., "filesystem:read" matches "filesystem:*"
 */
function matchesPattern(toolId: string, pattern: string): boolean {
  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -2);
    return toolId.startsWith(prefix + ":") || toolId === prefix;
  }
  return toolId === pattern;
}

/**
 * Check if tool is in a permission list
 */
function isInList(toolId: string, list: string[]): boolean {
  // Extract prefix (e.g., "filesystem" from "filesystem:read_file")
  const prefix = toolId.split(":")[0];

  return list.some(pattern =>
    matchesPattern(toolId, pattern) || matchesPattern(prefix, pattern)
  );
}

/**
 * Check if a tool is explicitly allowed (no HIL needed)
 */
export function isToolAllowed(toolId: string): boolean {
  const perms = getPermissions();
  return isInList(toolId, perms.permissions.allow);
}

/**
 * Check if a tool is explicitly denied (blocked)
 */
export function isToolDenied(toolId: string): boolean {
  const perms = getPermissions();
  return isInList(toolId, perms.permissions.deny);
}

/**
 * Check if a tool requires HIL (Human-in-the-Loop) approval
 * Returns true if tool is in 'ask' list OR if tool is unknown (not in any list)
 */
export function toolRequiresHil(toolId: string): boolean {
  const perms = getPermissions();

  // Explicitly in ask list
  if (isInList(toolId, perms.permissions.ask)) {
    return true;
  }

  // Unknown tool (not in allow, deny, or ask) → requires HIL for safety
  if (!isInList(toolId, perms.permissions.allow) &&
      !isInList(toolId, perms.permissions.deny)) {
    return true;
  }

  return false;
}

/**
 * Force reload of MCP permissions config
 */
export function reloadMcpPermissions(): void {
  PERMISSIONS_CACHE = null;
}

/**
 * Initialize MCP permissions by loading from config file
 */
export async function initMcpPermissions(): Promise<void> {
  await loadPermissionsJson();
}

/**
 * Get PermissionConfig for a specific tool prefix (legacy API)
 * Maps to new allow/ask model:
 * - allow → approvalMode: "auto"
 * - ask/unknown → approvalMode: "hil"
 */
export function getToolPermissionConfig(toolPrefix: string): PermissionConfig | null {
  const requiresHil = toolRequiresHil(toolPrefix);

  return {
    scope: "mcp-standard",
    approvalMode: requiresHil ? "hil" : "auto",
  };
}
