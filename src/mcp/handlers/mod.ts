/**
 * MCP Handlers Module
 *
 * Exports all MCP tool handlers for use by the gateway server.
 *
 * @module mcp/handlers
 */

export { handleSearchCapabilities, handleSearchTools } from "./search-handler.ts";
export { type DiscoverArgs, handleDiscover } from "./discover-handler.ts";
export { type CodeExecutionDependencies, handleExecuteCode } from "./code-execution-handler.ts";

// Phase 3.1: Execute handler facade + Use Cases
export { ExecuteHandlerFacade, type ExecuteRequest } from "./execute-handler-facade.ts";

// Phase 3.2: Discover handler facade (performance optimization)
export { DiscoverHandlerFacade, type DiscoverHandlerFacadeDeps } from "./discover-handler-facade.ts";

export {
  handleAbort,
  handleApprovalResponse,
  handleContinue,
  handleReplan,
  handleWorkflowExecution,
  processGeneratorUntilPause,
  type WorkflowHandlerDependencies,
} from "./workflow-handler.ts";
