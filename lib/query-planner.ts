// Stage 6.3 — Plan-and-Execute DAG (rule-driven)
//
// Decomposes a user query into 1–3 parallel sub-queries based on the
// signals emitted by routeQuery() in ./rag.ts. No LLM call — planning is
// pure, deterministic, fast, and cannot fail on malformed JSON.
//
// A single-step plan ("passthrough") means the executor is skipped and the
// existing single-query pipeline runs unchanged.

import type { QueryIntent, QueryRoute } from "./rag.js";

export interface QueryStep {
  /** Debug-only id used in traces ("left", "right", "chart"). */
  id: string;
  /** Sub-query text — goes through embedding + RPC + boosts like any query. */
  query: string;
  /** Reserved for P2 differential pool sizing. Not consumed in P1. */
  poolShare: number;
}

export type QueryPlanStrategy =
  | "passthrough"
  | "vspair"
  | "counter-archetype"
  | "team-archetype";

export interface QueryPlan {
  originalQuery: string;
  strategy: QueryPlanStrategy;
  steps: QueryStep[];
}

export function planQuery(
  question: string,
  intent: QueryIntent,
  route: QueryRoute,
): QueryPlan {
  // vsPair — "Dragonite vs Scizor", "how does Charizard handle Rotom-Wash".
  // Each side gets a profile query so the weaker-signal side can't get
  // crowded out by the stronger one; type_chart surfaces the matchup.
  if (route.vsPair) {
    const [a, b] = route.vsPair;
    return {
      originalQuery: question,
      strategy: "vspair",
      steps: [
        { id: "left", query: `${a} moveset ability stats`, poolShare: 0.4 },
        { id: "right", query: `${b} moveset ability stats`, poolShare: 0.4 },
        { id: "chart", query: `${a} ${b} type matchup`, poolShare: 0.2 },
      ],
    };
  }

  // Archetype + counter intent — "counter a Rain team", "how to beat Sun".
  // Three angles: archetype strategy, explicit counters, and a
  // type-coverage query tuned to the archetype's weaknesses.
  if (route.archetype && intent.isCounterQuery) {
    const arch = route.archetype;
    return {
      originalQuery: question,
      strategy: "counter-archetype",
      steps: [
        { id: "theory", query: `${arch} team strategy enablers abusers`, poolShare: 0.35 },
        { id: "counters", query: `how to counter ${arch} teams weaknesses`, poolShare: 0.35 },
        { id: "coverage", query: archetypeCoverageQuery(arch), poolShare: 0.30 },
      ],
    };
  }

  // Archetype + team keyword — "best Sun team", "Sand team for Excadrill".
  // Diversifies the pool across theory doc, abuser cards, and tournament
  // pastes — the three buckets tournament-savvy users actually want.
  if (route.archetype && intent.hasTeamKeyword) {
    const arch = route.archetype;
    return {
      originalQuery: question,
      strategy: "team-archetype",
      steps: [
        { id: "archetype", query: `${arch} archetype team building theory`, poolShare: 0.35 },
        { id: "sweepers", query: `${arch} sweepers abusers main threats`, poolShare: 0.35 },
        { id: "tournament", query: `${arch} tournament winning teams`, poolShare: 0.30 },
      ],
    };
  }

  // Passthrough — single-step plan; existing single-query pipeline runs.
  return {
    originalQuery: question,
    strategy: "passthrough",
    steps: [{ id: "main", query: question, poolShare: 1.0 }],
  };
}

// Coverage angle for counter-archetype: name the types that pressure
// the archetype's enablers/abusers. Phrased so type_chart sub-chunks
// and typed Pokemon/move chunks both match.
function archetypeCoverageQuery(archetype: string): string {
  switch (archetype) {
    case "rain":
      return "grass electric type coverage water resist";
    case "sun":
      return "water rock ground type coverage fire resist";
    case "sand":
      return "water grass fighting ground type coverage rock resist";
    case "snow":
      return "fire steel fighting type coverage ice resist";
    case "trick room":
      return "priority moves fast sweepers taunt";
    case "tailwind":
      return "trick room priority icy wind taunt";
    default:
      return `${archetype} type coverage resist`;
  }
}
