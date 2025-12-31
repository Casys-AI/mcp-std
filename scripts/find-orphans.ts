import { load } from "@std/dotenv";
import { getDb } from "../src/db/mod.ts";

await load({ export: true });
const db = await getDb();

// Find orphan traces (capability deleted)
const orphans = await db.query(`
  SELECT et.capability_id, COUNT(*) as count
  FROM execution_trace et
  LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
  WHERE wp.pattern_id IS NULL
  GROUP BY et.capability_id
  ORDER BY count DESC
  LIMIT 10
`);

console.log("=== Orphan Traces (capability deleted) ===\n");
let total = 0;
for (const r of orphans) {
  const row = r as Record<string, unknown>;
  const id = row.capability_id as string | null;
  const count = row.count as number;
  total += count;
  console.log(`  ${id ? id.substring(0, 8) + "..." : "NULL"} → ${count} traces`);
}
console.log(`\nTotal orphan traces: ${total}`);

await db.close();
