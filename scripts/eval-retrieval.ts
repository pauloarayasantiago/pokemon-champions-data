/**
 * Graded-relevance retrieval evaluation harness.
 *
 * Reads `evals/golden-set.jsonl` (one case per line) and computes
 * nDCG@10, Recall@10, Context Precision@10, and MRR@10 per case, with
 * per-intent and per-difficulty slices.
 *
 * Grades:
 *   3 = perfect match (the chunk the query is about)
 *   2 = highly relevant (directly useful)
 *   1 = tangentially relevant (context)
 *   0 = irrelevant (default for anything not listed)
 *  -1 = forbidden (explicit hard negative — counts against precision)
 *
 * Expectations can match by either:
 *   - `id_prefix` — prefix-match on the chunk ID (e.g. "pokemon:charizard")
 *   - `source_substr` — substring match on `result.source`
 *
 * Forbidden IDs are matched the same way as `id_prefix`.
 *
 * Usage:
 *   npx tsx scripts/eval-retrieval.ts
 *   npx tsx scripts/eval-retrieval.ts --intent counter
 *   npx tsx scripts/eval-retrieval.ts --difficulty adversarial
 *   npx tsx scripts/eval-retrieval.ts --snapshot  # write timestamped JSON
 *   npx tsx scripts/eval-retrieval.ts --verbose   # per-case details
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query as ragQuery, type Result } from "../lib/rag.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

type IntentTag = "usage" | "counter" | "stat" | "item" | "move" | "team" | "matchup";
type Difficulty = "easy" | "medium" | "hard" | "adversarial";

interface GradedContext {
  id_prefix?: string;
  source_substr?: string;
  grade: 1 | 2 | 3;
}

interface GoldenCase {
  id: string;
  query: string;
  topK: number;
  intent_tag: IntentTag;
  difficulty_tier: Difficulty;
  expected_contexts: GradedContext[];
  forbidden_ids?: string[];
  description: string;
}

interface CaseMetrics {
  case: GoldenCase;
  results: Result[];
  gradedRanks: number[];       // grade assigned to each result at rank 0..topK-1
  ndcg: number;                // nDCG@10
  recall: number;              // Recall@10 (grade ≥ 1)
  precision: number;           // Context Precision@10 (grade ≥ 1)
  mrr: number;                 // MRR@10 (first grade ≥ 2)
  forbiddenHit: boolean;       // any forbidden ID appeared
  forbiddenCount: number;
  topHitRank: number | null;   // 0-based rank of the highest-grade hit, -1 if no grade≥1 hit
  topHitGrade: number;         // grade of the topHitRank result
  missedGrade3: string[];      // grade-3 expectations not found in top-K
  notes: string[];
}

// ---------------------------------------------------------------------------
// ID matching (reused pattern from scripts/eval.ts)
// ---------------------------------------------------------------------------

function matchesIdPrefix(result: Result, prefix: string): boolean {
  const meta = result.metadata as Record<string, unknown>;
  const name = (typeof meta.name === "string") ? meta.name.toLowerCase() : undefined;
  const pokemon = (typeof meta.pokemon === "string") ? meta.pokemon.toLowerCase() : undefined;
  const megaName = (typeof meta.mega_name === "string") ? meta.mega_name.toLowerCase() : undefined;
  const basePokemon = (typeof meta.base_pokemon === "string") ? meta.base_pokemon.toLowerCase() : undefined;

  const parts = prefix.split(":");
  const kind = parts[0];
  const slug = parts.slice(1).join(":");
  const slugSpaced = slug.replace(/-/g, " ");
  // Hyphenated Pokemon like Rotom-Wash and Landorus-Therian store name
  // as "rotom-wash" in metadata. Match against both the original hyphenated
  // slug and the space-substituted variant so either form resolves.
  const nameMatches = (s: string | undefined): boolean =>
    s !== undefined && (s === slug || s === slugSpaced);

  switch (kind) {
    case "pokemon":
      return result.source === "pokemon_champions.csv" && nameMatches(name);
    case "mega":
      return result.source === "mega_evolutions.csv" &&
        (megaName?.replace(/\s+/g, "-").toLowerCase().startsWith(slug) ?? false);
    case "move":
      return result.source === "moves.csv" && nameMatches(name);
    case "item":
      return result.source === "items.csv" && nameMatches(name);
    case "usage":
      return result.source === "pikalytics_usage.csv" && nameMatches(pokemon);
    case "updated-attack":
      return result.source === "updated_attacks.csv" && nameMatches(name);
    case "ability":
      return result.source === "new_abilities.csv" && nameMatches(name);
    case "mega-ability":
      return result.source === "mega_abilities.csv" && nameMatches(pokemon);
    case "team":
      return result.source === "tournament_teams.csv" &&
        (meta.team_id as string)?.toLowerCase().replace(/\s+/g, "-") === slug;
    default:
      // Also try a loose match on base_pokemon (for mega variants)
      if (nameMatches(basePokemon)) return true;
      return false;
  }
}

function matchesSourceSubstr(result: Result, substr: string): boolean {
  return result.source.includes(substr);
}

// ---------------------------------------------------------------------------
// Grading + metrics
// ---------------------------------------------------------------------------

function gradeResult(result: Result, expected: GradedContext[]): number {
  let best = 0;
  for (const exp of expected) {
    if (exp.id_prefix && matchesIdPrefix(result, exp.id_prefix)) {
      if (exp.grade > best) best = exp.grade;
    } else if (exp.source_substr && matchesSourceSubstr(result, exp.source_substr)) {
      if (exp.grade > best) best = exp.grade;
    }
  }
  return best;
}

/**
 * nDCG with graded relevance, normalized against the best achievable ordering
 * of the *retrieved* candidate pool.
 *
 *   DCG  = Σ (2^rel_i - 1) / log2(i + 2)
 *   IDCG = DCG of sort(gradedRanks, desc)
 *   nDCG = DCG / IDCG  ∈ [0, 1]
 *
 * This measures how well the system ordered the chunks it surfaced — it does
 * NOT measure whether the right chunks were retrieved in the first place.
 * Recall@K tracks that separately. When all declared grade-3 chunks are
 * present in the top-K at rank 0, nDCG = 1.0.
 *
 * When the top-K contains no graded chunk at all (both DCG and IDCG are 0),
 * we return 0 — consistent with treating "nothing found" as worst-case.
 */
function computeNDCG(gradedRanks: number[]): number {
  const dcg = gradedRanks.reduce(
    (s, g, i) => s + (Math.pow(2, g) - 1) / Math.log2(i + 2),
    0,
  );
  const idealGrades = [...gradedRanks].sort((a, b) => b - a);
  const idcg = idealGrades.reduce(
    (s, g, i) => s + (Math.pow(2, g) - 1) / Math.log2(i + 2),
    0,
  );
  return idcg > 0 ? dcg / idcg : 0;
}

function evaluateCase(c: GoldenCase, results: Result[]): CaseMetrics {
  const topK = c.topK;
  const truncated = results.slice(0, topK);

  const gradedRanks = truncated.map((r) => gradeResult(r, c.expected_contexts));
  const ndcg = computeNDCG(gradedRanks);

  // Recall@K: unique grade-3 expectations found in top-K (we treat grade-3
  // as the "must-find" set; grade 1–2 improve nDCG but don't dock Recall).
  const grade3Expects = c.expected_contexts.filter((e) => e.grade === 3);
  const grade3Found = grade3Expects.filter((e) =>
    truncated.some((r) =>
      (e.id_prefix && matchesIdPrefix(r, e.id_prefix)) ||
      (e.source_substr && matchesSourceSubstr(r, e.source_substr))
    )
  );
  const missedGrade3 = grade3Expects
    .filter((e) => !grade3Found.includes(e))
    .map((e) => e.id_prefix ?? e.source_substr ?? "(unnamed)");
  const recall = grade3Expects.length > 0 ? grade3Found.length / grade3Expects.length : 1;

  // Context Precision@K: fraction of top-K with grade ≥ 1.
  const precision = gradedRanks.filter((g) => g >= 1).length / Math.max(gradedRanks.length, 1);

  // MRR@K: first grade ≥ 2 hit.
  let firstHighRel = -1;
  for (let i = 0; i < gradedRanks.length; i++) {
    if (gradedRanks[i] >= 2) { firstHighRel = i; break; }
  }
  const mrr = firstHighRel >= 0 ? 1 / (firstHighRel + 1) : 0;

  // Forbidden check.
  const forbidden = c.forbidden_ids ?? [];
  let forbiddenCount = 0;
  const notes: string[] = [];
  for (const fid of forbidden) {
    if (truncated.some((r) => matchesIdPrefix(r, fid))) {
      forbiddenCount++;
      notes.push(`FORBIDDEN hit: ${fid}`);
    }
  }

  // Highest-graded hit for reporting.
  let topHitRank: number | null = null;
  let topHitGrade = 0;
  for (let i = 0; i < gradedRanks.length; i++) {
    if (gradedRanks[i] > topHitGrade) {
      topHitGrade = gradedRanks[i];
      topHitRank = i;
      if (topHitGrade === 3) break;
    }
  }

  for (const m of missedGrade3) notes.push(`MISS grade-3: ${m}`);

  return {
    case: c,
    results: truncated,
    gradedRanks,
    ndcg,
    recall,
    precision,
    mrr,
    forbiddenHit: forbiddenCount > 0,
    forbiddenCount,
    topHitRank,
    topHitGrade,
    missedGrade3,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function mean(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

interface SliceSummary {
  n: number;
  ndcg: number;
  recall: number;
  precision: number;
  mrr: number;
  forbiddenRate: number;
}

function summarize(cases: CaseMetrics[]): SliceSummary {
  return {
    n: cases.length,
    ndcg: mean(cases.map((c) => c.ndcg)),
    recall: mean(cases.map((c) => c.recall)),
    precision: mean(cases.map((c) => c.precision)),
    mrr: mean(cases.map((c) => c.mrr)),
    forbiddenRate: cases.length > 0
      ? cases.filter((c) => c.forbiddenHit).length / cases.length
      : 0,
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function parseArgs(): {
  intent?: string;
  difficulty?: string;
  snapshot: boolean;
  verbose: boolean;
  paceMs: number;
} {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const eq = args.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.split("=")[1];
    const flag = args.indexOf(`--${name}`);
    if (flag !== -1 && flag + 1 < args.length && !args[flag + 1].startsWith("--")) {
      return args[flag + 1];
    }
    return undefined;
  };
  // Default pacing: 12s per query when Jina is wired up. A 40-candidate pool
  // averages ~20k tokens per rerank call; Jina free tier caps at 100k
  // tokens/min, so 5 calls/min (12s spacing) is the stable ceiling.
  // Override with --pace 0 to run unpaced (e.g. when evaluating with Jina
  // disabled by unsetting JINA_API_KEY).
  const pace = get("pace");
  const jinaConfigured = !!process.env.JINA_API_KEY;
  const paceMs = pace !== undefined ? Number(pace) : jinaConfigured ? 12000 : 0;
  return {
    intent: get("intent"),
    difficulty: get("difficulty"),
    snapshot: args.includes("--snapshot"),
    verbose: args.includes("--verbose") || args.includes("-v"),
    paceMs,
  };
}

function loadGoldenSet(): GoldenCase[] {
  const path = resolve(PROJECT_ROOT, "evals", "golden-set.jsonl");
  const text = readFileSync(path, "utf-8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//"))
    .map((l, i) => {
      try {
        return JSON.parse(l) as GoldenCase;
      } catch (e) {
        throw new Error(`Malformed golden-set.jsonl line ${i + 1}: ${(e as Error).message}`);
      }
    });
}

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits).padStart(digits + 2);
}

async function main() {
  const opts = parseArgs();
  const allCases = loadGoldenSet();
  const cases = allCases.filter((c) => {
    if (opts.intent && c.intent_tag !== opts.intent) return false;
    if (opts.difficulty && c.difficulty_tier !== opts.difficulty) return false;
    return true;
  });

  if (cases.length === 0) {
    console.error("No cases matched filters.");
    process.exit(2);
  }

  const jinaStatus = process.env.JINA_API_KEY ? "active" : "disabled";
  console.log(
    `\nRunning ${cases.length} graded-relevance cases (of ${allCases.length} total) · Jina ${jinaStatus} · pace ${opts.paceMs}ms\n`,
  );

  const results: CaseMetrics[] = [];
  const t0 = Date.now();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let idx = 0; idx < cases.length; idx++) {
    const c = cases[idx];
    if (idx > 0 && opts.paceMs > 0) await sleep(opts.paceMs);
    process.stdout.write(`  [${c.intent_tag}/${c.difficulty_tier}] ${c.id} — ${c.query.slice(0, 50)}… `);
    try {
      const ragT0 = Date.now();
      const raw = await ragQuery(c.query, c.topK);
      const ragMs = Date.now() - ragT0;
      const m = evaluateCase(c, raw);
      results.push(m);
      const flag = m.forbiddenHit ? " ⚠FORBID" : "";
      console.log(
        `nDCG=${fmt(m.ndcg)} R=${fmt(m.recall)} P=${fmt(m.precision)} MRR=${fmt(m.mrr)} (${ragMs}ms)${flag}`,
      );
      if (opts.verbose) {
        for (const n of m.notes) console.log(`      ${n}`);
        console.log(`      top-3:`);
        for (let i = 0; i < Math.min(3, m.results.length); i++) {
          const r = m.results[i];
          console.log(
            `        ${i + 1}. [g=${m.gradedRanks[i]}] ${r.source} — ${r.text.slice(0, 60).replace(/\n/g, " ")}`,
          );
        }
      }
    } catch (err) {
      console.log("ERROR");
      console.log(`    ${(err as Error).message}`);
      results.push({
        case: c,
        results: [],
        gradedRanks: [],
        ndcg: 0,
        recall: 0,
        precision: 0,
        mrr: 0,
        forbiddenHit: false,
        forbiddenCount: 0,
        topHitRank: null,
        topHitGrade: 0,
        missedGrade3: [],
        notes: [`ERROR: ${(err as Error).message}`],
      });
    }
  }

  const totalMs = Date.now() - t0;

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  const overall = summarize(results);

  const intents = [...new Set(results.map((r) => r.case.intent_tag))].sort();
  const difficulties: Difficulty[] = ["easy", "medium", "hard", "adversarial"];

  console.log("\n" + "=".repeat(74));
  console.log("RETRIEVAL EVALUATION REPORT");
  console.log("=".repeat(74));
  console.log(`\nOverall (${overall.n} cases):`);
  console.log(`  nDCG@10            ${fmt(overall.ndcg)}`);
  console.log(`  Recall@10 (g=3)    ${fmt(overall.recall)}`);
  console.log(`  Context Prec@10    ${fmt(overall.precision)}`);
  console.log(`  MRR@10 (g≥2)       ${fmt(overall.mrr)}`);
  console.log(`  Forbidden hit rate ${fmt(overall.forbiddenRate)}`);

  console.log(`\nPer intent:`);
  console.log(`  ${"intent".padEnd(10)} ${"n".padStart(3)}  ${"nDCG".padStart(5)}  ${"R@10".padStart(5)}  ${"P@10".padStart(5)}  ${"MRR".padStart(5)}`);
  for (const it of intents) {
    const slice = results.filter((r) => r.case.intent_tag === it);
    const s = summarize(slice);
    console.log(
      `  ${it.padEnd(10)} ${String(s.n).padStart(3)}  ${fmt(s.ndcg)}  ${fmt(s.recall)}  ${fmt(s.precision)}  ${fmt(s.mrr)}`,
    );
  }

  console.log(`\nPer difficulty:`);
  console.log(`  ${"tier".padEnd(12)} ${"n".padStart(3)}  ${"nDCG".padStart(5)}  ${"R@10".padStart(5)}  ${"P@10".padStart(5)}  ${"MRR".padStart(5)}`);
  for (const d of difficulties) {
    const slice = results.filter((r) => r.case.difficulty_tier === d);
    if (slice.length === 0) continue;
    const s = summarize(slice);
    console.log(
      `  ${d.padEnd(12)} ${String(s.n).padStart(3)}  ${fmt(s.ndcg)}  ${fmt(s.recall)}  ${fmt(s.precision)}  ${fmt(s.mrr)}`,
    );
  }

  // Surface the worst offenders so humans can triage.
  const worst = [...results]
    .filter((r) => r.case.difficulty_tier !== "adversarial")
    .sort((a, b) => a.ndcg - b.ndcg)
    .slice(0, 5);
  if (worst.length > 0 && worst[0].ndcg < 1.0) {
    console.log(`\nLowest-nDCG non-adversarial cases:`);
    for (const w of worst) {
      console.log(
        `  nDCG=${fmt(w.ndcg)} R=${fmt(w.recall)}  [${w.case.intent_tag}] ${w.case.id} — ${w.case.query.slice(0, 50)}`,
      );
      for (const n of w.notes.slice(0, 2)) console.log(`    ${n}`);
    }
  }

  const forbiddenCases = results.filter((r) => r.forbiddenHit);
  if (forbiddenCases.length > 0) {
    console.log(`\n⚠ Forbidden-ID hits:`);
    for (const f of forbiddenCases) {
      console.log(`  [${f.case.intent_tag}/${f.case.difficulty_tier}] ${f.case.id} — ${f.forbiddenCount} forbidden`);
    }
  }

  console.log(`\nWall time: ${(totalMs / 1000).toFixed(1)}s (${(totalMs / cases.length).toFixed(0)}ms/case)`);
  console.log("=".repeat(74));

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  if (opts.snapshot) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
    const outDir = resolve(PROJECT_ROOT, "memory-bank", "eval-baselines");
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, `retrieval-${ts}.json`);
    const snapshot = {
      timestamp: new Date().toISOString(),
      filter: { intent: opts.intent, difficulty: opts.difficulty },
      overall,
      per_intent: Object.fromEntries(
        intents.map((it) => [it, summarize(results.filter((r) => r.case.intent_tag === it))]),
      ),
      per_difficulty: Object.fromEntries(
        difficulties
          .map((d) => [d, summarize(results.filter((r) => r.case.difficulty_tier === d))])
          .filter(([, s]) => (s as SliceSummary).n > 0),
      ),
      cases: results.map((r) => ({
        id: r.case.id,
        query: r.case.query,
        intent_tag: r.case.intent_tag,
        difficulty_tier: r.case.difficulty_tier,
        ndcg: r.ndcg,
        recall: r.recall,
        precision: r.precision,
        mrr: r.mrr,
        forbidden_count: r.forbiddenCount,
        graded_ranks: r.gradedRanks,
        top_hit_rank: r.topHitRank,
        top_hit_grade: r.topHitGrade,
        missed_grade3: r.missedGrade3,
        top_sources: r.results.slice(0, 5).map((x) => x.source),
      })),
    };
    writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
    console.log(`\nSnapshot: ${outPath}`);
  }

  // Exit non-zero if any forbidden hits (strict gate); otherwise always 0 so CI
  // sees the scores without failing during calibration.
  if (forbiddenCases.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
