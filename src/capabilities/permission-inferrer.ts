/**
 * Permission Inferrer (Epic 7 - Story 7.7a)
 *
 * Automatically infers permission requirements from TypeScript code using SWC AST parser.
 * Analyzes code patterns (fetch, mcp.*, Deno.* APIs) to determine minimal permission sets
 * following the principle of least privilege.
 *
 * Permission model (simplified 2025-12-19):
 * - scope: Resource access level (metadata for audit/documentation)
 * - approvalMode: auto (works freely) or hil (requires human approval)
 *
 * Note: Worker sandbox always runs with permissions: "none".
 * These are METADATA used for validation detection, not enforcement.
 *
 * @module capabilities/permission-inferrer
 */

import { parse } from "https://deno.land/x/swc@0.2.1/mod.ts";
import { getLogger } from "../telemetry/logger.ts";
import type { PermissionConfig, PermissionSet } from "./types.ts";

const logger = getLogger("default");

// Re-export types for convenience (canonical definition in types.ts)
export type { ApprovalMode, PermissionConfig, PermissionScope, PermissionSet } from "./types.ts";

/**
 * Pattern types detected in code analysis
 */
export type PatternCategory = "network" | "filesystem" | "env" | "unknown";

/**
 * Detected pattern in code analysis
 */
export interface DetectedPattern {
  /** The pattern identifier (e.g., "fetch", "mcp.filesystem.read") */
  pattern: string;
  /** Category of the pattern */
  category: PatternCategory;
  /** Whether this is a read-only operation */
  isReadOnly: boolean;
}

/**
 * Result of permission inference
 */
export interface InferredPermissions {
  /** The determined permission set profile */
  permissionSet: PermissionSet;
  /** Confidence score (0-1) based on pattern clarity */
  confidence: number;
  /** List of detected patterns for debugging/logging */
  detectedPatterns: string[];
}

// =============================================================================
// New simplified permission model (Claude Code style: allow/deny/ask)
// =============================================================================

/**
 * Simplified permissions structure (loaded from config/mcp-permissions.json)
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

// =============================================================================
// Legacy compatibility layer (for code that still uses old API)
// =============================================================================

/**
 * Get PermissionConfig for a specific tool prefix (legacy API)
 * Maps to new allow/ask model:
 * - allow → approvalMode: "auto"
 * - ask/unknown → approvalMode: "hil"
 */
export function getToolPermissionConfig(toolPrefix: string): PermissionConfig | null {
  const requiresHil = toolRequiresHil(toolPrefix);

  // Return a PermissionConfig that maps to the new model
  return {
    scope: "mcp-standard", // Scope is now just metadata, not used for decisions
    approvalMode: requiresHil ? "hil" : "auto",
  };
}

/**
 * Filesystem read-only operations
 */
const FILESYSTEM_READ_OPS = new Set([
  "read",
  "readFile",
  "readTextFile",
  "readDir",
  "stat",
  "lstat",
  "realPath",
]);

/**
 * PermissionInferrer - Infers permission requirements from TypeScript code
 *
 * Uses SWC (Rust-based parser) to analyze code and detect I/O patterns.
 * Returns minimal permission sets based on detected patterns.
 *
 * @example
 * ```typescript
 * const inferrer = new PermissionInferrer();
 * const permissions = await inferrer.inferPermissions(`
 *   const data = await fetch("https://api.example.com/data");
 *   return data.json();
 * `);
 * // Returns:
 * // {
 * //   permissionSet: "network-api",
 * //   confidence: 0.95,
 * //   detectedPatterns: ["fetch"]
 * // }
 * ```
 */
export class PermissionInferrer {
  private configLoaded = false;

  constructor() {
    logger.debug("PermissionInferrer initialized");
  }

  /**
   * Ensure MCP permissions config is loaded
   * Called automatically on first inferPermissions() call
   */
  private async ensureConfigLoaded(): Promise<void> {
    if (!this.configLoaded) {
      await loadMcpPermissions();
      this.configLoaded = true;
    }
  }

  /**
   * Infer permission requirements from TypeScript code
   *
   * @param code TypeScript code to analyze
   * @returns Permission inference result with set, confidence, and patterns
   */
  async inferPermissions(code: string): Promise<InferredPermissions> {
    try {
      // Ensure MCP permissions config is loaded
      await this.ensureConfigLoaded();

      // Wrap code in function if not already (for valid parsing)
      const wrappedCode = this.wrapCodeIfNeeded(code);

      // Parse with SWC
      const ast = await parse(wrappedCode, {
        syntax: "typescript",
        comments: false,
        script: true,
      });

      logger.debug("Code parsed for permission inference", {
        codeLength: code.length,
      });

      // Find all I/O patterns
      const patterns = this.findPatterns(ast);

      logger.debug("Patterns detected for permissions", {
        count: patterns.length,
        patterns: patterns.map((p) => p.pattern),
      });

      // Map patterns to permission set
      const result = this.mapPatternsToPermissionSet(patterns);

      logger.debug("Permission inference result", {
        permissionSet: result.permissionSet,
        confidence: result.confidence,
        patternCount: result.detectedPatterns.length,
      });

      return result;
    } catch (error) {
      // Non-critical: return minimal with low confidence on parse errors
      logger.warn("Permission inference failed, returning minimal", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        permissionSet: "minimal",
        confidence: 0.0,
        detectedPatterns: [],
      };
    }
  }

  /**
   * Wrap code in function if needed for valid parsing
   * (Same pattern as SchemaInferrer)
   */
  private wrapCodeIfNeeded(code: string): string {
    // Check if code already contains function/class/export declarations
    if (
      code.includes("function ") ||
      code.includes("class ") ||
      code.includes("export ")
    ) {
      return code;
    }

    // Wrap in async function for valid parsing
    return `async function _agentCardsWrapper() {\n${code}\n}`;
  }

  /**
   * Find all I/O patterns in the AST
   */
  private findPatterns(
    node: unknown,
    patterns: Map<string, DetectedPattern> = new Map(),
  ): DetectedPattern[] {
    if (!node || typeof node !== "object") {
      return Array.from(patterns.values());
    }

    const n = node as Record<string, unknown>;

    // CallExpression: fetch(), Deno.readFile(), etc.
    if (n.type === "CallExpression") {
      this.handleCallExpression(n, patterns);
    }

    // MemberExpression: mcp.filesystem, Deno.env, process.env
    if (n.type === "MemberExpression") {
      this.handleMemberExpression(n, patterns);
    }

    // Recurse through AST
    for (const key of Object.keys(n)) {
      const val = n[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          this.findPatterns(item, patterns);
        }
      } else if (typeof val === "object" && val !== null) {
        this.findPatterns(val, patterns);
      }
    }

    return Array.from(patterns.values());
  }

  /**
   * Handle CallExpression nodes: fetch(), Deno.readFile(), mcp.fs.read()
   */
  private handleCallExpression(
    n: Record<string, unknown>,
    patterns: Map<string, DetectedPattern>,
  ): void {
    const callee = n.callee as Record<string, unknown> | undefined;

    if (!callee) return;

    // Direct function call: fetch()
    if (callee.type === "Identifier") {
      const name = callee.value as string;

      if (name === "fetch") {
        patterns.set("fetch", {
          pattern: "fetch",
          category: "network",
          isReadOnly: false,
        });
      }
    }

    // Member expression call: Deno.readFile(), mcp.filesystem.read()
    if (callee.type === "MemberExpression") {
      const chainParts = this.extractMemberChain(callee);

      if (chainParts.length >= 2) {
        const pattern = chainParts.join(".");
        const detected = this.classifyPattern(chainParts);

        if (detected) {
          patterns.set(pattern, detected);
        }
      }
    }
  }

  /**
   * Handle MemberExpression nodes for property access patterns
   */
  private handleMemberExpression(
    n: Record<string, unknown>,
    patterns: Map<string, DetectedPattern>,
  ): void {
    const chainParts = this.extractMemberChain(n);

    // Detect Deno.env or process.env access
    if (chainParts.length >= 2) {
      const root = chainParts[0];
      const prop = chainParts[1];

      if ((root === "Deno" && prop === "env") || (root === "process" && prop === "env")) {
        const pattern = `${root}.${prop}`;
        patterns.set(pattern, {
          pattern,
          category: "env",
          isReadOnly: true, // Reading env vars
        });
      }
    }
  }

  /**
   * Extract member expression chain as array of strings
   * e.g., mcp.filesystem.read → ["mcp", "filesystem", "read"]
   */
  private extractMemberChain(
    node: Record<string, unknown>,
    parts: string[] = [],
  ): string[] {
    if (node.type === "Identifier") {
      return [node.value as string, ...parts];
    }

    if (node.type === "MemberExpression") {
      const obj = node.object as Record<string, unknown>;
      const prop = node.property as Record<string, unknown>;

      if (prop?.type === "Identifier" && typeof prop?.value === "string") {
        parts.unshift(prop.value);
      }

      return this.extractMemberChain(obj, parts);
    }

    return parts;
  }

  /**
   * Classify a member chain into a detected pattern
   */
  private classifyPattern(chainParts: string[]): DetectedPattern | null {
    const root = chainParts[0];

    // Deno.* patterns
    if (root === "Deno") {
      return this.classifyDenoPattern(chainParts);
    }

    // mcp.* patterns
    if (root === "mcp") {
      return this.classifyMCPPattern(chainParts);
    }

    return null;
  }

  /**
   * Classify Deno.* patterns
   */
  private classifyDenoPattern(chainParts: string[]): DetectedPattern | null {
    if (chainParts.length < 2) return null;

    const api = chainParts[1];
    const pattern = chainParts.join(".");

    // Network patterns
    if (api === "connect") {
      return {
        pattern,
        category: "network",
        isReadOnly: false,
      };
    }

    // Filesystem patterns
    if (
      api === "readFile" || api === "readTextFile" || api === "readDir" ||
      api === "stat" || api === "lstat" || api === "realPath"
    ) {
      return {
        pattern,
        category: "filesystem",
        isReadOnly: true,
      };
    }

    if (
      api === "writeFile" || api === "writeTextFile" || api === "mkdir" ||
      api === "remove" || api === "rename" || api === "copyFile"
    ) {
      return {
        pattern,
        category: "filesystem",
        isReadOnly: false,
      };
    }

    // Env pattern
    if (api === "env") {
      return {
        pattern,
        category: "env",
        isReadOnly: true,
      };
    }

    return null;
  }

  /**
   * Classify mcp.* patterns
   */
  private classifyMCPPattern(chainParts: string[]): DetectedPattern | null {
    if (chainParts.length < 2) return null;

    const toolPrefix = chainParts[1];
    const operation = chainParts.length > 2 ? chainParts[2] : undefined;
    const pattern = chainParts.join(".");

    // Determine category based on tool prefix name
    let category: PatternCategory;
    let isReadOnly = false;

    // Network tools
    const networkTools = ["github", "slack", "tavily", "api", "fetch", "exa", "network"];
    // Filesystem tools
    const filesystemTools = ["filesystem", "fs", "git", "archive", "media"];

    if (networkTools.includes(toolPrefix)) {
      category = "network";
    } else if (filesystemTools.includes(toolPrefix)) {
      category = "filesystem";
      // For filesystem tools, check if operation is read-only
      if ((toolPrefix === "filesystem" || toolPrefix === "fs") && operation) {
        isReadOnly = FILESYSTEM_READ_OPS.has(operation);
      }
    } else {
      // Other tools (json, math, docker, etc.) → unknown category for inference
      category = "unknown";
    }

    return {
      pattern,
      category,
      isReadOnly,
    };
  }

  /**
   * Map detected patterns to a permission set with confidence score
   */
  private mapPatternsToPermissionSet(patterns: DetectedPattern[]): InferredPermissions {
    const patternStrings = patterns.map((p) => p.pattern);

    // No patterns detected → minimal with high confidence
    if (patterns.length === 0) {
      return {
        permissionSet: "minimal",
        confidence: 0.95,
        detectedPatterns: [],
      };
    }

    // Categorize patterns
    const hasNetwork = patterns.some((p) => p.category === "network");
    const hasFilesystem = patterns.some((p) => p.category === "filesystem");
    const hasEnv = patterns.some((p) => p.category === "env");
    const hasUnknown = patterns.some((p) => p.category === "unknown");

    // All filesystem read-only
    const allFsReadOnly = patterns
      .filter((p) => p.category === "filesystem")
      .every((p) => p.isReadOnly);

    // Single category patterns → higher confidence
    const categoryCount = [hasNetwork, hasFilesystem, hasEnv, hasUnknown].filter(Boolean).length;

    // Mixed patterns or unknown → mcp-standard with lower confidence
    if (hasUnknown || categoryCount > 1) {
      return {
        permissionSet: "mcp-standard",
        confidence: hasUnknown ? 0.50 : 0.70,
        detectedPatterns: patternStrings,
      };
    }

    // Network only
    if (hasNetwork && !hasFilesystem && !hasEnv) {
      return {
        permissionSet: "network-api",
        confidence: patterns.length > 1 ? 0.95 : 0.90,
        detectedPatterns: patternStrings,
      };
    }

    // Filesystem only
    if (hasFilesystem && !hasNetwork && !hasEnv) {
      const permissionSet = allFsReadOnly ? "readonly" : "filesystem";
      return {
        permissionSet,
        confidence: patterns.length > 1 ? 0.95 : 0.90,
        detectedPatterns: patternStrings,
      };
    }

    // Env only → minimal (env access doesn't escalate to higher permissions)
    if (hasEnv && !hasNetwork && !hasFilesystem) {
      return {
        permissionSet: "mcp-standard", // Env access needs mcp-standard
        confidence: 0.80,
        detectedPatterns: patternStrings,
      };
    }

    // Fallback to mcp-standard
    return {
      permissionSet: "mcp-standard",
      confidence: 0.70,
      detectedPatterns: patternStrings,
    };
  }
}
