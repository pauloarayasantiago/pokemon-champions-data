# Active Context

_Last updated: 2026-04-22 (Phase 4 SHIPPED, bit-for-bit eval parity confirmed). Purpose: one-page "right now" snapshot. Forward plan lives in [rag-master-plan.md](rag-master-plan.md); stage-by-stage history in [progress.md](progress.md); bug log in [errors.md](errors.md)._

## TL;DR

- **Baseline retrieval (active):** nDCG@10 = **0.851** on 100-case golden set (no reranker — RRF + boosts only, planner ON, 2,329 chunks). Unchanged from Phase 1+2.
- **Baseline agentic (post-Phase 2, v4.1 prompt):** 12–13/13 pass at ~25.5k tok/pass, 25s avg/test. `citation_validity_rate` = **100%** on the 5 retrieval-tagged tests.
- **Phase 3 reranker (previous session):** BLOCKED. Committed as `cf845dd` after user direction. Both attempts (Gemma pointwise, BGE cross-encoder) regressed matchup nDCG 15-18% under planner decomposition — structural issue addressed by Phase 5.
- **Phase 4 (just shipped):** `lib/rag.ts` 1108 → 288 LOC orchestrator + 5 focused modules under `lib/rag/`. Retrieval snapshot [retrieval-phase4-refactor.json](eval-baselines/retrieval-phase4-refactor.json) is **bit-for-bit identical** to `retrieval-post-stage6.3-clean.json` baseline (full JSON deep-diff: zero deltas aside from timestamp). `tsc --noEmit` clean. Smoke test on "Protect PP in Champions" returns expected top-3 ranks. Gate passed.
- **Next move:** Phase 5 executor redesign (consumes `collectForceIncludes(originalQuery, ...)` + `applyBoosts(...)` post-merge) → Phase 3 retry with `RERANKER=crossencoder`. See [rag-master-plan.md](rag-master-plan.md) Part 4.

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

### Phase 4 — SHIPPED (2026-04-22 evening) · snapshot: [retrieval-phase4-refactor.json](eval-baselines/retrieval-phase4-refactor.json)

- **Goal:** split 1108-LOC `lib/rag.ts` into focused modules. Prerequisite for Phase 5 executor redesign. Behavior-preserving refactor.
- **Gate passed:** full 100-case retrieval eval produced `retrieval-phase4-refactor.json` — JSON deep-diff vs baseline `retrieval-post-stage6.3-clean.json` (ignoring timestamp) shows **zero deltas**. Overall 0.851386760816444 = baseline. All intents identical. `char-y-teammates` is a known 1-case flake (noticed in a redundant intermediate run at 0.9196 vs 1.0000; the canonical run returned 1.0000 matching baseline, so the flake is preserved at the same rate — not a refactor-induced regression).
- **Extraction:**
  - [lib/rag/classify.ts](../lib/rag/classify.ts) — 283 LOC: PROJECT_ROOT + Pokemon/move/item/type dictionaries + `QueryIntent` + 8 keyword arrays + `classifyQuery()`.
  - [lib/rag/route.ts](../lib/rag/route.ts) — 116 LOC: `QueryRoute` + `ARCHETYPE_PATTERNS` + `PHANTOM_TO_EVOLVED` + `PHANTOM_PRE_EVOS` + `routeQuery()`. Imports `getPokemonNames` + `QueryIntent` from `./classify.js`.
  - [lib/rag/structured-filter.ts](../lib/rag/structured-filter.ts) — 33 LOC: `runStructuredFilter()`.
  - [lib/rag/force-includes.ts](../lib/rag/force-includes.ts) — 172 LOC: `ForcedChunk` interface + `collectForceIncludes(question, intent, route, supabase): Promise<Map<string, ForcedChunk>>` wrapping all 7 force-include blocks (rules, phantom, phantomEvolved, vsPair, typeChart on vsPair, exact-entity, banned-item). First-wins insert matches the old global first-seen dedup; insertion order matches old concat order (rules → phantom → phantomEvolved → vs → typeChart → entity → bannedItem). **This is the key extraction Phase 5 consumes.**
  - [lib/rag/boost.ts](../lib/rag/boost.ts) — 266 LOC: `BoostCandidate` interface + `applyBoosts(candidates, intent, route, question, boostMul): BoostCandidate[]` — all 14 scoring categories.
- **Thin [lib/rag.ts](../lib/rag.ts) orchestrator (288 LOC):** staleness check, `Result` interface, `ProgressStage`/`ProgressCallback`/`QueryOptions`, and the `query()` function that wires embed → classify/route → RPC → rerank dispatch → structured filter → `collectForceIncludes` → augment rrf_score → dedup → parse → `applyBoosts` → sort + topK. Re-exports `classifyQuery`, `routeQuery`, `QueryIntent`, `QueryRoute` for back-compat.
- **Import updates:** [lib/query-planner.ts](../lib/query-planner.ts) now imports `QueryIntent` from `./rag/classify.js` and `QueryRoute` from `./rag/route.js`. [lib/query-executor.ts](../lib/query-executor.ts) still imports `Result, ProgressCallback` from `./rag.js` — no change (both still exported from orchestrator).
- **Observable behavior drop:** `rulesCount` field removed from `rerank_end` progress-callback payload (no consumers in tree). Everything else preserved.
- **Sanity checks passed:** `tsc --noEmit` exits 0. `npx tsx scripts/search.ts "Protect PP in Champions" 3` returns move:protect rank 1, champions_rules.md rank 2, damage_calc.md rank 3 — expected top-3 ordering.
- **Gate pending:** full 100-case retrieval eval in progress (background; ~17 min remaining at 12s/case pace). Pass criterion: per-intent nDCG within ±0.001 of `retrieval-post-stage6.3-clean.json` (0.851 overall). Snapshot will land at `memory-bank/eval-baselines/retrieval-2026-04-22T<ts>.json`.
- **Uncommitted on disk:** all new files under `lib/rag/` + edits to `lib/rag.ts`, `lib/query-planner.ts`, this activeContext + progress.md + master-plan doc updates.

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

Clean after Phase 4 commit. Phase 3 dormant code shipped earlier as `cf845dd`; Phase 4 refactor ships as the next commit (see log). Default behavior (`RERANKER` unset) remains RRF + boosts only — Phase 4 does not touch rerank paths.

## Immediately queued

1. **Phase 5 — executor redesign** (1 session): NEXT. Closes the aspirational Stage 6.3 nDCG gap AND structurally fixes the planner × reranker score-merge problem that blocked Phase 3. Redesign `executePlan()` in [lib/query-executor.ts](../lib/query-executor.ts): drop original query from parallel batch → sub-query merge → re-apply `collectForceIncludes(originalQuery, intent, route, supabase)` and `applyBoosts(pool, originalIntent, originalRoute, originalQuery, boostMul)` post-merge. Expected nDCG 0.86-0.88.
2. **Phase 3 retry — cross-encoder re-eval** (½ session, post-Phase 5): flip `RERANKER=crossencoder`, re-run 100-case retrieval eval + 3-run agentic variance. Expected nDCG 0.87-0.90 once planner conflict is resolved.
3. **Phase 6 — Gemma behavior flakes:** check if `team_json` flake resolved post-Phase 2 (forced-JSON should have fixed it); strengthen `tournament_retrieval` prompt directive.

Full tasks + gates + rollback triggers for each phase: [rag-master-plan.md](rag-master-plan.md) Part 4.

## Hard constraints

- **No paid APIs except OpenRouter Gemma 4 26B.** Jina is permanently OFF; don't propose top-ups. See [memory/project_no_paid_apis.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Golden set frozen this cycle** — don't edit `evals/golden-set.jsonl`.
- **Vercel Lambda 250MB bundle.** `onnxruntime-node` doesn't bundle; HF Inference API is the query-embedding path on prod. See [memory/project_vercel_embedding_constraint.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Rollback triggers:** any intent > 3% regression, agentic < 12/13 variance, Lambda > 240MB, Gemma rerank > $5/month.

## Key code pointers

- [lib/rag.ts](../lib/rag.ts) — thin `query()` orchestrator (288 LOC post-Phase-4). RERANKER dispatch still lives here; re-exports classify/route types.
- [lib/rag/classify.ts](../lib/rag/classify.ts) — dictionaries + `QueryIntent` + `classifyQuery()`.
- [lib/rag/route.ts](../lib/rag/route.ts) — `QueryRoute` + `ARCHETYPE_PATTERNS` + `PHANTOM_TO_EVOLVED` + `routeQuery()`.
- [lib/rag/structured-filter.ts](../lib/rag/structured-filter.ts) — `runStructuredFilter()`.
- [lib/rag/force-includes.ts](../lib/rag/force-includes.ts) — `collectForceIncludes()` returning `Map<id, ForcedChunk>`. Phase 5's consumption point.
- [lib/rag/boost.ts](../lib/rag/boost.ts) — `applyBoosts()` + `BoostCandidate` interface.
- [lib/query-planner.ts](../lib/query-planner.ts) / [lib/query-executor.ts](../lib/query-executor.ts) — Stage 6.3. Phase 5 redesigns the executor to re-apply force-includes/boosts post-merge against original query.
- [lib/rerank.ts](../lib/rerank.ts) — three reranker clients (Jina, Gemma pointwise, BGE cross-encoder via HF). All dormant by default; flip `RERANKER=crossencoder` post-Phase 5.
- [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5 (Stage 1.2).
- [src/app/api/team/route.ts:160](../src/app/api/team/route.ts) — agent loop, `Promise.all` (Stage 6.3).
- [evals/golden-set.jsonl](../evals/golden-set.jsonl) — 100-case graded-relevance set.
