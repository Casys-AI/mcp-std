/**
 * MCP Server Module
 *
 * Exports server types, constants, utilities, lifecycle, and health.
 *
 * @module mcp/server
 */

// Constants
export { MCPErrorCodes, ServerDefaults, SERVER_TITLE, type MCPErrorCode } from "./constants.ts";

// Types
export {
  type GatewayServerConfig,
  type ResolvedGatewayConfig,
  type ActiveWorkflow,
  type MCPToolResponse,
  type MCPErrorResponse,
  type MCPHandlerResponse,
  type JsonRpcRequest,
  type WorkflowExecutionArgs,
  type ContinueArgs,
  type AbortArgs,
  type ReplanArgs,
  type ApprovalResponseArgs,
  type SearchToolsArgs,
  type SearchCapabilitiesArgs,
} from "./types.ts";

// Response formatters
export {
  formatMCPError,
  formatMCPSuccess,
  formatLayerComplete,
  formatWorkflowComplete,
  formatApprovalRequired,
  formatAbortConfirmation,
  formatRejectionConfirmation,
  formatReplanConfirmation,
} from "./responses.ts";

// Lifecycle management
export {
  createMCPServer,
  startStdioServer,
  stopServer,
} from "./lifecycle.ts";

// Health checks
export {
  getHealthStatus,
  handleHealth,
  handleEventsStream,
  handleDashboardRedirect,
  type HealthStatus,
} from "./health.ts";

// HTTP server
export {
  startHttpServer,
  createHttpRequestHandler,
  handleJsonRpcRequest,
  type HttpServerDependencies,
  type HttpServerState,
} from "./http.ts";
