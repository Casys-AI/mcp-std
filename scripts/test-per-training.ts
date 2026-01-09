/**
 * Quick test of PER training
 */
import { spawnSHGATTraining } from "../src/graphrag/algorithms/shgat/spawn-training.ts";

// Generate fake capabilities
const N_CAPS = 50;
const K = 1024;

function randomVec(len: number): number[] {
  return Array.from({ length: len }, () => Math.random() - 0.5);
}

console.log(`Generating ${N_CAPS} fake capabilities...`);
const capabilities = Array.from({ length: N_CAPS }, (_, i) => ({
  id: `cap_${i}`,
  embedding: randomVec(K),
  toolsUsed: [`tool_${i % 10}`],
  successRate: 0.8,
}));

// Generate fake training examples
const N_EXAMPLES = 200;
console.log(`Generating ${N_EXAMPLES} fake training examples...`);

const examples = Array.from({ length: N_EXAMPLES }, (_, i) => {
  const posCapIdx = Math.floor(Math.random() * N_CAPS);
  const negCapIdx = (posCapIdx + 1 + Math.floor(Math.random() * (N_CAPS - 1))) % N_CAPS;

  return {
    intentEmbedding: randomVec(K),
    contextTools: [],
    candidateId: `cap_${posCapIdx}`,
    outcome: Math.random() > 0.3 ? 1 : 0, // 70% success rate
    negativeCapIds: [`cap_${negCapIdx}`],
  };
});

console.log("\n🚀 Launching PER training (defaults: 20 epochs, batch=64)...\n");

const result = await spawnSHGATTraining({
  capabilities,
  examples,
  // Uses production defaults: epochs=20, batchSize=64
});

console.log("\n" + "=".repeat(60));
if (result.success) {
  console.log("✅ Training completed!");
  console.log(`   Final loss: ${result.finalLoss?.toFixed(4)}`);
  console.log(`   Final accuracy: ${((result.finalAccuracy ?? 0) * 100).toFixed(1)}%`);
  console.log(`   TD errors collected: ${result.tdErrors?.length ?? 0}`);
} else {
  console.log("❌ Training failed:", result.error);
}
