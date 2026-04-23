import { resolve, dirname } from "node:path";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { embed } from "./embed.js";
import {
  rerankCandidates,
  rerankWithCrossEncoder,
  rerankWithGemma,
} from "./rerank.js";
import { supabaseServer } from "./supabase.js";
import { planQuery } from "./query-planner.js";
import { executePlan } from "./query-executor.js";
import { classifyQuery } from "./rag/classify.js";
import { routeQuery } from "./rag/route.js";
import { runStructuredFilter } from "./rag/structured-filter.js";
import { collectForceIncludes } from "./rag/force-includes.js";
import { applyBoosts, type BoostCandidate } from "./rag/boost.js";

// Re-export types so existing callers (scripts/*, lib/query-planner.ts,
// lib/query-executor.ts) keep working without import churn.
export type { QueryIntent } from "./rag/classify.js";
export type { QueryRoute } from "./rag/route.js";
export { classifyQuery, routeQuery };

const PROJECT_ROOT = process.env.POKEMON_DATA_ROOT
  ? resolve(process.env.POKEMON_DATA_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Staleness detection (reads pc_index_meta.file_mtimes)
// ---------------------------------------------------------------------------

let _stalenessChecked = false;

async function checkStaleness(): Promise<void> {
  if (_stalenessChecked) return;
  _stalenessChecked = true;

  // Skip on Vercel: Lambda filesystem mtimes come from the build image and
  // never match the mtimes captured at reindex time, so every file looks
  // "stale" on every cold start. Staleness is a local-dev signal only.
  if (process.env.VERCEL) return;

  try {
    const { data, error } = await supabaseServer()
      .from("pc_index_meta")
      .select("value")
      .eq("key", "file_mtimes")
      .maybeSingle();
    if (error || !data) return;

    const mtimes = (data.value ?? {}) as Record<string, string>;
    const staleFiles: string[] = [];

    for (const [relPath, indexedMtime] of Object.entries(mtimes)) {
      const absPath = resolve(PROJECT_ROOT, relPath);
      try {
        const currentMtime = statSync(absPath).mtime.toISOString();
        if (currentMtime > indexedMtime) staleFiles.push(relPath);
      } catch {
        // File removed — stale
        staleFiles.push(relPath);
      }
    }

    if (staleFiles.length > 0) {
      console.error(
        `[WARN] Index is stale: ${staleFiles.length} file(s) modified since last reindex (${staleFiles.slice(0, 3).join(", ")}${staleFiles.length > 3 ? "..." : ""}). Run /reindex to update.`
      );
    }
  } catch {
    // Network / table missing — ignore
  }
}

export interface Result {
  id: string;
  text: string;
  source: string;
  score: number;
  sourceType: string;
  metadata: Record<string, unknown>;
}

export type ProgressStage =
  | "embed_start"
  | "embed_end"
  | "rpc_start"
  | "rpc_end"
  | "structured_end"
  | "rules_end"
  | "rerank_end"
  | "plan_start"
  | "plan_end";

export type ProgressCallback = (stage: ProgressStage, detail?: Record<string, unknown>) => void;

export interface QueryOptions {
  /** Skip the Stage 6.3 planner. Set internally by executePlan when it
   *  fans out sub-queries, to avoid infinite recursion. External callers
   *  should not set this. */
  skipPlanner?: boolean;
}

export async function query(
  question: string,
  topK = 5,
  onProgress?: ProgressCallback,
  options?: QueryOptions,
): Promise<Result[]> {
  await checkStaleness();

  // Stage 6.3 — Plan-and-Execute DAG. Rule-driven decomposition based on
  // routeQuery() signals. Fires BEFORE embedding so the multi-step branch
  // doesn't waste work on a single embed we're about to discard.
  if (!options?.skipPlanner && process.env.QUERY_PLANNER_ENABLED !== "false") {
    const intent0 = classifyQuery(question);
    const route0 = routeQuery(question, intent0);
    const plan = planQuery(question, intent0, route0);
    if (plan.steps.length > 1) {
      return executePlan(
        plan,
        topK,
        (q, k) => query(q, k, undefined, { skipPlanner: true }),
        onProgress,
      );
    }
  }

  const embedT0 = Date.now();
  onProgress?.("embed_start", { chars: question.length });
  const [vector] = await embed([question], "query");
  onProgress?.("embed_end", { ms: Date.now() - embedT0, dim: vector?.length ?? 0 });

  const intent = classifyQuery(question);
  const route = routeQuery(question, intent);
  const supabase = supabaseServer();

  // Always fetch a healthy candidate pool so rerank boosts can surface the
  // right chunk even when topK is small (e.g. Protect in moves.csv can sit
  // outside the raw RRF top-20 but #1 after move-name boost). Strategic /
  // theory-routed queries get a larger floor because Pokemon chunks can
  // rank past 80 when FTS match is weak on strategic vocabulary (e.g.
  // "pivots into Tyranitar" — Pokemon chunk has no "pivot/defensive" terms).
  const baseFloor = route.route === "theory" || intent.isCounterQuery || intent.isMatchupQuery ? 160 : 80;
  const fetchK = Math.max(topK * 8, baseFloor);

  const rpcT0 = Date.now();
  onProgress?.("rpc_start", {
    fetchK,
    categories: intent.categories,
    pokemonName: intent.pokemonName,
    moveName: intent.moveName,
    itemName: intent.itemName,
  });
  const { data: hybridRaw, error: hybridErr } = await supabase.rpc("pc_hybrid_search", {
    p_embedding: vector,
    p_query: question,
    p_categories: intent.categories.length > 0 ? intent.categories : null,
    p_fetch_k: fetchK,
    p_rrf_k: 60,
  });
  onProgress?.("rpc_end", { ms: Date.now() - rpcT0, rows: (hybridRaw ?? []).length });
  if (hybridErr) {
    throw new Error(`pc_hybrid_search RPC failed: ${hybridErr.message}`);
  }
  const raw = (hybridRaw ?? []) as Record<string, unknown>[];

  // Reranker (cross-encoder / Gemma / Jina, configurable via RERANKER env).
  // Score the top-40 RPC candidates. When active, scores live in [0, 1] —
  // boostMul=20 keeps existing additive boosts (calibrated to RRF's
  // ~0.02-0.035 scale) meaningful on top of that.
  //
  // RERANKER values:
  //   crossencoder — BAAI/bge-reranker-base via HF Inference (default if HF_TOKEN set)
  //   gemma        — Gemma 4 26B pointwise via OpenRouter (deprecated — see retrieval-2026-04-22T03-52-48-886Z)
  //   jina         — Jina v2 (paid, currently no balance)
  //   none         — RRF + boosts only (back-compat default)
  // Legacy: GEMMA_RERANK_ENABLED=true still selects gemma.
  const rerankT0 = Date.now();
  const rerankerChoice =
    (process.env.RERANKER ?? "").toLowerCase() ||
    (process.env.GEMMA_RERANK_ENABLED === "true" ? "gemma" : "jina");
  const candidatesForRerank = raw.map((r) => ({
    id: r.id as string,
    text: r.text as string,
  }));
  let rerankerScores: Map<string, number> | null = null;
  if (rerankerChoice === "crossencoder") {
    rerankerScores = await rerankWithCrossEncoder(question, candidatesForRerank);
  } else if (rerankerChoice === "gemma") {
    rerankerScores = await rerankWithGemma(question, candidatesForRerank);
  } else if (rerankerChoice === "jina") {
    rerankerScores = await rerankCandidates(question, candidatesForRerank);
  }
  const rerankerActive = rerankerScores !== null && rerankerScores.size > 0;
  const boostMul = rerankerActive ? 20 : 1;
  if (rerankerActive) {
    for (const r of raw) {
      const s = rerankerScores!.get(r.id as string);
      // Items outside the reranked pool keep a small baseline so the boost
      // layer can still promote them (exact-name, structured, rules).
      r.rrf_score = typeof s === "number" ? s : 0.05;
    }
    if (process.env.RAG_DEBUG) {
      console.error(
        `[DEBUG] ${rerankerChoice} reranked ${rerankerScores!.size}/${raw.length} in ${Date.now() - rerankT0}ms`,
      );
    }
  }

  let structuredResults: Record<string, unknown>[] = [];
  if (intent.isStructured) {
    structuredResults = await runStructuredFilter(question, topK);
    if (process.env.RAG_DEBUG) {
      console.error(`[DEBUG] Structured results: ${structuredResults.length}`);
      for (const r of structuredResults) {
        console.error(`[DEBUG]   ${r.pokemon_name} Spe:${r.stat_speed} SpA:${r.stat_sp_atk}`);
      }
    }
  } else if (process.env.RAG_DEBUG) {
    console.error("[DEBUG] Not structured query");
  }

  // Force-included rows come from direct table selects with no rrf_score.
  // If the RPC already contains the same row, use max(rpcScore, baseScore)
  // so a high RPC score isn't clipped to the floor. Otherwise set baseScore
  // so boosts can lift the row into top-10 instead of leaving it at 0.
  const rpcScoreById = new Map<string, number>();
  for (const r of raw) {
    const s = typeof r.rrf_score === "number" ? r.rrf_score : Number(r.rrf_score ?? 0);
    rpcScoreById.set(r.id as string, s);
  }

  const forced = await collectForceIncludes(question, intent, route, supabase);
  const forcedRows: Record<string, unknown>[] = [];
  for (const { row, baseScore } of forced.values()) {
    const id = row.id as string;
    const rpcScore = rpcScoreById.get(id);
    const finalScore = rpcScore !== undefined ? Math.max(rpcScore, baseScore) : baseScore;
    forcedRows.push({ ...row, rrf_score: finalScore });
  }

  const structuredIds = new Set(structuredResults.map((r) => r.id as string));
  const allRaw = [...structuredResults, ...forcedRows, ...raw];

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = allRaw.filter((r) => {
    const id = r.id as string;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const parsed: BoostCandidate[] = deduped.map((r: Record<string, unknown>) => {
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

  const boosted = applyBoosts(parsed, intent, route, question, boostMul);

  boosted.sort((a, b) => b.score - a.score);
  const kept = boosted.slice(0, topK);
  onProgress?.("rerank_end", {
    candidatePool: boosted.length,
    kept: kept.length,
    topSource: kept[0]?.source ?? null,
    topScore: kept[0]?.score ?? null,
    topCategory: kept[0]?.dataCategory ?? null,
    structuredCount: structuredResults.length,
  });
  return kept;
}
