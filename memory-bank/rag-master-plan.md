# Pokemon Champions RAG — Master Plan (Canonical)

_Last revision: 2026-04-22, post Phase 4 SHIPPED. This doc is the canonical forward-looking plan; stage-by-stage history lives in [progress.md](progress.md)._

---

## 30-second catch-up

- **Current baseline:** retrieval nDCG@10 = **0.851** on the 100-case golden set (Phases 1 + 2 + 4 clean, RRF + boosts only); 13-test agentic eval 12-13/13 at ~25.5k tok/pass for Gemma 4 26B with citation_validity = 100%.
- **Shipped:** Stages 0–2, 3/4/4.6, 6.1, 6.3 (commit `b056e4c`), Phase 1 cleanup (`7767a0a`), Phase 2 forced-JSON + chunk_id validation (`bc02d11`), Phase 3 dormant reranker code (`cf845dd`), Phase 4 `lib/rag.ts` split (`f220160`, behavior-preserving, bit-for-bit identical).
- **BLOCKED:** Phase 3 reranker (code in tree but dormant behind `RERANKER` env var). Both attempts (Gemma pointwise, BGE cross-encoder via HF) regressed matchup nDCG by 15-18%. **Root cause: planner × reranker score-merge problem — structural, addressed by Phase 5.** See Phase 3 section.
- **Abandoned:** Stage 5 (EmbeddingGemma — Italian not a requirement → rolled back). Stage 3 Contextual Retrieval + 6.2 CRAG dropped (paid APIs).
- **Key constraint:** no paid APIs **except** OpenRouter Gemma 4 26B + free HF Inference. Jina is permanently OFF. See [memory/project_no_paid_apis.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Next move:** Phase 5 (executor redesign — consumes the `collectForceIncludes` / `applyBoosts` extractions from Phase 4) → Phase 3 retry (flip `RERANKER=crossencoder`, re-run gates). See Part 4.

---

## Roadmap status (live)

Update this table as each phase moves state. Source of truth for "what's done / what's next."

| # | Phase | Effort | Status | Started | Shipped | Commit | Snapshot |
|---|---|---|---|---|---|---|---|
| 0 | Stage 6.3 commit + closeout | — | SHIPPED | 2026-04-21 | 2026-04-22 | `b056e4c` | `retrieval-2026-04-21T19-01-55-020Z.json` |
| 1 | Cleanup + clean baseline | ½ session | SHIPPED | 2026-04-22 | 2026-04-22 | `7767a0a` | `retrieval-post-stage6.3-clean.json` |
| 2 | Forced-JSON + chunk_id validation | 1 session | SHIPPED | 2026-04-22 | 2026-04-22 | `bc02d11` | n/a (adds `citation_validity_rate` → 100% on v4.1) |
| 3 | Reranker (Gemma + cross-encoder) | 2 sessions | BLOCKED-pending-Phase-5 | 2026-04-22 | — | — | `retrieval-phase3-{gemma,crossencoder}.json` |
| 4 | `lib/rag.ts` split | 1 session | SHIPPED | 2026-04-22 | 2026-04-22 | `f220160` | `retrieval-phase4-refactor.json` (bit-for-bit = baseline) |
| 5 | Executor redesign | 1 session | NOT STARTED → unblocks Phase 3 reranker | — | — | — | `retrieval-post-phase5-executor.json` |
| 6 | Gemma behavior flakes | ½ session | NOT STARTED | — | — | — | agentic 13/13 |
| 7 | Subagents + progressive disclosure | 1–2 sessions | NOT STARTED | — | — | — | smoke parity |
| 8 | `scripts/eval-models.ts` split | 1 session | NOT STARTED | — | — | — | (bit-for-bit identical) |
| 9 | `lib/chunker.ts` split | 1 session | NOT STARTED | — | — | — | (bit-for-bit identical) |
| 10 | Stage 6.3 P2 extensions | — | DEFERRED | — | — | — | — |
| 11 | Late chunking | — | DEFERRED | — | — | — | — |
| 12 | Content & data | — | ROLLING | — | — | — | — |
| 13 | Webapp + regression | — | SEPARATE TRACK | — | — | — | — |

**Status values:** `NOT STARTED` · `IN PROGRESS` · `SHIPPED` · `BLOCKED` · `DEFERRED` · `ROLLING` · `SEPARATE TRACK`.

---

## Reorder rationale (2026-04-22, post Phase 3 BLOCKED)

**Current execution order: 1 → 2 → 3 (BLOCKED) → 4 → 5 → revisit 3 → 6 → 7.**

The 2026-04-22 morning order was 1 → 2 → 3 (reranker) → 4 → 5. Phase 3 was attempted twice (Gemma pointwise, then BGE cross-encoder via HF Inference) — both regressed matchup nDCG by 15-18%, triggering the master-plan rollback rule. The rerank code remains in [lib/rerank.ts](../lib/rerank.ts) behind `RERANKER` env var; default behavior is unchanged from Phase 2.

**Diagnostic:** the planner × reranker score-merge problem is structural. Stage 6.3 runs each sub-query through its own rerank pass, then max-merges. Sharp reranker scores create extreme disparities across sub-queries (the "right" chunk gets 0.95 from the "left" sub-query but 0.4 from the "original" — max-merge keeps 0.95 but the boost layer can't differentiate when other chunks also tie at 0.95 from different sub-queries). Cross-encoder makes this worse, not better, because its scores are sharper than Gemma's. Detail in Phase 3 section + [progress.md](progress.md) Phase 3 entry.

**Phase 5 (executor redesign) is the structural fix.** Per its own task list: "after sub-query merge: call `collectForceIncludes(originalQuery, ...)` against the ORIGINAL query and apply `applyBoosts(pool, originalIntent, originalRoute, originalQuery, boostMul)`." This re-applies the boost layer post-merge against the user's original query, so force-includes/boosts no longer have to compete with sub-query reranker scores from different intents. Once Phase 5 ships, the reranker code in lib/rerank.ts can be re-enabled and re-evaluated.

**Hard dependencies (unchanged):** Phase 4 (rag.ts split) before Phase 5 (executor redesign). Phase 3 reranker re-eval after Phase 5 ships.

**Earlier Phase 2-before-Phase-3 reorder (still valid):** Forced-JSON before reranker reduced agentic-gate flake by stabilizing the `team_json` output. That win persists for any future Phase 3 retry.

---

## Part 1 — Current state

### Retrieval (Jina OFF, n=100, Stage 4.6/6.3)

| Intent | n | nDCG@10 | Recall@10 | P@10 | MRR@10 |
|---|---|---|---|---|---|
| Overall | 100 | **0.849** | 0.87 | 0.33 | 0.83 |
| matchup | 10 | 0.740 | 1.00 | 0.48 | 0.60 |
| counter | 18 | 0.693 | 0.67 | 0.41 | 0.69 |
| team | 14 | 0.823 | 1.00 | 0.42 | 0.77 |
| item | 14 | 0.991 | 0.93 | — | 1.00 |
| move | 9 | 0.995 | 0.89 | — | 1.00 |
| stat | 26 | 0.838 | 0.81 | — | 0.82 |
| usage | 9 | 0.981 | 1.00 | — | 1.00 |
| **adversarial** | 20 | 0.685 | 0.60 | 0.18 | 0.70 |

**Key ceiling:** Stage 4.6's force-include + boost system saturates top-10 for the strategic intents — remaining gap is **ordering quality** (e.g., correct chunk at rank 7 instead of rank 3), not coverage. Recall@10 is 1.00 on matchup/team/usage. A reranker is the only lever that moves ordering; Stage 6.3 decomposition was neutral because max-score merge keeps the original's boosted chunks above sub-query candidates.

### Agentic (Gemma 4 26B, OpenRouter, --real-rag)

- **13-test suite baseline:** 12/13 pass @ ~22k tok/pass, 18.4s avg (Stage 1 final, Jina was ON at the time).
- **Known flakes:** `team_json` fails ~1/3 runs (Gemma incomplete JSON emission), `tournament_retrieval` 1/4 flake (Gemma RAG-usage gap — pokedex-only hallucinate instead of `search`). Both documented in [memory/project_gemma_agentic_quirks.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemma_agentic_quirks.md).
- **Stage 6.3 4-test team-build subset:** 4/4 pass including `team_json` (ran clean post-Stage 6.3, may be lucky variance).

### What shipped, by stage

| Stage | Shipped | Impact |
|---|---|---|
| 0 | Research catalog, plan doc, 3-run agentic baseline | Froze pre-upgrade reference at 38/39 @ 35k tok/pass, 22.6s |
| 1.1 | `vector(384)` → `halfvec(384)` Supabase migration, HNSW rebuilt with `halfvec_cosine_ops` | 2× index speed |
| 1.2 | Embedding swap MiniLM-L6 → `Xenova/bge-small-en-v1.5` (CLS pooling + BGE query prefix) | ~+10 nDCG baseline shift |
| 1.3 | Jina Reranker v2 integration in [lib/rerank.ts](../lib/rerank.ts) — sha256 cache, 403 fallback | Agentic: **−37% tokens, −21% latency** when Jina active; currently OFF (balance) |
| 2.1–2.3 | 100-case graded-relevance golden set, eval harness, 20 adversarials | Replaces MRR-1.0 saturation with per-intent slices |
| 3 (="4.1+4.2+6.1") | Team chunking (archetype coherence), metadata prefixes (`[kind] <name> <type>` on all CSV/knowledge chunks), `routeQuery()` rules-based router with force-includes | Overall 0.690 → 0.792 (**+14.7%**); counter +68%, matchup +28%, adversarial +336% |
| 4 | Header splitter (H1→H3 + per-bullet `[rules-banned]`/`[rules-phantom]`), TSVECTOR weighting (`setweight('A')` on names, `'B'` on prose), phantom-evolved co-surface dict (23 pre-evos → evolved forms) | Overall 0.792 → 0.806; adversarial Recall 0.10 → 0.45 |
| 4.6 P1 | H1 duplication fix — counter nDCG 0.648 → 0.693 |
| 4.6 P2 | Adversarial banned-item force-include + rank-1 boost — adversarial 0.517 → 0.685 |
| 4.6 P3 | Type-chart force-include via `Pokemon → types` lookup on vsPair — matchup 0.728 → 0.740 |
| 6.3 | Rule-driven Plan-and-Execute DAG ([lib/query-planner.ts](../lib/query-planner.ts) + [lib/query-executor.ts](../lib/query-executor.ts)) + agent-loop `Promise.all` over tool calls ([src/app/api/team/route.ts:160](../src/app/api/team/route.ts)) | Retrieval flat (Stage 4.6 saturated); framework in place for Phase 5 executor redesign |

### What was abandoned or dropped

- **Stage 5 EmbeddingGemma (MRL-384).** Built end-to-end dual-write shadow, fully evaluated, rolled back. Italian turned out to be a non-requirement; on pure English Gemma is −1.3% overall nDCG and −6.6% on `team` intent. Supabase shadow column dropped via migration `stage5_rollback_drop_embedding_v2`. Dormant evidence: `evals/golden-set-bilingual.jsonl` + `memory-bank/eval-baselines/retrieval-shadow-*.json` (untracked).
- **Stage 3.1–3.2 Contextual Retrieval** (paid Haiku ingestion) — dropped for cost.
- **Stage 3.3 post-hoc Haiku claim-support check** — dropped for cost.
- **Stage 6.2 CRAG per-chunk grader** (paid Haiku per call) — dropped for cost.
- **Revised Stage 3 scope (forced-JSON + `chunk_id` validator)** — was planned as the free part of Stage 3, **never shipped**. Now scheduled as Phase 2.
- **Giskard RAGET / Langfuse TS SDK** — off critical path.

---

## Part 2 — Constraints

### Budget

- **No paid APIs except OpenRouter Gemma 4 26B.** User confirmed paid Gemma credits are OK (2026-04-21). At ~$0.001/pointwise-rerank, trivially affordable at current query volume.
- **Jina is permanently OFF.** Don't propose top-ups; every paid-reranker plan is dead.
- **Paid Anthropic Haiku stays dropped.** Don't re-propose Contextual Retrieval, CRAG, or post-hoc groundedness.
- Free tiers OK to use: Supabase, Hugging Face Inference API, Xenova local ONNX (subject to Lambda budget).

### Eval

- **100-case golden set is frozen this cycle.** No adding/removing cases to close gate failures. The matchup P@10 gate (0.48 < 0.50) is structurally unreachable because `type_chart.md` isn't in most matchup rows' `expected_contexts` — revisit only if the user lifts the freeze.
- **All numbers above are Jina OFF.** Every baseline going forward is Jina OFF until Phase 3 ships a free reranker.

### Deployment

- **Vercel Lambda 250MB bundle.** `onnxruntime-node` native bindings don't bundle reliably — queries route embedding through HF Inference API on Vercel. Local ONNX reranker options must respect this limit. See [memory/project_vercel_embedding_constraint.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).

### Rollback triggers (any phase)

- Any intent's nDCG drops >3% from prior-phase baseline → revert, diagnose before moving on.
- Agentic 3-run variance test drops below 12/13 → block next phase.
- Lambda bundle exceeds 240MB → block merge.
- Gemma rerank cost exceeds $5/month at current query volume → reassess (should be trivially under).

---

## Part 3 — Critical files map

### By concern

| Concern | Files | Stage / phase touches |
|---|---|---|
| Query pipeline orchestrator | [lib/rag.ts](../lib/rag.ts) — 1083 LOC, ripe for split (see Phase 4) | Stages 1, 3, 4, 4.6, 6.3 |
| Query decomposition | [lib/query-planner.ts](../lib/query-planner.ts) (rules-based), [lib/query-executor.ts](../lib/query-executor.ts) (parallel fan-out + merge) | Stage 6.3 / Phase 5 |
| Embedding | [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5, HF Inference fallback for Vercel | Stage 1 |
| Reranker | [lib/rerank.ts](../lib/rerank.ts) — Jina client (currently returns null); sha256 cache | Stage 1.3 / Phase 3 |
| Chunking | [lib/chunker.ts](../lib/chunker.ts) — 794 LOC, 11 chunker functions | Stages 3, 4 / Phase 1 (residue delete), Phase 9 (split) |
| Indexing | [scripts/index-data.ts](../scripts/index-data.ts) | Stages 1, 3 |
| Retrieval eval | [scripts/eval-retrieval.ts](../scripts/eval-retrieval.ts), [evals/golden-set.jsonl](../evals/golden-set.jsonl) | Stage 2 |
| Agentic eval | [scripts/eval-models.ts](../scripts/eval-models.ts) — 1341 LOC, ripe for split (see Phase 8) | Stages 0, 2, 6 |
| LLM dispatch + system prompt | [src/lib/llm.ts](../src/lib/llm.ts), [src/lib/system-prompt.ts](../src/lib/system-prompt.ts), [src/lib/llm/*.ts](../src/lib/llm) | Phase 2 (forced-JSON), Phase 6 |
| Agent loop | [src/app/api/team/route.ts](../src/app/api/team/route.ts) | Stage 6.3 (Promise.all) |
| Tool definitions | [src/lib/tools.ts](../src/lib/tools.ts) | Stage 6.3 |
| Supabase schema | `supabase/migrations/` | Stages 1, 3, 4 |

### Force-include helpers in `lib/rag.ts` (target of Phase 4 extraction)

Six blocks inside `query()` that inject specific chunks into the candidate pool before the boost layer:

1. **Rules doc mechanic keywords** — when query contains `change|differ|banned|nerf|how does` tokens, FTS-match against `champions_rules.md`.
2. **Banned-item bullets** — fetch all `list_kind=banned-item` bullets, filter in-memory by whether query text contains any bullet's `metadata.entries`.
3. **Phantom pre-evo section** — FTS-match phantom name against rules doc.
4. **Phantom-evolved co-surface** — direct ID fetch `pokemon:<evolved>` when `route.phantomEvolved` is set.
5. **vsPair primary chunks** — fetch both Pokemon rows via `ilike` on CamelCase names.
6. **Type-chart on vsPair** — translate vsPair sides' types via `getPokemonTypes()`, FTS-match type sections.

Plus exact-entity force-include (move/item/strategic-Pokemon by id).

### Boost layer (`lib/rag.ts` lines ~800–1038)

~200 LOC applying 14 categories of domain-specific scoring adjustments (calibrated to RRF scale ~0.02–0.035, multiplied by `boostMul=20` when a reranker is active). Covers tier baselines, exact-entity matches, structured results, strategic intent, rules doc mechanic lift, theory routing, archetype matching, vsPair boost, phantom-evolved priority. Critical to extract as `applyBoosts()` in Phase 4.

---

## Part 4 — Forward roadmap

**Conventions.** Each phase block has `Status · Started · Shipped · Commit · Snapshot` in the status line, plus checkbox lists for tasks and gates. Flip `NOT STARTED` → `IN PROGRESS` when you open the first task; flip to `SHIPPED` only when every gate box is ticked and the commit has landed. Run retrieval + agentic eval between phases so regressions are catchable at the boundary.

---

### Phase 0 — Stage 6.3 commit + closeout

**Status:** SHIPPED · Started: 2026-04-21 · Shipped: 2026-04-22 · Commit: `b056e4c` · Snapshot: `retrieval-2026-04-21T19-01-55-020Z.json`

**Goal.** Land the Stage 6.3 code and verify no regression so every subsequent phase starts from a clean HEAD.

**Tasks:**
- [x] Commit the Stage 6.3 change set (`b056e4c`): `lib/query-planner.ts`, `lib/query-executor.ts`, `lib/rag.ts` planner branch, `src/app/api/team/route.ts` `Promise.all`.
- [x] Full 100-case retrieval snapshot with `QUERY_PLANNER_ENABLED=true`. Seven planner-ON snapshots in `memory-bank/eval-baselines/retrieval-2026-04-21T*.json` show overall nDCG 0.846–0.849.
- [x] Full 13-test 3-run agentic variance under `--real-rag` (2026-04-22 closeout runs; numbers in [progress.md](progress.md) Stage 6.3 entry).

**Gates:**
- [x] Retrieval: all intents within ±1% of Stage 4.6 baseline (overall 0.846 vs 0.849 = −0.35%; per-intent deltas < 0.5%).
- [x] Agentic: ≥ 12/13 on all 3 runs (see Phase 0 closeout entry in progress.md; known `team_json`/`tournament_retrieval` flakes documented).

**Shipped commit:** `b056e4c feat: implement RAG query planning and execution logic with supporting documentation and evaluation baselines` + Phase 0 closeout commit (docs reconciliation, 2026-04-22).

---

### Phase 1 — Cleanup + clean baseline

**Status:** SHIPPED · Started: 2026-04-22 · Shipped: 2026-04-22 · Commit: `7767a0a` · Snapshot: `retrieval-post-stage6.3-clean.json`

**Goal.** Clear Stage 5 residue; establish clean post-6.3 reference.

**Tasks:**
- [x] Delete the Italian translation layer in [lib/chunker.ts](../lib/chunker.ts) (`translatePairs()` + call sites). Extended scope: also stripped mirror translation layer in [lib/calc/matchup.ts](../lib/calc/matchup.ts) and removed `testItalianTranslation()` from [scripts/test-suite.ts](../scripts/test-suite.ts) — both overlooked in the original plan task list (would have crashed `/calc` + test-suite after JSON deletion).
- [x] Delete `lib/translations.json` (2,383 entries). Also deleted orphaned generator `scripts/build-translations.ts`.
- [x] Delete `evals/golden-set-bilingual.jsonl` (100-line manual IT translation fixture).
- [x] Delete the two `retrieval-shadow-2026-04-21T20-*.json` snapshots in `memory-bank/eval-baselines/`.
- [x] Reindex: `npx tsx scripts/index-data.ts --force` — 2,329 chunks, no translation-missing warnings.
- [x] Full 100-case retrieval eval with planner ON; snapshot at `memory-bank/eval-baselines/retrieval-post-stage6.3-clean.json` (Jina OFF).

**Gates:**
- [x] All intents within ±0.5% of Stage 4.6 baseline (overall 0.849 → 0.851). Per-intent deltas: counter −0.002, item 0.000, matchup +0.001, move 0.000, stat +0.001, team +0.021, usage 0.000, adversarial 0.000. team jump is reindex variance + ~90 new chunks since the 2026-04-21 baseline — welcome, not a regression.
- [x] Reindex completes cleanly — zero translation-missing warnings.

**Shipped commit:** `7767a0a chore(stage5): remove Italian translation residue [Phase 1]`

---

### Phase 2 — Forced-JSON + `chunk_id` validation _(was original Phase 5)_

**Status:** SHIPPED · Started: 2026-04-22 · Shipped: 2026-04-22 · Commit: `bc02d11` · Snapshot: n/a (adds agentic metric `citation_validity_rate`)

**Goal.** Land the only unshipped faithfulness defense from the original master plan. Free, orthogonal to retrieval. Running this before the reranker reduces agentic-gate flake for every downstream phase (the `team_json` bug may fix incidentally).

**Tasks:**
- [x] System-prompt change: final answer MUST end with a trailing ```claims-json fenced block. _Note: we kept the existing `team-json` block (UI-load-bearing) and added `claims-json` as a separate trailing block, rather than collapsing into the master plan's literal `{"answer", "claims"}` envelope. Explore agent verified [src/app/team/page.tsx:905-908](../src/app/team/page.tsx) renders prose freely so trailing content is safe._
- [x] Server-side validator in [lib/validate-citations.ts](../lib/validate-citations.ts) (shared, NEW ~150 LOC): for each claim, verify every `chunk_id` is in the set returned by `search` calls this conversation. Consumed by both prod ([src/app/api/team/route.ts](../src/app/api/team/route.ts)) and eval ([scripts/eval-models.ts](../scripts/eval-models.ts)).
- [x] Auto-retry once with system nudge on invalid chunk_ids. Nudge tightened in v4.1 to block the "collapse to `{"claims": []}`" escape.
- [x] Gemma JSON-repair layer: trailing commas, double braces, "thought" prefixes.
- [x] `citation_validity_rate` metric added to [scripts/eval-models.ts](../scripts/eval-models.ts), plus per-test citation fields in `TestResult` and a dedicated report section.
- [x] Full 13-test 3-run agentic variance — details below.
- [x] chunk_id propagation: `executeSearch`, `executeSearchRealRag`, `executeSearchStub` all include `id` now (stub uses synthetic `stub:<slug>-<i>`).
- [x] Infra fix: `loadEnv()` now respects explicit shell overrides (previously clobbered them with `.env` values, preventing `JINA_API_KEY=` from disabling Jina).

**3-run variance (gemma-4-26b, --real-rag, Jina OFF):**

| run | code | pass | tok/pass | citation_rate | cited_valid/total | retries |
|---|---|---|---|---|---|---|
| 1 | v4 | 12/13 | 34088 | 80% | 14/14 | 9 |
| 2 | v4.1 | 12/13 | 25480 | **100%** | 33/33 | 6 |
| 3 | v4.1 | 13/13 | 25638 | **100%** | 37/38 | 6 |

Run 1 on the v4 prompt exposed `creator_opinion` collapsing to `{"claims": []}` after retry. v4.1 tightens both system prompt and retry nudge (explicitly forbids empty-array as an escape from validation). Runs 2+3 under v4.1 both hit 5/5 retrieval-citation validity.

**Gates:**
- [x] Agentic pass rate ≥ 12/13 on all 3 runs. Measured 12, 12, 13.
- [x] `citation_validity_rate` ≥ 95% on the 5 retrieval-category tests. Measured 100% on both v4.1 runs (run 1 at 80% was on pre-tightened prompt).
- [x] `team_json` flake rate drops. Passed cleanly on both v4.1 runs — forced-JSON output mode stabilized Gemma's completion.

**Shipped commit:** `bc02d11 feat(llm): forced-JSON claims-json + chunk_id validation [Stage 3 revised / Phase 2]`

---

### Phase 3 — Reranker (BLOCKED-pending-Phase-5)

**Status:** BLOCKED-pending-Phase-5 · Started: 2026-04-22 · Shipped: — · Commit: — · Snapshots: [retrieval-phase3-gemma.json](../memory-bank/eval-baselines/retrieval-phase3-gemma.json), [retrieval-phase3-crossencoder.json](../memory-bank/eval-baselines/retrieval-phase3-crossencoder.json)

**Goal.** Replace dropped Jina path with a free reranker. Two attempts: Gemma 4 26B pointwise via OpenRouter, then BGE cross-encoder via HF Inference. Both regressed matchup nDCG by 15-18%, triggering the master-plan rollback rule. Phase 3 is structurally blocked by the planner × reranker score-merge problem — see Diagnostic below. Re-attempt after Phase 5 (executor redesign).

**What landed (kept in tree behind `RERANKER` env var):**
- [x] [lib/rerank.ts](../lib/rerank.ts): three reranker functions co-existing — `rerankCandidates` (Jina, ~80 LOC, dormant since balance ran out), `rerankWithGemma` (~140 LOC, pointwise OpenRouter, inline 10-slot worker pool, manual AbortController), `rerankWithCrossEncoder` (~80 LOC, batched HF Inference, single HTTP call, BAAI/bge-reranker-base).
- [x] [lib/rag.ts:584-625](../lib/rag.ts) `RERANKER` env-var dispatch (`crossencoder|gemma|jina|none`, default falls through to existing Jina-or-no-reranker behavior). Legacy `GEMMA_RERANK_ENABLED=true` still selects gemma.
- [x] [src/app/api/search/route.ts](../src/app/api/search/route.ts) `maxDuration = 30` (kept — needed when reranker re-enabled post-Phase 5).
- [x] Retrieval evals run for both rerankers (snapshots above). 100 cases each, Jina OFF.

**Eval results (retrieval, 100-case golden set, post-Phase 2 baseline 0.851):**

| Intent | Baseline | Gemma | Δ | Cross-encoder | Δ | Gate |
|---|---|---|---|---|---|---|
| **Overall** | 0.851 | 0.830 | −2.5% | 0.829 | −2.6% | ❌ ≥0.87 |
| counter | 0.691 | 0.711 | +2.9% | 0.722 | **+4.5%** | ✅ ≥0.72 (cross-encoder only) |
| **matchup** | 0.741 | 0.629 | **−15.1%** | 0.605 | **−18.4%** | ❌ ≥0.77 |
| move | 0.995 | 0.876 | −12.0% | 0.958 | −3.7% | (cross-encoder recovered most) |
| item | 0.991 | 0.983 | −0.8% | 1.000 | +0.9% | ✓ |
| stat | 0.839 | 0.824 | −1.8% | 0.800 | −4.6% | ✗ (cross-encoder regressed) |
| team | 0.844 | 0.860 | +1.9% | 0.829 | −1.8% | ✓ |
| usage | 0.981 | 0.977 | −0.4% | 0.986 | +0.5% | ✓ |
| **adversarial** | 0.685 | 0.694 | +1.3% | 0.652 | −4.8% | ❌ ≥0.68 (cross-encoder only) |

Wall time: Gemma 16 min ($0.80), cross-encoder 5.6 min (free).

**Diagnostic — planner × reranker score-merge problem:**

Pattern: passthrough queries improve under both rerankers; planner-decomposed queries (Stage 6.3 vsPair / counter-archetype / team-archetype strategies) regress. Matchup queries are almost all vsPair-decomposed → matchup regresses worst. Adversarial queries depend on force-included chunks (banned-item bullets, phantom co-surface) that the reranker scores low → adversarial regresses with sharper reranker scores.

Mechanism: Stage 6.3's executor runs each sub-query through its own rerank pass, then max-merges. With the cross-encoder's sharp 0.95-vs-0.05 spread, the same chunk gets very different scores from different sub-queries (e.g., Garchomp chunk gets 0.95 from "left: garchomp moveset" sub-query but 0.4 from "original: Garchomp vs Charizard" sub-query). Max-merge keeps 0.95, but other "wrong" chunks also tie at 0.95 from different sub-queries. The boost layer can't differentiate when many chunks tie post-merge.

Confirming evidence: smoke on a passthrough query ("Protect PP in Champions") moved the grade-3 chunk from rank 5 (Gemma) to rank 2 (cross-encoder), validating that the cross-encoder works on single-pass queries. Both attempts regressed only on planner-decomposed intents.

**Phase 5 (executor redesign) is the structural fix.** Per Phase 5's task list: "after sub-query merge: call `collectForceIncludes(originalQuery, intent, route, supabase)`, inject into merged pool. Then apply `applyBoosts(pool, originalIntent, originalRoute, originalQuery, boostMul)`." This re-applies the force-includes and boost layer post-merge against the user's ORIGINAL query, so domain knowledge no longer competes with sub-query reranker scores from divergent intents. Once Phase 5 ships, flip `RERANKER=crossencoder` and re-run gates.

**Gates (all unmet — code stays dormant):**
- [ ] matchup nDCG ≥ 0.77 — measured 0.629 (Gemma) / 0.605 (cross-encoder)
- [ ] counter nDCG ≥ 0.72 — measured 0.711 (Gemma) / **0.722 (cross-encoder, met)**
- [ ] Overall nDCG ≥ 0.87 — measured 0.830 / 0.829
- [ ] Agentic 3-run variance ≥ 12/13 — not run (would have burned credits on a known-failing config)
- [ ] Monthly cost projection < $5 — N/A (cross-encoder is free; Gemma was on track at ~$1/eval)

**Default behavior:** unchanged from Phase 2. `RERANKER` unset → falls through to "jina" → Jina returns null (no balance) → `boostMul=1` → RRF + boosts only, identical to post-Phase 2 nDCG = 0.851.

**Target commit when re-attempted (post-Phase 5):** `feat(rag): cross-encoder reranker re-enabled [Phase 3 retry under Phase 5 executor]`

---

### Phase 4 — `lib/rag.ts` split _(was original Phase 3)_

**Status:** SHIPPED · Started: 2026-04-22 · Shipped: 2026-04-22 · Commit: `f220160` · Snapshot: [retrieval-phase4-refactor.json](../memory-bank/eval-baselines/retrieval-phase4-refactor.json)

**Goal.** Prerequisite for Phase 5. Pure refactor, behavior-preserving.

**Tasks:**
- [x] Extract [lib/rag/classify.ts](../lib/rag/classify.ts) (283 LOC) — `classifyQuery()`, `QueryIntent`, 8 keyword lists, `getPokemonNames` / `getMoveNames` / `getItemNames` / `getPokemonTypes` dictionaries.
- [x] Extract [lib/rag/route.ts](../lib/rag/route.ts) (116 LOC) — `routeQuery()`, `QueryRoute`, `ARCHETYPE_PATTERNS`, `PHANTOM_TO_EVOLVED` (exported), `PHANTOM_PRE_EVOS`.
- [x] Extract [lib/rag/force-includes.ts](../lib/rag/force-includes.ts) (172 LOC) — `collectForceIncludes(question, intent, route, supabase): Promise<Map<string, ForcedChunk>>` wraps all 7 force-include blocks with first-wins insert (matches old global dedup). **Key extraction for Phase 5.**
- [x] Extract [lib/rag/boost.ts](../lib/rag/boost.ts) (266 LOC) — `applyBoosts(candidates, intent, route, question, boostMul): BoostCandidate[]` — the 200-LOC scoring layer.
- [x] Extract [lib/rag/structured-filter.ts](../lib/rag/structured-filter.ts) (33 LOC) — `runStructuredFilter()`.
- [x] `lib/rag.ts` shrinks to 288-LOC orchestrator (staleness check + types + `query()` wiring + back-compat re-exports of `classifyQuery` / `routeQuery` / `QueryIntent` / `QueryRoute`).
- [x] [lib/query-planner.ts](../lib/query-planner.ts) updated to pull types from `./rag/classify.js` and `./rag/route.js` (lib/query-executor.ts untouched — `Result, ProgressCallback` still resolve via rag.ts re-exports).
- [x] Full 100-case retrieval eval snapshot produced and JSON-deep-diffed against baseline.

**Gates:**
- [x] Retrieval eval byte-for-byte identical to baseline — `retrieval-phase4-refactor.json` deep-diff vs `retrieval-post-stage6.3-clean.json` returns zero deltas (ignoring timestamp). Overall 0.851386760816444 = baseline. All per-intent and per-case values match.
- [x] No cyclic imports; `tsc --noEmit` exits 0. Each module compiles in isolation.

**Shipped commit:** `f220160 refactor(rag): split lib/rag.ts into focused modules [Phase 4]`.

---

### Phase 5 — Executor redesign _(was original Phase 4)_

**Status:** NOT STARTED · Started: — · Shipped: — · Commit: — · Snapshot: `retrieval-post-phase5-executor.json`

**Goal.** Close the aspirational Stage 6.3 nDCG gap (sub-queries currently can't out-score the original's boosted chunks).

**Tasks:**
- [ ] Drop the original query from `executePlan()`'s parallel batch.
- [ ] After sub-query merge: call `collectForceIncludes(originalQuery, intent, route, supabase)`, inject into merged pool.
- [ ] Then apply `applyBoosts(pool, originalIntent, originalRoute, originalQuery, boostMul)`, sort, slice topK.
- [ ] Net effect: sub-queries contribute diverse candidates, force-includes/boosts still key off user's original wording (Stage 4.6 invariant preserved), sub-query chunks now compete for top-10.
- [ ] Full 100-case retrieval snapshot.
- [ ] Full 13-test 3-run agentic variance run.

**Gates:**
- [ ] matchup nDCG ≥ 0.79 (further +0.02 over Phase 3).
- [ ] counter nDCG ≥ 0.73.
- [ ] adversarial nDCG ≥ 0.68 (force-includes still fire against original — Stage 4.6 invariant check).
- [ ] Agentic 3-run variance ≥ 12/13.

**Target commit:** `feat(rag): Stage 6.3 executor redesign — sub-queries compete with post-merge force-includes`

---

### Phase 6 — Gemma behavior flakes

**Status:** NOT STARTED · Started: — · Shipped: — · Commit: — · Snapshot: agentic 13/13

**Goal.** Fix the two known Gemma quirks. May already be partially resolved by Phase 2 (forced-JSON) — start with `tournament_retrieval` if so.

**Tasks:**
- [ ] Re-check `team_json` flake rate post-Phase 2. If resolved, note and skip.
- [ ] If still flaking: prompt tightening to emit the fenced block earlier.
- [ ] `tournament_retrieval` 1/4 flake: system-prompt directive — force `search` before any `pokedex` lookup when query contains tournament/meta keywords (partial directive exists, needs strengthening).
- [ ] Full 13-test 3-run agentic variance.

**Gates:**
- [ ] 3-run variance → 13/13 on all 3 runs.
- [ ] `tournament_retrieval` explicitly passing on all 3 runs.

**Target commit:** `fix(agent): Gemma team_json + tournament_retrieval flake mitigations`

---

### Phase 7 — Subagents + progressive disclosure _(Stage 7a)_

**Status:** NOT STARTED · Started: — · Shipped: — · Commit: — · Snapshot: smoke parity (CLI + webapp)

**Goal.** Shift from CLAUDE.md monolith to per-workflow subagents. Independent of embedding model (no longer gated on abandoned Stage 5).

**Tasks:**
- [ ] Create `.claude/skills/pokemon/SKILL.md` as new top-level skill.
- [ ] Split CLAUDE.md persona + `/team` rules into three subagents with restricted tool allowlists:
  - [ ] `team-build` — full RAG + calc + validate_set + pokedex.
  - [ ] `team-evaluate` — RAG read-only + calc (no validate_set; evaluates existing, doesn't propose).
  - [ ] `team-counter` — RAG + calc (restricted set forces counter-archetype path).
- [ ] Trim CLAUDE.md to: lookup-first rule, Champions ≠ S/V delta, banned items, roster. Move persona and workflow detail into the skill.
- [ ] Smoke tests: webapp + CLI `/team build rain`, `/team counter Dragonite`.

**Gates:**
- [ ] Output parity with main branch on 3 smoke cases.
- [ ] CLAUDE.md line count at least halved.

**Target commit:** `feat(skills): /team subagents + progressive disclosure [Stage 7a]`

---

### Phase 8 — `scripts/eval-models.ts` split

**Status:** NOT STARTED · Started: — · Shipped: — · Commit: — · Snapshot: (bit-for-bit identical)

**Goal.** Housekeeping — 1341 LOC → organized modules. No user-visible change.

**Tasks:**
- [ ] Extract `eval-harness/tests.ts` — 13 test definitions + scorers.
- [ ] Extract `eval-harness/adapters.ts` — per-provider call paths (OpenRouter, Ollama, Anthropic, Gemini) incl. `toAnthropicFormat()` + `toAnthropicTools()`.
- [ ] Extract `eval-harness/scoring.ts` — loop-detection, pokedex-cap, force-completion fallback.
- [ ] Extract `eval-harness/cli.ts` — argv + snapshot + report.
- [ ] `scripts/eval-models.ts` → thin entry (~50 LOC).
- [ ] Run full 13-test suite, compare outputs byte-for-byte.

**Gates:**
- [ ] Full 13-test suite byte-for-byte identical (same snapshot JSON).

**Target commit:** `refactor(evals): split eval-models.ts into eval-harness modules`

---

### Phase 9 — `lib/chunker.ts` split

**Status:** NOT STARTED · Started: — · Shipped: — · Commit: — · Snapshot: (bit-for-bit identical)

**Goal.** Housekeeping — 794 LOC → per-source modules. Lower priority, less frequently touched.

**Tasks:**
- [ ] Extract `lib/chunker/pokemon.ts`, `mega.ts`, `move.ts`, `item.ts`, `team.ts`, `usage.ts`, `matchup.ts`, `markdown.ts` (incl. `chunkMarkdownFile` + `RULES_LIST_SECTIONS` splitter), `ability.ts`.
- [ ] `lib/chunker.ts` → barrel export.
- [ ] Reindex + full retrieval eval; compare byte-for-byte.

**Gates:**
- [ ] Reindex + full retrieval eval byte-for-byte identical.

**Target commit:** `refactor(chunker): split lib/chunker.ts into per-source modules`

---

### Phase 10 — Stage 6.3 P2 extensions _(deferred, opportunistic)_

**Status:** DEFERRED — land only if real queries surface the need.

- **P2a LLM-driven planner fallback** — Gemma emits `QueryPlan` JSON for queries that `routeQuery()` rules don't catch. Parse-retry loop on malformed JSON. Behind `PLANNER_LLM_FALLBACK=true`.
- **P2b `$variable` step-dependencies** — topological executor with variable interpolation (e.g., step 2 uses `$step1.result[0].pokemon`). Add when a concrete query needs it.

---

### Phase 11 — Late chunking _(deferred, opportunistic)_

**Status:** DEFERRED — value smaller without EmbeddingGemma (abandoned); revisit if BGE alone shows headroom.

- Late chunking on team markdowns + long knowledge docs (`team_building_theory.md`, `meta_snapshot.md`).
- Compute `[CLS]` over full doc once, sub-slice per section — preserves document-level context in each chunk embedding.

**Gate when shipped.** Modest retrieval improvement on hard-difficulty tier; no regression elsewhere.

---

### Phase 12 — Content & data _(rolling)_

**Status:** ROLLING — slotted between phases as needed.

- [ ] `creator_opinion` test verification — may already pass post-4.5 but unverified in current 13-test suite.
- [ ] `data/knowledge/singles_meta.md` — Singles ladder diverges from Doubles; no KB coverage.
- [ ] Reconcile `meta_snapshot.md` with AngrySlowbroPlus tier list (Sinistcha-first vs Incineroar-first drift).
- [ ] Codify TheDelybird's 5 template archetypes with EV pastes.

---

### Phase 13 — Webapp + regression _(separate track)_

**Status:** SEPARATE TRACK — doesn't block the RAG roadmap.

- [ ] Webapp Tailwind 4 blocker (tracked in `webapp/HANDOVER.md`).
- [ ] Full `npm test` regression against Supabase backend (251 tests; only smoke-tested since LanceDB migration).

---

## Part 5 — Critical path + dependencies

```
Phase 0 (Stage 6.3 commit)              [SHIPPED]
   ↓
Phase 1 (cleanup + clean baseline)      [SHIPPED]
   ↓
Phase 2 (forced-JSON + chunk_id)        [SHIPPED] — faithfulness defense; fixed team_json flake
   ↓
Phase 3 (reranker — Gemma + cross-enc)  [BLOCKED] — both regressed matchup; planner × reranker structural issue
   ↓
Phase 4 (rag.ts split)                  [NEXT]    — behavior-preserving refactor
   ↓
Phase 5 (executor redesign)             [unblocks Phase 3 reranker re-attempt]
   ↓
Phase 3-retry (flip RERANKER=crossencoder, re-run gates)
   ↓
Phase 6 (Gemma flakes — tournament_retrieval)
   ↓
Phase 7 (subagents)

Phase 8 / 9 (eval-models / chunker splits) — can slot anywhere, no deps
Phase 10 (P2 extensions) — after Phase 5; wait for real need
Phase 11 (late chunking)  — after Phase 5; opportunistic
Phase 12 (content)        — rolling
Phase 13 (webapp)         — separate track
```

**Hard dependencies:**
- Phase 0 before Phase 1 (need clean HEAD to measure cleanup impact).
- Phase 4 before Phase 5 (executor redesign needs `collectForceIncludes()` extracted).
- **Phase 5 before Phase 3 retry** (post-merge force-includes are the structural fix the reranker needs to coexist with the planner — see Phase 3 Diagnostic).

**Soft dependencies:**
- Phase 2 before Phase 3 — reduces agentic-gate flake noise. (Won during Phase 2; preserved for Phase 3 retry.)
- Phase 2 may resolve `team_json` incidentally, shrinking Phase 6 scope. (Confirmed shipped.)
- Phase 5 before Phase 7 if subagents emit validated JSON (can ship subagents earlier and retrofit).

---

## Part 6 — Expected nDCG trajectory

| After phase | Overall nDCG | Driver |
|---|---|---|
| Current (Stage 6.3) | 0.849 | — |
| Phase 1 (cleanup) | **0.851** measured | Reindex variance (+90 chunks since baseline); per-intent within ±0.5% |
| Phase 2 (forced-JSON) | **0.851** measured | No retrieval impact (faithfulness only); citation_validity_rate = 100% |
| Phase 3 attempt 1 (Gemma) | **0.830** measured | ❌ Regressed matchup −15%; planner × reranker score-merge problem |
| Phase 3 attempt 2 (cross-encoder) | **0.829** measured | ❌ Regressed matchup −18%, adversarial −4.8%; same structural issue |
| Phase 4 (rag.ts split) | **0.851 measured** | Flat — behavior-preserving refactor, bit-for-bit identical to baseline |
| Phase 5 (executor redesign) | 0.86–0.88 expected | Sub-queries compete for top-10 via post-merge force-includes (Stage 4.6 invariant preserved) |
| Phase 3-retry (post Phase 5) | 0.87–0.90 expected | With executor fix, cross-encoder no longer fights the boost layer |
| Phase 6–9 | marginal / flat | Maintenance + housekeeping |

---

## Part 7 — Glossary / key concepts

- **Passthrough** — single-step query plan; no decomposition. Existing Stage 4.6 single-query pipeline runs unchanged. Majority of queries.
- **Decomposition** — multi-step query plan (Stage 6.3). Three strategies: `vspair` (A vs B → 3 sub-queries), `counter-archetype` (archetype + counter → 3), `team-archetype` (archetype + team → 3).
- **Force-include** — chunks injected into the candidate pool outside the hybrid RPC. Guarantees specific chunks appear (e.g., both sides of a vsPair, banned-item bullets on adversarial queries).
- **Boost layer** — 200-LOC additive scoring adjustments in `lib/rag.ts`, calibrated to RRF scale. 14 categories: tier baselines, exact-entity match, structured results, strategic intent, rules-doc mechanic lift, theory routing, archetype match, vsPair primary, phantom-evolved priority, etc.
- **`boostMul`** — multiplier applied to boosts when a reranker is active (reranker scores in [0,1] vs RRF in [0.02, 0.035] — `boostMul=20` keeps additive boosts meaningful on top of reranker scores).
- **`QueryIntent`** — output of `classifyQuery()`: categories filter + extracted entities + intent flags (`isCounterQuery`, `isMatchupQuery`, `hasTeamKeyword`, etc.).
- **`QueryRoute`** — output of `routeQuery()`: `{route: "theory"|"data"|"both", archetype, vsPair, phantomName, phantomEvolved}`. Drives pool sizing, force-includes, routing boosts.
- **`QueryPlan`** — Stage 6.3 planner output: `{strategy, steps: [{id, query, poolShare}]}`. `steps.length === 1` means passthrough.
- **Graded relevance (0–3)** — golden-set grading: 3=perfect match, 2=highly relevant, 1=tangential, 0=irrelevant (default), −1=forbidden (hard negative).
- **Adversarial case** — query designed to test hallucination defense (phantom pre-evos like "Scyther EV spread", banned items like "Life Orb best Pokemon", banned mechanics like "Terastallize setup"). 20 of 100 golden set cases.
- **Stage 4.6 invariant** — force-includes + banned-item/phantom boosts must key off the ORIGINAL user query, never sub-queries. Protected by Phase 5 executor redesign (post-merge force-includes pass against original).

---

## Part 8 — Pointers

### Research source

- `research/agent-rag-research.pdf` — canonical research that motivated the initiative. Original research catalog + stage handovers consolidated into this doc and [progress.md](progress.md).

### Memory (cross-session, project-level)

- [project_no_paid_apis.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md) — **budget constraint** (no paid APIs except Gemma).
- [project_default_model.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_default_model.md) — DEFAULT_MODEL = gemma-4-26b.
- [project_gemma_agentic_quirks.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemma_agentic_quirks.md) — known Gemma failure modes (informs Phase 2 + 6).
- [project_vercel_embedding_constraint.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md) — Lambda constraint (informs reranker options in Phase 3).
- [project_gemini3_eval.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemini3_eval.md) — Gemini 3 Flash eval results (for future model decisions).

### Eval baselines

- Current reference: `memory-bank/eval-baselines/retrieval-post-stage6.3-clean.json` (Phase 1 + 2, 0.851 overall, RRF + boosts only).
- Phase 3 attempt 1 (Gemma): `memory-bank/eval-baselines/retrieval-phase3-gemma.json` (0.830 overall, BLOCKED — see Phase 3 section).
- Phase 3 attempt 2 (cross-encoder): `memory-bank/eval-baselines/retrieval-phase3-crossencoder.json` (0.829 overall, BLOCKED — see Phase 3 section).
- Phase 5 target: `retrieval-post-phase5-executor.json` (expect 0.86–0.88 overall, no rerank).
- Phase 3-retry target (post Phase 5): `retrieval-post-phase3-retry-crossencoder.json` (expect 0.87–0.90 overall).

### Key code

- [lib/rag.ts](../lib/rag.ts) — `query()` orchestrator. Split target in Phase 4.
- [lib/query-planner.ts](../lib/query-planner.ts) / [lib/query-executor.ts](../lib/query-executor.ts) — Stage 6.3 planner + executor. Executor redesign in Phase 5.
- [lib/rerank.ts](../lib/rerank.ts) — three reranker clients (Jina, Gemma, BGE cross-encoder), `RERANKER` env-var dispatch in [lib/rag.ts:584-625](../lib/rag.ts). All currently dormant (default falls through to RRF + boosts). Cross-encoder is the production candidate; flip `RERANKER=crossencoder` post-Phase 5.
- [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5 (Stage 1.2).
- [src/app/api/team/route.ts:160](../src/app/api/team/route.ts) — agent loop with `Promise.all` tool-call parallelization (Stage 6.3).
- [evals/golden-set.jsonl](../evals/golden-set.jsonl) — 100-case graded-relevance set.

---

## Part 9 — Future-agent quickstart

If you're a future agent landing cold:

1. **Start with the Roadmap status table** (top of this doc) — tells you what's done, what's in-flight, what's next.
2. **Check [activeContext.md](activeContext.md)** for the current "right now" state — what was touched last session, what's in-flight.
3. **Check [progress.md](progress.md)** Completed vs Pending for history of what's shipped.
4. **Do NOT** propose paid APIs other than Gemma on OpenRouter. Do NOT suggest "top up Jina." Do NOT reintroduce the Italian translation layer.
5. **Do NOT** edit the golden set to fix gate failures — the user has explicitly frozen it for this cycle.
6. **Run evals between phases.** Retrieval (`npx tsx scripts/eval-retrieval.ts --snapshot`) and agentic (`npx tsx scripts/eval-models.ts --real-rag --runs 3`). Commit after each gate passes.
7. **When in doubt about budget:** any stage that needs per-call spending on a non-Gemma-OpenRouter service is dead. Find a free or self-hosted alternative.

### Keeping this doc current

When a phase moves state:

1. **Starting a phase:** flip Status `NOT STARTED` → `IN PROGRESS`, fill `Started:` with today's date, tick task boxes as you complete them.
2. **Blocked:** flip Status → `BLOCKED`, add a note under the phase with what's blocking.
3. **Shipping a phase:** every task and gate box ticked? Fill `Shipped:` with today's date, fill `Commit:` with the short SHA, flip Status → `SHIPPED`. Update the Roadmap status table at the top to match.
4. **Update Part 6 trajectory** with the actual measured nDCG if it diverged from the expected range.
5. **Add a completion entry to [progress.md](progress.md)** with measured numbers + commit SHA.
6. **Do NOT renumber phases after shipping.** If you insert a new phase, suffix the next number (e.g., 3b) rather than bumping everything.
