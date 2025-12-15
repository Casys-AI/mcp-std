/**
 * Unit tests for GraphRAGEngine.getGraphSnapshot() - Story 6.2
 *
 * Tests critiques pour valider la structure et le comportement de l'API snapshot
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";

async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  await db.connect();

  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  return db;
}

// TEST CRITIQUE 1: Structure du snapshot (valide tous les ACs)
Deno.test("GraphRAGEngine.getGraphSnapshot - structure correcte", async () => {
  const db = await createTestDb();
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const snapshot = engine.getGraphSnapshot();

  // Vérifier que la structure existe
  assertExists(snapshot);
  assertExists(snapshot.nodes);
  assertExists(snapshot.edges);
  assertExists(snapshot.metadata);

  // Vérifier les types
  assertEquals(Array.isArray(snapshot.nodes), true, "nodes doit être un array");
  assertEquals(Array.isArray(snapshot.edges), true, "edges doit être un array");
  assertEquals(typeof snapshot.metadata, "object", "metadata doit être un object");

  // Vérifier les métadonnées requises
  assertEquals(typeof snapshot.metadata.total_nodes, "number");
  assertEquals(typeof snapshot.metadata.total_edges, "number");
  assertEquals(typeof snapshot.metadata.density, "number");
  assertExists(snapshot.metadata.last_updated);

  await db.close();
});

// TEST CRITIQUE 2: Graphe vide ne plante pas (robustesse)
Deno.test("GraphRAGEngine.getGraphSnapshot - graphe vide sans erreur", async () => {
  const db = await createTestDb();
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const snapshot = engine.getGraphSnapshot();

  assertEquals(snapshot.nodes.length, 0);
  assertEquals(snapshot.edges.length, 0);
  assertEquals(snapshot.metadata.total_nodes, 0);
  assertEquals(snapshot.metadata.total_edges, 0);
  assertEquals(snapshot.metadata.density, 0);

  await db.close();
});

// TEST CRITIQUE 3: Structure des nodes (AC3: nodes avec server, PageRank, degree)
Deno.test("GraphRAGEngine.getGraphSnapshot - structure node correcte", async () => {
  const db = await createTestDb();
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // Ajouter un node directement au graphe pour tester la structure
  const graphEngine = engine as any; // Access private graph for testing
  if (graphEngine.graph) {
    graphEngine.graph.addNode("mcp__filesystem__read_file");
    graphEngine.pageRanks = { "mcp__filesystem__read_file": 0.5 };
  }

  const snapshot = engine.getGraphSnapshot();

  if (snapshot.nodes.length > 0) {
    const node = snapshot.nodes[0];

    // Vérifier tous les champs requis pour le dashboard
    assertExists(node.id, "node doit avoir un id");
    assertExists(node.label, "node doit avoir un label");
    assertExists(node.server, "node doit avoir un server");
    assertEquals(typeof node.pagerank, "number", "pagerank doit être un number");
    assertEquals(typeof node.degree, "number", "degree doit être un number");

    // Vérifier le parsing du label et server
    assertEquals(node.label, "read_file");
    assertEquals(node.server, "filesystem");
  }

  await db.close();
});

// TEST CRITIQUE 4: Structure des edges (AC4: edges avec confidence, observed_count)
Deno.test("GraphRAGEngine.getGraphSnapshot - structure edge correcte", async () => {
  const db = await createTestDb();
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // Ajouter un edge directement au graphe pour tester la structure
  const graphEngine = engine as any;
  if (graphEngine.graph) {
    graphEngine.graph.addNode("mcp__filesystem__read_file");
    graphEngine.graph.addNode("mcp__postgres__query");
    graphEngine.graph.addEdge("mcp__filesystem__read_file", "mcp__postgres__query", {
      confidence_score: 0.85,
      observed_count: 5,
    });
  }

  const snapshot = engine.getGraphSnapshot();

  if (snapshot.edges.length > 0) {
    const edge = snapshot.edges[0];

    // Vérifier tous les champs requis pour le dashboard
    assertExists(edge.source, "edge doit avoir un source");
    assertExists(edge.target, "edge doit avoir un target");
    assertEquals(typeof edge.confidence, "number", "confidence doit être un number");
    assertEquals(typeof edge.observed_count, "number", "observed_count doit être un number");

    // Vérifier les ranges valides
    assertEquals(edge.confidence >= 0 && edge.confidence <= 1, true, "confidence entre 0-1");
  }

  await db.close();
});

// TEST CRITIQUE 5: Parsing correct des tool IDs (AC3: couleur par server)
Deno.test("GraphRAGEngine.getGraphSnapshot - parsing des tool IDs multiples", async () => {
  const db = await createTestDb();
  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const graphEngine = engine as any;
  if (graphEngine.graph) {
    // Ajouter plusieurs nodes avec différents servers
    graphEngine.graph.addNode("mcp__filesystem__read_file");
    graphEngine.graph.addNode("mcp__brave-search__search");
    graphEngine.graph.addNode("mcp__sequential-thinking__think");
    graphEngine.pageRanks = {
      "mcp__filesystem__read_file": 0.3,
      "mcp__brave-search__search": 0.4,
      "mcp__sequential-thinking__think": 0.3,
    };
  }

  const snapshot = engine.getGraphSnapshot();

  assertEquals(snapshot.nodes.length, 3);

  // Vérifier que chaque server est correctement parsé
  const servers = snapshot.nodes.map((n) => n.server);
  assertEquals(servers.includes("filesystem"), true);
  assertEquals(servers.includes("brave-search"), true);
  assertEquals(servers.includes("sequential-thinking"), true);

  // Vérifier que les labels sont corrects
  const labels = snapshot.nodes.map((n) => n.label);
  assertEquals(labels.includes("read_file"), true);
  assertEquals(labels.includes("search"), true);
  assertEquals(labels.includes("think"), true);

  await db.close();
});
