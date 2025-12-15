/**
 * Integration tests for dashboard HTTP endpoints - Story 6.2
 *
 * Tests the /dashboard and /api/graph/snapshot endpoints
 * served by the Casys PML gateway server.
 */

import { assertEquals, assertExists } from "@std/assert";
import { PMLGatewayServer } from "../../src/mcp/gateway-server.ts";
import { createDefaultClient, PGliteClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import { GraphRAGEngine } from "../../src/graphrag/graph-engine.ts";
import { VectorSearch } from "../../src/vector/search.ts";
import { DAGSuggester } from "../../src/graphrag/dag-suggester.ts";
import { ParallelExecutor } from "../../src/dag/executor.ts";
import { EmbeddingModel } from "../../src/vector/embeddings.ts";

const TEST_PORT = 3006; // Use 3006-3008 range to avoid conflicts with dev server (3003)

/**
 * Helper to create a fully initialized gateway for testing
 */
async function createTestGateway(db: PGliteClient): Promise<{
  gateway: PMLGatewayServer;
  graphEngine: GraphRAGEngine;
}> {
  // Initialize embedding model
  const embeddingModel = new EmbeddingModel();
  await embeddingModel.load();

  // Create dependencies
  const vectorSearch = new VectorSearch(db, embeddingModel);
  const graphEngine = new GraphRAGEngine(db);
  await graphEngine.syncFromDatabase();
  const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

  // Create mock executor (no actual MCP clients needed for dashboard tests)
  const mockToolExecutor = async () => ({ success: true, result: null });
  const executor = new ParallelExecutor(mockToolExecutor, {
    verbose: false,
    taskTimeout: 30000,
  });

  // Empty MCP clients map (dashboard doesn't need actual MCP connections)
  const mcpClients = new Map();

  const gateway = new PMLGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    mcpClients,
    undefined, // capabilityStore
    undefined, // adaptiveThresholdManager
    {
      name: "test-gateway",
      version: "1.0.0",
    },
  );

  return { gateway, graphEngine };
}

Deno.test({
  name: "GET /dashboard - redirects to Fresh dashboard",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = createDefaultClient();
    await db.connect();

    const { gateway } = await createTestGateway(db);

    // Start server in background
    gateway.startHttp(TEST_PORT);

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    try {
      // Make request to dashboard endpoint (don't follow redirects)
      const response = await fetch(`http://localhost:${TEST_PORT}/dashboard`, {
        redirect: "manual",
      });

      // Verify redirect response (Story 6.2 migrated dashboard to Fresh)
      assertEquals(response.status, 302);
      assertEquals(response.headers.get("Location"), "http://localhost:8080/dashboard");

      // Consume body to prevent leak
      await response.body?.cancel();
    } finally {
      // Cleanup
      await gateway.stop();
      await db.close();
      // Wait for port to be released
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  },
});

Deno.test({
  name: "GET /api/graph/snapshot - returns JSON",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = createDefaultClient();
    await db.connect();

    const { gateway } = await createTestGateway(db);

    // Start server in background
    gateway.startHttp(TEST_PORT + 1);

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    try {
      // Make request to snapshot API endpoint
      const response = await fetch(`http://localhost:${TEST_PORT + 1}/api/graph/snapshot`);

      // Verify response
      assertEquals(response.status, 200);
      assertEquals(response.headers.get("Content-Type"), "application/json");

      const snapshot = await response.json();

      // Verify structure
      assertExists(snapshot.nodes);
      assertExists(snapshot.edges);
      assertExists(snapshot.metadata);

      // Verify arrays
      assertEquals(Array.isArray(snapshot.nodes), true);
      assertEquals(Array.isArray(snapshot.edges), true);

      // Verify metadata
      assertEquals(typeof snapshot.metadata.total_nodes, "number");
      assertEquals(typeof snapshot.metadata.total_edges, "number");
      assertEquals(typeof snapshot.metadata.density, "number");
      assertExists(snapshot.metadata.last_updated);
    } finally {
      // Cleanup
      await gateway.stop();
      await db.close();
      // Wait for port to be released (needs longer delay for HTTP server cleanup due to TCP TIME_WAIT)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },
});

Deno.test({
  name: "GET /api/graph/snapshot - with graph data",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Use in-memory database for test isolation
    const db = new PGliteClient("memory://");
    await db.connect();
    const migrationRunner = new MigrationRunner(db);
    await migrationRunner.runUp(getAllMigrations());

    const { gateway, graphEngine } = await createTestGateway(db);

    // Add some graph data before starting server
    // Create a simple tool sequence: read_file -> query -> create_issue
    await graphEngine.addEdge(
      "mcp__filesystem__read_file",
      "mcp__postgres__query",
      { weight: 1.0, count: 1, source: "test" },
    );
    await graphEngine.addEdge(
      "mcp__postgres__query",
      "mcp__github__create_issue",
      { weight: 1.0, count: 1, source: "test" },
    );

    // Start server in background
    gateway.startHttp(TEST_PORT + 2);

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    try {
      // Make request to snapshot API endpoint
      const response = await fetch(`http://localhost:${TEST_PORT + 2}/api/graph/snapshot`);

      assertEquals(response.status, 200);

      const snapshot = await response.json();

      // Verify graph has data
      assertEquals(snapshot.nodes.length, 3);
      assertEquals(snapshot.edges.length, 2);
      assertEquals(snapshot.metadata.total_nodes, 3);
      assertEquals(snapshot.metadata.total_edges, 2);

      // Verify node structure
      const node = snapshot.nodes[0];
      assertExists(node.id);
      assertExists(node.label);
      assertExists(node.server);
      assertEquals(typeof node.pagerank, "number");
      assertEquals(typeof node.degree, "number");

      // Verify edge structure
      const edge = snapshot.edges[0];
      assertExists(edge.source);
      assertExists(edge.target);
      assertEquals(typeof edge.confidence, "number");
      assertEquals(typeof edge.observed_count, "number");

      // Verify confidence and pagerank are in valid ranges
      assertEquals(edge.confidence >= 0 && edge.confidence <= 1, true);
      assertEquals(node.pagerank >= 0 && node.pagerank <= 1, true);
    } finally {
      // Cleanup
      await gateway.stop();
      await db.close();
    }
  },
});

// Note: "handles missing file" test removed - dashboard now redirects to Fresh (Story 6.2)
