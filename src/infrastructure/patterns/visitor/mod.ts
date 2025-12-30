/**
 * Visitor Pattern
 *
 * Separates algorithms from the objects on which they operate.
 * Useful for AST traversal, tree processing, and similar operations.
 *
 * @module infrastructure/patterns/visitor
 */

export { ASTVisitor, createVisitor } from "./ast-visitor.ts";
export type { ASTNode, DefaultHandler, NodeHandler } from "./ast-visitor.ts";
