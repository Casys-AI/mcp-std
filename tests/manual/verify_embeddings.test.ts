/**
 * Manual test to verify embeddings work and validate article numbers
 * Run with: deno test tests/manual/verify_embeddings.test.ts --allow-all
 */

import { EmbeddingModel } from "../../src/vector/embeddings.ts";

Deno.test("Manual - Download model and verify embeddings", async () => {
  console.log("\n⏳ Téléchargement du modèle BGE-Large-EN-v1.5...");
  console.log("   (Cela peut prendre 2-3 minutes au premier lancement)\n");

  const model = new EmbeddingModel();
  const startLoad = performance.now();
  await model.load();
  const loadTime = performance.now() - startLoad;

  console.log(`✅ Modèle chargé en ${(loadTime / 1000).toFixed(1)}s\n`);

  // Test basique d'embedding
  console.log("🧪 Test d'embedding...");
  const text1 = "read a file from the filesystem";
  const text2 = "write content to a file";
  const text3 = "create a GitHub pull request";

  const start = performance.now();
  const emb1 = await model.encode(text1);
  const emb2 = await model.encode(text2);
  const emb3 = await model.encode(text3);
  const encodeTime = performance.now() - start;

  console.log(`   Dimension des embeddings : ${emb1.length}`);
  console.log(`   Temps pour 3 embeddings : ${encodeTime.toFixed(1)}ms\n`);

  // Calcul de similarité cosine
  function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  console.log("📊 Similarités cosine :");
  const sim12 = cosineSimilarity(emb1, emb2);
  const sim13 = cosineSimilarity(emb1, emb3);
  const sim23 = cosineSimilarity(emb2, emb3);

  console.log(`   "read file" vs "write file" : ${sim12.toFixed(3)} (devraient être similaires)`);
  console.log(`   "read file" vs "GitHub PR"  : ${sim13.toFixed(3)} (devraient être différents)`);
  console.log(`   "write file" vs "GitHub PR" : ${sim23.toFixed(3)} (devraient être différents)\n`);

  if (sim12 > 0.7 && sim13 < 0.5) {
    console.log("✅ Le modèle fonctionne correctement !\n");
  } else {
    console.log("⚠️  Résultats inattendus\n");
  }
});
