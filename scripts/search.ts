import { query } from "../lib/rag.js";

const question = process.argv[2];
const topK = parseInt(process.argv[3] ?? "5", 10);

if (!question) {
  console.error("Usage: npx tsx scripts/search.ts <question> [topK]");
  process.exit(1);
}

console.log(`Searching for: "${question}" (top ${topK})\n`);

const results = await query(question, topK);

for (const [i, r] of results.entries()) {
  console.log(`--- Result ${i + 1} (similarity: ${r.score.toFixed(4)}) ---`);
  console.log(`Source: ${r.source} [${r.sourceType}]`);
  console.log(r.text.length > 300 ? r.text.slice(0, 300) + "..." : r.text);
  console.log();
}
