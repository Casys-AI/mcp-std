/**
 * AST Visitor Pattern
 *
 * Generic visitor pattern for AST traversal. Allows separating node-type-specific
 * logic from the traversal algorithm. Handlers can be registered per node type
 * and the visitor dispatches to the appropriate handler.
 *
 * Benefits:
 * - Separates concerns: traversal vs handling
 * - Easy to add new node type handlers
 * - Testable: handlers can be unit tested independently
 * - Composable: visitors can be combined
 *
 * @example
 * ```typescript
 * const visitor = new ASTVisitor<BuilderContext, HandlerResult>()
 *   .register("CallExpression", handleCallExpression)
 *   .register("IfStatement", handleIfStatement)
 *   .register("SwitchStatement", handleSwitchStatement);
 *
 * visitor.visit(node, context);
 * ```
 *
 * @module infrastructure/patterns/visitor/ast-visitor
 */

/**
 * Generic node type - AST nodes must have a `type` field
 */
export interface ASTNode {
  type: string;
  [key: string]: unknown;
}

/**
 * Handler function signature
 *
 * @param node The AST node to handle
 * @param context Shared context (state, utilities, etc.)
 * @param visitor Reference to the visitor for recursive traversal
 */
export type NodeHandler<TNode extends ASTNode, TContext, TResult> = (
  node: TNode,
  context: TContext,
  visitor: ASTVisitor<TContext, TResult>,
) => TResult;

/**
 * Default handler when no specific handler is registered
 */
export type DefaultHandler<TContext, TResult> = (
  node: ASTNode,
  context: TContext,
  visitor: ASTVisitor<TContext, TResult>,
) => TResult;

/**
 * Generic AST Visitor
 *
 * Dispatches to registered handlers based on node type.
 * Supports default handler for unregistered types.
 */
export class ASTVisitor<TContext, TResult> {
  private handlers: Map<string, NodeHandler<ASTNode, TContext, TResult>> = new Map();
  private defaultHandler?: DefaultHandler<TContext, TResult>;

  /**
   * Register a handler for a specific node type
   */
  register<TNode extends ASTNode>(
    nodeType: string,
    handler: NodeHandler<TNode, TContext, TResult>,
  ): this {
    this.handlers.set(nodeType, handler as NodeHandler<ASTNode, TContext, TResult>);
    return this;
  }

  /**
   * Register multiple handlers at once
   */
  registerAll(
    handlers: Record<string, NodeHandler<ASTNode, TContext, TResult>>,
  ): this {
    for (const [type, handler] of Object.entries(handlers)) {
      this.handlers.set(type, handler);
    }
    return this;
  }

  /**
   * Set default handler for unregistered node types
   */
  setDefault(handler: DefaultHandler<TContext, TResult>): this {
    this.defaultHandler = handler;
    return this;
  }

  /**
   * Check if a handler is registered for a node type
   */
  hasHandler(nodeType: string): boolean {
    return this.handlers.has(nodeType);
  }

  /**
   * Get all registered node types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Visit a node, dispatching to the appropriate handler
   *
   * @param node The AST node to visit
   * @param context Shared context
   * @returns Handler result, or undefined if no handler matches
   */
  visit(node: ASTNode, context: TContext): TResult | undefined {
    const handler = this.handlers.get(node.type);

    if (handler) {
      return handler(node, context, this);
    }

    if (this.defaultHandler) {
      return this.defaultHandler(node, context, this);
    }

    return undefined;
  }

  /**
   * Visit multiple nodes
   */
  visitAll(nodes: ASTNode[], context: TContext): Array<TResult | undefined> {
    return nodes.map((node) => this.visit(node, context));
  }

  /**
   * Create a child visitor that inherits handlers but can override
   */
  extend(): ASTVisitor<TContext, TResult> {
    const child = new ASTVisitor<TContext, TResult>();
    for (const [type, handler] of this.handlers) {
      child.handlers.set(type, handler);
    }
    child.defaultHandler = this.defaultHandler;
    return child;
  }

  /**
   * Clone this visitor
   */
  clone(): ASTVisitor<TContext, TResult> {
    return this.extend();
  }
}

/**
 * Create a visitor with handlers pre-registered
 */
export function createVisitor<TContext, TResult>(
  handlers: Record<string, NodeHandler<ASTNode, TContext, TResult>>,
  defaultHandler?: DefaultHandler<TContext, TResult>,
): ASTVisitor<TContext, TResult> {
  const visitor = new ASTVisitor<TContext, TResult>();
  visitor.registerAll(handlers);
  if (defaultHandler) {
    visitor.setDefault(defaultHandler);
  }
  return visitor;
}
