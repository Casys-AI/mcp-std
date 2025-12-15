/**
 * Unit tests for custom error types
 */

import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import {
  ConfigurationError,
  DAGExecutionError,
  DatabaseError,
  MCPServerError,
  PMLError,
  TimeoutError,
  VectorSearchError,
} from "../../../src/errors/error-types.ts";

Deno.test("PMLError - base error class", () => {
  const error = new PMLError(
    "Test error",
    "TEST_ERROR",
    true,
    "Try this fix",
  );

  assertEquals(error.message, "Test error");
  assertEquals(error.code, "TEST_ERROR");
  assertEquals(error.recoverable, true);
  assertEquals(error.suggestion, "Try this fix");
  assertEquals(error.name, "PMLError");
  assertInstanceOf(error, Error);
});

Deno.test("MCPServerError - with server context", () => {
  const error = new MCPServerError(
    "filesystem-server",
    "Connection failed",
  );

  assertEquals(error.serverId, "filesystem-server");
  assertEquals(error.code, "MCP_SERVER_ERROR");
  assertEquals(error.recoverable, true);
  assert(error.suggestion?.includes("filesystem-server"));
});

Deno.test("VectorSearchError - with query context", () => {
  const error = new VectorSearchError("Search failed", "test query");

  assertEquals(error.query, "test query");
  assertEquals(error.code, "VECTOR_SEARCH_ERROR");
  assertEquals(error.recoverable, true);
});

Deno.test("DAGExecutionError - recoverable vs non-recoverable", () => {
  const recoverable = new DAGExecutionError(
    "Task failed",
    "task-1",
    true,
  );
  const nonRecoverable = new DAGExecutionError(
    "Circular dependency",
    undefined,
    false,
  );

  assertEquals(recoverable.recoverable, true);
  assertEquals(recoverable.taskId, "task-1");
  assertEquals(nonRecoverable.recoverable, false);
  assertEquals(nonRecoverable.taskId, undefined);
});

Deno.test("DatabaseError - not recoverable", () => {
  const error = new DatabaseError("Query failed", "SELECT");

  assertEquals(error.operation, "SELECT");
  assertEquals(error.recoverable, false);
  assertEquals(error.code, "DATABASE_ERROR");
});

Deno.test("ConfigurationError - with config key", () => {
  const error = new ConfigurationError(
    "Missing config",
    "database.path",
  );

  assertEquals(error.configKey, "database.path");
  assertEquals(error.recoverable, false);
});

Deno.test("TimeoutError - with operation details", () => {
  const error = new TimeoutError("database-query", 5000);

  assertEquals(error.operation, "database-query");
  assertEquals(error.timeoutMs, 5000);
  assert(error.message.includes("5000ms"));
  assertEquals(error.recoverable, true);
});
