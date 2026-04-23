// Stage 6.3 — Plan-and-Execute DAG (executor) · Phase 5 redesign
//
// Runs a multi-step QueryPlan: sub-queries fan out via `rawFn` to fetch
// RAW DB candidates (embed + RPC only — no rerank, no force-includes,
// no boosts). The executor then re-applies collectForceIncludes() and
// applyBoosts() ONCE against the user's ORIGINAL query/intent/route
// post-merge. This is the Phase 5 structural fix for the planner ×
// reranker score-merge problem: sub-queries now contribute diverse
// candidates, but domain knowledge (force-includes, boosts) keys off
// the user's original wording rather than each sub-query's text,
// preserving the Stage 4.6 invariant under planner decomposition.
//
// Pre-Phase-5 behavior (for reference): each sub-query ran the full
// single-query pipeline (embed + RPC + rerank + force-includes + boosts)
// and then results were max-merged by id. Because every sub-query got
// its own force-include / boost / rerank pass keyed off its OWN text,
// Stage 4.6 invariants drifted and a reranker couldn't coexist with
// the boost layer. Phase 3 attempts regressed matchup nDCG 15-18%;
// Phase 5 fixes that structurally.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryPlan } from "./query-planner.js";
import type { Result, ProgressCallback } from "./rag.js";
import type { QueryIntent } from "./rag/classify.js";
import type { QueryRoute } from "./rag/route.js";
import { collectForceIncludes } from "./rag/force-includes.js";
import { applyBoosts, type BoostCandidate } from "./rag/boost.js";
import { runStructuredFilter } from "./rag/structured-filter.js";

type RawFn = (question: string, fetchK: number) => Promise<Record<string, unknown>[]>;

export async function executePlan(
  plan: QueryPlan,
  topK: number,
  originalIntent: QueryIntent,
  originalRoute: QueryRoute,
  supabase: SupabaseClient,
  rawFn: RawFn,
  onProgress?: ProgressCallback,
  boostMul: number = 1,
): Promise<Result[]> {
  const planT0 = Date.now();
  onProgress?.("plan_start", {
    strategy: plan.strategy,
    stepCount: plan.steps.length,
    steps: plan.steps.map((s) => ({ id: s.id, query: s.query })),
  });

  // Larger pool floor on theory / counter / matchup routes — compensates
  // for removing the original query from the fan-out. Mirrors the
  // single-pipeline baseFloor=160 heuristic (lib/rag.ts) for the same
  // reason: Pokemon chunks can rank past 80 when FTS is weak on
  // strategic vocabulary. Keyed on ORIGINAL intent/route so sub-queries
  // inherit the right floor regardless of their own phrasing.
  const perStep = Math.max(
    topK * 3,
    originalRoute.route === "theory" || originalIntent.isCounterQuery || originalIntent.isMatchupQuery
      ? 160
      : 80,
  );

  // Fan out SUB-QUERIES ONLY. Original is no longer in the batch — its
  // signal enters via post-merge force-includes + boosts against
  // plan.originalQuery / originalIntent / originalRoute.
  const subBatches = await Promise.all(
    plan.steps.map((step) => rawFn(step.query, perStep)),
  );

  // Merge raw DB rows by id, keeping max rrf_score. Rows remain
  // Record<string, unknown> (unparsed) so force-include augment + parse
  // can happen in one pass below.
  const mergedById = new Map<string, Record<string, unknown>>();
  for (const batch of subBatches) {
    for (const row of batch) {
      const id = row.id as string;
      const score = typeof row.rrf_score === "number" ? row.rrf_score : Number(row.rrf_score ?? 0);
      const existing = mergedById.get(id);
      const existingScore = existing
        ? (typeof existing.rrf_score === "number" ? existing.rrf_score : Number(existing.rrf_score ?? 0))
        : -Infinity;
      if (!existing || score > existingScore) mergedById.set(id, row);
    }
  }

  // Force-includes against ORIGINAL query/intent/route. This is the
  // Stage 4.6 invariant fix: phantom, vsPair, banned-item, type_chart,
  // exact-entity chunks trigger based on what the USER asked, not how
  // the planner decomposed the question. max(rpcScore, baseScore) so a
  // chunk already highly ranked by a sub-query isn't clipped to the
  // floor. Force-include row wins on other fields (matches the old
  // single-pipeline concat-dedup semantics).
  const forced = await collectForceIncludes(plan.originalQuery, originalIntent, originalRoute, supabase);
  for (const { row, baseScore } of forced.values()) {
    const id = row.id as string;
    const existing = mergedById.get(id);
    const existingScore = existing
      ? (typeof existing.rrf_score === "number" ? existing.rrf_score : Number(existing.rrf_score ?? 0))
      : undefined;
    const finalScore = existingScore !== undefined ? Math.max(existingScore, baseScore) : baseScore;
    mergedById.set(id, { ...row, rrf_score: finalScore });
  }

  // Optional structured filter against originalQuery. In practice the
  // planner never fires multi-step plans on structured queries (stat
  // filters don't match vspair/counter-archetype/team-archetype
  // patterns), so originalIntent.isStructured is always false here.
  // Branch included for parity with the single-pipeline.
  const structuredIds = new Set<string>();
  if (originalIntent.isStructured) {
    const structuredResults = await runStructuredFilter(plan.originalQuery, topK);
    for (const row of structuredResults) {
      const id = row.id as string;
      structuredIds.add(id);
      if (!mergedById.has(id)) {
        // Structured rows lack rrf_score — score=0, isStructuredResult=true
        // gives them a +0.1 boost via applyBoosts so they clear the pack.
        mergedById.set(id, row);
      }
    }
  }

  // Parse merged rows → BoostCandidate[] (mirrors lib/rag.ts parse block).
  const parsed: BoostCandidate[] = [...mergedById.values()].map((r) => {
    const rawMeta = r.metadata;
    const metadata: Record<string, unknown> =
      typeof rawMeta === "string"
        ? JSON.parse(rawMeta)
        : (rawMeta as Record<string, unknown>) ?? {};
    const id = r.id as string;
    return {
      id,
      text: r.text as string,
      source: r.source as string,
      score: typeof r.rrf_score === "number" ? r.rrf_score : Number(r.rrf_score ?? 0),
      sourceType: r.source_type as string,
      dataCategory: r.data_category as string,
      metadata,
      isStructuredResult: structuredIds.has(id),
    };
  });

  // Boost against ORIGINAL query/intent/route. boostMul=1 under Phase 5
  // (no reranker). Phase 3 retry will plumb a reranker-aware boostMul
  // through this parameter once a post-merge reranker step is added
  // before the applyBoosts call.
  const boosted = applyBoosts(parsed, originalIntent, originalRoute, plan.originalQuery, boostMul);
  boosted.sort((a, b) => b.score - a.score);
  const kept = boosted.slice(0, topK);

  onProgress?.("plan_end", {
    strategy: plan.strategy,
    stepCount: plan.steps.length,
    mergedPoolSize: mergedById.size,
    forcedCount: forced.size,
    kept: kept.length,
    topSource: kept[0]?.source ?? null,
    topScore: kept[0]?.score ?? null,
    ms: Date.now() - planT0,
  });

  if (process.env.RAG_DEBUG) {
    console.error(
      `[DEBUG] executePlan ${plan.strategy} steps=${plan.steps.length} subPool=${mergedById.size - forced.size} forced=${forced.size} total=${mergedById.size} kept=${kept.length} in ${Date.now() - planT0}ms`,
    );
    for (const [i, step] of plan.steps.entries()) {
      console.error(`[DEBUG]   batch[${step.id}]: "${step.query}" → ${subBatches[i].length} rows`);
    }
  }

  return kept;
}
