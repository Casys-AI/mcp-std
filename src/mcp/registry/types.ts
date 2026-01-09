/**
 * MCP Registry Types (Story 14.7)
 *
 * Types for the unified `/mcp/{fqdn}` endpoint that serves
 * capabilities, MiniTools, and MCP metadata.
 *
 * @module mcp/registry/types
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * MCP execution type.
 *
 * - `deno`: TypeScript code executed in sandbox (capabilities, MiniTools)
 * - `stdio`: External process via stdin/stdout (npm packages)
 * - `http`: HTTP proxy to cloud API
 */
export type McpType = "deno" | "stdio" | "http";

/**
 * Execution routing.
 *
 * - `client`: Execute locally on user's machine
 * - `server`: Execute on pml.casys.ai cloud
 */
export type McpRouting = "client" | "server";

/**
 * Record type in pml_registry VIEW.
 */
export type McpRecordType = "mcp-tool" | "capability";

// ============================================================================
// Registry Entry
// ============================================================================

/**
 * Unified MCP registry entry returned by `/mcp/{fqdn}` endpoint.
 *
 * Contains all metadata needed to fetch, validate, and execute an MCP.
 */
export interface McpRegistryEntry {
  /** Full 5-part FQDN with hash: org.project.namespace.action.hash */
  fqdn: string;

  /** Execution type */
  type: McpType;

  /** Human-readable description */
  description: string;

  /** Where to execute: client (local) or server (cloud) */
  routing: McpRouting;

  /** Exposed tool names (colon format): ["filesystem:read_file"] */
  tools: string[];

  /** SHA-256 integrity hash (full, for lockfile) */
  integrity: string;

  /** Record type from pml_registry VIEW */
  recordType: McpRecordType;

  // === Type-specific fields ===

  /** For deno: URL to fetch TypeScript code */
  codeUrl?: string;

  /** For stdio: Installation command */
  install?: McpInstallInfo;

  /** For http: Proxy target URL */
  proxyTo?: string;

  /** Required environment variables (derived from config) */
  envRequired?: string[];

  /** Warnings about side effects */
  warnings?: McpWarnings;
}

/**
 * Installation info for stdio MCPs.
 */
export interface McpInstallInfo {
  /** Command to run (e.g., "npx", "uvx") */
  command: string;

  /** Command arguments */
  args: string[];

  /** Required environment variables */
  envRequired?: string[];
}

/**
 * Warnings about MCP side effects.
 */
export interface McpWarnings {
  /** Dotfiles that may be created */
  createsDotfiles?: string[];

  /** Network access required */
  requiresNetwork?: boolean;

  /** File system access scope */
  fsAccess?: "read" | "write" | "full";
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response for GET /mcp (catalog listing).
 */
export interface McpCatalogResponse {
  /** List of registry entries (summary) */
  items: McpCatalogItem[];

  /** Total count (for pagination) */
  total: number;

  /** Current page */
  page: number;

  /** Items per page */
  limit: number;
}

/**
 * Summary item in catalog listing.
 */
export interface McpCatalogItem {
  /** Full FQDN with hash */
  fqdn: string;

  /** Execution type */
  type: McpType;

  /** Execution routing */
  routing: McpRouting;

  /** Brief description */
  description?: string;
}

/**
 * Error response for hash mismatch.
 */
export interface McpHashMismatchError {
  error: "hash_mismatch";
  message: string;
  /** Current valid FQDN with correct hash */
  currentFqdn: string;
}

/**
 * Error response for not found.
 */
export interface McpNotFoundError {
  error: "not_found";
  message: string;
}

/**
 * Union of error responses.
 */
export type McpErrorResponse = McpHashMismatchError | McpNotFoundError;

// ============================================================================
// Query Options
// ============================================================================

/**
 * Options for listing MCPs.
 */
export interface McpListOptions {
  /** Filter by type */
  type?: McpType;

  /** Filter by routing */
  routing?: McpRouting;

  /** Filter by record type */
  recordType?: McpRecordType;

  /** Page number (1-indexed) */
  page?: number;

  /** Items per page */
  limit?: number;

  /** Search query (matches name/description) */
  search?: string;
}

// ============================================================================
// Internal Types (for service implementation)
// ============================================================================

/**
 * Raw row from pml_registry VIEW.
 */
export interface PmlRegistryRow {
  record_type: McpRecordType;
  id: string;
  name: string;
  description: string | null;
  code_url: string | null;
  routing: string | null;
  server_id: string | null;
  workflow_pattern_id: string | null;
  org: string | null;
  project: string | null;
  namespace: string | null;
  action: string | null;
}

/**
 * Server connection info from mcp_server.connection_info.
 */
export interface ServerConnectionInfo {
  type?: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}
