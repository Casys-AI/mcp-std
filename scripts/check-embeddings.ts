import { load } from "@std/dotenv";
import { getDb } from "../src/db/mod.ts";

await load({ export: true });
const db = await getDb();

// Embeddings are in workflow_pattern (capability), not execution_trace (migration 030)
const result = await db.query(`
  SELECT
    COUNT(*) as total,
    COUNT(intent_embedding) as with_embedding,
    COUNT(*) - COUNT(intent_embedding) as missing
  FROM workflow_pattern
`);

console.log("=== Missing Embeddings Analysis ===\n");
const r = result[0] as Record<string, unknown>;
console.log(`Total traces: ${r.total}`);
console.log(`With embedding: ${r.with_embedding}`);
console.log(`Missing: ${r.missing}`);
console.log(`Oldest missing: ${r.oldest_missing}`);
console.log(`Newest missing: ${r.newest_missing}`);

// Check which capabilities are missing embeddings
const missing = await db.query(`
  SELECT pattern_id, description, created_at
  FROM workflow_pattern
  WHERE intent_embedding IS NULL
  ORDER BY created_at DESC
  LIMIT 10
`);
console.log("\n=== Capabilities Without Embeddings ===");
for (const row of missing) {
  const r = row as Record<string, unknown>;
  const date = (r.created_at as Date).toISOString().slice(0,10);
  const desc = (r.description as string || "NULL").slice(0,50);
  console.log(`${date}: ${desc}...`);
}

// Count traces affected
const affected = await db.query(`
  SELECT COUNT(*) as count
  FROM execution_trace et
  LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
  WHERE wp.intent_embedding IS NULL
`);
console.log(`\nTraces affected: ${(affected[0] as Record<string,unknown>).count}`);

await db.close();
