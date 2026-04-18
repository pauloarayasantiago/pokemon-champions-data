/**
 * Quick DB inspection utility for debugging the Supabase chunk index.
 * Usage: npx tsx scripts/debug-db.ts
 */
import { supabaseServer } from "../lib/supabase.js";

async function main() {
  const supabase = supabaseServer();

  const { count, error: countErr } = await supabase
    .from("pc_chunks")
    .select("*", { count: "exact", head: true });
  if (countErr) throw new Error(countErr.message);
  console.log("Total rows:", count);

  const cats = new Map<string, number>();
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("pc_chunks")
      .select("data_category")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cat = r.data_category as string;
      cats.set(cat, (cats.get(cat) ?? 0) + 1);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log("\nCategory distribution:");
  for (const [cat, n] of [...cats.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${n}`);
  }
}

main().catch(console.error);
