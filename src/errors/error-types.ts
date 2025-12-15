/**
 * Custom Error Types for Casys PML
 *
 * Provides a hierarchy of error classes with user-friendly messages,
 * error codes, recoverability flags, and suggestions for resolution.
 *
 * @module errors/error-types
 */

/**
 * Base error class for Casys PML
 *
 * All custom errors extend this class to provide:
 * - Unique error code for categorization
 * - Recoverable flag to indicate if the operation can continue
 * - User-friendly suggestion for how to resolve the error
 */
export class PMLError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false,
    public suggestion?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace for where our error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * MCP Server connection/communication errors
 *
 * Thrown when:
 * - Unable to connect to an MCP server
 * - Communication with server fails
 * - Server returns invalid response
 */
export class MCPServerError extends PMLError {
  constructor(
    public serverId: string,
    message: string,
    public originalError?: Error,
  ) {
    super(
      message,
      "MCP_SERVER_ERROR",
      true, // Recoverable - can continue with other servers
      `Check server configuration for '${serverId}' or run 'cai status'`,
    );
  }
}

/**
 * Vector search errors
 *
 * Thrown when:
 * - Embedding generation fails
 * - Vector database query fails
 * - Search returns invalid results
 */
export class VectorSearchError extends PMLError {
  constructor(message: string, public query?: string) {
    super(
      message,
      "VECTOR_SEARCH_ERROR",
      true, // Recoverable - can fallback to keyword search
      "Try a different query or check database integrity",
    );
  }
}

/**
 * DAG execution errors
 *
 * Thrown when:
 * - Circular dependency detected
 * - Task execution fails
 * - Workflow cannot complete
 */
export class DAGExecutionError extends PMLError {
  constructor(
    message: string,
    public taskId?: string,
    recoverable: boolean = false,
  ) {
    super(
      message,
      "DAG_EXECUTION_ERROR",
      recoverable,
      recoverable ? "This task failed but workflow continues" : "Workflow execution halted",
    );
  }
}

/**
 * Database errors
 *
 * Thrown when:
 * - Database connection fails
 * - Query execution fails
 * - Transaction fails
 */
export class DatabaseError extends PMLError {
  constructor(message: string, public operation: string) {
    super(
      message,
      "DATABASE_ERROR",
      false, // Not recoverable - database is critical
      "Check database file permissions and integrity",
    );
  }
}

/**
 * Configuration errors
 *
 * Thrown when:
 * - Required configuration is missing
 * - Configuration is invalid
 * - Config file cannot be read
 */
export class ConfigurationError extends PMLError {
  constructor(message: string, public configKey?: string) {
    super(
      message,
      "CONFIGURATION_ERROR",
      false, // Not recoverable - configuration is required
      "Run 'cai init' to reconfigure",
    );
  }
}

/**
 * Timeout errors
 *
 * Thrown when an operation exceeds its timeout threshold
 */
export class TimeoutError extends PMLError {
  constructor(
    public operation: string,
    public timeoutMs: number,
  ) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      "TIMEOUT_ERROR",
      true, // Recoverable - can retry with higher timeout
      "Increase timeout or check server responsiveness",
    );
  }
}
