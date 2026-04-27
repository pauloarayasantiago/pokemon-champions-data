// scripts/prompt-loop/score.ts
//
// Score a candidate prompt against the dev or holdout suite.
//
// Usage:
//   npx tsx scripts/prompt-loop/score.ts \
//     --candidate-file src/lib/system-prompt.candidate.ts \
//     --set dev \
//     --output-dir runs/prompt-loop/iter-000 \
//     --runs 2
//
// Writes:
//   <output-dir>/score.json (or score-holdout.json) — full per-trial results
//   <output-dir>/candidate-results.json (or candidate-results-holdout.json) — compact paired-comparison cache
//   <output-dir>/failures.json (dev set only) — failures filtered for next iter's diagnosis

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import {
  DEV_PROMPTS,
  HOLDOUT_PROMPTS,
  evaluatePredicate,
  type Trial,
} from "./prompts.js";
import type { CachedTrial, ChampionResults } from "./state.js";

interface ScoreArgs {
  candidateFile: string;
  set: "dev" | "holdout";
  outputDir: string;
  runs: number;
  baseUrl: string;
  model: string;
}

function parseArgs(): ScoreArgs {
  const out: Partial<ScoreArgs> = {
    candidateFile: "src/lib/system-prompt.candidate.ts",
    set: "dev",
    runs: 2,
    baseUrl: "http://localhost:3000",
    model: "gemini-3-flash",
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--candidate-file") out.candidateFile = process.argv[++i];
    else if (a === "--set") out.set = process.argv[++i] as "dev" | "holdout";
    else if (a === "--output-dir") out.outputDir = process.argv[++i];
    else if (a === "--runs") out.runs = parseInt(process.argv[++i], 10);
    else if (a === "--base-url") out.baseUrl = process.argv[++i];
    else if (a === "--model") out.model = process.argv[++i];
  }
  if (!out.outputDir) {
    throw new Error("--output-dir is required");
  }
  return out as ScoreArgs;
}

interface RunTrialInput {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  systemPromptVersion: string;
  userPrompt: string;
  caseId: string;
  timeoutMs?: number;
}

async function runTrial(input: RunTrialInput): Promise<Trial> {
  const trial: Trial = {
    caseId: input.caseId,
    fullContent: "",
    toolCalls: [],
    phantomRefused: false,
    totalMs: 0,
    errored: false,
  };
  const tStart = Date.now();

  const ac = new AbortController();
  const timeoutMs = input.timeoutMs ?? 5 * 60_000; // 5 min/trial hard cap
  const timeoutHandle = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const resp = await fetch(`${input.baseUrl}/api/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: "user", content: input.userPrompt }],
        systemPromptOverride: input.systemPrompt,
        systemPromptVersion: input.systemPromptVersion,
      }),
      signal: ac.signal,
    });

    if (!resp.ok) {
      trial.errored = true;
      trial.errorText = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`;
      return trial;
    }
    if (!resp.body) {
      trial.errored = true;
      trial.errorText = "no response body";
      return trial;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let sawDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const evt of events) {
        if (!evt.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(evt.slice(6));
          if (parsed.type === "done") sawDone = true;
          if (parsed.type === "error") {
            trial.errored = true;
            trial.errorText = (parsed.error as string) ?? "stream error";
          }
          handleEvent(trial, parsed);
        } catch {
          // malformed event — skip silently
        }
      }
    }

    if (!sawDone && !trial.errored) {
      trial.errored = true;
      trial.errorText = "stream ended without done event";
    }
  } catch (e) {
    trial.errored = true;
    trial.errorText = (e as Error).message;
  } finally {
    clearTimeout(timeoutHandle);
    trial.totalMs = Date.now() - tStart;
  }

  // Re-parse team-json from content for predicates that need parsedTeam.
  // (route's team_result event doesn't include the parsed object.)
  if (trial.teamResult?.hasBlock) {
    const m = trial.fullContent.match(/```team-json\s*([\s\S]*?)```/);
    if (m) {
      try {
        trial.teamResult.parsedTeam = JSON.parse(m[1]);
      } catch { /* ignore parse error */ }
    }
  }

  return trial;
}

function handleEvent(trial: Trial, evt: Record<string, unknown>): void {
  switch (evt.type) {
    case "meta":
      trial.outputMode = evt.outputMode as string | undefined;
      trial.promptVersion = evt.systemPromptVersion as string | undefined;
      break;
    case "content":
      trial.fullContent += (evt.delta as string) ?? "";
      break;
    case "tool_call":
      trial.toolCalls.push({
        name: evt.name as string,
        args: (evt.arguments as Record<string, unknown>) ?? {},
        iter: (evt.iter as number) ?? 0,
        timestamp: (evt.ts as number) ?? Date.now(),
      });
      break;
    case "phantom_pokemon_refused":
      trial.phantomRefused = true;
      break;
    case "team_result":
      trial.teamResult = {
        valid: (evt.valid as boolean | null) ?? null,
        hasBlock: (evt.hasBlock as boolean) ?? false,
        duplicateItemCount: (evt.duplicateItemCount as number) ?? 0,
        duplicateSpeciesCount: (evt.duplicateSpeciesCount as number) ?? 0,
        spreadIssueCount: (evt.spreadIssueCount as number) ?? 0,
        retryFired: (evt.retryFired as boolean) ?? false,
      };
      break;
    case "citation_result":
      trial.citationResult = {
        valid: (evt.valid as boolean) ?? false,
        totalCited: (evt.totalCited as number) ?? 0,
        validCited: (evt.validCited as number) ?? 0,
        invalidIds: (evt.invalidIds as string[]) ?? [],
        retryFired: (evt.retryFired as boolean) ?? false,
      };
      break;
    case "done":
      trial.finishReason = evt.finishReason as string | undefined;
      break;
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Load candidate prompt module via dynamic ESM import.
  // tsx wraps named exports under `default` — handle both shapes.
  const candidatePath = resolve(args.candidateFile);
  const candidateUrl = pathToFileURL(candidatePath).href;
  const candidateMod = await import(candidateUrl);
  const candidate: { buildSystemPrompt: (mode: string) => string; SYSTEM_PROMPT_VERSION: string } =
    (candidateMod as { default?: unknown }).default && typeof (candidateMod as { default?: { buildSystemPrompt?: unknown } }).default?.buildSystemPrompt === "function"
      ? (candidateMod as { default: { buildSystemPrompt: (mode: string) => string; SYSTEM_PROMPT_VERSION: string } }).default
      : (candidateMod as { buildSystemPrompt: (mode: string) => string; SYSTEM_PROMPT_VERSION: string });

  if (typeof candidate.buildSystemPrompt !== "function") {
    throw new Error(`Candidate module ${candidatePath} missing buildSystemPrompt export`);
  }
  if (typeof candidate.SYSTEM_PROMPT_VERSION !== "string") {
    throw new Error(`Candidate module ${candidatePath} missing SYSTEM_PROMPT_VERSION export`);
  }

  const teamBuildPrompt = candidate.buildSystemPrompt("team-build");
  const analysisPrompt = candidate.buildSystemPrompt("analysis");
  const promptVersion = candidate.SYSTEM_PROMPT_VERSION;

  const cases = args.set === "dev" ? DEV_PROMPTS : HOLDOUT_PROMPTS;
  console.log(
    `[score] candidate=${promptVersion} set=${args.set} cases=${cases.length} runs/case=${args.runs} model=${args.model}`,
  );

  if (!existsSync(args.outputDir)) {
    mkdirSync(args.outputDir, { recursive: true });
  }

  const startTs = Date.now();
  const cachedTrials: CachedTrial[] = [];
  const fullResults: Array<CachedTrial & {
    totalMs: number;
    fullContent: string;
    toolCallNames: string[];
    teamValid: boolean | null | undefined;
    citationsValid: boolean | undefined;
    phantomRefused: boolean;
    errored: boolean;
    errorText?: string;
  }> = [];

  for (const tc of cases) {
    for (let runIdx = 0; runIdx < args.runs; runIdx++) {
      const sysPrompt = tc.expectedMode === "analysis" ? analysisPrompt : teamBuildPrompt;
      process.stdout.write(`[score] ${tc.id} run ${runIdx + 1}/${args.runs}... `);

      const trial = await runTrial({
        baseUrl: args.baseUrl,
        model: args.model,
        systemPrompt: sysPrompt,
        systemPromptVersion: `${promptVersion}-${tc.expectedMode}`,
        userPrompt: tc.prompt,
        caseId: tc.id,
      });

      const verdict = evaluatePredicate(tc, trial);
      console.log(
        `${verdict.pass ? "PASS" : "FAIL"} (${(trial.totalMs / 1000).toFixed(1)}s)${
          verdict.reasons.length > 0 ? " — " + verdict.reasons.join("; ") : ""
        }`,
      );

      const cached: CachedTrial = {
        caseId: tc.id,
        runIdx,
        pass: verdict.pass,
        reasons: verdict.reasons,
      };
      cachedTrials.push(cached);
      fullResults.push({
        ...cached,
        totalMs: trial.totalMs,
        fullContent: trial.fullContent,
        toolCallNames: trial.toolCalls.map(t => t.name),
        teamValid: trial.teamResult?.valid,
        citationsValid: trial.citationResult?.valid,
        phantomRefused: trial.phantomRefused,
        errored: trial.errored,
        errorText: trial.errorText,
      });
    }
  }

  const durationMs = Date.now() - startTs;
  const passes = cachedTrials.filter(t => t.pass).length;
  const totalTrials = cachedTrials.length;
  const estimatedCostUsd = totalTrials * 0.04; // ~$0.04/run per project_gemini3_eval.md

  // Per-category counts (used by acceptance gate for zero-tolerance regression checks).
  const categoryCounts = {
    bannedItemTrials: fullResults.filter(r =>
      r.reasons.some(rs => rs.startsWith("banned_items:")),
    ).length,
    phantomViolations: fullResults.filter(r =>
      r.reasons.includes("phantom_not_refused"),
    ).length,
    citationInvalidTrials: fullResults.filter(r =>
      r.reasons.some(rs => rs.startsWith("citations_invalid")),
    ).length,
    erroredTrials: fullResults.filter(r => r.errored).length,
  };

  const fullFile = args.set === "dev" ? "score.json" : "score-holdout.json";
  writeFileSync(
    join(args.outputDir, fullFile),
    JSON.stringify({
      set: args.set,
      candidateVersion: promptVersion,
      casesScored: cases.length,
      runsPerCase: args.runs,
      totalTrials,
      passes,
      failures: totalTrials - passes,
      durationMs,
      estimatedCostUsd,
      categoryCounts,
      results: fullResults,
    }, null, 2),
  );

  // Compact paired-comparison cache.
  const cachedFile = args.set === "dev"
    ? "candidate-results.json"
    : "candidate-results-holdout.json";
  const cachedRes: ChampionResults = {
    promptVersion,
    cachedAt: new Date().toISOString(),
    set: args.set,
    trials: cachedTrials,
  };
  writeFileSync(join(args.outputDir, cachedFile), JSON.stringify(cachedRes, null, 2));

  // Failures-only filter for next iter's diagnosis (dev only).
  if (args.set === "dev") {
    const failures = fullResults.filter(r => !r.pass);
    writeFileSync(
      join(args.outputDir, "failures.json"),
      JSON.stringify(failures, null, 2),
    );
  }

  console.log(
    `\n[score] ${args.set}: ${passes}/${totalTrials} passed in ${(durationMs / 1000).toFixed(1)}s ($${estimatedCostUsd.toFixed(2)} est)`,
  );
  console.log(`[score]   categories: ${JSON.stringify(categoryCounts)}`);
  console.log(`[score]   -> ${join(args.outputDir, fullFile)}`);
  console.log(`[score]   -> ${join(args.outputDir, cachedFile)}`);
}

main().catch(e => {
  console.error(`[score] fatal: ${(e as Error).stack ?? (e as Error).message}`);
  process.exit(1);
});
