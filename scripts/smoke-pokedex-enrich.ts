// Smoke-test for R2 — pokedex enrichment with Pikalytics context.
// Inline-imports the helpers from tools.ts via dynamic import to dodge the
// CJS/ESM dance that direct imports would need.

import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "csv-parse/sync";

interface Row {
  rank: number;
  usagePct: number;
  topMoves: Array<{ name: string; pct: number }>;
  topItems: Array<{ name: string; pct: number }>;
}

function parsePipeList(s: string | undefined): Array<{ name: string; pct: number }> {
  if (!s) return [];
  return s.split("|").map((entry) => {
    const idx = entry.lastIndexOf(":");
    if (idx === -1) return { name: entry.trim(), pct: 0 };
    return { name: entry.slice(0, idx).trim(), pct: parseFloat(entry.slice(idx + 1)) || 0 };
  }).filter((e) => e.name.length > 0);
}

const raw = readFileSync(join(process.cwd(), "pikalytics_usage.csv"), "utf-8");
const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
const map = new Map<string, Row>();
for (const r of rows) {
  const name = (r.pokemon ?? "").trim().toLowerCase();
  if (!name) continue;
  map.set(name, {
    rank: parseInt(r.rank, 10) || 0,
    usagePct: parseFloat(r.usage_pct) || 0,
    topMoves: parsePipeList(r.top_moves),
    topItems: parsePipeList(r.top_items),
  });
}

console.log("Pikalytics rows loaded:", map.size);
console.log("\n--- Froslass ---");
const fro = map.get("froslass");
console.log(JSON.stringify({ rank: fro?.rank, usagePct: fro?.usagePct, topMoves: fro?.topMoves.slice(0, 4), topItems: fro?.topItems.slice(0, 3) }, null, 2));

console.log("\n--- Krookodile ---");
const kro = map.get("krookodile");
console.log(JSON.stringify({ rank: kro?.rank, usagePct: kro?.usagePct, topMoves: kro?.topMoves.slice(0, 4), topItems: kro?.topItems.slice(0, 3) }, null, 2));

console.log("\n--- Unknown low-usage Pokemon ---");
console.log(map.get("flapple") ? "Flapple in pikalytics" : "Flapple not in pikalytics (likely below cutoff)");
