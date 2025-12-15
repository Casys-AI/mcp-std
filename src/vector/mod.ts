/**
 * Vector Embeddings Module
 *
 * Provides embedding generation and semantic search capabilities
 * using BGE-M3 model and PGlite with pgvector.
 *
 * @module vector
 */

// Embedding generation
export {
  EmbeddingModel,
  generateEmbeddingForTool,
  generateEmbeddings,
  schemaToText,
} from "./embeddings.ts";

export type {
  EmbeddingGenerationResult,
  EmbeddingStats,
  ToolEmbeddingInput,
  ToolSchema,
} from "./embeddings.ts";

// Vector search
export { VectorSearch } from "./search.ts";
export type { SearchResult } from "./search.ts";
