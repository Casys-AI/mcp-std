/**
 * DI Adapters Module
 *
 * Adapters that wrap existing implementations to work with DI tokens.
 *
 * @module infrastructure/di/adapters
 */

// Phase 2.1: Core adapters
export { GraphEngineAdapter } from "./graph-engine-adapter.ts";
export { CapabilityRepositoryAdapter } from "./capability-repository-adapter.ts";
export { MCPClientRegistryAdapter } from "./mcp-client-registry-adapter.ts";

// Phase 3.2: Code analyzer
export { CodeAnalyzerAdapter } from "./code-analyzer-adapter.ts";

// Phase 3.1: Execute adapters (DAGSuggester, SHGAT, Workflow, etc.)
export * from "./execute/mod.ts";
