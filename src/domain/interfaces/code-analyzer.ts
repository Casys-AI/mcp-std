/**
 * Code Analyzer Interface
 *
 * Defines the contract for static code analysis.
 * Implementations: StaticStructureBuilder
 *
 * Phase 3.2: DI Container Expansion
 *
 * @module domain/interfaces/code-analyzer
 */

import type { StaticStructure } from "../../capabilities/types/mod.ts";

/**
 * Tool call extracted from code
 */
export interface ExtractedToolCall {
  /** Tool identifier (e.g., "filesystem:read_file") */
  toolId: string;
  /** Node ID in static structure */
  nodeId: string;
  /** Extracted arguments (if any) */
  arguments?: Record<string, unknown>;
  /** Whether this is an MCP tool or code operation */
  type: "mcp" | "code";
}

/**
 * Dependency extracted from code
 */
export interface ExtractedDependency {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Dependency type */
  type: "data" | "control" | "sequence";
}

/**
 * Tools requiring HIL approval
 */
export interface HILRequiredTools {
  /** List of tool IDs requiring approval */
  tools: string[];
  /** Reason for each tool */
  reasons?: Record<string, string>;
}

/**
 * Interface for static code analysis
 *
 * This interface abstracts the code analysis layer,
 * allowing for different implementations (SWC-based, AST-based)
 * and easy mocking in tests.
 */
export interface ICodeAnalyzer {
  /**
   * Build static structure from TypeScript code
   *
   * Analyzes code to extract control flow, data flow, and tool calls.
   *
   * @param code - TypeScript/JavaScript code to analyze
   * @returns Static structure with nodes and edges
   */
  analyze(code: string): Promise<StaticStructure>;

  /**
   * Extract tool calls from code
   *
   * @param code - Code to analyze
   * @returns List of tool calls found
   */
  extractToolCalls(code: string): Promise<ExtractedToolCall[]>;

  /**
   * Get tools requiring HIL approval from static structure
   *
   * @param structure - Pre-analyzed static structure
   * @returns List of tool IDs requiring HIL approval
   */
  getHILRequiredTools(structure: StaticStructure): HILRequiredTools;
}
