/**
 * MCP (Model Context Protocol) Module
 *
 * Provides MCP server/client implementation with:
 * - Gateway server for multi-server orchestration
 * - Client for connecting to MCP servers
 * - Server discovery and configuration
 * - Adaptive threshold management
 *
 * @module mcp
 */

// Gateway server
export { PMLGatewayServer } from "./gateway-server.ts";
// Legacy exports for backward compatibility (deprecated)
export { PMLGatewayServer as CasysPmlGatewayServer } from "./gateway-server.ts";
export { PMLGatewayServer as AgentCardsGatewayServer } from "./gateway-server.ts";
export type { GatewayServerConfig } from "./gateway-server.ts";

// MCP Client
export { MCPClient } from "./client.ts";

// Smithery MCP Client (HTTP Streamable transport)
export { SmitheryMCPClient } from "./smithery-client.ts";

// Smithery registry loader
export { SmitheryLoader } from "./smithery-loader.ts";

// Server discovery
export { MCPServerDiscovery } from "./discovery.ts";

// Gateway handler (internal)
export { GatewayHandler } from "./gateway-handler.ts";

// Adaptive threshold management
export { AdaptiveThresholdManager } from "./adaptive-threshold.ts";

// Schema extraction
export { SchemaExtractor } from "./schema-extractor.ts";

// Workflow DAG storage
export {
  cleanupExpiredDAGs,
  deleteWorkflowDAG,
  extendWorkflowDAGExpiration,
  getWorkflowDAG,
  getWorkflowDAGRecord,
  saveWorkflowDAG,
  updateWorkflowDAG,
} from "./workflow-dag-store.ts";
export type { WorkflowDAGRecord } from "./workflow-dag-store.ts";

// Types
export type {
  CodeExecutionRequest,
  CodeExecutionResponse,
  MCPClientBase,
  MCPConfig,
  MCPServer,
  MCPTool,
  SmitheryServerConfig,
} from "./types.ts";
