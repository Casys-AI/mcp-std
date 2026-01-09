/**
 * Tool Definitions Builder Adapter
 *
 * Adapts buildToolDefinitionsFromStaticStructure to IToolDefinitionsBuilder interface.
 *
 * Phase 3.1: Execute Handler → Use Cases refactoring
 *
 * @module infrastructure/di/adapters/execute/tool-definitions-builder-adapter
 */

import type { StaticStructure } from "../../../../capabilities/types/mod.ts";
import type { MCPClientBase } from "../../../../mcp/types.ts";
import type { CapabilityRegistry } from "../../../../capabilities/capability-registry.ts";
import type { CapabilityStore } from "../../../../capabilities/capability-store.ts";
import { buildToolDefinitionsFromStaticStructure } from "../../../../mcp/handlers/shared/tool-definitions.ts";

/**
 * IToolDefinitionsBuilder interface (matches ExecuteDirectUseCase dependency)
 */
export interface IToolDefinitionsBuilder {
  buildFromStaticStructure(structure: StaticStructure): Promise<unknown[]>;
}

/**
 * Dependencies for ToolDefinitionsBuilderAdapter
 */
export interface ToolDefinitionsBuilderAdapterDeps {
  mcpClients: Map<string, MCPClientBase>;
  capabilityRegistry?: CapabilityRegistry;
  capabilityStore?: CapabilityStore;
}

/**
 * Adapts buildToolDefinitionsFromStaticStructure to IToolDefinitionsBuilder interface
 */
export class ToolDefinitionsBuilderAdapter implements IToolDefinitionsBuilder {
  constructor(private readonly deps: ToolDefinitionsBuilderAdapterDeps) {}

  /**
   * Build tool definitions from static structure
   */
  async buildFromStaticStructure(structure: StaticStructure): Promise<unknown[]> {
    return await buildToolDefinitionsFromStaticStructure(structure, {
      mcpClients: this.deps.mcpClients,
      capabilityRegistry: this.deps.capabilityRegistry,
      capabilityStore: this.deps.capabilityStore,
    });
  }
}
