/**
 * Capability Executor Service
 *
 * Story 13.3: CapabilityMCPServer + Gateway
 *
 * Executes capabilities by their MCP tool name via sandbox.
 * Implements CapabilityExecutor interface following Repository pattern.
 *
 * @module mcp/capability-server/services/capability-executor
 */

import type { CapabilityExecutor, ExecuteResult } from "../interfaces.ts";
import { parseToolName } from "../interfaces.ts";
import type { CapabilityStore } from "../../../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../../capabilities/capability-registry.ts";
import type { WorkerBridge } from "../../../sandbox/worker-bridge.ts";
import { getLogger } from "../../../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Default scope for capability resolution
 */
const DEFAULT_SCOPE = { org: "local", project: "default" };

/**
 * CapabilityExecutorService
 *
 * Executes capabilities by their MCP tool name via WorkerBridge sandbox.
 *
 * Flow:
 * 1. Parse tool name (mcp__namespace__action)
 * 2. Resolve capability via CapabilityRegistry
 * 3. Get code from workflow_pattern via CapabilityStore
 * 4. Execute via WorkerBridge sandbox
 *
 * @example
 * ```typescript
 * const executor = new CapabilityExecutorService(
 *   capabilityStore,
 *   capabilityRegistry,
 *   workerBridge,
 * );
 * const result = await executor.execute("mcp__code__analyze", { file: "src/main.ts" });
 * ```
 */
export class CapabilityExecutorService implements CapabilityExecutor {
  constructor(
    private capabilityStore: CapabilityStore,
    private capabilityRegistry: CapabilityRegistry,
    private workerBridge: WorkerBridge,
  ) {}

  /**
   * Execute a capability by MCP tool name (AC2, AC3)
   *
   * - AC2: Executes capability code via sandbox
   * - AC3: Returns error response for non-existent capability
   *
   * @param toolName - MCP tool name (e.g., `mcp__code__analyze`)
   * @param args - Tool arguments
   * @returns Execution result with success/error and latency
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ExecuteResult> {
    const startTime = Date.now();

    // 1. Parse tool name
    const parsed = parseToolName(toolName);
    if (!parsed) {
      logger.warn("Invalid tool name format", { toolName });
      return {
        success: false,
        data: null,
        error: `Invalid tool name format: ${toolName}`,
        latencyMs: Date.now() - startTime,
      };
    }

    const { namespace, action } = parsed;
    const displayName = `${namespace}:${action}`;

    logger.debug("Executing capability", {
      toolName,
      namespace,
      action,
      displayName,
    });

    // 2. Resolve capability via registry
    const record = await this.capabilityRegistry.resolveByName(
      displayName,
      DEFAULT_SCOPE,
    );

    if (!record) {
      logger.warn("Capability not found", { displayName, toolName });
      return {
        success: false,
        data: null,
        error: `Capability not found: ${toolName}`,
        latencyMs: Date.now() - startTime,
      };
    }

    // 3. Get code from workflow_pattern via FK
    // The capability_records table has a workflowPatternId FK to workflow_pattern.
    // The codeSnippet is stored in workflow_pattern, not in capability_records.
    // This separation allows multiple capability aliases to share the same code.
    if (!record.workflowPatternId) {
      logger.warn("Capability has no workflow pattern", {
        displayName,
        recordId: record.id,
      });
      return {
        success: false,
        data: null,
        error: `Capability has no code: ${toolName}`,
        latencyMs: Date.now() - startTime,
      };
    }

    const pattern = await this.capabilityStore.findById(record.workflowPatternId);
    if (!pattern?.codeSnippet) {
      logger.warn("Workflow pattern has no code", {
        displayName,
        patternId: record.workflowPatternId,
      });
      return {
        success: false,
        data: null,
        error: `Capability has no code: ${toolName}`,
        latencyMs: Date.now() - startTime,
      };
    }

    // 4. Execute via sandbox
    try {
      // Build minimal context for execution
      const context = {
        ...args,
        __capability_fqdn: record.id,
        __capability_name: displayName,
      };

      // Execute code in sandbox
      // Note: Empty toolDefinitions for now - capability code should be self-contained
      // Future enhancement: inject tools the capability uses from dag_structure.tools_used
      const result = await this.workerBridge.execute(
        pattern.codeSnippet,
        [], // toolDefinitions - capability may have embedded tools or be self-contained
        context,
        undefined, // capabilityContext
        undefined, // parentTraceId
      );

      const latencyMs = Date.now() - startTime;

      if (!result.success) {
        // Extract error message from StructuredError or use default
        const errorMessage = result.error?.message || "Execution failed";
        logger.warn("Capability execution failed", {
          toolName,
          error: errorMessage,
          latencyMs,
        });
        return {
          success: false,
          data: null,
          error: errorMessage,
          latencyMs,
        };
      }

      logger.info("Capability executed successfully", {
        toolName,
        latencyMs,
      });

      return {
        success: true,
        data: result.result,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("Capability execution error", {
        toolName,
        error: errorMessage,
        latencyMs,
      });

      return {
        success: false,
        data: null,
        error: errorMessage,
        latencyMs,
      };
    }
  }
}
