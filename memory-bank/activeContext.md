# Active Context

_Last updated: 2026-04-21, post Stage 6.3. Purpose: one-page "right now" snapshot. Forward plan lives in [rag-master-plan.md](rag-master-plan.md); stage-by-stage history in [progress.md](progress.md); bug log in [errors.md](errors.md)._

## TL;DR

- **Baseline retrieval:** nDCG@10 = **0.849** on 100-case golden set (Jina OFF, Stage 4.6).
- **Baseline agentic:** 12/13 pass at ~22k tok/pass, 18.4s avg, Gemma 4 26B via OpenRouter.
- **Last shipped:** Stage 6.3 (Plan-and-Execute DAG + `Promise.all` agent loop) — retrieval-neutral; framework in place.
- **Working-tree state:** Stage 6.3 code written, **not yet committed**. Recent commits end at `9e67bd3` (Stage 5 rollback doc). See "Pending verification + commit" below.
- **Next move:** Phase 1 cleanup (Stage 5 residue delete) → Phase 2 Gemma pointwise reranker. See [rag-master-plan.md](rag-master-plan.md) Part 4.

## Per-intent baseline (Jina OFF, Stage 4.6/6.3)

| Intent | n | nDCG@10 | Recall@10 | P@10 | Gate |
|---|---|---|---|---|---|
| Overall | 100 | 0.849 | 0.87 | 0.33 | — |
| matchup | 10 | 0.740 | 1.00 | 0.48 | P@10 0.50 ✗ (structural) |
| counter | 18 | 0.693 | 0.67 | 0.41 | ✓ |
| team | 14 | 0.823 | 1.00 | 0.42 | ✓ |
| adversarial | 20 | 0.685 | 0.60 | 0.18 | ✓ |
| item | 14 | 0.991 | 0.93 | — | ✓ |
| move | 9 | 0.995 | 0.89 | — | ✓ |
| usage | 9 | 0.981 | 1.00 | — | ✓ |
| stat | 26 | 0.838 | 0.81 | — | ✓ |

Only unmet gate: matchup P@10 = 0.48 (target 0.50). **Structural** — golden-set `expected_contexts` doesn't list `type_chart.md` on most matchup rows. User forbade editing the golden set this cycle.

## Most recent work

### Stage 6.3 — SHIPPED (code) / uncommitted (git) · 2026-04-21

- Rule-driven query decomposition at the RAG layer: [lib/query-planner.ts](../lib/query-planner.ts) (~90 LOC) + [lib/query-executor.ts](../lib/query-executor.ts) (~70 LOC).
- `Promise.all` over agent-loop tool calls: [src/app/api/team/route.ts:160](../src/app/api/team/route.ts).
- Flag `QUERY_PLANNER_ENABLED=false` = full rollback to Stage 4.6.
- Retrieval neutral (Stage 4.6 force-includes saturate top-10); framework in place for Phase 4 executor redesign.

### Stage 5 — ABANDONED · 2026-04-21

- EmbeddingGemma MRL-384 shadow. Italian not a product requirement; Gemma −1.3% overall / −6.6% on `team` intent vs BGE.
- Code reverted (never committed); Supabase `embedding_v2` column/index/RPC dropped.
- Dormant evidence (untracked): `evals/golden-set-bilingual.jsonl` + two `retrieval-shadow-*.json` in `memory-bank/eval-baselines/`.

## Working-tree state (uncommitted)

- `M lib/rag.ts` — planner branch (Stage 6.3).
- `M src/app/api/team/route.ts` — `Promise.all` (Stage 6.3).
- `M memory-bank/activeContext.md`, `progress.md` — session docs.
- `M .claude/settings.local.json`.
- **Untracked new code:** `lib/query-planner.ts`, `lib/query-executor.ts`.
- **Untracked data:** retrieval-eval snapshots (9), Gemma model-eval snapshots (7) + logs.

## Immediately queued

1. **Commit Stage 6.3** after the two verifications below.
2. **Phase 1 cleanup** (lowest-risk on-ramp): delete Italian translation residue (`translatePairs()` in `lib/rag.ts`, `lib/translations.json` 2,383 entries, `evals/golden-set-bilingual.jsonl`, 2 shadow snapshots); reindex; snapshot new clean baseline.
3. **Phase 2 Gemma pointwise reranker** (highest retrieval leverage): replaces dropped Jina path. Top-40 → Gemma pointwise scoring via OpenRouter. Gate: matchup ≥ 0.77, counter ≥ 0.72, overall ≥ 0.87.

Details + rollback triggers for each phase: [rag-master-plan.md](rag-master-plan.md).

## Pending verification before committing Stage 6.3

- **Full 100-case retrieval snapshot** (prior attempt killed by stdout buffer hang; only per-intent subsets verified).
- **Full 13-test 3-run agentic variance** (prior Stage 6.3 eval was a 4-test team-build subset — 4/4 pass including `team_json` may have been lucky variance).

## Hard constraints

- **No paid APIs except OpenRouter Gemma 4 26B.** Jina is permanently OFF; don't propose top-ups. See [memory/project_no_paid_apis.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Golden set frozen this cycle** — don't edit `evals/golden-set.jsonl`.
- **Vercel Lambda 250MB bundle.** `onnxruntime-node` doesn't bundle; HF Inference API is the query-embedding path on prod. See [memory/project_vercel_embedding_constraint.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Rollback triggers:** any intent > 3% regression, agentic < 12/13 variance, Lambda > 240MB, Gemma rerank > $5/month.

## Key code pointers

- [lib/rag.ts](../lib/rag.ts) — `query()` orchestrator. Split target in Phase 3.
- [lib/query-planner.ts](../lib/query-planner.ts) / [lib/query-executor.ts](../lib/query-executor.ts) — Stage 6.3.
- [lib/rerank.ts](../lib/rerank.ts) — reranker client. Currently Jina (403). Phase 2 adds `rerankWithGemma()`.
- [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5 (Stage 1.2).
- [src/app/api/team/route.ts:160](../src/app/api/team/route.ts) — agent loop, `Promise.all` (Stage 6.3).
- [evals/golden-set.jsonl](../evals/golden-set.jsonl) — 100-case graded-relevance set.
