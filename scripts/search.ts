import { query, getStaleness } from "../lib/rag.js";

const question = process.argv[2];
const topK = parseInt(process.argv[3] ?? "5", 10);

if (!question) {
  console.error("Usage: npx tsx scripts/search.ts <question> [topK]");
  process.exit(1);
}

function formatHoursAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

const staleness = await getStaleness().catch(() => null);
if (staleness) {
  const parts = staleness.sources
    .map((s) => `${s.name}=${formatHoursAgo(s.hoursSinceMostRecent)}${s.hasFsDrift ? "*" : ""}`)
    .join(", ");
  const maxAge = staleness.sources.reduce((m, s) => Math.max(m, s.hoursSinceMostRecent), 0);
  const warn = maxAge > 72 ? " [STALE >72h]" : "";
  const driftNote = staleness.hasFsDrift ? " (* = local fs drift)" : "";
  console.log(`Data refreshed ${formatHoursAgo(maxAge)} ago${warn} · ${parts}${driftNote}`);
}

console.log(`Searching for: "${question}" (top ${topK})\n`);

const results = await query(question, topK);

for (const [i, r] of results.entries()) {
  console.log(`--- Result ${i + 1} (similarity: ${r.score.toFixed(4)}) ---`);
  console.log(`Source: ${r.source} [${r.sourceType}]`);
  console.log(r.text.length > 300 ? r.text.slice(0, 300) + "..." : r.text);
  console.log();
}
