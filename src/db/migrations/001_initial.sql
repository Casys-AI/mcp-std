-- Migration 001: Initial Schema for Casys PML
-- Created: 2025-11-03
-- Purpose: Create tables for embeddings, schemas, and configuration

-- Tool schemas table: Cache of MCP tool definitions
CREATE TABLE IF NOT EXISTS tool_schema (
  tool_id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL,
  output_schema JSONB,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tool embeddings table: BGE-Large-EN-v1.5 embeddings (1024 dimensions)
CREATE TABLE IF NOT EXISTS tool_embedding (
  tool_id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- HNSW index for fast vector similarity search
-- Parameters: m=16 (number of connections), ef_construction=64 (construction parameter)
-- Operator: vector_cosine_ops (cosine distance metric)
CREATE INDEX IF NOT EXISTS idx_tool_embedding_hnsw
ON tool_embedding
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Configuration key-value store
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tool_schema_server_id ON tool_schema(server_id);
CREATE INDEX IF NOT EXISTS idx_tool_embedding_server_id ON tool_embedding(server_id);
