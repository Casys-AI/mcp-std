/**
 * Tool Context Builder - MCP Tools Injection System
 *
 * Provides secure injection of MCP tools into the sandbox execution context.
 * Uses message passing (Option 2 from architecture spike) instead of function
 * serialization to maintain sandbox isolation while providing access to tools.
 *
 * Key Features:
 * - Vector search to identify relevant tools only (top-k filtering)
 * - TypeScript type definitions for injected tools (autocomplete support)
 * - Message-passing based tool invocation (sandbox ↔ parent process)
 * - Comprehensive error propagation with stack traces
 * - Security: No eval(), no Function() constructor
 *
 * @module sandbox/context-builder
 */

import type { MCPClientBase } from "../mcp/types.ts";
import type { SearchResult, VectorSearch } from "../vector/search.ts";
import type { ToolDefinition } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Tool wrapper function signature
 * Wraps MCP tool calls as async functions for sandbox consumption
 */
export type ToolFunction = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Tool context: Maps server/tool names to wrapped functions
 * Example: { github: { listCommits: async (args) => ... }, filesystem: { read: async (args) => ... } }
 */
export interface ToolContext {
  [serverKey: string]: {
    [toolName: string]: ToolFunction;
  };
}

/**
 * Tool metadata for type generation
 */
interface ToolMetadata {
  serverId: string;
  toolName: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Builder for injecting MCP tools into sandbox execution context
 *
 * Orchestrates:
 * 1. Vector search to find relevant tools
 * 2. MCP client wrapper generation
 * 3. TypeScript type definition generation
 * 4. Tool context assembly for injection
 */
export class ContextBuilder {
  private vectorSearch: VectorSearch | null = null;
  private mcpClients: Map<string, MCPClientBase> = new Map();
  private typeDefinitionCache: Map<string, string> = new Map();

  constructor(
    vectorSearch?: VectorSearch,
    mcpClients?: Map<string, MCPClientBase>,
  ) {
    this.vectorSearch = vectorSearch || null;
    this.mcpClients = mcpClients || new Map();

    logger.debug("ContextBuilder initialized", {
      hasVectorSearch: !!vectorSearch,
      mcpClientsCount: mcpClients?.size ?? 0,
    });
  }

  /**
   * Set MCP clients manager
   */
  setMCPClients(clients: Map<string, MCPClientBase>): void {
    this.mcpClients = clients;
    this.typeDefinitionCache.clear();
  }

  /**
   * Set vector search engine
   */
  setVectorSearch(search: VectorSearch): void {
    this.vectorSearch = search;
  }

  /**
   * Build tool context for injection into sandbox
   *
   * Process:
   * 1. Use vector search to identify top-k relevant tools (if intent provided)
   * 2. Load MCP clients for identified tools
   * 3. Generate wrappers for each tool
   * 4. Assemble context object for injection
   *
   * @param intent Natural language query for tool discovery (e.g., "read a file")
   * @param topK Maximum number of tools to inject (default: 5)
   * @returns Tool context ready for sandbox injection
   */
  async buildContext(
    intent?: string,
    topK: number = 5,
  ): Promise<ToolContext> {
    const startTime = performance.now();
    const context: ToolContext = {};

    try {
      // Step 1: Identify relevant tools via vector search
      let relevantTools: SearchResult[] = [];
      if (intent && this.vectorSearch) {
        logger.info(`Building context for intent: "${intent}" (topK=${topK})`);
        relevantTools = await this.vectorSearch.searchTools(intent, topK, 0.6);
        logger.info(`Found ${relevantTools.length} relevant tools`);
      } else {
        logger.info("No intent provided, building empty context");
      }

      // Step 2: Group tools by server
      const toolsByServer = new Map<string, ToolMetadata[]>();
      for (const searchResult of relevantTools) {
        if (!toolsByServer.has(searchResult.serverId)) {
          toolsByServer.set(searchResult.serverId, []);
        }
        toolsByServer.get(searchResult.serverId)!.push({
          serverId: searchResult.serverId,
          toolName: searchResult.toolName,
          description: searchResult.schema.description,
          inputSchema: searchResult.schema.inputSchema as Record<
            string,
            unknown
          >,
        });
      }

      // Step 3: Build wrappers for each server
      for (const [serverId, tools] of toolsByServer.entries()) {
        const client = this.mcpClients.get(serverId);
        if (!client) {
          logger.warn(`MCP client not found for server: ${serverId}`);
          continue;
        }

        const serverToolContext = wrapMCPClient(client, tools);
        if (Object.keys(serverToolContext).length > 0) {
          context[serverId] = serverToolContext;
        }

        logger.debug(`Injected ${Object.keys(serverToolContext).length} tools for ${serverId}`);
      }

      const elapsed = performance.now() - startTime;
      logger.info(
        `Context built successfully (${elapsed.toFixed(1)}ms, ${
          Object.keys(context).length
        } servers)`,
      );

      return context;
    } catch (error) {
      logger.error("Failed to build context", {
        error: error instanceof Error ? error.message : String(error),
        intent,
      });
      throw error;
    }
  }

  /**
   * Build tool context from search results (Story 3.4 helper)
   *
   * Convenience method that directly accepts SearchResults from vector search
   * instead of requiring an intent string.
   *
   * @param searchResults Results from vector search (already filtered)
   * @returns Tool context ready for sandbox injection
   */
  async buildContextFromSearchResults(
    searchResults: SearchResult[],
  ): Promise<ToolContext> {
    const startTime = performance.now();
    const context: ToolContext = {};

    try {
      logger.info(`Building context from ${searchResults.length} search results`);

      // Group tools by server
      const toolsByServer = new Map<string, ToolMetadata[]>();
      for (const searchResult of searchResults) {
        if (!toolsByServer.has(searchResult.serverId)) {
          toolsByServer.set(searchResult.serverId, []);
        }
        toolsByServer.get(searchResult.serverId)!.push({
          serverId: searchResult.serverId,
          toolName: searchResult.toolName,
          description: searchResult.schema.description,
          inputSchema: searchResult.schema.inputSchema as Record<
            string,
            unknown
          >,
        });
      }

      // Build wrappers for each server
      for (const [serverId, tools] of toolsByServer.entries()) {
        const client = this.mcpClients.get(serverId);
        if (!client) {
          logger.warn(`MCP client not found for server: ${serverId}`);
          continue;
        }

        const serverToolContext = wrapMCPClient(client, tools);
        if (Object.keys(serverToolContext).length > 0) {
          context[serverId] = serverToolContext;
        }

        logger.debug(`Injected ${Object.keys(serverToolContext).length} tools for ${serverId}`);
      }

      const elapsed = performance.now() - startTime;
      logger.info(
        `Context built successfully (${elapsed.toFixed(1)}ms, ${
          Object.keys(context).length
        } servers)`,
      );

      return context;
    } catch (error) {
      logger.error("Failed to build context from search results", {
        error: error instanceof Error ? error.message : String(error),
        resultsCount: searchResults.length,
      });
      throw error;
    }
  }

  /**
   * Generate TypeScript type definitions for tools
   *
   * @param tools Tools to generate types for
   * @returns TypeScript type definition code
   */
  generateTypeDefinitions(tools: ToolMetadata[]): string {
    const lines: string[] = [
      "// Auto-generated tool types",
      "",
    ];

    for (const tool of tools) {
      const cacheKey = `${tool.serverId}:${tool.toolName}`;

      if (this.typeDefinitionCache.has(cacheKey)) {
        lines.push(this.typeDefinitionCache.get(cacheKey)!);
        continue;
      }

      const typeDefinition = generateTypeFromSchema(
        tool.toolName,
        tool.inputSchema,
      );
      lines.push(typeDefinition);
      this.typeDefinitionCache.set(cacheKey, typeDefinition);
    }

    return lines.join("\n");
  }

  /**
   * Clear type definition cache
   */
  clearTypeCache(): void {
    this.typeDefinitionCache.clear();
  }

  /**
   * Build serializable tool definitions for Worker RPC bridge (Story 7.1b)
   *
   * Converts SearchResults to ToolDefinition objects that can be serialized
   * and sent to the Worker. The Worker uses these to generate tool proxies.
   *
   * @param searchResults Results from vector search
   * @returns Array of serializable tool definitions
   */
  buildToolDefinitions(searchResults: SearchResult[]): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];

    for (const result of searchResults) {
      definitions.push({
        server: result.serverId,
        name: result.toolName,
        description: result.schema.description || "",
        inputSchema: result.schema.inputSchema as Record<string, unknown> || {},
      });
    }

    logger.debug(`Built ${definitions.length} tool definitions for Worker`, {
      servers: [...new Set(definitions.map((d) => d.server))],
    });

    return definitions;
  }
}

/**
 * Security error class for invalid tool names
 */
export class InvalidToolNameError extends Error {
  readonly toolName: string;

  constructor(toolName: string, reason: string) {
    super(`Invalid tool name '${toolName}': ${reason}`);
    this.name = "InvalidToolNameError";
    this.toolName = toolName;
    Object.setPrototypeOf(this, InvalidToolNameError.prototype);
  }
}

/**
 * Validate tool name against security constraints
 *
 * Prevents prototype pollution attacks by rejecting dangerous property names.
 * Enforces whitelist pattern: alphanumeric, underscores, hyphens only.
 *
 * @param toolName Tool name to validate
 * @throws InvalidToolNameError if tool name is invalid
 */
function validateToolName(toolName: string): void {
  // Check for empty or very long names first
  if (toolName.length === 0) {
    throw new InvalidToolNameError(toolName, "Tool name cannot be empty");
  }

  if (toolName.length > 100) {
    throw new InvalidToolNameError(
      toolName,
      "Tool name is too long (max 100 characters)",
    );
  }

  // List of dangerous property names that could cause prototype pollution
  const DANGEROUS_NAMES = [
    "__proto__",
    "constructor",
    "prototype",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
  ];

  // Check for dangerous property names (case-insensitive)
  const lowerName = toolName.toLowerCase();
  if (DANGEROUS_NAMES.some((dangerous) => lowerName.includes(dangerous))) {
    throw new InvalidToolNameError(
      toolName,
      "Tool name contains dangerous property name that could cause prototype pollution",
    );
  }

  // Enforce whitelist pattern: alphanumeric, underscore, hyphen only
  const VALID_PATTERN = /^[a-z0-9_-]+$/i;
  if (!VALID_PATTERN.test(toolName)) {
    throw new InvalidToolNameError(
      toolName,
      "Tool name must contain only alphanumeric characters, underscores, and hyphens",
    );
  }
}

// Story 7.1b: Tracing is now handled natively in WorkerBridge (RPC bridge)
// The wrapToolCall(), setTracingEnabled(), isTracingEnabled() functions have been removed
// See: src/sandbox/worker-bridge.ts for native tracing implementation

/**
 * Wrap MCP client tools as TypeScript functions
 *
 * Creates wrapper functions that:
 * - Match tool names (converting snake_case to camelCase)
 * - Accept typed arguments
 * - Return tool results asynchronously
 * - Propagate errors as exceptions
 * - Validate tool names for security (prevent prototype pollution)
 * Note: Story 7.1b moved tracing to WorkerBridge (native RPC tracing)
 *
 * Security: No function serialization, no eval - just simple function objects
 *
 * @param client MCP client with available tools
 * @param specificTools Optional: Only wrap specific tools (default: all)
 * @returns Object with tool functions
 * @throws InvalidToolNameError if any tool name is invalid
 */
export function wrapMCPClient(
  client: MCPClientBase,
  specificTools?: ToolMetadata[],
): { [key: string]: ToolFunction } {
  const wrapped: { [key: string]: ToolFunction } = {};

  // Get list of tools to wrap
  const toolsToWrap = specificTools ? specificTools.map((t) => t.toolName) : []; // If specificTools provided, use those; otherwise empty for now

  if (toolsToWrap.length === 0 && !specificTools) {
    // No tools specified - would need to query client, but we don't have schema info here
    // This is handled at the caller level where we have SearchResult metadata
    return wrapped;
  }

  // Create wrapper for each tool
  for (const toolName of toolsToWrap) {
    // Validate tool name for security (prevent prototype pollution)
    validateToolName(toolName);

    // Convert snake_case tool names to camelCase for JavaScript API
    const methodName = snakeToCamel(toolName);

    // Create base tool function
    const baseFn = async (args: Record<string, unknown>): Promise<unknown> => {
      try {
        logger.debug(`Calling tool: ${client.serverId}:${toolName}`, {
          argsKeys: Object.keys(args),
        });

        // Route through existing MCPClient infrastructure
        // This ensures rate limiting, health checks, and error handling
        const result = await client.callTool(toolName, args);

        logger.debug(`Tool call succeeded: ${client.serverId}:${toolName}`);
        return result;
      } catch (error) {
        logger.error(`Tool call failed: ${client.serverId}:${toolName}`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Propagate error as exception for sandbox error handling
        throw new MCPToolError(
          `${client.serverId}:${toolName}`,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    // Story 7.1b: Tracing now handled natively in WorkerBridge
    // wrapMCPClient is kept for backward compatibility but tracing is removed
    wrapped[methodName] = baseFn;
  }

  return wrapped;
}

/**
 * JSON representation of MCPToolError
 */
export interface MCPToolErrorJSON {
  type: string;
  toolName: string;
  message: string;
  originalMessage: string;
  timestamp: number;
  stack?: string;
}

/**
 * Error class for tool invocation failures
 * Preserves error information while making it safe for serialization
 */
export class MCPToolError extends Error {
  readonly toolName: string;
  readonly originalError: Error;
  readonly timestamp: number;

  constructor(toolName: string, originalError: Error) {
    super(`Tool error in '${toolName}': ${originalError.message}`);
    this.name = "MCPToolError";
    this.toolName = toolName;
    this.originalError = originalError;
    this.timestamp = Date.now();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MCPToolError.prototype);
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): MCPToolErrorJSON {
    return {
      type: this.name,
      toolName: this.toolName,
      message: this.message,
      originalMessage: this.originalError.message,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Generate TypeScript interface from JSON Schema
 * Supports: string, number, boolean, object, array
 * Handles required fields and optional fields
 *
 * @param toolName Tool name (used for interface naming)
 * @param schema JSON Schema object
 * @returns TypeScript interface definition
 */
function generateTypeFromSchema(
  toolName: string,
  schema?: Record<string, unknown>,
): string {
  const interfaceName = camelToTitle(toolName) + "Args";

  if (!schema || schema.type !== "object") {
    // Fallback for non-object or missing schema
    return `interface ${interfaceName} { [key: string]: unknown }`;
  }

  const properties = (schema.properties as Record<string, unknown>) || {};
  const required = (schema.required as string[]) || [];

  const fieldLines: string[] = [];
  for (const [propName, propSchema] of Object.entries(properties)) {
    const isRequired = required.includes(propName);
    const typeStr = getTypeString(propSchema as Record<string, unknown>);
    const optional = isRequired ? "" : "?";
    fieldLines.push(`  ${propName}${optional}: ${typeStr};`);
  }

  const body = fieldLines.length > 0 ? fieldLines.join("\n") : "  [key: string]: unknown;";

  return `interface ${interfaceName} {\n${body}\n}`;
}

/**
 * Get TypeScript type string from JSON Schema property
 */
function getTypeString(schema: Record<string, unknown>): string {
  const type = schema.type;

  if (Array.isArray(type)) {
    // Union type
    return type
      .map((t) => mapJsonTypeToTS(t as string))
      .filter((t) => t !== "null")
      .join(" | ");
  }

  return mapJsonTypeToTS(type as string);
}

/**
 * Map JSON Schema type to TypeScript type
 */
function mapJsonTypeToTS(jsonType: string): string {
  switch (jsonType) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "unknown[]";
    case "object":
      return "Record<string, unknown>";
    case "null":
      return "null";
    default:
      return "unknown";
  }
}

/**
 * Convert snake_case and kebab-case to camelCase
 * Examples:
 *   list_commits → listCommits
 *   list-pull-requests → listPullRequests
 *   get_repo_123 → getRepo123
 */
function snakeToCamel(str: string): string {
  return str.replace(/[_-]([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert camelCase to TitleCase
 * Example: listCommits → ListCommits
 */
function camelToTitle(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}
