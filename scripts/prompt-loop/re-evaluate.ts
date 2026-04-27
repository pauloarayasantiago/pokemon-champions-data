// scripts/prompt-loop/re-evaluate.ts
//
// Re-run predicates against cached trials in an existing iter-NN/score.json,
// without making any API calls. Used after fixing predicate bugs to refresh
// the baseline without paying for re-scoring.
//
// Usage:
//   npx tsx scripts/prompt-loop/re-evaluate.ts --output-dir runs/prompt-loop/iter-000

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { DEV_PROMPTS, HOLDOUT_PROMPTS, evaluatePredicate, type Trial } from "./prompts.js";

interface Args {
  outputDir: string;
  set: "dev" | "holdout";
}

function parseArgs(): Args {
  const out: Partial<Args> = { set: "dev" };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--output-dir") out.outputDir = process.argv[++i];
    else if (a === "--set") out.set = process.argv[++i] as "dev" | "holdout";
  }
  if (!out.outputDir) throw new Error("--output-dir is required");
  return out as Args;
}

function trialFromCachedResult(r: {
  caseId: string;
  fullContent: string;
  toolCallNames: string[];
  teamValid?: boolean | null;
  citationsValid?: boolean;
  phantomRefused: boolean;
  errored?: boolean;
  errorText?: string;
}): Trial {
  // Reconstruct a Trial from the cached score.json. We don't have full toolCalls
  // metadata (only names) — build minimal stand-ins. Predicates that need args
  // beyond `name` would need richer caching; current predicates only check names.
  const toolCalls = r.toolCallNames.map((name, i) => ({
    name,
    args: {},
    iter: 0,
    timestamp: i,
  }));

  // Re-parse team-json from content for predicates needing parsedTeam.
  let parsedTeam: { archetype?: string; pokemon?: Array<{ name?: string; item?: string; ability?: string; moves?: string[] }> } | null = null;
  const m = r.fullContent.match(/```team-json\s*([\s\S]*?)```/);
  if (m) {
    try {
      parsedTeam = JSON.parse(m[1]);
    } catch { /* ignore */ }
  }

  const trial: Trial = {
    caseId: r.caseId,
    fullContent: r.fullContent,
    toolCalls,
    phantomRefused: r.phantomRefused,
    errored: r.errored ?? false,
    errorText: r.errorText,
    totalMs: 0,
  };
  if (r.teamValid !== undefined) {
    trial.teamResult = {
      valid: r.teamValid ?? null,
      hasBlock: !!parsedTeam,
      parsedTeam,
      duplicateItemCount: 0,
      duplicateSpeciesCount: 0,
      spreadIssueCount: 0,
      retryFired: false,
    };
  }
  if (r.citationsValid !== undefined) {
    trial.citationResult = {
      valid: r.citationsValid,
      totalCited: 0,
      validCited: 0,
      invalidIds: [],
      retryFired: false,
    };
  }
  return trial;
}

function main(): void {
  const args = parseArgs();
  const file = args.set === "dev" ? "score.json" : "score-holdout.json";
  const path = join(args.outputDir, file);

  const old = JSON.parse(readFileSync(path, "utf8")) as {
    set: string;
    candidateVersion: string;
    casesScored: number;
    runsPerCase: number;
    totalTrials: number;
    durationMs: number;
    estimatedCostUsd: number;
    results: Array<{
      caseId: string;
      runIdx: number;
      pass: boolean;
      reasons: string[];
      totalMs: number;
      fullContent: string;
      toolCallNames: string[];
      teamValid?: boolean | null;
      citationsValid?: boolean;
      phantomRefused: boolean;
      errored?: boolean;
      errorText?: string;
    }>;
  };

  const cases = args.set === "dev" ? DEV_PROMPTS : HOLDOUT_PROMPTS;
  const newResults = old.results.map(r => {
    const tc = cases.find(c => c.id === r.caseId);
    if (!tc) {
      console.warn(`unknown caseId in cached results: ${r.caseId}`);
      return r;
    }
    const trial = trialFromCachedResult(r);
    const verdict = evaluatePredicate(tc, trial);
    return { ...r, pass: verdict.pass, reasons: verdict.reasons };
  });

  const passes = newResults.filter(r => r.pass).length;
  const cachedTrials = newResults.map(r => ({
    caseId: r.caseId,
    runIdx: r.runIdx,
    pass: r.pass,
    reasons: r.reasons,
  }));

  const categoryCounts = {
    bannedItemTrials: newResults.filter(r => r.reasons.some(rs => rs.startsWith("banned_items:"))).length,
    phantomViolations: newResults.filter(r => r.reasons.includes("phantom_not_refused")).length,
    citationInvalidTrials: newResults.filter(r => r.reasons.some(rs => rs.startsWith("citations_invalid"))).length,
    erroredTrials: newResults.filter(r => r.errored).length,
  };

  const out = {
    ...old,
    passes,
    failures: newResults.length - passes,
    categoryCounts,
    results: newResults,
    reEvaluatedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(out, null, 2));

  // Update candidate-results.json paired-cache too.
  const cachedFile = args.set === "dev" ? "candidate-results.json" : "candidate-results-holdout.json";
  writeFileSync(
    join(args.outputDir, cachedFile),
    JSON.stringify({
      promptVersion: old.candidateVersion,
      cachedAt: new Date().toISOString(),
      set: args.set,
      trials: cachedTrials,
    }, null, 2),
  );

  // Refresh failures.json (dev only).
  if (args.set === "dev") {
    const failures = newResults.filter(r => !r.pass);
    writeFileSync(join(args.outputDir, "failures.json"), JSON.stringify(failures, null, 2));
  }

  console.log(`re-evaluated: ${passes}/${newResults.length} pass | categories: ${JSON.stringify(categoryCounts)}`);
  for (const r of newResults) {
    console.log(`  ${r.caseId}#${r.runIdx} ${r.pass ? "PASS" : "FAIL"} ${r.reasons.join("; ")}`);
  }
}

main();
