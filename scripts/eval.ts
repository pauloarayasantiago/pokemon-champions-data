/**
 * Evaluation harness for the RAG search pipeline.
 *
 * Runs all test cases from eval-data.ts, computes per-query and aggregate
 * metrics, and prints a formatted report.
 *
 * Usage:
 *   npx tsx scripts/eval.ts              # run all cases
 *   npx tsx scripts/eval.ts --category exact-lookup  # filter by category
 */

import { query as ragQuery, type Result } from "../lib/rag.js";
import { EVAL_CASES, type EvalCase } from "../lib/eval-data.js";

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

interface CaseResult {
  case: EvalCase;
  results: Result[];
  recall: number;          // fraction of expectedIds found in topK
  mrr: number;             // reciprocal rank of first expected hit
  noForbidden: boolean;    // true if no forbidden IDs appeared
  sourcesFound: boolean;   // true if all expectedSources matched
  pass: boolean;           // recall === 1 AND noForbidden AND sourcesFound
  details: string[];       // human-readable notes
}

function evaluateCase(evalCase: EvalCase, results: Result[]): CaseResult {
  const resultIds = results.map((r) => r.metadata?.id ?? r.source);
  const details: string[] = [];

  // --- Recall: fraction of expectedIds found ---
  let expectedFound = 0;
  let firstExpectedRank = Infinity;

  for (const expected of evalCase.expectedIds ?? []) {
    const idx = results.findIndex((r) => {
      // Try chunk ID from metadata, fall back to constructing from source
      const chunkId =
        (r.metadata as Record<string, unknown>)?.id as string | undefined;
      // Use startsWith for prefix matching (e.g. "mega:mega-dragonite" matches "mega:mega-dragonite:0")
      if (chunkId && chunkId.startsWith(expected)) return true;
      // Also check the raw text for the ID prefix
      return false;
    });
    if (idx !== -1) {
      expectedFound++;
      if (idx < firstExpectedRank) firstExpectedRank = idx;
    } else {
      details.push(`MISS: expected "${expected}" not in top ${evalCase.topK}`);
    }
  }

  const expectedIds = evalCase.expectedIds ?? [];
  const recall =
    expectedIds.length > 0
      ? expectedFound / expectedIds.length
      : 1; // no expectations = auto-pass

  const mrr = firstExpectedRank < Infinity ? 1 / (firstExpectedRank + 1) : 0;

  // --- Forbidden IDs check ---
  let noForbidden = true;
  for (const forbidden of evalCase.forbiddenIds ?? []) {
    const found = results.some((r) => {
      const chunkId =
        (r.metadata as Record<string, unknown>)?.id as string | undefined;
      if (chunkId && chunkId.startsWith(forbidden)) return true;
      return false;
    });
    if (found) {
      noForbidden = false;
      details.push(`FORBIDDEN: "${forbidden}" appeared in results`);
    }
  }

  // --- Source match check ---
  let sourcesFound = true;
  for (const src of evalCase.expectedSources ?? []) {
    const found = results.some((r) => r.source.includes(src));
    if (!found) {
      sourcesFound = false;
      details.push(`MISS-SOURCE: "${src}" not in result sources`);
    }
  }

  const pass = recall === 1 && noForbidden && sourcesFound;

  return { case: evalCase, results, recall, mrr, noForbidden, sourcesFound, pass, details };
}

// ---------------------------------------------------------------------------
// Chunk ID extraction: we need chunk IDs but rag.ts doesn't return them.
// We'll add a workaround by also searching the metadata for the id field.
// ---------------------------------------------------------------------------

// The current rag.ts returns metadata parsed from JSON which includes all
// metadata fields from the chunker. We need to also get the `id` column.
// For now, we'll do ID matching by examining the text content and source.

// Better approach: patch rag.ts to also return the chunk `id`. But since
// we're in Phase 0 (read-only eval), let's match by source + metadata.

function matchesId(result: Result, targetId: string): boolean {
  const meta = result.metadata as Record<string, unknown>;

  // Direct metadata fields that map to chunk ID components
  const name = (typeof meta.name === "string") ? meta.name.toLowerCase() : undefined;
  const pokemon = (typeof meta.pokemon === "string") ? meta.pokemon.toLowerCase() : undefined;
  const megaName = (typeof meta.mega_name === "string") ? meta.mega_name.toLowerCase() : undefined;
  const basePokemon = (typeof meta.base_pokemon === "string") ? meta.base_pokemon.toLowerCase() : undefined;

  const parts = targetId.split(":");
  const prefix = parts[0];
  const slug = parts.slice(1).join(":");

  switch (prefix) {
    case "pokemon":
      return result.source === "pokemon_champions.csv" && name === slug.replace(/-/g, " ");
    case "mega":
      return result.source === "mega_evolutions.csv" &&
        (megaName?.replace(/\s+/g, "-").toLowerCase().startsWith(slug) ?? false);
    case "move":
      return result.source === "moves.csv" && name === slug.replace(/-/g, " ");
    case "item":
      return result.source === "items.csv" && name === slug.replace(/-/g, " ");
    case "usage":
      return result.source === "pikalytics_usage.csv" && pokemon === slug.replace(/-/g, " ");
    case "updated-attack":
      return result.source === "updated_attacks.csv" && name === slug.replace(/-/g, " ");
    case "ability":
      return result.source === "new_abilities.csv" && name === slug.replace(/-/g, " ");
    case "mega-ability":
      return result.source === "mega_abilities.csv" && pokemon === slug.replace(/-/g, " ");
    case "team":
      return result.source === "tournament_teams.csv" &&
        (meta.team_id as string)?.toLowerCase().replace(/\s+/g, "-") === slug;
    default:
      return false;
  }
}

function evaluateCaseV2(evalCase: EvalCase, results: Result[]): CaseResult {
  const details: string[] = [];
  const expectedIds = evalCase.expectedIds ?? [];

  // --- Recall ---
  let expectedFound = 0;
  let firstExpectedRank = Infinity;

  for (const expected of expectedIds) {
    const idx = results.findIndex((r) => matchesId(r, expected));
    if (idx !== -1) {
      expectedFound++;
      if (idx < firstExpectedRank) firstExpectedRank = idx;
      details.push(`HIT: "${expected}" at rank ${idx + 1}`);
    } else {
      details.push(`MISS: expected "${expected}" not in top ${evalCase.topK}`);
    }
  }

  const recall =
    expectedIds.length > 0
      ? expectedFound / expectedIds.length
      : 1;

  const mrr = firstExpectedRank < Infinity ? 1 / (firstExpectedRank + 1) : 0;

  // --- Forbidden ---
  let noForbidden = true;
  for (const forbidden of evalCase.forbiddenIds ?? []) {
    const found = results.some((r) => matchesId(r, forbidden));
    if (found) {
      noForbidden = false;
      details.push(`FORBIDDEN: "${forbidden}" appeared in results`);
    }
  }

  // --- Sources ---
  let sourcesFound = true;
  for (const src of evalCase.expectedSources ?? []) {
    const found = results.some((r) => r.source.includes(src));
    if (!found) {
      sourcesFound = false;
      details.push(`MISS-SOURCE: "${src}" not in result sources`);
    }
  }

  const pass = recall === 1 && noForbidden && sourcesFound;

  return { case: evalCase, results, recall, mrr, noForbidden, sourcesFound, pass, details };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const eqArg = process.argv.find((a) => a.startsWith("--category="));
  const flagIdx = process.argv.indexOf("--category");
  const categoryFilter = eqArg
    ? eqArg.split("=")[1]
    : flagIdx !== -1 && flagIdx + 1 < process.argv.length
      ? process.argv[flagIdx + 1]
      : undefined;

  const cases = categoryFilter
    ? EVAL_CASES.filter((c) => c.category === categoryFilter)
    : EVAL_CASES;

  console.log(`\nRunning ${cases.length} eval cases...\n`);

  const caseResults: CaseResult[] = [];

  for (const evalCase of cases) {
    process.stdout.write(`  [${evalCase.category}] ${evalCase.description}... `);
    try {
      const results = await ragQuery(evalCase.query, evalCase.topK);
      const result = evaluateCaseV2(evalCase, results);
      caseResults.push(result);
      console.log(result.pass ? "PASS" : "FAIL");
      if (!result.pass) {
        for (const d of result.details) {
          if (d.startsWith("MISS") || d.startsWith("FORBIDDEN")) {
            console.log(`    ${d}`);
          }
        }
        // Show what was actually returned
        console.log(`    Actual results:`);
        for (let i = 0; i < Math.min(3, results.length); i++) {
          const r = results[i];
          console.log(`      ${i + 1}. [${r.score.toFixed(4)}] ${r.source} — ${r.text.slice(0, 80)}...`);
        }
      }
    } catch (err) {
      console.log("ERROR");
      console.log(`    ${(err as Error).message}`);
      caseResults.push({
        case: evalCase,
        results: [],
        recall: 0,
        mrr: 0,
        noForbidden: true,
        sourcesFound: false,
        pass: false,
        details: [`ERROR: ${(err as Error).message}`],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Aggregate metrics
  // ---------------------------------------------------------------------------

  const total = caseResults.length;
  const passed = caseResults.filter((r) => r.pass).length;
  const avgRecall = caseResults.reduce((s, r) => s + r.recall, 0) / total;
  const avgMrr = caseResults.filter((r) => (r.case.expectedIds ?? []).length > 0);
  const mrrDenom = avgMrr.length || 1;
  const meanMrr = avgMrr.reduce((s, r) => s + r.mrr, 0) / mrrDenom;
  const noForbiddenRate = caseResults.filter((r) => r.noForbidden).length / total;
  const sourceRate = caseResults.filter((r) => r.sourcesFound).length / total;

  // Per-category breakdown
  const categories = [...new Set(caseResults.map((r) => r.case.category))];

  console.log("\n" + "=".repeat(70));
  console.log("EVALUATION REPORT");
  console.log("=".repeat(70));
  console.log(`\nOverall: ${passed}/${total} passed (${(passed / total * 100).toFixed(1)}%)`);
  console.log(`Mean Recall@5:    ${avgRecall.toFixed(3)}`);
  console.log(`Mean MRR:         ${meanMrr.toFixed(3)}`);
  console.log(`No-Forbidden:     ${(noForbiddenRate * 100).toFixed(1)}%`);
  console.log(`Sources Found:    ${(sourceRate * 100).toFixed(1)}%`);

  console.log("\nBy Category:");
  for (const cat of categories) {
    const catCases = caseResults.filter((r) => r.case.category === cat);
    const catPassed = catCases.filter((r) => r.pass).length;
    const catRecall = catCases.reduce((s, r) => s + r.recall, 0) / catCases.length;
    console.log(`  ${cat.padEnd(15)} ${catPassed}/${catCases.length} pass, recall=${catRecall.toFixed(3)}`);
  }

  console.log("\n" + "=".repeat(70));

  // Exit with non-zero if any failures
  if (passed < total) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
