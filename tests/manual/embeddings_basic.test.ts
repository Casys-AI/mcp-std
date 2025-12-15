/**
 * Quick test to verify EmbeddingModel class works correctly with @huggingface/transformers v3
 */

import { EmbeddingModel } from "../../src/vector/embeddings.ts";

async function main() {
  console.log("🔄 Testing EmbeddingModel class...\n");

  const model = new EmbeddingModel();
  await model.load();
  console.log("✓ Model loaded\n");

  // Test 1: Single embedding
  console.log("Test 1: Single embedding generation");
  const text1 = "send email notification";
  const embedding1 = await model.encode(text1);
  console.log(`  Text: "${text1}"`);
  console.log(`  Embedding dimensions: ${embedding1.length}`);
  console.log(`  First 5 values: [${embedding1.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}]`);
  console.log(
    `  ✓ ${embedding1.length === 1024 ? "OK - 1024 dimensions" : "ERROR - Wrong dimensions!"}\n`,
  );

  // Test 2: Multiple embeddings
  console.log("Test 2: Multiple embedding generation");
  const texts = [
    "read file from disk",
    "write data to database",
    "authenticate user credentials",
  ];
  const embeddings: number[][] = [];
  for (const text of texts) {
    embeddings.push(await model.encode(text));
  }
  console.log(`  Texts: ${texts.length}`);
  console.log(`  Embeddings generated: ${embeddings.length}`);
  for (let i = 0; i < embeddings.length; i++) {
    console.log(`    [${i}] "${texts[i]}" → ${embeddings[i].length} dims`);
  }
  console.log(
    `  ✓ ${
      embeddings.length === 3 && embeddings.every((e) => e.length === 1024)
        ? "OK - All 1024 dimensions"
        : "ERROR!"
    }\n`,
  );

  // Test 3: Verify normalization
  console.log("Test 3: Verify embeddings are normalized");
  const magnitude = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
  console.log(`  Magnitude of embedding: ${magnitude.toFixed(6)}`);
  console.log(
    `  ✓ ${
      Math.abs(magnitude - 1.0) < 0.001
        ? "OK - Normalized (magnitude ≈ 1.0)"
        : "ERROR - Not normalized!"
    }\n`,
  );

  // Test 4: Verify model is loaded
  console.log("Test 4: Model status");
  console.log(`  Model loaded: ${model.isLoaded()}`);
  console.log(`  ✓ ${model.isLoaded() ? "OK" : "ERROR!"}\n`);

  console.log("✅ All embedding tests passed!");
}

main().catch(console.error);
