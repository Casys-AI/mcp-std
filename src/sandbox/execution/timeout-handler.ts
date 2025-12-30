/**
 * Timeout Handler
 *
 * Handles timeout enforcement for sandbox execution.
 *
 * @module sandbox/execution/timeout-handler
 */

import { getLogger } from "../../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Result from command execution
 */
export interface CommandOutput {
  stdout: string;
  stderr: string;
  success: boolean;
  code: number;
}

/**
 * Timeout Handler
 *
 * Provides timeout enforcement for Deno subprocess execution.
 */
export class TimeoutHandler {
  constructor(private defaultTimeout: number) {}

  /**
   * Execute command with timeout enforcement
   *
   * Uses AbortController to enforce timeout. Process is killed if timeout
   * is exceeded.
   *
   * @param command - Deno command to execute
   * @param timeout - Optional timeout override
   * @returns Command output
   * @throws Error if execution fails or times out
   */
  async executeWithTimeout(
    command: Deno.Command,
    timeout?: number,
  ): Promise<CommandOutput> {
    const effectiveTimeout = timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    let process: Deno.ChildProcess | null = null;

    const timeoutId = setTimeout(() => {
      logger.warn("Sandbox execution timeout, killing process", {
        timeoutMs: effectiveTimeout,
      });
      controller.abort();
      if (process) {
        try {
          process.kill("SIGKILL");
        } catch {
          // Process might already be dead
        }
      }
    }, effectiveTimeout);

    try {
      process = command.spawn();
      const { stdout, stderr, success, code } = await process.output();

      clearTimeout(timeoutId);

      if (controller.signal.aborted) {
        throw new Error("TIMEOUT");
      }

      const stdoutText = new TextDecoder().decode(stdout);
      const stderrText = new TextDecoder().decode(stderr);

      logger.debug("Subprocess completed", {
        success,
        code,
        stdoutLength: stdoutText.length,
        stderrLength: stderrText.length,
      });

      return {
        stdout: stdoutText,
        stderr: stderrText,
        success,
        code,
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
   * Wrap a promise with timeout
   *
   * @param promise - Promise to wrap
   * @param timeout - Optional timeout override
   * @returns Result of the promise
   * @throws TimeoutError if timeout exceeded
   */
  async wrap<T>(promise: Promise<T>, timeout?: number): Promise<T> {
    const effectiveTimeout = timeout ?? this.defaultTimeout;

    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("TIMEOUT")), effectiveTimeout);
      }),
    ]);
  }
}
