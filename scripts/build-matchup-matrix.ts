/**
 * Build the Pokemon Champions matchup matrix.
 *
 * Generates a CSV of all pairwise matchup scores for 186 base + 59 Mega Pokemon.
 * Each row: attacker, defender, best_move, damage_%, reverse_move, reverse_%, speed_advantage, score
 *
 * Usage:
 *   npx tsx scripts/build-matchup-matrix.ts
 *   npx tsx scripts/build-matchup-matrix.ts --top-only   # Only Pokemon with Pikalytics data
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateAllSets, buildMatchupMatrix, matrixToCSV } from "../lib/calc/matchup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const topOnly = process.argv.includes("--top-only");

console.log("Generating standard competitive sets...");
let sets = generateAllSets();

if (topOnly) {
  // Filter to only Pokemon with reasonable usage (have items = have Pikalytics data)
  sets = sets.filter((s) => s.item.length > 0);
  console.log(`Filtered to ${sets.length} Pokemon with Pikalytics data.`);
} else {
  console.log(`Generated ${sets.length} sets (186 base + 59 Mega forms).`);
}

const startTime = Date.now();
const entries = buildMatchupMatrix(sets);
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`Matrix built in ${elapsed}s.`);

const csv = matrixToCSV(entries);
const outPath = join(ROOT, "matchup_matrix.csv");
writeFileSync(outPath, csv);

console.log(`Written to ${outPath} (${entries.length} rows, ${(csv.length / 1024).toFixed(0)} KB)`);

// Print top 20 most favorable matchups
const sorted = [...entries].sort((a, b) => b.score - a.score);
console.log("\nTop 20 most dominant matchups:");
for (const e of sorted.slice(0, 20)) {
  console.log(
    `  ${e.attacker.padEnd(22)} > ${e.defender.padEnd(22)} | ${e.bestMove.padEnd(18)} ${String(e.damagePct + "%").padStart(7)} | score ${e.score.toFixed(2)}`
  );
}

// Print top 20 hardest walls
console.log("\nTop 20 hardest walls (defender favored):");
const walls = [...entries].sort((a, b) => a.score - b.score);
for (const e of walls.slice(0, 20)) {
  console.log(
    `  ${e.defender.padEnd(22)} walls ${e.attacker.padEnd(22)} | takes ${String(e.damagePct + "%").padStart(7)} | score ${e.score.toFixed(2)}`
  );
}
