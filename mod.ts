/**
 * Standard library tools - aggregated exports
 *
 * System tools:
 * - docker.ts     - Container/image management
 * - git.ts        - Repository operations
 * - network.ts    - HTTP, DNS, connectivity
 * - process.ts    - Process management
 * - archive.ts    - Compression (tar, zip)
 * - ssh.ts        - Remote execution
 * - kubernetes.ts - K8s cluster management
 * - database.ts   - SQL/NoSQL access
 * - media.ts      - Audio/video/image
 * - cloud.ts      - AWS, GCP, systemd
 * - sysinfo.ts    - System information
 * - packages.ts   - npm, pip, apt, brew
 * - text.ts       - sed, awk, jq, sort
 *
 * Data tools:
 * - algo.ts       - Sorting, searching algorithms
 * - collections.ts- Array/set/map operations
 * - crypto.ts     - Hashing, encoding, encryption
 * - datetime.ts   - Date/time manipulation
 * - format.ts     - Formatting (numbers, bytes, etc)
 * - http.ts       - HTTP client operations
 * - json.ts       - JSON manipulation
 * - math.ts       - Mathematical operations
 * - transform.ts  - Data transformations (CSV, XML)
 * - validation.ts - Data validation
 * - vfs.ts        - Virtual filesystem
 *
 * New tools:
 * - string.ts     - String manipulation
 * - path.ts       - Path utilities
 * - faker.ts      - Mock data generation
 * - color.ts      - Color manipulation
 * - geo.ts        - Geographic calculations
 * - qrcode.ts     - QR/barcode generation
 * - resilience.ts - Retry/rate limiting
 * - schema.ts     - Schema inference
 * - diff.ts       - Text diff/comparison
 *
 * Agent tools (MCP Sampling):
 * - agent.ts      - LLM-powered decision/analysis via sampling
 *
 * Capability management (MCP Server):
 * - cap.ts        - cap:list, cap:rename, cap:lookup, cap:whois
 *
 * @module lib/std/mod
 */

export { type MiniTool, runCommand } from "./src/common.ts";
export type { MiniToolHandler, MiniToolResult, ToolCategory } from "./src/types.ts";

// System tools
export { dockerTools } from "./src/docker.ts";
export { gitTools } from "./src/git.ts";
export { networkTools } from "./src/network.ts";
export { processTools } from "./src/process.ts";
export { archiveTools } from "./src/archive.ts";
export { sshTools } from "./src/ssh.ts";
export { kubernetesTools } from "./src/kubernetes.ts";
export { databaseTools } from "./src/database.ts";
export { closePgliteConnection, pgliteTools } from "./src/pglite.ts";
export { mediaTools } from "./src/media.ts";
export { cloudTools } from "./src/cloud.ts";
export { sysinfoTools } from "./src/sysinfo.ts";
export { packagesTools } from "./src/packages.ts";
export { textTools } from "./src/text.ts";

// Data tools
export { algoTools } from "./src/algo.ts";
export { collectionsTools } from "./src/collections.ts";
export { cryptoTools } from "./src/crypto.ts";
export { datetimeTools } from "./src/datetime.ts";
export { formatTools } from "./src/format.ts";
export { httpTools } from "./src/http.ts";
export { jsonTools } from "./src/json.ts";
export { mathTools } from "./src/math.ts";
export { transformTools } from "./src/transform.ts";
export { validationTools } from "./src/validation.ts";
export { vfsTools } from "./src/vfs.ts";

// New tools
export { stringTools } from "./src/string.ts";
export { pathTools } from "./src/path.ts";
export { fakerTools } from "./src/faker.ts";
export { colorTools } from "./src/color.ts";
export { geoTools } from "./src/geo.ts";
export { qrcodeTools } from "./src/qrcode.ts";
export { resilienceTools } from "./src/resilience.ts";
export { schemaTools } from "./src/schema.ts";
export { diffTools } from "./src/diff.ts";

// Agent tools (MCP Sampling)
export { agentTools, createAgenticSamplingClient, setSamplingClient } from "./src/agent.ts";

// Capability management (MCP HTTP Client + types)
// Note: CapModule and PmlStdServer have been moved to src/mcp/handlers/cap-handler.ts
// This module now exports only the HTTP client and types for standalone package use
export { pmlTools } from "./src/cap.ts";
export type {
  CapListItem,
  CapListOptions,
  CapListResponse,
  CapLookupOptions,
  CapLookupResponse,
  CapMergeOptions,
  CapMergeResponse,
  CapRenameOptions,
  CapRenameResponse,
  CapTool,
  CapToolResult,
  CapWhoisOptions,
  CapWhoisResponse,
  OnCapabilityMerged,
} from "./src/cap.ts";

// Python execution tools
export { pythonTools } from "./src/python.ts";

// Legacy tools (backward compat)
export { dataTools } from "./src/data.ts";
export { stateTools } from "./src/state.ts";
export { compareTools } from "./src/compare.ts";

// Utility tools
export { utilTools } from "./src/util.ts";

// Imports for combined export
import { dockerTools } from "./src/docker.ts";
import { gitTools } from "./src/git.ts";
import { networkTools } from "./src/network.ts";
import { processTools } from "./src/process.ts";
import { archiveTools } from "./src/archive.ts";
import { sshTools } from "./src/ssh.ts";
import { kubernetesTools } from "./src/kubernetes.ts";
import { databaseTools } from "./src/database.ts";
import { pgliteTools } from "./src/pglite.ts";
import { mediaTools } from "./src/media.ts";
import { cloudTools } from "./src/cloud.ts";
import { sysinfoTools } from "./src/sysinfo.ts";
import { packagesTools } from "./src/packages.ts";
import { textTools } from "./src/text.ts";
import { algoTools } from "./src/algo.ts";
import { collectionsTools } from "./src/collections.ts";
import { cryptoTools } from "./src/crypto.ts";
import { datetimeTools } from "./src/datetime.ts";
import { formatTools } from "./src/format.ts";
import { httpTools } from "./src/http.ts";
import { jsonTools } from "./src/json.ts";
import { mathTools } from "./src/math.ts";
import { transformTools } from "./src/transform.ts";
import { validationTools } from "./src/validation.ts";
import { vfsTools } from "./src/vfs.ts";
import { stringTools } from "./src/string.ts";
import { pathTools } from "./src/path.ts";
import { fakerTools } from "./src/faker.ts";
import { colorTools } from "./src/color.ts";
import { geoTools } from "./src/geo.ts";
import { qrcodeTools } from "./src/qrcode.ts";
import { resilienceTools } from "./src/resilience.ts";
import { schemaTools } from "./src/schema.ts";
import { diffTools } from "./src/diff.ts";
// Agent imports
import { agentTools } from "./src/agent.ts";
// PML imports (capability management)
import { pmlTools } from "./src/cap.ts";
// Python imports
import { pythonTools } from "./src/python.ts";
// Legacy imports
import { dataTools } from "./src/data.ts";
import { stateTools } from "./src/state.ts";
import { compareTools } from "./src/compare.ts";
// Utility imports
import { utilTools } from "./src/util.ts";
import type { MiniTool as MiniToolType } from "./src/types.ts";

/** All system tools combined */
export const systemTools = [
  // System tools
  ...dockerTools,
  ...gitTools,
  ...networkTools,
  ...processTools,
  ...archiveTools,
  ...sshTools,
  ...kubernetesTools,
  ...databaseTools,
  ...pgliteTools,
  ...mediaTools,
  ...cloudTools,
  ...sysinfoTools,
  ...packagesTools,
  ...textTools,
  // Data tools
  ...algoTools,
  ...collectionsTools,
  ...cryptoTools,
  ...datetimeTools,
  ...formatTools,
  ...httpTools,
  ...jsonTools,
  ...mathTools,
  ...transformTools,
  ...validationTools,
  ...vfsTools,
  // New tools
  ...stringTools,
  ...pathTools,
  ...fakerTools,
  ...colorTools,
  ...geoTools,
  ...qrcodeTools,
  ...resilienceTools,
  ...schemaTools,
  ...diffTools,
  // Agent tools
  ...agentTools,
  // PML tools (capability management)
  ...pmlTools,
  // Python tools
  ...pythonTools,
  // Legacy tools
  ...dataTools,
  ...stateTools,
  ...compareTools,
  // Utility tools
  ...utilTools,
];

/** Alias for backward compatibility */
export const allTools = systemTools;

/** Tools organized by category */
export const toolsByCategory: Record<string, MiniToolType[]> = {
  text: textTools,
  json: jsonTools,
  math: mathTools,
  datetime: datetimeTools,
  crypto: cryptoTools,
  collections: collectionsTools,
  vfs: vfsTools,
  data: dataTools,
  http: httpTools,
  validation: validationTools,
  format: formatTools,
  transform: transformTools,
  state: stateTools,
  compare: compareTools,
  algo: algoTools,
  color: colorTools,
  network: networkTools,
  string: stringTools,
  path: pathTools,
  faker: fakerTools,
  geo: geoTools,
  qrcode: qrcodeTools,
  resilience: resilienceTools,
  schema: schemaTools,
  diff: diffTools,
  // System tools
  docker: dockerTools,
  git: gitTools,
  process: processTools,
  archive: archiveTools,
  ssh: sshTools,
  kubernetes: kubernetesTools,
  database: databaseTools,
  pglite: pgliteTools,
  media: mediaTools,
  cloud: cloudTools,
  sysinfo: sysinfoTools,
  packages: packagesTools,
  // Utility tools
  util: utilTools,
  // Agent tools (MCP Sampling)
  agent: agentTools,
  // PML tools (capability management)
  pml: pmlTools,
  // Python execution
  python: pythonTools,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): MiniToolType[] {
  return toolsByCategory[category] || [];
}

/**
 * Get a specific tool by name
 */
export function getToolByName(name: string): MiniToolType | undefined {
  return allTools.find((t) => t.name === name);
}

/**
 * Get all available categories
 */
export function getCategories(): string[] {
  return Object.keys(toolsByCategory);
}

// ============================================================================
// MiniToolsClient Class
// ============================================================================

export interface MiniToolsClientOptions {
  categories?: string[];
}

/**
 * Client for executing mini-tools
 */
export class MiniToolsClient {
  private tools: MiniToolType[];

  constructor(options?: MiniToolsClientOptions) {
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  /**
   * List available tools
   */
  listTools(): MiniToolType[] {
    return this.tools;
  }

  /**
   * Convert tools to MCP format
   */
  toMCPFormat(): Array<
    { name: string; description: string; inputSchema: Record<string, unknown> }
  > {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.handler(args);
  }

  /**
   * Get tool count
   */
  get count(): number {
    return this.tools.length;
  }
}

/** Default client instance with all tools */
export const defaultClient: MiniToolsClient = new MiniToolsClient();
