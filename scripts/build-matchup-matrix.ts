/**
 * Build the Pokemon Champions matchup matrix.
 *
 * Generates a CSV of all pairwise matchup scores for 186 base + 59 Mega Pokemon.
 *
 * Usage:
 *   npx tsx scripts/build-matchup-matrix.ts                          # Basic matchup matrix
 *   npx tsx scripts/build-matchup-matrix.ts --top-only               # Only Pikalytics-tracked Pokemon
 *   npx tsx scripts/build-matchup-matrix.ts --efficiency             # Full efficiency coefficient matrix
 *   npx tsx scripts/build-matchup-matrix.ts --efficiency --top-only  # Efficiency, meta Pokemon only
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateAllSets, buildMatchupMatrix, matrixToCSV } from "../lib/calc/matchup.js";
import { buildEfficiencyMatrix, efficiencyToCSV } from "../lib/calc/efficiency.js";
import type { EfficiencyEntry } from "../lib/calc/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const topOnly = process.argv.includes("--top-only");
const efficiencyMode = process.argv.includes("--efficiency");

console.log("Generating standard competitive sets...");
let sets = generateAllSets();

if (topOnly) {
  sets = sets.filter((s) => s.item.length > 0);
  console.log(`Filtered to ${sets.length} Pokemon with Pikalytics data.`);
} else {
  console.log(`Generated ${sets.length} sets (186 base + 59 Mega forms).`);
}

const startTime = Date.now();

if (efficiencyMode) {
  // ── Efficiency coefficient matrix ──
  const entries = buildEfficiencyMatrix(sets);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Efficiency matrix built in ${elapsed}s.`);

  const csv = efficiencyToCSV(entries);
  const outPath = join(ROOT, "efficiency_matrix.csv");
  writeFileSync(outPath, csv);
  console.log(`Written to ${outPath} (${entries.length} rows, ${(csv.length / 1024).toFixed(0)} KB)`);

  // Print top 20 by efficiency coefficient
  const sorted = [...entries].sort((a, b) => b.efficiency - a.efficiency);
  console.log("\nTop 20 most efficient matchups (E coefficient):");
  for (const e of sorted.slice(0, 20)) {
    console.log(
      `  ${e.attacker.padEnd(22)} > ${e.defender.padEnd(22)} | E=${e.efficiency.toFixed(3).padStart(7)} | off=${e.subScores.offenseScore.toFixed(2)} def=${e.subScores.defenseScore.toFixed(2)} spd=${e.subScores.speedScore.toFixed(2)} typ=${e.subScores.typingScore.toFixed(2)}`
    );
  }

  // Print top 20 hardest walls by efficiency
  const walls = [...entries].sort((a, b) => a.efficiency - b.efficiency);
  console.log("\nTop 20 hardest walls (lowest E coefficient):");
  for (const e of walls.slice(0, 20)) {
    console.log(
      `  ${e.defender.padEnd(22)} walls ${e.attacker.padEnd(22)} | E=${e.efficiency.toFixed(3).padStart(7)} | off=${e.subScores.offenseScore.toFixed(2)} def=${e.subScores.defenseScore.toFixed(2)} spd=${e.subScores.speedScore.toFixed(2)} typ=${e.subScores.typingScore.toFixed(2)}`
    );
  }

  // Print meta-weighted summary: average efficiency per Pokemon vs meta
  const metaEntries = entries.filter((e) => e.isMeta);
  const avgByPokemon = new Map<string, { sum: number; count: number }>();
  for (const e of metaEntries) {
    const key = e.attacker;
    const existing = avgByPokemon.get(key) ?? { sum: 0, count: 0 };
    existing.sum += e.efficiency * e.metaWeight;
    existing.count++;
    avgByPokemon.set(key, existing);
  }
  const ranked = [...avgByPokemon.entries()]
    .map(([name, { sum, count }]) => ({ name, avgEff: sum / count }))
    .sort((a, b) => b.avgEff - a.avgEff);

  console.log("\nTop 30 Pokemon by meta-weighted efficiency:");
  for (const { name, avgEff } of ranked.slice(0, 30)) {
    console.log(`  ${name.padEnd(22)} avg E*w = ${avgEff.toFixed(4)}`);
  }
} else {
  // ── Original matchup matrix ──
  const entries = buildMatchupMatrix(sets);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Matrix built in ${elapsed}s.`);

  const csv = matrixToCSV(entries);
  const outPath = join(ROOT, "matchup_matrix.csv");
  writeFileSync(outPath, csv);
  console.log(`Written to ${outPath} (${entries.length} rows, ${(csv.length / 1024).toFixed(0)} KB)`);

  const sorted = [...entries].sort((a, b) => b.score - a.score);
  console.log("\nTop 20 most dominant matchups:");
  for (const e of sorted.slice(0, 20)) {
    console.log(
      `  ${e.attacker.padEnd(22)} > ${e.defender.padEnd(22)} | ${e.bestMove.padEnd(18)} ${String(e.damagePct + "%").padStart(7)} | score ${e.score.toFixed(2)}`
    );
  }

  console.log("\nTop 20 hardest walls (defender favored):");
  const walls = [...entries].sort((a, b) => a.score - b.score);
  for (const e of walls.slice(0, 20)) {
    console.log(
      `  ${e.defender.padEnd(22)} walls ${e.attacker.padEnd(22)} | takes ${String(e.damagePct + "%").padStart(7)} | score ${e.score.toFixed(2)}`
    );
  }
}
