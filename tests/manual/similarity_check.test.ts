/**
 * Quick test to verify BGE-M3 semantic similarity behavior
 * Tests with truly dissimilar text pairs to determine appropriate threshold
 */

import { pipeline } from "@huggingface/transformers";

// Test pairs with truly different meanings
const testPairs = [
  {
    text1: "send email notification",
    text2: "calculate mathematical function",
    description: "Original test pair (action verbs, system operations)",
  },
  {
    text1: "read file from disk",
    text2: "the color blue is beautiful",
    description: "Technical operation vs aesthetic description",
  },
  {
    text1: "database query execution",
    text2: "playing musical instrument",
    description: "Computing vs Arts/Music",
  },
  {
    text1: "compile source code",
    text2: "cooking pasta recipe",
    description: "Software vs Cooking",
  },
  {
    text1: "network request timeout",
    text2: "mountain climbing adventure",
    description: "Technical error vs Outdoor activity",
  },
  {
    text1: "authentication token validation",
    text2: "butterfly migration pattern",
    description: "Security/Tech vs Nature/Biology",
  },
];

async function main() {
  console.log("🔄 Loading BGE-M3 model...");
  const model = await pipeline("feature-extraction", "Xenova/bge-m3");
  console.log("✓ Model loaded\n");

  console.log("Testing semantic similarity with truly dissimilar text pairs:\n");

  for (const pair of testPairs) {
    // Generate embeddings
    const output1 = await model(pair.text1, { pooling: "mean", normalize: true });
    const output2 = await model(pair.text2, { pooling: "mean", normalize: true });

    const embedding1 = Array.from(output1.data as Float32Array);
    const embedding2 = Array.from(output2.data as Float32Array);

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const cosineSimilarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));

    console.log(`📊 ${pair.description}`);
    console.log(`   Text 1: "${pair.text1}"`);
    console.log(`   Text 2: "${pair.text2}"`);
    console.log(`   Similarity: ${cosineSimilarity.toFixed(3)}`);
    console.log(`   Below 0.3? ${cosineSimilarity < 0.3 ? "✓ YES" : "✗ NO"}`);
    console.log();
  }

  console.log("\n📈 Analysis:");
  console.log("If most similarities are > 0.3, the test threshold needs adjustment.");
  console.log("If most similarities are < 0.3, the original test pair is not truly dissimilar.");
}

main().catch(console.error);
