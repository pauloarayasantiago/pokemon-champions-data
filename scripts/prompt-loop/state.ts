// scripts/prompt-loop/state.ts
//
// Read/write helpers for runs/prompt-loop/state.json. Persists loop state across
// ScheduleWakeup ticks so the agent can resume cleanly even if the conversation
// is interrupted.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export const STATE_DIR = "runs/prompt-loop";
export const STATE_FILE = join(STATE_DIR, "state.json");
export const CHAMPION_RESULTS_FILE = join(STATE_DIR, "champion-results.json");

export interface CachedTrial {
  caseId: string;
  runIdx: number;
  pass: boolean;
  reasons: string[];
}

export interface ChampionResults {
  promptVersion: string;
  cachedAt: string;
  set: "dev" | "holdout";
  trials: CachedTrial[];
}

export interface IterationHistoryEntry {
  iter: number;
  timestamp: string;
  decision: "ACCEPTED" | "REJECTED" | "INDETERMINATE";
  reason: string;
  pairedScore: number;
  candidatePassRate: number;
  championPassRate: number;
  costUsd: number;
  candidateVersion: string;
}

export interface RationaleEntry {
  iter: number;
  status: "ACCEPTED" | "REJECTED" | "REVERTED";
  rationale: string;
}

export interface State {
  iter: number;
  wallStartUtc: string;
  spentUsd: number;
  champion: {
    version: string;
    acceptedAt: string;
    devCachedAt?: string;
    holdoutCachedAt?: string;
  };
  history: IterationHistoryEntry[];
  consecutiveNoImprovement: number;
  rationaleLedger: RationaleEntry[];
  /** Last iter at which holdout was scored. Used to gate iter 12/25 holdout runs. */
  lastHoldoutIter: number;
}

function ensureDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function readState(): State | null {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
}

export function writeState(state: State): void {
  ensureDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function initialState(promptVersion: string): State {
  const now = new Date().toISOString();
  return {
    iter: 0,
    wallStartUtc: now,
    spentUsd: 0,
    champion: {
      version: promptVersion,
      acceptedAt: now,
    },
    history: [],
    consecutiveNoImprovement: 0,
    rationaleLedger: [],
    lastHoldoutIter: -1,
  };
}

export function readChampionResults(set: "dev" | "holdout"): ChampionResults | null {
  const file = set === "dev"
    ? CHAMPION_RESULTS_FILE
    : join(STATE_DIR, "champion-results-holdout.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as ChampionResults;
}

export function writeChampionResults(results: ChampionResults): void {
  ensureDir();
  const file = results.set === "dev"
    ? CHAMPION_RESULTS_FILE
    : join(STATE_DIR, "champion-results-holdout.json");
  writeFileSync(file, JSON.stringify(results, null, 2));
}

/** Compose a paired-comparison verdict from candidate + champion trials. */
export interface PairedComparison {
  wins: number;   // candidate passes, champion fails
  losses: number; // champion passes, candidate fails
  ties: number;
  pairedScore: number; // wins - losses
  perTrial: Array<{ caseId: string; runIdx: number; outcome: "WIN" | "LOSS" | "TIE" }>;
}

export function comparePaired(
  candidateTrials: CachedTrial[],
  championTrials: CachedTrial[],
): PairedComparison {
  const cmp: PairedComparison = {
    wins: 0,
    losses: 0,
    ties: 0,
    pairedScore: 0,
    perTrial: [],
  };
  for (const ct of candidateTrials) {
    const champ = championTrials.find(
      t => t.caseId === ct.caseId && t.runIdx === ct.runIdx,
    );
    if (!champ) continue; // missing pair; skip
    let outcome: "WIN" | "LOSS" | "TIE";
    if (ct.pass && !champ.pass) {
      outcome = "WIN";
      cmp.wins++;
    } else if (!ct.pass && champ.pass) {
      outcome = "LOSS";
      cmp.losses++;
    } else {
      outcome = "TIE";
      cmp.ties++;
    }
    cmp.perTrial.push({ caseId: ct.caseId, runIdx: ct.runIdx, outcome });
  }
  cmp.pairedScore = cmp.wins - cmp.losses;
  return cmp;
}
