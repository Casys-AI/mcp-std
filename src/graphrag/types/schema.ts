/**
 * Schema and Edge Types
 *
 * Types for tool schemas and data flow relationships (Story 10.3).
 *
 * @module graphrag/types/schema
 */

import type { ProvidesCoverage } from "../../capabilities/types.ts";

// Re-export ProvidesCoverage for consumers of graphrag module
export type { ProvidesCoverage } from "../../capabilities/types.ts";

/**
 * JSON Schema representation for tool inputs/outputs
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  [key: string]: unknown;
}

/**
 * Field-level mapping between provider output and consumer input
 *
 * Describes how a specific field from the provider's output
 * maps to a field in the consumer's input.
 */
export interface FieldMapping {
  /** Field name in provider's output schema */
  fromField: string;
  /** Field name in consumer's input schema */
  toField: string;
  /** Whether types are compatible (string->string, number->string, etc.) */
  typeCompatible: boolean;
  /** Source field type */
  fromType?: string;
  /** Target field type */
  toType?: string;
}

/**
 * Provides edge representing data flow between tools/capabilities
 *
 * Story 10.3: Captures the relationship where one tool's output
 * can serve as input to another tool. Used to improve DAG suggestions
 * by understanding natural data flow chains.
 *
 * Example: fs:read_file (outputs: content) -> json:parse (inputs: json)
 * This creates a "provides" edge because content can feed json input.
 */
export interface ProvidesEdge {
  /** Tool/capability that provides the data */
  from: string;
  /** Tool/capability that consumes the data */
  to: string;
  /** Edge type (always "provides" for this interface) */
  type: "provides";
  /** Coverage level: strict (all required), partial (some required), optional (only optional) */
  coverage: ProvidesCoverage;
  /** JSON Schema of what the provider outputs */
  providerOutputSchema: JSONSchema;
  /** JSON Schema of what the consumer expects as input */
  consumerInputSchema: JSONSchema;
  /** Field-by-field mapping showing how data flows */
  fieldMapping: FieldMapping[];
  /** Weight for graph algorithms (default: 0.7) */
  weight?: number;
}
