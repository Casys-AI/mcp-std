/**
 * Execute Code Use Case
 *
 * Executes TypeScript code in a secure sandbox with injected MCP tools.
 *
 * @example
 * ```typescript
 * const useCase = new ExecuteCodeUseCase(sandbox, contextBuilder, eventBus);
 * const result = await useCase.execute({
 *   code: "return mcp.math.sum({ a: 1, b: 2 });",
 *   intent: "calculate sum"
 * });
 * ```
 *
 * @module application/use-cases/code/execute-code
 */

import * as log from "@std/log";
import type { IEventBus } from "../../../domain/interfaces/event-bus.ts";
import type { UseCaseResult } from "../shared/types.ts";
import type {
  ExecuteCodeRequest,
  ExecuteCodeResult,
} from "./types.ts";

/**
 * Sandbox executor interface
 */
export interface ISandboxExecutor {
  execute(
    code: string,
    options: SandboxExecuteOptions,
  ): Promise<SandboxExecuteResult>;
}

/**
 * Sandbox execution options
 */
export interface SandboxExecuteOptions {
  timeout?: number;
  memoryLimit?: number;
  allowedReadPaths?: string[];
  context?: Record<string, unknown>;
  injectedTools?: ToolDefinition[];
}

/**
 * Sandbox execution result
 */
export interface SandboxExecuteResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executionTimeMs: number;
  logs?: string[];
}

/**
 * Tool definition for injection
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Context builder interface for tool discovery
 */
export interface IContextBuilder {
  discoverTools(intent: string): Promise<ToolDefinition[]>;
}

/**
 * Use case for executing code in sandbox
 */
export class ExecuteCodeUseCase {
  constructor(
    private readonly sandbox: ISandboxExecutor,
    private readonly contextBuilder: IContextBuilder,
    private readonly eventBus: IEventBus,
  ) {}

  /**
   * Execute the code execution use case
   */
  async execute(
    request: ExecuteCodeRequest,
  ): Promise<UseCaseResult<ExecuteCodeResult>> {
    const { code, intent, context = {}, sandboxConfig = {} } = request;

    // Validate request
    if (!code || code.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "MISSING_CODE",
          message: "Missing required parameter: code",
        },
      };
    }

    log.debug(
      `ExecuteCodeUseCase: code length=${code.length}, intent="${intent ?? "none"}"`,
    );

    const startTime = Date.now();

    try {
      // Discover tools based on intent
      let injectedTools: ToolDefinition[] = [];
      if (intent) {
        injectedTools = await this.contextBuilder.discoverTools(intent);
        log.debug(`Discovered ${injectedTools.length} tools for intent`);
      }

      // Emit start event
      this.eventBus.emit({
        type: "capability.start" as const,
        source: "execute-code-use-case",
        payload: {
          type: "code_execution",
          codeLength: code.length,
          intent,
          toolCount: injectedTools.length,
        },
      });

      // Execute in sandbox
      const result = await this.sandbox.execute(code, {
        timeout: sandboxConfig.timeout ?? 30000,
        memoryLimit: sandboxConfig.memoryLimit ?? 256,
        allowedReadPaths: sandboxConfig.allowedReadPaths ?? [],
        context,
        injectedTools,
      });

      const executionTimeMs = Date.now() - startTime;

      // Emit end event
      this.eventBus.emit({
        type: "capability.end" as const,
        source: "execute-code-use-case",
        payload: {
          type: "code_execution",
          success: result.success,
          executionTimeMs,
          error: result.error,
        },
      });

      if (!result.success) {
        return {
          success: false,
          error: {
            code: "EXECUTION_FAILED",
            message: result.error ?? "Code execution failed",
          },
          data: {
            output: null,
            executionTimeMs,
            success: false,
            error: result.error,
            logs: result.logs,
            injectedTools: injectedTools.map((t) => t.name),
          },
        };
      }

      log.debug(`Code executed successfully in ${executionTimeMs}ms`);

      return {
        success: true,
        data: {
          output: result.output,
          executionTimeMs,
          success: true,
          logs: result.logs,
          injectedTools: injectedTools.map((t) => t.name),
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      log.error(`Code execution error: ${error}`);

      // Emit error event
      this.eventBus.emit({
        type: "capability.end" as const,
        source: "execute-code-use-case",
        payload: {
          type: "code_execution",
          success: false,
          executionTimeMs,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
