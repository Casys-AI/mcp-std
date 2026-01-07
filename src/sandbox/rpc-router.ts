/**
 * RPC Router - Routes tool calls to appropriate handlers
 *
 * Handles routing of RPC calls from sandbox worker to:
 * - cap_* tools (via CapModule)
 * - $cap:<uuid> capability references
 * - Named capabilities (namespace:action)
 * - MCP servers (fallback)
 *
 * Extracted from worker-bridge.ts for separation of concerns.
 *
 * @module sandbox/rpc-router
 */

import type { MCPClientBase } from "../mcp/types.ts";
import type { CapabilityStore } from "../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../capabilities/capability-registry.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type { JsonValue } from "../capabilities/types.ts";
import type { ToolDefinition } from "./types.ts";
import { getCapModule } from "../../lib/std/cap.ts";
import { getCapabilityFqdn } from "../capabilities/capability-registry.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Result from routing an RPC call
 */
export interface RpcRouteResult {
  success: boolean;
  result?: JsonValue;
  error?: string;
  /** Route type for logging */
  routeType: "cap_module" | "cap_uuid" | "capability" | "mcp_server";
}

/**
 * Configuration for RpcRouter
 */
export interface RpcRouterConfig {
  mcpClients: Map<string, MCPClientBase>;
  capabilityStore?: CapabilityStore;
  capabilityRegistry?: CapabilityRegistry;
  graphRAG?: GraphRAGEngine;
  timeout: number;
}

/**
 * Minimal interface for WorkerBridge execution (avoids circular dependency)
 */
export interface WorkerBridgeExecutor {
  execute: (
    code: string,
    toolDefinitions: ToolDefinition[],
    context?: Record<string, unknown>,
  ) => Promise<{ success: boolean; result?: unknown; error?: unknown; executionTimeMs: number }>;
  cleanup: () => void;
}

/**
 * Factory for creating new WorkerBridge instances
 */
export type WorkerBridgeFactory = (config: {
  timeout: number;
  capabilityStore?: CapabilityStore;
  graphRAG?: GraphRAGEngine;
  capabilityRegistry?: CapabilityRegistry;
}) => WorkerBridgeExecutor;

/**
 * RpcRouter - Routes tool calls to appropriate handlers
 *
 * @example
 * ```typescript
 * const router = new RpcRouter(config, bridgeFactory);
 * const result = await router.route("std", "cap_list", {});
 * ```
 */
export class RpcRouter {
  constructor(
    private config: RpcRouterConfig,
    private bridgeFactory: WorkerBridgeFactory,
  ) {}

  /**
   * Route an RPC call to the appropriate handler
   *
   * @param server - Server namespace (e.g., "std", "$cap", "filesystem")
   * @param tool - Tool name (e.g., "cap_list", "uuid", "read_file")
   * @param args - Tool arguments
   * @returns Route result with success, result/error, and route type
   */
  async route(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<RpcRouteResult> {
    // 1. Handle cap_* tools via CapModule
    if (server === "std" && tool.startsWith("cap_")) {
      return this.routeToCapModule(tool, args);
    }

    // 2. Handle $cap:<uuid> capability references
    if (server === "$cap") {
      return this.routeToCapUuid(tool, args);
    }

    // 3. Try routing to named capability first
    const capabilityResult = await this.routeToCapability(server, tool, args);
    if (capabilityResult) {
      return capabilityResult;
    }

    // 4. Fallback to MCP server
    return this.routeToMcpServer(server, tool, args);
  }

  /**
   * Route cap_* tools to CapModule
   */
  private async routeToCapModule(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<RpcRouteResult> {
    const capModule = getCapModule();
    const capToolName = "cap:" + tool.slice(4); // "cap_list" → "cap:list"

    logger.debug("Routing cap tool to CapModule", { tool, capToolName });

    const capResult = await capModule.call(capToolName, args);
    return {
      success: !capResult.isError,
      result: {
        content: capResult.content,
        isError: capResult.isError,
      } as JsonValue,
      routeType: "cap_module",
    };
  }

  /**
   * Route $cap:<uuid> to capability by UUID
   */
  private async routeToCapUuid(
    uuid: string,
    args: Record<string, unknown>,
  ): Promise<RpcRouteResult> {
    if (!this.config.capabilityRegistry || !this.config.capabilityStore) {
      return {
        success: false,
        error: `Capability UUID routing requires capabilityRegistry and capabilityStore`,
        routeType: "cap_uuid",
      };
    }

    const record = await this.config.capabilityRegistry.getById(uuid);
    if (!record || !record.workflowPatternId) {
      return {
        success: false,
        error: `Capability UUID not found: ${uuid}`,
        routeType: "cap_uuid",
      };
    }

    const pattern = await this.config.capabilityStore.findById(record.workflowPatternId);
    if (!pattern?.codeSnippet) {
      return {
        success: false,
        error: `Capability pattern not found for UUID: ${uuid}`,
        routeType: "cap_uuid",
      };
    }

    logger.info("Routing $cap:<uuid> to capability", { uuid, id: record.id });

    return this.executeCapability(pattern.codeSnippet, args, record.id, "cap_uuid");
  }

  /**
   * Try routing to a named capability (namespace:action)
   * @returns null if no capability found, result otherwise
   */
  private async routeToCapability(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<RpcRouteResult | null> {
    if (!this.config.capabilityRegistry || !this.config.capabilityStore) {
      return null;
    }

    const capabilityName = `${server}:${tool}`;
    const record = await this.config.capabilityRegistry.resolveByName(
      capabilityName,
      { org: "local", project: "default" },
    );

    if (!record || !record.workflowPatternId) {
      return null;
    }

    const pattern = await this.config.capabilityStore.findById(record.workflowPatternId);
    if (!pattern?.codeSnippet) {
      return null;
    }

    logger.info("Routing to capability (unified)", {
      server,
      tool,
      fqdn: getCapabilityFqdn(record),
    });

    return this.executeCapability(pattern.codeSnippet, args, record.id, "capability");
  }

  /**
   * Route to MCP server (fallback)
   */
  private async routeToMcpServer(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<RpcRouteResult> {
    const client = this.config.mcpClients.get(server);
    if (!client) {
      return {
        success: false,
        error: `MCP server "${server}" not connected and no capability "${server}:${tool}" found`,
        routeType: "mcp_server",
      };
    }

    const result = await client.callTool(tool, args);

    // Check for MCP soft errors (isError: true)
    const mcpResult = result as { isError?: boolean; content?: Array<{ text?: string }> } | null;
    const isToolError = mcpResult?.isError === true;
    const errorMessage = isToolError && mcpResult?.content?.[0]?.text
      ? mcpResult.content[0].text
      : undefined;

    return {
      success: !isToolError,
      result: result as JsonValue,
      error: errorMessage,
      routeType: "mcp_server",
    };
  }

  /**
   * Execute a capability via new WorkerBridge instance
   */
  private async executeCapability(
    code: string,
    args: Record<string, unknown>,
    capabilityId: string,
    routeType: "cap_uuid" | "capability",
  ): Promise<RpcRouteResult> {
    const bridge = this.bridgeFactory({
      timeout: this.config.timeout,
      capabilityStore: this.config.capabilityStore,
      graphRAG: this.config.graphRAG,
      capabilityRegistry: this.config.capabilityRegistry,
    });

    try {
      const capResult = await bridge.execute(
        code,
        [],
        { ...args, __capability_id: capabilityId },
      );

      return {
        success: capResult.success,
        result: capResult.result as JsonValue,
        routeType,
      };
    } finally {
      bridge.cleanup();
    }
  }
}
