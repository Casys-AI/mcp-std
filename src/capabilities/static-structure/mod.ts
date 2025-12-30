/**
 * Static Structure Builder Modules
 *
 * Refactored components of the static structure builder:
 * - types: Internal types for AST processing
 * - extractors: Pure functions for extracting values from AST nodes
 * - evaluators: Pure functions for evaluating constant expressions
 * - edge-generators: Functions for generating edges between nodes
 * - ast-handlers: Node-specific handlers using Visitor pattern
 *
 * @module capabilities/static-structure
 */

// Types
export type {
  BuilderState,
  InternalNode,
  NodeCounters,
  NodeMetadata,
  ToolSchema,
} from "./types.ts";

// Extractors
export {
  extractArrayLiteral,
  extractConditionText,
  extractMemberChain,
  extractObjectLiteral,
  extractTemplateLiteralText,
  isLiteralExpression,
} from "./extractors.ts";

// Evaluators
export { evaluateBinaryOp, evaluateUnaryOp } from "./evaluators.ts";

// Edge Generators
export {
  computeCoverage,
  generateAllEdges,
  generateChainedEdges,
  generateConditionalEdges,
  generateForkJoinEdges,
  generateProvidesEdges,
  generateSequenceEdges,
  loadToolSchema,
} from "./edge-generators.ts";

// AST Handlers (Visitor Pattern)
export {
  ARRAY_OPERATIONS,
  createStaticStructureVisitor,
  defaultTraversalHandler,
  handleBinaryExpression,
  handleCallExpression,
  handleConditionalExpression,
  handleFunctionExpression,
  handleIfStatement,
  handleSwitchStatement,
  handleVariableDeclarator,
  OPERATOR_MAP,
} from "./ast-handlers.ts";
export type { CallExpressionResult, HandlerContext, VisitorResult } from "./ast-handlers.ts";

// Builder Context Adapter
export { BuilderContextAdapter } from "./builder-context-adapter.ts";
export type { IStaticStructureBuilder } from "./builder-context-adapter.ts";
