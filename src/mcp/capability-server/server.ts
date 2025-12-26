/**
 * Capability MCP Server
 *
 * Story 13.3: CapabilityMCPServer + Gateway
 *
 * Virtual MCP server exposing capabilities as MCP tools.
 * Integrates with Gateway via handleListTools and handleCallTool methods.
 *
 * Architecture:
 * - Uses CapabilityListerService for tool listing
 * - Uses CapabilityExecutorService for tool execution
 * - Records usage metrics via CapabilityRegistry
 *
 * @module mcp/capability-server/server
 */

import type { MCPTool } from "../types.ts";
import type { ExecuteResult } from "./interfaces.ts";
import { parseToolName } from "./interfaces.ts";
import { CapabilityListerService } from "./services/capability-lister.ts";
import { CapabilityExecutorService } from "./services/capability-executor.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../capabilities/capability-registry.ts";
import type { WorkerBridge } from "../../sandbox/worker-bridge.ts";
import { getLogger } from "../../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * CapabilityMCPServer configuration
 */
export interface CapabilityMCPServerConfig {
  /** Enable usage tracking (default: true) */
  trackUsage?: boolean;
}

/**
 * CapabilityMCPServer
 *
 * Virtual MCP server that exposes capabilities as tools.
 * Claude sees capability tools alongside native MCP tools in the tool list.
 *
 * Usage with Gateway:
 * 1. Gateway calls handleListTools() to get capability tools
 * 2. Gateway merges with native MCP tools
 * 3. When tool is called, Gateway routes to handleCallTool()
 *
 * @example
 * ```typescript
 * const capServer = new CapabilityMCPServer(
 *   capabilityStore,
 *   capabilityRegistry,
 *   workerBridge,
 * );
 *
 * // In Gateway:
 * const capTools = await capServer.handleListTools();
 * const allTools = [...nativeTools, ...capTools];
 *
 * // When capability tool is called:
 * if (toolName.startsWith("mcp__")) {
 *   return await capServer.handleCallTool(toolName, args);
 * }
 * ```
 */
export class CapabilityMCPServer {
  private lister: CapabilityListerService;
  private executor: CapabilityExecutorService;
  private trackUsage: boolean;

  constructor(
    capabilityStore: CapabilityStore,
    private capabilityRegistry: CapabilityRegistry,
    workerBridge: WorkerBridge,
    config?: CapabilityMCPServerConfig,
  ) {
    this.lister = new CapabilityListerService(capabilityStore);
    this.executor = new CapabilityExecutorService(
      capabilityStore,
      capabilityRegistry,
      workerBridge,
    );
    this.trackUsage = config?.trackUsage ?? true;

    logger.info("CapabilityMCPServer initialized", {
      trackUsage: this.trackUsage,
    });
  }

  /**
   * Handle tools/list request (AC1, AC4, AC7)
   *
   * Returns all capabilities as MCP tools with:
   * - name: `mcp__<namespace>__<action>` format
   * - inputSchema: from capability's parameters_schema
   * - description: capability description or fallback
   *
   * @returns List of MCP tools representing capabilities
   */
  async handleListTools(): Promise<MCPTool[]> {
    logger.debug("CapabilityMCPServer.handleListTools called");

    const tools = await this.lister.listTools();

    logger.info("Listed capability tools", {
      count: tools.length,
    });

    return tools;
  }

  /**
   * Handle tools/call request (AC2, AC3, AC5)
   *
   * Executes capability and records usage metrics.
   *
   * @param toolName - MCP tool name (e.g., `mcp__code__analyze`)
   * @param args - Tool arguments
   * @returns Execution result
   */
  async handleCallTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ExecuteResult> {
    const startTime = Date.now();

    logger.debug("CapabilityMCPServer.handleCallTool", {
      toolName,
      argKeys: Object.keys(args),
    });

    try {
      const result = await this.executor.execute(toolName, args);

      // AC5: Record usage metrics
      if (this.trackUsage) {
        await this.recordUsage(toolName, result);
      }

      return result;
    } catch (error) {
      // Defensive error boundary - catch any unexpected errors from executor
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Unexpected error in handleCallTool", {
        toolName,
        error: errorMessage,
      });

      return {
        success: false,
        data: null,
        error: `Execution error: ${errorMessage}`,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Record usage metrics for a capability (AC5)
   *
   * Updates usage_count, success_count, and latency in capability_records.
   *
   * @param toolName - MCP tool name
   * @param result - Execution result
   */
  private async recordUsage(
    toolName: string,
    result: ExecuteResult,
  ): Promise<void> {
    try {
      const parsed = parseToolName(toolName);
      if (!parsed) return;

      const displayName = `${parsed.namespace}:${parsed.action}`;
      const record = await this.capabilityRegistry.resolveByName(
        displayName,
        { org: "local", project: "default" },
      );

      if (record) {
        await this.capabilityRegistry.recordUsage(
          record.id,
          result.success,
          result.latencyMs,
        );

        logger.debug("Recorded capability usage", {
          fqdn: record.id,
          success: result.success,
          latencyMs: result.latencyMs,
        });
      }
    } catch (error) {
      // Don't fail the request if usage tracking fails
      logger.warn("Failed to record capability usage", {
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if a tool name is a capability tool
   *
   * Used by Gateway to route tool calls.
   *
   * @param toolName - Tool name to check
   * @returns true if this is a capability tool (mcp__ prefix)
   */
  isCapabilityTool(toolName: string): boolean {
    return toolName.startsWith("mcp__");
  }
}
