/**
 * Generate and cache BGE-M3 embeddings for benchmark fixtures
 *
 * Run once to pre-compute embeddings:
 *   deno run --allow-all tests/benchmarks/fixtures/generate-embeddings.ts
 *
 * @module tests/benchmarks/fixtures/generate-embeddings
 */

import { EmbeddingModel } from "../../../src/vector/embeddings.ts";
import process from "node:process";

const FIXTURE_PATH = new URL("./scenarios/medium-graph.json", import.meta.url);

console.log("📦 Loading fixture...");
const fixtureText = await Deno.readTextFile(FIXTURE_PATH);
const fixture = JSON.parse(fixtureText);

console.log("🔄 Loading BGE-M3 model...");
const model = new EmbeddingModel();
await model.load();
console.log("✅ Model loaded!");

// Cache for deduplication
const cache = new Map<string, number[]>();

async function getEmbedding(text: string): Promise<number[]> {
  if (cache.has(text)) return cache.get(text)!;
  const emb = await model.encode(text);
  cache.set(text, emb);
  return emb;
}

// Generate embeddings for capabilities
console.log("🧮 Generating embeddings for capabilities...");
for (const cap of fixture.nodes.capabilities) {
  const text = cap.description || cap.id;
  cap.embedding = await getEmbedding(text);
  process.stdout.write(".");
}
console.log(` ${fixture.nodes.capabilities.length} capabilities done!`);

// Generate embeddings for tools
console.log("🧮 Generating embeddings for tools...");
for (const tool of fixture.nodes.tools) {
  const text = tool.id.replace(/__/g, " ").replace(/_/g, " ");
  tool.embedding = await getEmbedding(text);
  process.stdout.write(".");
}
console.log(` ${fixture.nodes.tools.length} tools done!`);

// Generate embeddings for episodic events (intents)
console.log("🧮 Generating embeddings for episodic events...");
if (fixture.episodicEvents) {
  for (const event of fixture.episodicEvents) {
    event.intentEmbedding = await getEmbedding(event.intent);
    process.stdout.write(".");
  }
  console.log(` ${fixture.episodicEvents.length} events done!`);
}

// Generate embeddings for test queries
console.log("🧮 Generating embeddings for test queries...");
if (fixture.testQueries) {
  for (const query of fixture.testQueries) {
    query.intentEmbedding = await getEmbedding(query.intent);
    process.stdout.write(".");
  }
  console.log(` ${fixture.testQueries.length} queries done!`);
}

// Save updated fixture
console.log("💾 Saving fixture with embeddings...");
await Deno.writeTextFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2));

console.log("✅ Done! Embeddings saved to medium-graph.json");
console.log(`   Total unique embeddings: ${cache.size}`);

await model.dispose();
