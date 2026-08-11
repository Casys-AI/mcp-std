/**
 * MCP Standard Library
 *
 * A comprehensive collection of MCP tools for AI agents.
 *
 * @module lib/std
 */

// Re-export client and tools
export {
  // Tools
  allTools,
  // Client
  defaultClient,
  getCategories,
  getToolByName,
  getToolsByCategory,
  MiniToolsClient,
  MiniToolsMCP,
  miniToolsMCP,
  toolsByCategory,
} from "./src/client.ts";

// Re-export client types
export type {
  MCPClientBase,
  MCPTool,
  MCPToolMeta,
  MCPToolWireFormat,
  McpUiToolMeta,
  MiniToolsClientOptions,
} from "./src/client.ts";

// Re-export types
export type {
  MiniTool,
  MiniToolHandler,
  MiniToolResult,
  ToolCategory,
} from "./src/client.ts";

// Re-export individual tool arrays for direct access
export {
  // Agent tools
  agentTools,
  // Data tools
  algoTools,
  // System tools
  archiveTools,
  closePgliteConnection,
  cloudTools,
  collectionsTools,
  // New tools
  colorTools,
  compareTools,
  createAgenticSamplingClient,
  cryptoTools,
  databaseTools,
  dataTools,
  datetimeTools,
  devtoolsTools,
  diffTools,
  dockerTools,
  encodingTools,
  fakerTools,
  formatTools,
  geoTools,
  gitTools,
  httpTools,
  iptoolsTools,
  jsonTools,
  kubernetesTools,
  mathTools,
  mediaTools,
  networkTools,
  packagesTools,
  pathTools,
  pgliteTools,
  processTools,
  // Python tools
  pythonTools,
  qrcodeTools,
  resilienceTools,
  // Common utilities
  runCommand,
  schemaTools,
  securityTools,
  setSamplingClient,
  sshTools,
  stateTools,
  stringTools,
  sysinfoTools,
  textanalysisTools,
  textTools,
  timezoneTools,
  transformTools,
  utilTools,
  validationTools,
  vfsTools,
} from "./src/tools/mod.ts";

/** Alias for backward compatibility */
export { allTools as systemTools } from "./src/tools/mod.ts";
