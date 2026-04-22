# Active Context

_Last updated: 2026-04-22, post Phase 3 BLOCKED. Purpose: one-page "right now" snapshot. Forward plan lives in [rag-master-plan.md](rag-master-plan.md); stage-by-stage history in [progress.md](progress.md); bug log in [errors.md](errors.md)._

## TL;DR

- **Baseline retrieval (active):** nDCG@10 = **0.851** on 100-case golden set (no reranker — RRF + boosts only, planner ON, 2,329 chunks). Unchanged from Phase 1+2.
- **Baseline agentic (post-Phase 2, v4.1 prompt):** 12–13/13 pass at ~25.5k tok/pass, 25s avg/test. `citation_validity_rate` = **100%** on the 5 retrieval-tagged tests.
- **Last attempt:** Phase 3 reranker — **BLOCKED**. Two attempts (Gemma 4 26B pointwise via OpenRouter, then BAAI/bge-reranker-base via HF Inference) both regressed matchup nDCG by 15-18%, triggering master-plan rollback. Snapshots: [retrieval-phase3-gemma.json](eval-baselines/retrieval-phase3-gemma.json) (0.830), [retrieval-phase3-crossencoder.json](eval-baselines/retrieval-phase3-crossencoder.json) (0.829). Code stays in tree behind `RERANKER` env var; default is no-op (identical to Phase 2 behavior).
- **Root cause:** planner × reranker score-merge problem. Stage 6.3's executor reranks each sub-query independently then max-merges, so sharp reranker scores create disparities the boost layer can't differentiate. Structural — addressed by Phase 5 (executor redesign), which re-applies force-includes/boosts post-merge against the original query. Detail in [progress.md](progress.md) Phase 3 entry.
- **Working tree (uncommitted):** Phase 3 code on disk — `lib/rerank.ts` (+220 LOC for Gemma + cross-encoder functions), `lib/rag.ts` (+15 LOC dispatch), `src/app/api/search/route.ts` (+1 line maxDuration), 2 new eval snapshots. No commit yet — awaiting user decision on commit shape.
- **Next move:** **Phase 4** `lib/rag.ts` split → Phase 5 executor redesign → Phase 3 retry (flip `RERANKER=crossencoder`, re-run gates). See [rag-master-plan.md](rag-master-plan.md) Part 4.

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

### Phase 3 — BLOCKED-pending-Phase-5 (2026-04-22)

- **What was tried:** two reranker implementations co-existing in [lib/rerank.ts](../lib/rerank.ts) — `rerankWithGemma()` (~140 LOC, pointwise OpenRouter, 10-slot inline worker pool, manual `AbortController`) and `rerankWithCrossEncoder()` (~80 LOC, single batched HF Inference call to BAAI/bge-reranker-base). [lib/rag.ts:584-625](../lib/rag.ts) dispatches via `RERANKER` env var (`crossencoder|gemma|jina|none`).
- **Why both failed gates:** planner × reranker score-merge problem — Stage 6.3 reranks each sub-query independently, sharp reranker scores create cross-sub-query disparities the boost layer can't differentiate. Detail in [progress.md](progress.md) Phase 3 entry. Smoke confirmed cross-encoder works correctly on passthrough queries (move-protect: rank 5 → rank 2) — the regression is isolated to planner-decomposed paths.
- **Decision:** roadmap reorder, not rollback. Code stays in tree behind env-var switch (default unchanged from Phase 2). Phase 4 → Phase 5 ship first; Phase 3 retry then flips `RERANKER=crossencoder` and re-runs gates under the new executor.

### Phase 2 — SHIPPED · commit `bc02d11` (2026-04-22)

- New shared module [lib/validate-citations.ts](../lib/validate-citations.ts): parser + JSON-repair + chunk_id validator + retry-nudge formatter (~150 LOC, 14/14 unit tests pass).
- Agent responses now end with a required `claims-json` block. For team-building: comes AFTER `team-json`. For non-team queries: it's the only fenced block. The existing UI renders the whole response as prose ([src/app/team/page.tsx:905-908](../src/app/team/page.tsx)), so adding a trailing block is safe.
- chunk_id propagation end-to-end: [src/lib/tools.ts](../src/lib/tools.ts) + [scripts/eval-models.ts](../scripts/eval-models.ts) both include `id` in search tool output (stub uses synthetic `stub:<slug>-<i>`).
- [src/app/api/team/route.ts](../src/app/api/team/route.ts) agent loop: accumulates `seenChunkIds` across all `search` calls, validates claims-json post-loop, fires one auto-retry with tightened nudge on invalid IDs. Emits new SSE events `citation_retry` + `citation_result` for ops visibility.
- Eval harness: same loop plus `citation_validity_rate` metric, per-test citation fields in `TestResult`, new CITATIONS report section, snapshot fields.
- System-prompt version: `2026-04-18.v3-self-revise` → `2026-04-22.v4.1-claims-json-tightened`. v4.1 closes the `{"claims": []}` escape hatch that run 1 exposed on `creator_opinion`.
- Infra fix: `loadEnv()` now respects explicit shell overrides.
- **3-run variance (gemma-4-26b --real-rag, Jina OFF):** run 1 (v4) 12/13 @ 80% cit_rate; run 2 (v4.1) 12/13 @ 100%; run 3 (v4.1) 13/13 @ 100%. Master-plan gates (≥12/13 all 3 runs + cit_rate ≥95%) all met under v4.1. `team_json` flake fixed — passed cleanly on both v4.1 runs.

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

Uncommitted Phase 3 code on disk (not yet committed pending user direction):
- `lib/rerank.ts` — added `rerankWithGemma()` + `rerankWithCrossEncoder()` (~220 LOC total, both behind env-var dispatch)
- `lib/rag.ts` — RERANKER env-var dispatch at lines 584-625 (~15 LOC)
- `src/app/api/search/route.ts` — `maxDuration = 30` (kept for Phase 3 retry)
- `memory-bank/eval-baselines/retrieval-phase3-{gemma,crossencoder}.json` — both eval snapshots (untracked)

Default behavior (`RERANKER` unset) is identical to Phase 2 — falls through to "jina" → returns null (no balance) → boostMul=1 → RRF + boosts.

## Immediately queued

1. **Phase 4 — `lib/rag.ts` split** (1 session): prerequisite for Phase 5 executor redesign. Behavior-preserving refactor — extracts `classify/route/force-includes/boost/structured-filter` into modules. Now the next thing to ship.
2. **Phase 5 — executor redesign** (1 session): closes the aspirational Stage 6.3 nDCG gap AND structurally fixes the planner × reranker score-merge problem that blocked Phase 3. After Phase 5: re-applies force-includes + boosts post-merge against original query.
3. **Phase 3 retry — cross-encoder re-eval** (½ session, post-Phase 5): flip `RERANKER=crossencoder`, re-run 100-case retrieval eval + 3-run agentic variance. Expected nDCG 0.87–0.90 once planner conflict is resolved.

Full tasks + gates + rollback triggers for each phase: [rag-master-plan.md](rag-master-plan.md) Part 4.

## Hard constraints

- **No paid APIs except OpenRouter Gemma 4 26B.** Jina is permanently OFF; don't propose top-ups. See [memory/project_no_paid_apis.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Golden set frozen this cycle** — don't edit `evals/golden-set.jsonl`.
- **Vercel Lambda 250MB bundle.** `onnxruntime-node` doesn't bundle; HF Inference API is the query-embedding path on prod. See [memory/project_vercel_embedding_constraint.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Rollback triggers:** any intent > 3% regression, agentic < 12/13 variance, Lambda > 240MB, Gemma rerank > $5/month.

## Key code pointers

- [lib/rag.ts](../lib/rag.ts) — `query()` orchestrator. Split target in Phase 4. RERANKER dispatch at lines 584-625.
- [lib/query-planner.ts](../lib/query-planner.ts) / [lib/query-executor.ts](../lib/query-executor.ts) — Stage 6.3. Phase 5 redesigns the executor to re-apply force-includes/boosts post-merge against original query.
- [lib/rerank.ts](../lib/rerank.ts) — three reranker clients (Jina, Gemma pointwise, BGE cross-encoder via HF). All dormant by default; flip `RERANKER=crossencoder` post-Phase 5.
- [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5 (Stage 1.2).
- [src/app/api/team/route.ts:160](../src/app/api/team/route.ts) — agent loop, `Promise.all` (Stage 6.3).
- [evals/golden-set.jsonl](../evals/golden-set.jsonl) — 100-case graded-relevance set.
