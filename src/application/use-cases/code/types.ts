/**
 * Code Execution Use Case Types
 *
 * Shared types for code execution use cases.
 *
 * @module application/use-cases/code/types
 */

// Re-export shared types
export type { UseCaseError, UseCaseResult } from "../shared/types.ts";

// ============================================================================
// Execute Code
// ============================================================================

/**
 * Request to execute code in sandbox
 */
export interface ExecuteCodeRequest {
  /** TypeScript code to execute */
  code: string;
  /** Natural language intent (for tool discovery) */
  intent?: string;
  /** Custom context to inject */
  context?: Record<string, unknown>;
  /** Sandbox configuration */
  sandboxConfig?: SandboxConfig;
}

/**
 * Sandbox configuration options
 */
export interface SandboxConfig {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Memory limit in MB */
  memoryLimit?: number;
  /** Allowed read paths */
  allowedReadPaths?: string[];
  /** Enable PII detection */
  piiDetection?: boolean;
}

/**
 * Result of code execution
 */
export interface ExecuteCodeResult {
  /** Execution output */
  output: unknown;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Console logs from execution */
  logs?: string[];
  /** Tools that were injected */
  injectedTools?: string[];
}

// ============================================================================
// Validate Code
// ============================================================================

/**
 * Request to validate code without executing
 */
export interface ValidateCodeRequest {
  /** TypeScript code to validate */
  code: string;
  /** Whether to check for security issues */
  securityCheck?: boolean;
}

/**
 * Result of code validation
 */
export interface ValidateCodeResult {
  /** Whether code is valid */
  isValid: boolean;
  /** Syntax errors if any */
  syntaxErrors?: SyntaxError[];
  /** Security issues if any */
  securityIssues?: SecurityIssue[];
  /** Detected patterns */
  patterns?: string[];
}

/**
 * Syntax error info
 */
export interface SyntaxError {
  line: number;
  column: number;
  message: string;
}

/**
 * Security issue info
 */
export interface SecurityIssue {
  severity: "low" | "medium" | "high" | "critical";
  type: string;
  message: string;
  line?: number;
}
