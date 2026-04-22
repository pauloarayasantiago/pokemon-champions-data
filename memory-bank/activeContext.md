# Active Context

_Last updated: 2026-04-22, post Phase 1. Purpose: one-page "right now" snapshot. Forward plan lives in [rag-master-plan.md](rag-master-plan.md); stage-by-stage history in [progress.md](progress.md); bug log in [errors.md](errors.md)._

## TL;DR

- **Baseline retrieval:** nDCG@10 = **0.851** on 100-case golden set post-Phase 1 (Jina OFF, planner ON, 2,329 chunks). Stage 4.6/6.3 was 0.849; +0.24% overall, team +2.55% (reindex + ~90 new chunks).
- **Baseline agentic:** 12/13 pass at ~22k tok/pass, 18.4s avg, Gemma 4 26B via OpenRouter.
- **Last shipped:** Phase 1 cleanup (commit `7767a0a`) — Italian translation layer removed from `lib/chunker.ts` + `lib/calc/matchup.ts` + `scripts/test-suite.ts`; `translations.json` (2,383 entries) + `build-translations.ts` + 3 Stage 5 eval artifacts deleted.
- **Working tree:** clean after Phase 1 commit.
- **Next move:** Phase 2 forced-JSON + `chunk_id` validation → Phase 3 Gemma pointwise reranker → Phase 4 `lib/rag.ts` split. See [rag-master-plan.md](rag-master-plan.md) Part 4.

## Per-intent baseline (Jina OFF, Phase 1 clean — 2026-04-22)

| Intent | n | nDCG@10 | Recall@10 | P@10 | Gate |
|---|---|---|---|---|---|
| Overall | 100 | 0.851 | 0.87 | 0.34 | — |
| matchup | 10 | 0.741 | 1.00 | 0.49 | P@10 0.50 ✗ (structural) |
| counter | 18 | 0.691 | 0.67 | 0.41 | ✓ |
| team | 14 | 0.844 | 1.00 | 0.41 | ✓ |
| adversarial | 20 | 0.685 | 0.60 | 0.18 | ✓ |
| item | 14 | 0.991 | 0.93 | — | ✓ |
| move | 9 | 0.995 | 0.89 | — | ✓ |
| usage | 9 | 0.981 | 1.00 | — | ✓ |
| stat | 26 | 0.839 | 0.81 | — | ✓ |

Only unmet gate: matchup P@10 = 0.49 (target 0.50). **Structural** — golden-set `expected_contexts` doesn't list `type_chart.md` on most matchup rows. User forbade editing the golden set this cycle.

## Most recent work

### Phase 1 — SHIPPED · commit `7767a0a` (2026-04-22)

- Italian translation layer (`translatePairs()` + `getTranslations()`) removed from [lib/chunker.ts](../lib/chunker.ts); pikalytics chunk assembly reads `r.top_moves` / `r.top_items` / `r.top_abilities` directly.
- Mirror translation layer (`translateMove/Item/Ability()`) also removed from [lib/calc/matchup.ts](../lib/calc/matchup.ts) — not in original plan task list, but would have crashed `/calc` / `build-matchup-matrix` after JSON deletion.
- `testItalianTranslation()` + its `main()` call removed from [scripts/test-suite.ts](../scripts/test-suite.ts); `testScraperHeader()` preserved (the `Accept-Language` header is the canonical fix).
- Deletions: `lib/translations.json` (2,383 entries), `scripts/build-translations.ts` (orphaned generator), `evals/golden-set-bilingual.jsonl`, two `retrieval-shadow-2026-04-21T20-*.json` snapshots.
- Reindex: 2,329 chunks, zero translation-missing warnings.
- Retrieval gate: overall 0.851 (+0.24% vs 0.849 baseline); per-intent all within ±0.5% except team +2.55% (reindex variance + ~90 new chunks — welcome).

### Stage 6.3 — SHIPPED · commit `b056e4c` (2026-04-21) · Phase 0 closed 2026-04-22

- Rule-driven query decomposition at the RAG layer: [lib/query-planner.ts](../lib/query-planner.ts) (~90 LOC) + [lib/query-executor.ts](../lib/query-executor.ts) (~70 LOC).
- `Promise.all` over agent-loop tool calls: [src/app/api/team/route.ts:160](../src/app/api/team/route.ts).
- Flag `QUERY_PLANNER_ENABLED=false` = full rollback to Stage 4.6.
- Retrieval neutral (Stage 4.6 force-includes saturate top-10); framework in place for Phase 5 executor redesign.
- Phase 0 closeout 3-run agentic variance (gemma-4-26b --real-rag, 2026-04-22): recorded in [progress.md](progress.md) Stage 6.3 entry.

### Stage 5 — ABANDONED · 2026-04-21 · residue cleared 2026-04-22 (Phase 1)

- EmbeddingGemma MRL-384 shadow. Italian not a product requirement; Gemma −1.3% overall / −6.6% on `team` intent vs BGE.
- Code reverted (never committed); Supabase `embedding_v2` column/index/RPC dropped.
- File-level residue (bilingual fixture + 2 shadow snapshots + dead translation dict) deleted in Phase 1.

## Working tree

Clean after Phase 1 commit.

## Immediately queued

1. **Phase 2 — forced-JSON + `chunk_id` validation** (1 session): faithfulness defense. Orthogonal to retrieval; may fix `team_json` flake incidentally, cleaning agentic-gate variance for every downstream phase.
2. **Phase 3 — Gemma pointwise reranker ⭐** (1 session, highest retrieval leverage): replaces dropped Jina path. Top-40 → Gemma pointwise scoring via OpenRouter. Gate: matchup ≥ 0.77, counter ≥ 0.72, overall ≥ 0.87.
3. **Phase 4 — `lib/rag.ts` split** (1 session): prerequisite for Phase 5 executor redesign. Behavior-preserving refactor — extracts `classify/route/force-includes/boost/structured-filter` into modules.

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
