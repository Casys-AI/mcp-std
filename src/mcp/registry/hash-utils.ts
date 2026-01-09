/**
 * Hash Utilities for MCP Registry (Story 14.7)
 *
 * Functions for computing integrity hashes for MCPs.
 *
 * @module mcp/registry/hash-utils
 */

import { generateFullHash, generateHash } from "../../capabilities/fqdn.ts";
import type { McpType, ServerConnectionInfo } from "./types.ts";

/**
 * Compute integrity hash for an MCP based on its type.
 *
 * - deno (capabilities/MiniTools): SHA-256 of code
 * - stdio: SHA-256 of install config (command + args + version)
 * - http: SHA-256 of proxy config (proxyTo + envRequired)
 *
 * @param _type - MCP type (for future use, content determines hash)
 * @param content - Content to hash (code, config, etc.)
 * @returns Full SHA-256 hash (64 chars)
 */
export async function computeIntegrity(
  _type: McpType,
  content: string | Record<string, unknown>,
): Promise<string> {
  const stringContent = typeof content === "string"
    ? content
    : JSON.stringify(content, Object.keys(content as object).sort());

  return await generateFullHash(stringContent);
}

/**
 * Compute short hash (4 chars) for FQDN.
 *
 * @param content - Content to hash
 * @returns 4-char hex hash
 */
export async function computeShortHash(content: string): Promise<string> {
  return await generateHash(content);
}

/**
 * Build content string for stdio MCP integrity hash.
 *
 * @param config - Server connection info
 * @returns Normalized string for hashing
 */
export function buildStdioHashContent(config: ServerConnectionInfo): string {
  const normalized = {
    command: config.command || "",
    args: config.args || [],
  };
  return JSON.stringify(normalized);
}

/**
 * Build content string for http MCP integrity hash.
 *
 * @param config - Server connection info with URL
 * @returns Normalized string for hashing
 */
export function buildHttpHashContent(config: ServerConnectionInfo): string {
  const normalized = {
    url: config.url || "",
    envRequired: config.env ? Object.keys(config.env).sort() : [],
  };
  return JSON.stringify(normalized);
}

/**
 * Derive MCP type from server connection info.
 *
 * @param config - Server connection info
 * @returns MCP type
 */
export function deriveMcpType(config: ServerConnectionInfo | null): McpType {
  if (!config) return "deno";
  if (config.url) return "http";
  if (config.command) return "stdio";
  return "deno";
}

/**
 * Derive required environment variables from config.
 *
 * @param config - Server connection info
 * @returns List of required env var names
 */
export function deriveEnvRequired(config: ServerConnectionInfo | null): string[] {
  if (!config?.env) return [];
  return Object.keys(config.env).filter((key) => {
    const value = config.env![key];
    // Filter out keys with actual values (secrets) vs placeholders
    return typeof value === "string" && (value.startsWith("${") || value === "");
  });
}

/**
 * Validate integrity hash matches expected.
 *
 * @param received - Hash received from server
 * @param expected - Hash from lockfile
 * @returns true if matches
 */
export function validateIntegrity(received: string, expected: string): boolean {
  // Compare full hashes (case-insensitive)
  return received.toLowerCase() === expected.toLowerCase();
}

/**
 * Extract short hash from full hash.
 *
 * @param fullHash - Full SHA-256 hash (64 chars)
 * @returns Short hash (4 chars)
 */
export function extractShortHash(fullHash: string): string {
  return fullHash.substring(0, 4).toLowerCase();
}
