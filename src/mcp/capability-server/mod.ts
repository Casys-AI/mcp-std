/**
 * Capability MCP Server Module
 *
 * Story 13.3: CapabilityMCPServer + Gateway
 *
 * Exposes capabilities as MCP tools, making them indistinguishable
 * from native MCP tools in Claude's tool list.
 *
 * @module mcp/capability-server
 */

// Interfaces and utilities
export type {
  CapabilityExecutor,
  CapabilityLister,
  ExecuteResult,
  ParsedToolName,
} from "./interfaces.ts";
export { parseToolName, toMCPToolName } from "./interfaces.ts";

// Server class
export { CapabilityMCPServer, type CapabilityMCPServerConfig } from "./server.ts";

// Services
export { CapabilityListerService } from "./services/capability-lister.ts";
export { CapabilityExecutorService } from "./services/capability-executor.ts";
