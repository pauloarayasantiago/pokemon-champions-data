# Active Context

_Last updated: 2026-04-22, post Phase 0 closeout. Purpose: one-page "right now" snapshot. Forward plan lives in [rag-master-plan.md](rag-master-plan.md); stage-by-stage history in [progress.md](progress.md); bug log in [errors.md](errors.md)._

## TL;DR

- **Baseline retrieval:** nDCG@10 = **0.849** on 100-case golden set (Jina OFF, Stage 4.6); Stage 6.3 runs 0.846–0.849 (within ±0.5%).
- **Baseline agentic:** 12/13 pass at ~22k tok/pass, 18.4s avg, Gemma 4 26B via OpenRouter.
- **Last shipped:** Phase 0 closeout — Stage 6.3 (commit `b056e4c`), agentic 3-run variance verified 2026-04-22.
- **Working tree:** clean after Phase 0 closeout commit.
- **Next move:** Phase 1 cleanup (delete Italian translation residue) → Phase 2 forced-JSON + `chunk_id` validation → Phase 3 Gemma pointwise reranker. See [rag-master-plan.md](rag-master-plan.md) Part 4.

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

### Stage 6.3 — SHIPPED · commit `b056e4c` (2026-04-21) · Phase 0 closed 2026-04-22

- Rule-driven query decomposition at the RAG layer: [lib/query-planner.ts](../lib/query-planner.ts) (~90 LOC) + [lib/query-executor.ts](../lib/query-executor.ts) (~70 LOC).
- `Promise.all` over agent-loop tool calls: [src/app/api/team/route.ts:160](../src/app/api/team/route.ts).
- Flag `QUERY_PLANNER_ENABLED=false` = full rollback to Stage 4.6.
- Retrieval neutral (Stage 4.6 force-includes saturate top-10); framework in place for Phase 5 executor redesign.
- Phase 0 closeout 3-run agentic variance (gemma-4-26b --real-rag, 2026-04-22): recorded in [progress.md](progress.md) Stage 6.3 entry.

### Stage 5 — ABANDONED · 2026-04-21

- EmbeddingGemma MRL-384 shadow. Italian not a product requirement; Gemma −1.3% overall / −6.6% on `team` intent vs BGE.
- Code reverted (never committed); Supabase `embedding_v2` column/index/RPC dropped.
- Dormant evidence (untracked): `evals/golden-set-bilingual.jsonl` + two `retrieval-shadow-*.json` in `memory-bank/eval-baselines/`.

## Working tree

Clean after Phase 0 closeout commit.

## Immediately queued

1. **Phase 1 — cleanup** (½ session, lowest-risk on-ramp): delete Italian translation residue (`translatePairs()` in `lib/chunker.ts`, `lib/translations.json` 2,383 entries, `evals/golden-set-bilingual.jsonl`, 2 shadow snapshots); reindex; snapshot new clean baseline.
2. **Phase 2 — forced-JSON + `chunk_id` validation** (1 session): faithfulness defense. Orthogonal to retrieval; may fix `team_json` flake incidentally, cleaning agentic-gate variance for every downstream phase.
3. **Phase 3 — Gemma pointwise reranker ⭐** (1 session, highest retrieval leverage): replaces dropped Jina path. Top-40 → Gemma pointwise scoring via OpenRouter. Gate: matchup ≥ 0.77, counter ≥ 0.72, overall ≥ 0.87.

Full tasks + gates + rollback triggers for each phase: [rag-master-plan.md](rag-master-plan.md) Part 4.

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
