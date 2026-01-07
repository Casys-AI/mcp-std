/**
 * CodeAnalyzer Adapter
 *
 * Wraps StaticStructureBuilder to implement the ICodeAnalyzer interface.
 * Provides static code analysis capabilities through DI.
 *
 * Phase 3.2: DI Container Expansion
 *
 * @module infrastructure/di/adapters/code-analyzer-adapter
 */

import { CodeAnalyzer } from "../container.ts";
import { StaticStructureBuilder } from "../../../capabilities/static-structure-builder.ts";
import type { DbClient } from "../../../db/types.ts";
import type {
  ExtractedToolCall,
  HILRequiredTools,
} from "../../../domain/interfaces/code-analyzer.ts";
import type { StaticStructure } from "../../../capabilities/types/mod.ts";

/**
 * Adapter that wraps StaticStructureBuilder for DI registration.
 *
 * Maps ICodeAnalyzer interface methods to StaticStructureBuilder implementation.
 */
export class CodeAnalyzerAdapter extends CodeAnalyzer {
  private readonly builder: StaticStructureBuilder;

  constructor(db: DbClient) {
    super();
    this.builder = new StaticStructureBuilder(db);
  }

  /**
   * Analyze code to build static structure
   */
  analyze = async (code: string): Promise<StaticStructure> => {
    return this.builder.buildStaticStructure(code);
  };

  /**
   * Extract tool calls from code
   *
   * Analyzes the static structure and extracts all tool calls.
   */
  extractToolCalls = async (code: string): Promise<ExtractedToolCall[]> => {
    const structure = await this.builder.buildStaticStructure(code);
    const toolCalls: ExtractedToolCall[] = [];

    for (const node of structure.nodes) {
      if (node.type === "task") {
        // Determine if it's an MCP tool or code operation
        const isMcp = node.tool.includes(":") && !node.tool.startsWith("code:");

        toolCalls.push({
          toolId: node.tool,
          nodeId: node.id,
          arguments: node.arguments as Record<string, unknown> | undefined,
          type: isMcp ? "mcp" : "code",
        });
      }
    }

    return toolCalls;
  };

  /**
   * Get tools requiring HIL approval from static structure
   */
  getHILRequiredTools = (structure: StaticStructure): HILRequiredTools => {
    const tools = this.builder.getHILRequiredTools(structure);
    return {
      tools,
      reasons: undefined, // Could be extended to include reasons per tool
    };
  };

  /** Access underlying builder for methods not in interface */
  get underlying(): StaticStructureBuilder {
    return this.builder;
  }
}
