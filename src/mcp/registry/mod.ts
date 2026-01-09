/**
 * Registry Module
 *
 * Tool registration, lookup, and discovery.
 *
 * @module mcp/registry
 */

export { defaultRegistry, getMetaTools, ToolRegistry } from "./tool-registry.ts";

export {
  createDefaultDiscovery,
  type DiscoveredTool,
  type DiscoveryOptions,
  MCPServerDiscovery,
} from "./discovery.ts";

// Story 14.7: MCP Registry Types
export type {
  McpCatalogItem,
  McpCatalogResponse,
  McpErrorResponse,
  McpHashMismatchError,
  McpInstallInfo,
  McpListOptions,
  McpNotFoundError,
  McpRecordType,
  McpRegistryEntry,
  McpRouting,
  McpType,
  McpWarnings,
  PmlRegistryRow,
  ServerConnectionInfo,
} from "./types.ts";

// Story 14.7: MCP Registry Service
export { McpRegistryService } from "./mcp-registry.service.ts";

// Story 14.7: Hash Utilities
export {
  buildHttpHashContent,
  buildStdioHashContent,
  computeIntegrity,
  deriveEnvRequired,
  deriveMcpType,
  extractShortHash,
  validateIntegrity,
} from "./hash-utils.ts";
