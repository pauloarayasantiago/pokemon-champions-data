// Stage 6.3 — Plan-and-Execute DAG (executor)
//
// Runs a multi-step QueryPlan: each sub-query runs the full single-query
// pipeline (embed + hybrid RPC + Jina + force-includes + boosts) in
// parallel via Promise.all, then results are merged by chunk id.
//
// The executor calls back into query() with skipPlanner=true to avoid
// infinite recursion. Each sub-query gets its own intent+route
// classification because sub-queries are often narrower (and want
// different boosts) than the original user question.

import type { QueryPlan } from "./query-planner.js";
import type { Result, ProgressCallback } from "./rag.js";

type QueryFn = (question: string, topK: number) => Promise<Result[]>;

export async function executePlan(
  plan: QueryPlan,
  topK: number,
  queryFn: QueryFn,
  onProgress?: ProgressCallback,
): Promise<Result[]> {
  const planT0 = Date.now();
  onProgress?.("plan_start", {
    strategy: plan.strategy,
    stepCount: plan.steps.length,
    steps: plan.steps.map((s) => ({ id: s.id, query: s.query })),
  });

  // Each sub-query fetches ~3× topK candidates (floor 40) so the merged
  // pool is diverse enough that dedup doesn't collapse us back to one
  // source's top hits.
  const perStep = Math.max(topK * 3, 40);

  // Run the ORIGINAL query alongside sub-queries. The original is the only
  // path where vsPair / phantom / banned-item force-includes and their
  // boosts fire — sub-queries re-classify independently and lose those
  // signals. Including the original preserves Stage 4.6 invariants (both
  // sides of a vsPair get force-included; banned-item chunks rank-1 on
  // adversarial queries) while sub-queries add semantic diversity.
  const allBatches = await Promise.all([
    queryFn(plan.originalQuery, perStep),
    ...plan.steps.map((step) => queryFn(step.query, perStep)),
  ]);

  // Merge by chunk id; keep the highest score a chunk earned across all
  // batches. The original-query batch carries vsPair / force-include
  // boosts; sub-query batches carry intent-specific boosts for each
  // semantic angle. Max-score per id preserves whichever angle ranked
  // the chunk best.
  const merged = new Map<string, Result>();
  for (const batch of allBatches) {
    for (const r of batch) {
      const existing = merged.get(r.id);
      if (!existing || r.score > existing.score) merged.set(r.id, r);
    }
  }

  const sorted = [...merged.values()].sort((a, b) => b.score - a.score);
  const kept = sorted.slice(0, topK);

  onProgress?.("plan_end", {
    strategy: plan.strategy,
    stepCount: plan.steps.length,
    mergedPoolSize: merged.size,
    kept: kept.length,
    topSource: kept[0]?.source ?? null,
    topScore: kept[0]?.score ?? null,
    ms: Date.now() - planT0,
  });

  if (process.env.RAG_DEBUG) {
    console.error(
      `[DEBUG] executePlan ${plan.strategy} steps=${plan.steps.length} pool=${merged.size} kept=${kept.length} in ${Date.now() - planT0}ms`,
    );
    console.error(`[DEBUG]   batch[original]: "${plan.originalQuery}" → ${allBatches[0].length} rows`);
    for (const [i, step] of plan.steps.entries()) {
      console.error(`[DEBUG]   batch[${step.id}]: "${step.query}" → ${allBatches[i + 1].length} rows`);
    }
  }

  return kept;
}
