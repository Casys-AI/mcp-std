/**
 * Casys PML - Public API Exports
 *
 * This module exports the public API for Casys PML.
 *
 * Note: The CLI entry point (main) is not exported here.
 * Use `deno run --allow-all jsr:@casys/mcp-gateway` to run the CLI.
 *
 * @module mod
 */

// MCP Gateway Server
export { PMLGatewayServer } from "./src/mcp/gateway-server.ts";
// Legacy exports for backward compatibility (deprecated)
export { PMLGatewayServer as CasysPmlGatewayServer } from "./src/mcp/gateway-server.ts";
export { PMLGatewayServer as AgentCardsGatewayServer } from "./src/mcp/gateway-server.ts";
export type { GatewayServerConfig } from "./src/mcp/gateway-server.ts";
export { MCPClient } from "./src/mcp/client.ts";
export { MCPServerDiscovery } from "./src/mcp/discovery.ts";
export type {
  CodeExecutionRequest,
  CodeExecutionResponse,
  MCPConfig,
  MCPServer,
  MCPTool,
} from "./src/mcp/types.ts";

// Sandbox executor for secure code execution
export { DenoSandboxExecutor } from "./src/sandbox/executor.ts";
export type {
  ErrorType,
  ExecutionResult,
  SandboxConfig,
  StructuredError,
} from "./src/sandbox/types.ts";

// PII Detection & Tokenization (Story 3.6)
export { detectAndTokenize, PIIDetector, TokenizationManager } from "./src/sandbox/pii-detector.ts";
export type { PIIConfig, PIIMatch, PIIType } from "./src/sandbox/pii-detector.ts";

// Code Execution Cache (Story 3.7)
export { CodeExecutionCache, generateCacheKey } from "./src/sandbox/cache.ts";
export type { CacheConfig, CacheEntry, CacheStats } from "./src/sandbox/cache.ts";

// Tool context builder for MCP tool injection
export {
  ContextBuilder,
  InvalidToolNameError,
  MCPToolError,
  wrapMCPClient,
} from "./src/sandbox/context-builder.ts";
export type { ToolContext, ToolFunction } from "./src/sandbox/context-builder.ts";

// DAG Execution with Adaptive Feedback Loops (Epic 2.5)
export { ParallelExecutor } from "./src/dag/executor.ts";
export { ControlledExecutor } from "./src/dag/controlled-executor.ts";
export { CheckpointManager } from "./src/dag/checkpoint-manager.ts";
export type {
  Checkpoint,
  Command,
  DAGExecutionResult,
  ExecutionEvent,
  ExecutorConfig,
  TaskError,
  TaskResult,
  ToolExecutor,
} from "./src/dag/types.ts";
export {
  contextReducer,
  createInitialState,
  decisionsReducer,
  getStateSnapshot,
  messagesReducer,
  tasksReducer,
  updateState,
  validateStateInvariants,
} from "./src/dag/state.ts";
export type { Decision, Message, StateUpdate, WorkflowState } from "./src/dag/state.ts";
export { EventStream } from "./src/dag/event-stream.ts";
export type { EventStreamStats } from "./src/dag/event-stream.ts";
export { AsyncQueue, CommandQueue, isValidCommand } from "./src/dag/command-queue.ts";

// Database components
export { createDefaultClient } from "./src/db/client.ts";
export { getAllMigrations, MigrationRunner } from "./src/db/migrations.ts";

// Vector search and embeddings
export { EmbeddingModel } from "./src/vector/embeddings.ts";
export { VectorSearch } from "./src/vector/search.ts";

// GraphRAG engine
export { GraphRAGEngine } from "./src/graphrag/graph-engine.ts";
export { DAGSuggester } from "./src/graphrag/dag-suggester.ts";
export type {
  DAGStructure,
  GraphStats,
  SuggestedDAG,
  Task,
  WorkflowIntent,
} from "./src/graphrag/types.ts";
