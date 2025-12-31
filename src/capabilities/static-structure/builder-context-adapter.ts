/**
 * Builder Context Adapter
 *
 * Adapts StaticStructureBuilder to the HandlerContext interface,
 * allowing extracted handlers to access builder methods and state.
 *
 * Follows the adapter pattern used in src/infrastructure/di/adapters/.
 *
 * @module capabilities/static-structure/builder-context-adapter
 */

import type { HandlerContext } from "./ast-handlers.ts";
import type { InternalNode } from "./types.ts";

/**
 * Interface for the builder methods/properties exposed to the adapter.
 *
 * This defines the contract that StaticStructureBuilder must fulfill
 * to work with the extracted handlers.
 */
export interface IStaticStructureBuilder {
  // Methods
  generateNodeId(type: "task" | "decision" | "capability" | "fork" | "join" | "loop"): string;
  extractConditionText(node: Record<string, unknown> | undefined): string;
  extractMemberChain(node: Record<string, unknown>, parts?: string[]): string[];
  extractCodeFromSpan(span: { start: number; end: number } | undefined): string | undefined;
  extractFullChainSpan(node: Record<string, unknown>): { start: number; end: number } | undefined;
  extractLiteralValue(node: Record<string, unknown>): unknown;
  findNodes(
    node: unknown,
    nodes: InternalNode[],
    position: number,
    parentScope?: string,
    nestingLevel?: number,
    currentParentOp?: string,
  ): void;

  // Complex handlers (delegated back to builder)
  handleCallExpression(
    n: Record<string, unknown>,
    nodes: InternalNode[],
    position: number,
    parentScope?: string,
    nestingLevel?: number,
    currentParentOp?: string,
  ): { nodeId?: string; handled: boolean };

  handleVariableDeclarator(
    n: Record<string, unknown>,
    nodes: InternalNode[],
    position: number,
    parentScope?: string,
    nestingLevel?: number,
    currentParentOp?: string,
  ): void;

  // State
  readonly processedSpans: Map<string, string>;
  readonly variableToNodeId: Map<string, string>;
  readonly literalBindings: Map<string, unknown>;
}

/**
 * Adapter that wraps StaticStructureBuilder for handler use.
 *
 * Creates a HandlerContext from a builder instance and traversal state.
 * Delegates all method calls to the underlying builder.
 *
 * @example
 * ```typescript
 * const ctx = new BuilderContextAdapter(builder, nodes, position, parentScope);
 * handleIfStatement(node, ctx, visitor);
 * ```
 */
export class BuilderContextAdapter implements HandlerContext {
  constructor(
    private readonly builder: IStaticStructureBuilder,
    public readonly nodes: InternalNode[],
    public readonly position: number,
    public readonly parentScope?: string,
    public readonly nestingLevel: number = 0,
    public readonly currentParentOp?: string,
  ) {}

  // Delegate methods to builder
  generateNodeId = (type: "task" | "decision" | "capability" | "fork" | "join" | "loop"): string =>
    this.builder.generateNodeId(type);

  extractConditionText = (node: Record<string, unknown> | undefined): string =>
    this.builder.extractConditionText(node);

  extractMemberChain = (node: Record<string, unknown>, parts?: string[]): string[] =>
    this.builder.extractMemberChain(node, parts);

  extractCodeFromSpan = (span: { start: number; end: number } | undefined): string | undefined =>
    this.builder.extractCodeFromSpan(span);

  extractFullChainSpan = (
    node: Record<string, unknown>,
  ): { start: number; end: number } | undefined => this.builder.extractFullChainSpan(node);

  extractLiteralValue = (node: Record<string, unknown>): unknown =>
    this.builder.extractLiteralValue(node);

  findNodes = (
    node: unknown,
    nodes: InternalNode[],
    position: number,
    parentScope?: string,
    nestingLevel?: number,
    currentParentOp?: string,
  ): void => this.builder.findNodes(node, nodes, position, parentScope, nestingLevel, currentParentOp);

  // Complex handlers (delegated back to builder)
  handleCallExpression = (
    n: Record<string, unknown>,
    nodes: InternalNode[],
    position: number,
    parentScope?: string,
    nestingLevel?: number,
    currentParentOp?: string,
  ): { nodeId?: string; handled: boolean } =>
    this.builder.handleCallExpression(n, nodes, position, parentScope, nestingLevel, currentParentOp);

  handleVariableDeclarator = (
    n: Record<string, unknown>,
    nodes: InternalNode[],
    position: number,
    parentScope?: string,
    nestingLevel?: number,
    currentParentOp?: string,
  ): void => this.builder.handleVariableDeclarator(n, nodes, position, parentScope, nestingLevel, currentParentOp);

  // Expose state via getters (delegate to builder)
  get processedSpans(): Map<string, string> {
    return this.builder.processedSpans;
  }

  get variableToNodeId(): Map<string, string> {
    return this.builder.variableToNodeId;
  }

  get literalBindings(): Map<string, unknown> {
    return this.builder.literalBindings;
  }

  /**
   * Access underlying builder for methods not in interface.
   */
  get underlying(): IStaticStructureBuilder {
    return this.builder;
  }
}
