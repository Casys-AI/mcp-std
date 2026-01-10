/**
 * Output Schema Inferrer (ADR-061)
 *
 * Infers JSON Schema from runtime values observed during tool execution.
 * Used to automatically populate tool_schema.output_schema from traces.
 *
 * Key features:
 * - Type inference from JavaScript values
 * - Schema merging for multiple observations
 * - Confidence tracking based on observation count
 *
 * @module capabilities/output-schema-inferrer
 */

import type { DbClient } from "../db/types.ts";
import type { JSONSchema } from "./types.ts";
import { syncProvidesEdgesForTool } from "../graphrag/provides-edge-calculator.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

// =============================================================================
// Schema Inference from Values
// =============================================================================

/**
 * Infer JSON Schema from a JavaScript value
 *
 * Recursively analyzes the value structure to produce a schema.
 * For arrays, samples the first element to infer items schema.
 * For objects, infers properties from all keys.
 *
 * @param value - Runtime value to analyze
 * @param maxDepth - Maximum recursion depth (default: 5)
 * @returns Inferred JSON Schema
 *
 * @example
 * ```typescript
 * inferSchemaFromValue({ name: "test", count: 42 })
 * // Returns:
 * // {
 * //   type: "object",
 * //   properties: {
 * //     name: { type: "string" },
 * //     count: { type: "integer" }
 * //   }
 * // }
 * ```
 */
export function inferSchemaFromValue(value: unknown, maxDepth: number = 5): JSONSchema {
  if (maxDepth <= 0) {
    return {}; // Stop recursion, accept any
  }

  // Null
  if (value === null) {
    return { type: "null" };
  }

  // Undefined (treat as optional, no schema constraint)
  if (value === undefined) {
    return {};
  }

  // String
  if (typeof value === "string") {
    // Note: format detection removed - JSONSchema type doesn't support format field
    // Could be added later if JSONSchema type is extended
    return { type: "string" };
  }

  // Number
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return { type: "number" };
    }
    return { type: Number.isInteger(value) ? "integer" : "number" };
  }

  // Boolean
  if (typeof value === "boolean") {
    return { type: "boolean" };
  }

  // Array
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array" };
    }

    // Sample multiple elements if available for better inference
    const sampleSize = Math.min(value.length, 3);
    const sampledSchemas = value.slice(0, sampleSize).map(v => inferSchemaFromValue(v, maxDepth - 1));

    // If all sampled items have same type, use that
    const itemSchema = mergeSchemaArray(sampledSchemas);

    return { type: "array", items: itemSchema };
  }

  // Object
  if (typeof value === "object") {
    const properties: Record<string, JSONSchema> = {};

    for (const [key, val] of Object.entries(value)) {
      properties[key] = inferSchemaFromValue(val, maxDepth - 1);
    }

    // All observed keys are potentially required (will be refined during merge)
    const required = Object.keys(properties);

    const schema: JSONSchema = { type: "object", properties };
    if (required.length > 0) {
      schema.required = required;
    }

    return schema;
  }

  // Function, Symbol, etc. - not JSON serializable
  return {};
}

// =============================================================================
// Schema Merging
// =============================================================================

/**
 * Merge multiple schemas into one (union-like)
 *
 * Used when we have multiple observations of the same field.
 * Produces a schema that accepts all observed variations.
 */
function mergeSchemaArray(schemas: JSONSchema[]): JSONSchema {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];

  // Check if all schemas have same type
  const types = schemas.map(s => s.type).filter(Boolean);
  const uniqueTypes = [...new Set(types)];

  if (uniqueTypes.length === 1) {
    // Same type - merge properties if object
    if (uniqueTypes[0] === "object") {
      return mergeObjectSchemas(schemas);
    }
    return schemas[0];
  }

  // Different types - return empty (accepts any)
  // Could also use oneOf but keeping it simple
  return {};
}

/**
 * Merge multiple object schemas
 *
 * Properties present in all schemas are required.
 * Properties present in some schemas are optional.
 */
function mergeObjectSchemas(schemas: JSONSchema[]): JSONSchema {
  const allProperties = new Map<string, JSONSchema[]>();
  const propertyCounts = new Map<string, number>();

  for (const schema of schemas) {
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (!allProperties.has(key)) {
          allProperties.set(key, []);
          propertyCounts.set(key, 0);
        }
        allProperties.get(key)!.push(propSchema);
        propertyCounts.set(key, propertyCounts.get(key)! + 1);
      }
    }
  }

  const mergedProperties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  for (const [key, propSchemas] of allProperties) {
    mergedProperties[key] = mergeSchemaArray(propSchemas);

    // Required if present in ALL observations
    if (propertyCounts.get(key) === schemas.length) {
      required.push(key);
    }
  }

  const result: JSONSchema = { type: "object", properties: mergedProperties };
  if (required.length > 0) {
    result.required = required;
  }

  return result;
}

/**
 * Merge an existing schema with a newly observed schema
 *
 * @param existing - Previously inferred schema (or null if first observation)
 * @param observed - Newly observed schema from execution
 * @returns Merged schema
 */
export function mergeSchemas(existing: JSONSchema | null, observed: JSONSchema): JSONSchema {
  if (!existing) return observed;

  // If types differ, return more general schema
  if (existing.type !== observed.type) {
    // Keep object type if one is object (more informative)
    if (existing.type === "object") return existing;
    if (observed.type === "object") return observed;
    return {}; // Accept any
  }

  // Same type
  if (existing.type === "object" && observed.type === "object") {
    return mergeObjectSchemas([existing, observed]);
  }

  if (existing.type === "array" && observed.type === "array") {
    const mergedItems = existing.items && observed.items
      ? mergeSchemas(existing.items, observed.items)
      : existing.items || observed.items;
    return { type: "array", items: mergedItems };
  }

  // Primitive types - keep existing (first observation wins for format, etc.)
  return existing;
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Get current output schema for a tool
 */
export async function getToolOutputSchema(
  db: DbClient,
  toolId: string,
): Promise<JSONSchema | null> {
  const result = await db.query(
    `SELECT output_schema FROM tool_schema WHERE tool_id = $1`,
    [toolId],
  );

  if ((result as unknown[]).length === 0) return null;

  const row = (result as Array<{ output_schema: JSONSchema | null }>)[0];
  return row.output_schema;
}

/**
 * Update tool output schema in database
 */
export async function updateToolOutputSchema(
  db: DbClient,
  toolId: string,
  schema: JSONSchema,
): Promise<void> {
  await db.query(
    `UPDATE tool_schema SET output_schema = $2, updated_at = NOW() WHERE tool_id = $1`,
    [toolId, JSON.stringify(schema)],
  );
}

/**
 * Increment observation count for schema confidence tracking
 * Note: Currently a no-op, tracking via updated_at timestamp.
 * Future: add observation_count column to tool_schema
 */
async function incrementObservationCount(
  _db: DbClient,
  _toolId: string,
): Promise<void> {
  // Use metadata column or create separate tracking
  // For now, we'll track via the updated_at timestamp frequency
  // Future: add observation_count column
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Enrich tool output schema from observed execution output
 *
 * Call this after each tool execution to incrementally build
 * accurate output schemas from real data.
 *
 * @param db - Database client
 * @param toolId - Tool that was executed
 * @param output - Actual output from execution
 * @param syncEdges - Whether to sync provides edges after update (default: true)
 *
 * @example
 * ```typescript
 * // In post-execution flow
 * const result = await executeTool(toolId, args);
 * await enrichToolOutputSchema(db, toolId, result.output);
 * ```
 */
export async function enrichToolOutputSchema(
  db: DbClient,
  toolId: string,
  output: unknown,
  syncEdges: boolean = true,
): Promise<{ updated: boolean; edgesCreated: number }> {
  const startTime = performance.now();

  try {
    // Skip if output is undefined/null (no schema to infer)
    if (output === undefined || output === null) {
      return { updated: false, edgesCreated: 0 };
    }

    // 1. Infer schema from output
    const inferredSchema = inferSchemaFromValue(output);

    // Skip if we couldn't infer anything useful
    if (!inferredSchema.type && !inferredSchema.properties) {
      return { updated: false, edgesCreated: 0 };
    }

    // 2. Get existing schema
    const existingSchema = await getToolOutputSchema(db, toolId);

    // 3. Merge with existing (or use inferred if first observation)
    const mergedSchema = mergeSchemas(existingSchema, inferredSchema);

    // 4. Check if schema actually changed
    const existingStr = JSON.stringify(existingSchema);
    const mergedStr = JSON.stringify(mergedSchema);

    if (existingStr === mergedStr) {
      // No change, skip update
      return { updated: false, edgesCreated: 0 };
    }

    // 5. Update database
    await updateToolOutputSchema(db, toolId, mergedSchema);
    await incrementObservationCount(db, toolId);

    logger.debug("Updated tool output schema from execution", {
      toolId,
      schemaType: mergedSchema.type,
      propertyCount: mergedSchema.properties ? Object.keys(mergedSchema.properties).length : 0,
    });

    // 6. Sync provides edges if requested
    let edgesCreated = 0;
    if (syncEdges) {
      edgesCreated = await syncProvidesEdgesForTool(db, toolId);
    }

    const elapsedMs = performance.now() - startTime;
    logger.info("Enriched tool output schema", {
      toolId,
      edgesCreated,
      elapsedMs: Math.round(elapsedMs),
    });

    return { updated: true, edgesCreated };
  } catch (error) {
    // Non-critical: log and continue
    logger.warn("Failed to enrich tool output schema", {
      toolId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { updated: false, edgesCreated: 0 };
  }
}

// =============================================================================
// Batch Processing
// =============================================================================

/**
 * Backfill output schemas from historical traces
 *
 * Processes execution_trace.task_results to infer schemas for all tools.
 * Run this once to populate schemas from existing data.
 *
 * @param db - Database client
 * @param limit - Maximum traces to process (default: all)
 * @returns Statistics about the backfill
 */
export async function backfillOutputSchemas(
  db: DbClient,
  limit?: number,
): Promise<{ toolsUpdated: number; tracesProcessed: number; edgesCreated: number }> {
  const startTime = performance.now();

  logger.info("Starting output schema backfill from traces");

  // 1. Get traces with task_results
  let query = `
    SELECT id, task_results
    FROM execution_trace
    WHERE task_results IS NOT NULL
    ORDER BY executed_at DESC
  `;
  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const traces = await db.query(query) as Array<{
    id: string;
    task_results: Array<{ tool?: string; result?: unknown; success?: boolean }>;
  }>;

  // 2. Aggregate outputs by tool
  const toolOutputs = new Map<string, unknown[]>();

  for (const trace of traces) {
    if (!trace.task_results || !Array.isArray(trace.task_results)) continue;

    for (const task of trace.task_results) {
      const toolId = task.tool;
      const output = task.result;

      // Skip: no tool, failed, no output, or capability references
      if (!toolId || !task.success || output === undefined || output === null) continue;
      if (toolId.startsWith("$cap:")) continue;

      if (!toolOutputs.has(toolId)) {
        toolOutputs.set(toolId, []);
      }
      toolOutputs.get(toolId)!.push(output);
    }
  }

  logger.info("Aggregated tool outputs from traces", {
    uniqueTools: toolOutputs.size,
    totalTraces: traces.length,
  });

  // 3. Infer and merge schemas for each tool
  let toolsUpdated = 0;
  let totalEdgesCreated = 0;

  for (const [toolId, outputs] of toolOutputs) {
    // Infer schema from all outputs
    const schemas = outputs.map(o => inferSchemaFromValue(o));
    const mergedSchema = schemas.reduce(
      (acc, s) => mergeSchemas(acc, s),
      null as JSONSchema | null,
    );

    if (!mergedSchema) continue;

    // Update and sync
    const result = await enrichToolOutputSchema(db, toolId, outputs[0], true);
    if (result.updated) {
      toolsUpdated++;
      totalEdgesCreated += result.edgesCreated;
    }
  }

  const elapsedMs = performance.now() - startTime;
  logger.info("Output schema backfill complete", {
    toolsUpdated,
    tracesProcessed: traces.length,
    edgesCreated: totalEdgesCreated,
    elapsedMs: Math.round(elapsedMs),
  });

  return {
    toolsUpdated,
    tracesProcessed: traces.length,
    edgesCreated: totalEdgesCreated,
  };
}
