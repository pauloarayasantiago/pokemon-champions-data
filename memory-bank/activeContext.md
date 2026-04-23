# Active Context

_Last updated: 2026-04-23 (Phase 5 SHIPPED — executor redesign landed, structural prerequisite for Phase 3 retry in place). Purpose: one-page "right now" snapshot. Forward plan lives in [rag-master-plan.md](rag-master-plan.md); stage-by-stage history in [progress.md](progress.md); bug log in [errors.md](errors.md)._

## TL;DR

- **Baseline retrieval (active):** nDCG@10 = **0.853** on 100-case golden set (no reranker — RRF + boosts only, planner ON, 2,329 chunks). Up from 0.851 pre-Phase-5. Per-intent: matchup 0.7552 (+0.0138), counter 0.6924 (+0.0009), adversarial 0.6853 (unchanged — Stage 4.6 invariant holds), all others unchanged. Snapshot: [retrieval-post-phase5-executor.json](eval-baselines/retrieval-post-phase5-executor.json).
- **Baseline agentic (post-Phase 5, v4.1 prompt):** 3-run variance with gemma-4-26b --real-rag: 13/13, 13/13, 12/13. Gate ≥12/13 met on all runs. Run-3 miss is `phantom_pokemon` (known Gemma hallucination-category quirk — no tools used, not retrieval-induced). Citation validity 100%/100%/80% on the 5 retrieval-tagged tests.
- **Phase 3 reranker:** dormant code shipped as `cf845dd` — default behavior unchanged (RERANKER unset → RRF + boosts only). Phase 5 fixes the planner × reranker score-merge problem structurally; Phase 3 retry will flip `RERANKER=crossencoder` and re-run gates, expecting 0.87-0.90 overall.
- **Phase 4 (shipped 2026-04-22):** `lib/rag.ts` 1108 → 288 LOC orchestrator + 5 focused modules under `lib/rag/`. Bit-for-bit identical retrieval eval. Commits `f220160`, `c328256`, `c303d55`.
- **Phase 5 (shipped 2026-04-23):** two-step ship. Step 1 `409ec84`: extract `rawCandidates()` helper, refactor single-query path (99/100 cases bit-identical; one-case drift on `char-y-teammates` is a pre-existing Supabase tie-break flake). Step 2 `1cd971d`: `executePlan` rewrite — sub-queries contribute RAW candidates, post-merge force-includes + boosts re-apply against original query. Stage 4.6 invariant preserved by construction.
- **Next move:** **Phase 3 retry** — flip `RERANKER=crossencoder`, re-run 100-case retrieval + 3-run agentic, verify cross-encoder now coexists with boost layer. Expected 0.87-0.90 overall. See [rag-master-plan.md](rag-master-plan.md) Part 4.

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

### Phase 5 — SHIPPED (2026-04-23) · snapshot: [retrieval-post-phase5-executor.json](eval-baselines/retrieval-post-phase5-executor.json)

- **Goal:** structural fix for the planner × reranker score-merge problem that blocked Phase 3. Pre-Phase-5 executor ran each sub-query through the full single-query pipeline (embed + RPC + rerank + force-includes + boosts) and max-merged results — each sub-query's force-include/boost/rerank pass keyed off its OWN text, drifting Stage 4.6 invariants. Phase 5 reverses that: sub-queries contribute raw candidates only, force-includes + boosts re-apply once post-merge against the ORIGINAL query.
- **Two-step ship** (mirrors Phase 4 pattern):
  - **Step 1** (`409ec84`): added private `rawCandidates(question, fetchK, onProgress?)` helper in [lib/rag.ts](../lib/rag.ts) — does embed + classify + route + RPC only, returns `{raw, intent, route}`. Single-query path refactored to call it (double-classify accepted for thin executor callback). 99/100 cases bit-identical to Phase 4 baseline. Sole drift: `char-y-teammates` case 21 (pre-existing Supabase tie-break flake documented during Phase 4, oscillates 0.9196↔1.0).
  - **Step 2** (`1cd971d`): rewrote `executePlan` in [lib/query-executor.ts](../lib/query-executor.ts). New signature: `executePlan(plan, topK, originalIntent, originalRoute, supabase, rawFn, onProgress?, boostMul=1)`. Drops `plan.originalQuery` from the parallel batch. `perStep` floor raised to 160 on theory/counter/matchup routes. Post-merge: `collectForceIncludes(plan.originalQuery, originalIntent, originalRoute, supabase)` + optional structured filter branch + parse → `applyBoosts(...)` against originalQuery → sort → slice. `boostMul` parameterized for Phase 3 retry.
- **Retrieval gate vs Phase 4 baseline** (`retrieval-post-phase5-executor.json` vs `retrieval-phase4-refactor.json`):
  - Overall nDCG 0.8514 → 0.8529 (+0.0015)
  - matchup 0.7414 → 0.7552 (+0.0138 — structural improvement target)
  - counter 0.6915 → 0.6924 (+0.0009)
  - adversarial 0.6853 unchanged (Stage 4.6 invariant check ✓)
  - team/item/move/stat/usage: unchanged
  - hard difficulty 0.7656 → 0.7716 (+0.0060)
  - Forbidden rate 0 (strict gate ✓)
  - No intent regressed. No rollback trigger fired.
- **Gates hit vs missed:** adversarial ≥0.68 ✓, agentic ≥12/13 on each run ✓, no intent >3% regression ✓. Aspirational gates matchup ≥0.79 (miss by 0.035) and counter ≥0.73 (miss by 0.038) were optimistic — the master plan trajectory expected those numbers from the reranker re-enabled on top of the Phase 5 executor (Phase 3 retry, target 0.87-0.90). Phase 5 is the prerequisite that makes Phase 3 retry possible without the per-sub-query interference.
- **Agentic 3-run variance** (gemma-4-26b --real-rag): 13/13, 13/13, 12/13. Run-3 failure is `phantom_pokemon` (hallucination category — no tools used, pre-existing Gemma flake documented in `memory/project_gemma_agentic_quirks.md`). All 5/5 retrieval-category tests passed their content check in every run. Citation validity 100%/100%/80% (run-3 had 1 retrieval test with 3/37 invalid chunk_ids after retry — Gemma-side hallucination, not retrieval-induced).
- **Behavior change documented:** when `RERANKER` is set to non-default on a planner-decomposed path, sub-query-level reranking is silently skipped (`rawCandidates` doesn't call the reranker). Passthrough queries still rerank. Nobody is on non-default RERANKER paths today; Phase 3 retry will re-add a post-merge reranker at the executor level.

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

Clean after Phase 5 commits. Default behavior (`RERANKER` unset) remains RRF + boosts only — Phase 5 did not touch rerank paths. The executor now calls `collectForceIncludes(originalQuery, ...)` and `applyBoosts(..., originalQuery, ...)` post-merge, preserving Stage 4.6 invariants under planner decomposition.

## Immediately queued

1. **Phase 3 retry — cross-encoder re-eval** (½ session): NEXT. Flip `RERANKER=crossencoder` (or wire a post-merge reranker step in [lib/query-executor.ts](../lib/query-executor.ts) before `applyBoosts`), re-run 100-case retrieval eval + 3-run agentic variance. Expected nDCG 0.87-0.90 now that sub-queries don't fight the boost layer. Needs design choice: simple RERANKER env flip reuses the passthrough reranker (only on passthrough queries, still useful) vs threading a reranker through `executePlan` to rerank the merged pool against originalQuery (the full structural win). Recommend the latter — it's the Phase 3 retry the master plan pointed at.
2. **Phase 6 — Gemma behavior flakes:** Phase 5 run-3 showed `phantom_pokemon` still flakes and one retrieval test had invalid chunk_ids after retry. Revisit the prompt tightening for the `phantom_pokemon` adversarial case and dig into the chunk_id hallucination on retrieval tests.
3. **Phase 7 — subagents + progressive disclosure:** CLAUDE.md split into `team-build` / `team-evaluate` / `team-counter` subagents with restricted tool allowlists. Independent of Phase 3 retry.
4. **Phase 8-9 — housekeeping splits:** `scripts/eval-models.ts` (1341 LOC) and `lib/chunker.ts` (794 LOC). Can slot anywhere.

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
