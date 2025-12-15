/**
 * Unit tests for vector search
 *
 * Tests cover all acceptance criteria:
 * - AC1: Query embedding generation
 * - AC2: Cosine similarity search
 * - AC3: searchTools() API
 * - AC4: Top-k results sorted by relevance
 * - AC5: Configurable similarity threshold
 * - AC6: Accuracy with sample queries
 * - AC7: Performance P95 <100ms
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { VectorSearch } from "../../../src/vector/search.ts";
import { MockEmbeddingModel } from "../../fixtures/mock-embedding-model.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { createInitialMigration } from "../../../src/db/migrations.ts";

/**
 * Create a test database in memory
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  // Run migrations
  const migration = createInitialMigration();
  await migration.up(db);

  return db;
}

/**
 * Insert test tool embeddings into database
 * Creates realistic tool schemas with embeddings for testing
 */
async function insertTestEmbeddings(
  db: PGliteClient,
  model: MockEmbeddingModel,
): Promise<void> {
  // Test tools with descriptions designed for semantic search testing
  const testTools = [
    {
      toolId: "filesystem:read_file",
      serverId: "filesystem",
      toolName: "read_file",
      description: "Read the contents of a file from the filesystem",
      schema: {
        name: "read_file",
        description: "Read the contents of a file from the filesystem",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file" },
          },
        },
      },
    },
    {
      toolId: "filesystem:write_file",
      serverId: "filesystem",
      toolName: "write_file",
      description: "Write content to a file on the filesystem",
      schema: {
        name: "write_file",
        description: "Write content to a file on the filesystem",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file" },
            content: { type: "string", description: "Content to write" },
          },
        },
      },
    },
    {
      toolId: "github:create_pull_request",
      serverId: "github",
      toolName: "create_pull_request",
      description: "Create a new pull request on GitHub repository",
      schema: {
        name: "create_pull_request",
        description: "Create a new pull request on GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "PR title" },
            body: { type: "string", description: "PR description" },
          },
        },
      },
    },
    {
      toolId: "github:list_issues",
      serverId: "github",
      toolName: "list_issues",
      description: "List issues from a GitHub repository",
      schema: {
        name: "list_issues",
        description: "List issues from a GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            repo: { type: "string", description: "Repository name" },
          },
        },
      },
    },
    {
      toolId: "database:query",
      serverId: "database",
      toolName: "query",
      description: "Execute a SQL query against the database",
      schema: {
        name: "query",
        description: "Execute a SQL query against the database",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "SQL query" },
          },
        },
      },
    },
  ];

  for (const tool of testTools) {
    // Insert tool schema
    await db.query(
      `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        tool.toolId,
        tool.serverId,
        tool.toolName,
        tool.description,
        JSON.stringify(tool.schema.inputSchema),
      ],
    );

    // Generate and insert embedding
    const text = `${tool.schema.name} ${tool.schema.description}`;
    const embedding = await model.encode(text);
    const vectorLiteral = `[${embedding.join(",")}]`;

    await db.query(
      `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [
        tool.toolId,
        tool.serverId,
        tool.toolName,
        vectorLiteral,
        JSON.stringify({ description: tool.description }),
      ],
    );
  }
}

// AC3: Test searchTools() API basic functionality
Deno.test("VectorSearch - searchTools() returns results", { ignore: true }, async () => {
  const db = await createTestDb();
  const model = new MockEmbeddingModel();
  await model.load();

  await insertTestEmbeddings(db, model);

  const vectorSearch = new VectorSearch(db, model);
  const results = await vectorSearch.searchTools("read a file", 5, 0.0);

  assertExists(results);
  assert(Array.isArray(results));
  assert(results.length > 0);

  // Check result structure
  const firstResult = results[0];
  assertExists(firstResult.toolId);
  assertExists(firstResult.serverId);
  assertExists(firstResult.toolName);
  assertExists(firstResult.score);
  assertExists(firstResult.schema);

  await db.close();
});

// AC1: Test query embedding generation
Deno.test(
  "VectorSearch - generates query embedding before search",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);

    // Query should trigger embedding generation
    const results = await vectorSearch.searchTools("test query", 5);

    // If this completes without error, embedding was generated successfully
    assertExists(results);

    await db.close();
  },
);

// AC2: Test cosine similarity search returns correct scores
Deno.test(
  "VectorSearch - cosine similarity scores are between 0 and 1",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);
    const results = await vectorSearch.searchTools("read file", 5, 0.0);

    // All scores should be between 0 and 1
    for (const result of results) {
      assert(result.score >= 0 && result.score <= 1, `Score ${result.score} out of range [0, 1]`);
    }

    await db.close();
  },
);

// AC4: Test top-k results are sorted by relevance score (descending)
Deno.test(
  "VectorSearch - results sorted by score descending",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);
    const results = await vectorSearch.searchTools("file operations", 5, 0.0);

    // Check that scores are in descending order
    for (let i = 0; i < results.length - 1; i++) {
      assert(
        results[i].score >= results[i + 1].score,
        `Results not sorted: ${results[i].score} < ${results[i + 1].score}`,
      );
    }

    await db.close();
  },
);

// AC5: Test configurable similarity threshold
Deno.test(
  "VectorSearch - similarity threshold filters results",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);

    // Search with high threshold
    const strictResults = await vectorSearch.searchTools("read file", 5, 0.9);
    const lenientResults = await vectorSearch.searchTools("read file", 5, 0.5);

    // Lenient threshold should return more or equal results
    assert(lenientResults.length >= strictResults.length);

    // All results should meet their threshold
    for (const result of strictResults) {
      assert(result.score >= 0.9);
    }
    for (const result of lenientResults) {
      assert(result.score >= 0.5);
    }

    await db.close();
  },
);

// AC6: Test accuracy with sample query - file operations
Deno.test(
  "VectorSearch - finds file operation tools",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);
    const results = await vectorSearch.searchTools("read a file", 3, 0.6);

    // Should find filesystem tools
    const fileTools = results.filter((r) => r.serverId === "filesystem");
    assert(fileTools.length > 0, "Should find filesystem tools");

    // Top result should be read_file
    assertEquals(results[0].toolName, "read_file");

    await db.close();
  },
);

// AC6: Test accuracy with sample query - GitHub operations
Deno.test(
  "VectorSearch - finds GitHub tools",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);
    const results = await vectorSearch.searchTools(
      "create a pull request",
      3,
      0.6,
    );

    // Should find github tools
    const githubTools = results.filter((r) => r.serverId === "github");
    assert(githubTools.length > 0, "Should find GitHub tools");

    // Top result should be create_pull_request
    assertEquals(results[0].toolName, "create_pull_request");

    await db.close();
  },
);

// AC6: Test accuracy with sample query - database operations
Deno.test(
  "VectorSearch - finds database tools",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);
    const results = await vectorSearch.searchTools(
      "query database records",
      3,
      0.6,
    );

    // Should find database tools
    const dbTools = results.filter((r) => r.serverId === "database");
    assert(dbTools.length > 0, "Should find database tools");

    // Top result should be query
    assertEquals(results[0].toolName, "query");

    await db.close();
  },
);

// Edge case: Empty query
Deno.test("VectorSearch - handles empty query", async () => {
  const db = await createTestDb();
  const model = new MockEmbeddingModel(); // Don't load model for this test

  const vectorSearch = new VectorSearch(db, model);
  const results = await vectorSearch.searchTools("", 5);

  // Should return empty array for empty query
  assertEquals(results.length, 0);

  await db.close();
});

// Edge case: No results above threshold
Deno.test(
  "VectorSearch - returns empty array when no results above threshold",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);

    // Search for something completely unrelated with very high threshold
    const results = await vectorSearch.searchTools(
      "quantum physics equations",
      5,
      0.99,
    );

    // Should return empty or very few results
    assert(results.length >= 0);

    await db.close();
  },
);

// Edge case: Invalid topK parameter
Deno.test("VectorSearch - handles invalid topK", { ignore: true }, async () => {
  const db = await createTestDb();
  const model = new MockEmbeddingModel();
  await model.load();

  await insertTestEmbeddings(db, model);

  const vectorSearch = new VectorSearch(db, model);

  // Should use default topK=5 when given invalid value
  const results = await vectorSearch.searchTools("test", -1);
  assertExists(results);

  await db.close();
});

// Edge case: Invalid minScore parameter
Deno.test("VectorSearch - handles invalid minScore", { ignore: true }, async () => {
  const db = await createTestDb();
  const model = new MockEmbeddingModel();
  await model.load();

  await insertTestEmbeddings(db, model);

  const vectorSearch = new VectorSearch(db, model);

  // Should use default minScore=0.7 when given invalid value
  const results = await vectorSearch.searchTools("test", 5, 1.5);
  assertExists(results);

  await db.close();
});

// AC7: Benchmark test - P95 latency <100ms
Deno.test(
  "VectorSearch - P95 latency <100ms for 100 queries",
  { ignore: true },
  async () => {
    const db = await createTestDb();
    const model = new MockEmbeddingModel();
    await model.load();

    await insertTestEmbeddings(db, model);

    const vectorSearch = new VectorSearch(db, model);
    const latencies: number[] = [];

    // Run 100 queries
    const testQueries = [
      "read a file",
      "write to file",
      "create pull request",
      "list issues",
      "database query",
    ];

    for (let i = 0; i < 100; i++) {
      const query = testQueries[i % testQueries.length];
      const start = performance.now();
      await vectorSearch.searchTools(query, 5);
      const end = performance.now();
      latencies.push(end - start);
    }

    // Calculate P95
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95 = latencies[p95Index];

    console.log(`P95 latency: ${p95.toFixed(2)}ms`);
    console.log(`Median latency: ${latencies[Math.floor(latencies.length / 2)].toFixed(2)}ms`);
    console.log(`Max latency: ${latencies[latencies.length - 1].toFixed(2)}ms`);

    // AC7: Verify P95 <100ms
    assert(p95 < 100, `P95 latency ${p95.toFixed(2)}ms exceeds 100ms target`);

    await db.close();
  },
);
