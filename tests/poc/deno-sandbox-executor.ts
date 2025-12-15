/**
 * POC: Deno Sandbox Executor
 *
 * Demonstrates secure code execution in isolated Deno subprocess with:
 * - Explicit permission whitelisting
 * - Timeout enforcement
 * - Memory limits
 * - Error capturing
 */

export interface SandboxConfig {
  timeout?: number; // Milliseconds (default: 30000)
  memoryLimit?: number; // MB (default: 512)
  allowedReadPaths?: string[]; // Allowed read paths (default: none)
}

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: {
    type: "SyntaxError" | "RuntimeError" | "TimeoutError" | "MemoryError" | "PermissionError";
    message: string;
    stack?: string;
  };
  executionTimeMs: number;
  memoryUsedMb?: number;
}

/**
 * Deno Sandbox Executor (POC)
 *
 * Executes TypeScript code in isolated Deno subprocess with strict permissions.
 */
export class DenoSandboxExecutor {
  private config: Required<SandboxConfig>;

  constructor(config?: SandboxConfig) {
    this.config = {
      timeout: config?.timeout ?? 30000, // 30s default
      memoryLimit: config?.memoryLimit ?? 512, // 512MB default
      allowedReadPaths: config?.allowedReadPaths ?? [],
    };
  }

  /**
   * Execute TypeScript code in sandbox
   *
   * @param code - TypeScript code to execute
   * @returns Execution result with output or error
   */
  async execute(code: string): Promise<ExecutionResult> {
    const startTime = performance.now();
    let tempFile: string | null = null;

    try {
      // 1. Wrap user code in execution wrapper
      const wrappedCode = this.wrapCode(code);

      // 2. Build Deno command with strict permissions
      const { command, tempFilePath } = this.buildCommand(wrappedCode);
      tempFile = tempFilePath;

      // 3. Execute with timeout
      const result = await this.executeWithTimeout(command);

      const executionTime = performance.now() - startTime;

      return {
        success: true,
        result: result.output,
        executionTimeMs: executionTime,
        memoryUsedMb: result.memoryUsed,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;

      return {
        success: false,
        error: this.parseError(error),
        executionTimeMs: executionTime,
      };
    } finally {
      // Cleanup temp file
      if (tempFile) {
        try {
          Deno.removeSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Wrap user code in execution wrapper
   *
   * Wrapper:
   * - Captures return value
   * - Serializes to JSON
   * - Handles async code
   */
  private wrapCode(code: string): string {
    return `
(async () => {
  try {
    // User code
    const __result = await (async () => {
      ${code}
    })();

    // Serialize result
    const __serialized = JSON.stringify({
      success: true,
      result: __result,
    });

    console.log("__SANDBOX_RESULT__:" + __serialized);
  } catch (error) {
    // Capture error
    const __serialized = JSON.stringify({
      success: false,
      error: {
        type: error.constructor.name,
        message: error.message,
        stack: error.stack,
      },
    });

    console.log("__SANDBOX_RESULT__:" + __serialized);
  }
})();
`;
  }

  /**
   * Build Deno command with strict permissions
   */
  private buildCommand(code: string): { command: Deno.Command; tempFilePath: string } {
    // Create temp file for code (deno eval doesn't support all permission flags)
    const tempFile = Deno.makeTempFileSync({ suffix: ".ts" });
    Deno.writeTextFileSync(tempFile, code);

    // Build permission flags
    const permissions: string[] = [];

    // Memory limit
    permissions.push(`--v8-flags=--max-old-space-size=${this.config.memoryLimit}`);

    // Read permissions (whitelist only)
    if (this.config.allowedReadPaths.length > 0) {
      // Allow temp file + user-specified paths
      const readPaths = [tempFile, ...this.config.allowedReadPaths].join(",");
      permissions.push(`--allow-read=${readPaths}`);
    } else {
      // Only allow reading the temp file itself
      permissions.push(`--allow-read=${tempFile}`);
    }

    // Deny all other permissions explicitly
    permissions.push("--deny-write");
    permissions.push("--deny-net");
    permissions.push("--deny-run");
    permissions.push("--deny-ffi");
    permissions.push("--deny-env");

    // Build command
    const command = new Deno.Command("deno", {
      args: ["run", ...permissions, tempFile],
      stdout: "piped",
      stderr: "piped",
    });

    return { command, tempFilePath: tempFile };
  }

  /**
   * Execute command with timeout
   */
  private async executeWithTimeout(
    command: Deno.Command,
  ): Promise<{ output: unknown; memoryUsed?: number }> {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      // Spawn process
      const process = command.spawn();

      // Read stdout
      const { stdout, stderr } = await process.output();

      clearTimeout(timeoutId);

      // Parse output
      const stdoutText = new TextDecoder().decode(stdout);
      const stderrText = new TextDecoder().decode(stderr);

      // Check for timeout abort
      if (controller.signal.aborted) {
        throw new Error("TIMEOUT");
      }

      // Look for result marker
      const resultMatch = stdoutText.match(/__SANDBOX_RESULT__:(.*)/);
      if (!resultMatch) {
        // No result found - check for errors
        if (stderrText) {
          throw new Error(`RUNTIME_ERROR: ${stderrText}`);
        }
        throw new Error("No result returned from sandbox");
      }

      // Parse result
      const resultJson = JSON.parse(resultMatch[1]);

      if (!resultJson.success) {
        throw new Error(`USER_ERROR: ${JSON.stringify(resultJson.error)}`);
      }

      return {
        output: resultJson.result,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (controller.signal.aborted) {
        throw new Error("TIMEOUT");
      }

      throw error;
    }
  }

  /**
   * Parse error into structured format
   */
  private parseError(error: unknown): ExecutionResult["error"] {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Timeout error
    if (errorMessage.includes("TIMEOUT")) {
      return {
        type: "TimeoutError",
        message: `Execution exceeded timeout of ${this.config.timeout}ms`,
      };
    }

    // Memory error (OOM)
    if (errorMessage.includes("out of memory") || errorMessage.includes("heap")) {
      return {
        type: "MemoryError",
        message: `Memory limit of ${this.config.memoryLimit}MB exceeded`,
      };
    }

    // Permission error
    if (
      errorMessage.includes("PermissionDenied") ||
      errorMessage.includes("permission") ||
      errorMessage.includes("NotCapable") ||
      errorMessage.includes("Requires") ||
      errorMessage.includes("--allow-")
    ) {
      return {
        type: "PermissionError",
        message: errorMessage,
      };
    }

    // User code error
    if (errorMessage.includes("USER_ERROR")) {
      const userError = JSON.parse(errorMessage.replace("USER_ERROR: ", ""));
      return {
        type: userError.type === "SyntaxError" ? "SyntaxError" : "RuntimeError",
        message: userError.message,
        stack: userError.stack,
      };
    }

    // Runtime error
    return {
      type: "RuntimeError",
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    };
  }
}
