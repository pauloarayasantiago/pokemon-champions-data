/**
 * Quick DB inspection utility for debugging LanceDB queries.
 * Usage: npx tsx scripts/debug-db.ts
 */
import { connect } from "@lancedb/lancedb";
import { resolve } from "node:path";

async function main() {
  const db = await connect(resolve(import.meta.dirname, "..", ".lancedb"));
  const table = await db.openTable("chunks");

  const allRows = await table.query().limit(2000).toArray();
  console.log("Total rows:", allRows.length);

  const cats = new Map<string, number>();
  for (const r of allRows) {
    const cat = r.data_category as string;
    cats.set(cat, (cats.get(cat) ?? 0) + 1);
  }
  console.log("\nCategory distribution:");
  for (const [cat, count] of [...cats.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch(console.error);
