# Active Context

_Last updated: 2026-04-25 (RAG → UI/UX pivot). Purpose: one-page "right now" snapshot. Forward plan lives in [rag-master-plan.md](rag-master-plan.md); stage-by-stage history in [progress.md](progress.md); bug log in [errors.md](errors.md); data-pipeline source-of-truth in [techContext.md § Data Pipeline](techContext.md#data-pipeline)._

## Current focus: UI/UX Phase 2 (active track)

**Strategic pivot (2026-04-25):** RAG roadmap declared feature-complete for current product surface. Diminishing-returns signals all green: retrieval nDCG plateau at 0.844 (+0.8pp absolute over 2 weeks), agentic eval saturated at 13/13 + 100% citations across all viable models, all 4 user-value quality levers (model selection, freshness, citations, phantoms) shipped 2026-04-23. Active track is now **Tier D — Webapp UX**.

**Phase 1 (passive RAG observation, no keyboard):**
- 2026-04-26 (~24h after task fire): confirm `data/transcripts/` has new `.md` files from Windows Task Scheduler YouTube job (A10 gate close).
- 2026-04-28 04:00 UTC: first Serebii weekly cron fire (A12 gate 1).
- 2026-05-05 04:00 UTC: second Serebii fire → A12 verified-shipped.

**Phase 2 (UI/UX, all 3 SHIPPED 2026-04-25):**
1. **D1** — Mobile Team debugger via `<Sheet side="bottom">` + header toggle. `<DebugPanel>` extracted; reused across desktop aside + mobile drawer.
2. **D2** — `streamReply()` extracted; Retry button on transport-error card; `<ThinkingSkeleton>` while streaming-empty; "stream ended" fallback. Pre-existing `Date.now()` impurity fixed.
3. **D3** — New [src/components/ui/field.tsx](../src/components/ui/field.tsx) primitives (`Field`/`FieldLabel`/`FieldHint`/`FieldError`/`useFieldControl`); applied to `/calc` (5 fields), `/search` + `/team` inputs (sr-only labels, aria-labels, focus rings).

Detail in [progress.md](progress.md) "Tier D — Webapp UX Phase 1" entry. tsc + eslint clean.

**Re-entry triggers for RAG work** (don't touch unless one fires): real users surface a quality issue the eval suite missed; new Champions patch ships; budget unlocks paid APIs; A9 demand emerges.

## RAG TL;DR (for cold readers)

- **Retrieval baseline:** nDCG@10 = **0.844** overall (post-reranker-cleanup, 2,639 chunks). Δ -0.1% vs 0.845 post-A3 — well within 3% budget. Canonical snapshot: [retrieval-2026-04-24T05-27-53-696Z.json](eval-baselines/retrieval-2026-04-24T05-27-53-696Z.json).
- **Agentic baseline (`gemma-4-26b --real-rag`, post-A4c 3-run):** **13/13 + 13/13 + 12/13** pass, **citation validity 100/100/100** (up from 80/100/80 pre-A4c), avg ~27k tok/pass. Phantom_pokemon interceptor fires in 0ms/0 tokens. Snapshots: `snapshots/model-eval-2026-04-24T04-*.json`.
- **Default model:** `gemma-4-26b` (paid ~$0.008/run). 7-model bake-off held 2026-04-23 — no challenger beats on cost+quality. DeepSeek V3.2 matches at 3× cost; GLM-4.5-Air matches at 5× cost with 3.4× token variance; Ollama 7-8B Q4 locals 2-8/13 (below bar).
- **Four user-value quality levers all shipped this session** (strategic reframe goal):
  1. **Model selection** — bake-off done, Gemma retained.
  2. **Content freshness** — A10 (YouTube local task scheduler) + A11 (Pikalytics+Sheets cron 2×/day) + A12 (Serebii weekly cron) + A13 (staleness UX).
  3. **Citation hallucination** — A4c shipped (validation nudge enumerates valid chunk_ids).
  4. **Phantom Pokemon** — A4 interceptor shipped model-agnostic.
- **Session 2026-04-23 ship count:** A1/A2 (NO-GOs, memos), A3 (content refresh), A4 (phantom interceptor), A4c (citation nudge), A5 (Claude self-eval), A6 (multilingual pikalytics fix), A7 (core-WR NL retrieval), A10 revised (YouTube local schtasks), A11 (2×/day cron), A12 (Serebii weekly cron), A13 (staleness telemetry), C-tier reranker cleanup. Detailed archive entries in [progress.md](progress.md).
- **Push state:** 6 session commits pushed to `origin/main` (`7ac3b1c` A7, `cc7e927` A12, `2ba58b5` A4c, `cd66ce1` reranker cleanup code, `9b85dfd` memory-bank wrap-up, `a1be19f` post-cleanup retrieval baseline). Working tree clean.

## Next actions (Tier D — UI/UX continued)

1. **Manual smoke validation** of D1/D2/D3 (DevTools mobile mode for D1; force a transport error for D2 retry; tab-nav + screen-reader pass for D3). No code changes if smoke passes.
2. **Commit + push** D1/D2/D3 + memory-bank updates as one logical unit ("feat(ux): Tier D Phase 1 — mobile debugger + retry/skeleton + Field primitives").
3. **D4 — Mobile bottom-nav consistency** (next session candidate): the existing custom bottom-nav component is anchored on some pages but not all. Audit + apply uniformly. Pairs with D1's mobile-first push.
4. **D5 — `/pokedex` & `/sets` polish** (next session candidate): search-as-you-type on `/pokedex`; archetype/core filter on `/sets`. Both surfaces are template-quality today.
5. **D6 — Design tokens formalize** (deferred): Tailwind v4 `@theme` block lacks semantic names (`--color-success`, `--color-info`, radius-sm/lg). Pre-mature until a real component-library scale shows up.

**Tier A residue (optional, unchanged from 2026-04-23):**

- A8 (CLI harness wrapper) and A9 (harder eval tests) remain DEFERRED. Only pursue if a Tier-D session surfaces a concrete need (e.g., user complaint demanding paid-tier model differentiation).
- A4b (prompt hardening) DEFERRED — A4 interceptor is the structural fix.
- Tier B: Phase 3 reranker retry — **PERMANENTLY DEFERRED** (B1 closeout 2026-04-23 late evening).

## Observation gates pending

- **Local YouTube scraper** (`pokemon-youtube-scraper` schtasks task, 12h interval, run-as `paulo` interactive-only). First fire: 2026-04-24 07:57 local. After 2 fires (~24h), confirm `data/transcripts/` has new `.md` files + non-bot commit on `main`. Manual smoke run (2026-04-23 evening) already landed 22 transcripts as `dfc3664` — proves script works end-to-end. A11 GH Actions path validated by run 24867630255.
- **Serebii weekly cron** — first scheduled fire Sunday 2026-04-28 04:00 UTC, second 2026-05-05. Both green + row-counts stable closes A12 as SHIPPED + verified.

## Session 2026-04-23 — SHIPPED list (compact; full detail in [progress.md](progress.md))

- **C-tier housekeeping: dormant reranker cleanup** · commits `cd66ce1`/`9b85dfd`/`a1be19f` — B1 (Phase 3 reranker retry) permanently deferred; dropped `lib/rerank.ts` (3 clients) + RERANKER dispatch + `boostMul` plumbing (~230 LOC). Renamed `rerank_end` progress event to `boost_end`. Gate: retrieval nDCG 0.844 (Δ-0.1%); agentic 13/13 + 100% citation validity.
- **A4c (citation retry nudge hardening)** · commit `2ba58b5` — `formatValidationNudge` now enumerates valid chunk_ids (cap 50 ≈ 1k tokens). 3-run citation validity 80/100/80 → **100/100/100**. Best Gemma tok/pass ever at avg ~27k.
- **A12 (Serebii weekly cron)** · commit `cc7e927` — new [.github/workflows/refresh-serebii.yml](../.github/workflows/refresh-serebii.yml), Sunday 04:00 UTC. Observation gate pending 2026-04-28 + 2026-05-05.
- **A7 (NL "X+Y core WR" retrieval hardening)** · commit `7ac3b1c` — content prose in meta_snapshot.md + `+0.08` boost in [lib/rag/boost.ts](../lib/rag/boost.ts) gated on `\bcore\b` AND `\b(win rate|winrate|wr)\b`. `/lookup "Archaludon Pelipper rain core win rate" 3` returns meta_snapshot top-cores chunk at rank 3 with 55.8% figure (was absent from top-20).
- **A6 (multilingual pikalytics locale flips)** · commit `6c2c101` — cache-bust + retry + prior-EN fallback + Floette-Eternal seed in [scraper_pikalytics.py](../scraper_pikalytics.py). CSV now 0 non-ASCII; scraper self-heals across cron runs.
- **A13 (staleness telemetry UX)** · commit `740ef9b` — `getStaleness()` in [lib/rag.ts](../lib/rag.ts) + SSE event in route.ts + `<StalenessFooter>` in [src/app/team/page.tsx](../src/app/team/page.tsx) + one-liner in [scripts/search.ts](../scripts/search.ts).
- **A10/A11 (data-pipeline cron)** · commits on main — cron bumped to `0 0,12 * * *` (2×/day); A10 YouTube step reverted from GH Actions after cloud-IP ban discovered, re-shipped as [scripts/scrape-youtube-local.bat](../scripts/scrape-youtube-local.bat) via local Windows Task Scheduler.
- **A5 (Claude Opus 4.7 self-eval)** — 10/10 applicable, 3 N/A. Surfaced A6/A7/A8/A9. Report: [team_outputs/claude-opus-self-eval-2026-04-23.md](../team_outputs/claude-opus-self-eval-2026-04-23.md).
- **A4 (phantom_pokemon interceptor)** · commit — model-agnostic [lib/phantom-guard.ts](../lib/phantom-guard.ts); 0ms/0 tokens pre-LLM short-circuit. 3/3 runs post-ship.
- **A3 (content enrichment)** · commits `3555ad2`..`8b31999` — fresh Pikalytics (89/216 Pokemon) + VGCPastes 445 teams; new [data/knowledge/singles_meta.md](../data/knowledge/singles_meta.md); viability-vs-usage paragraph in meta_snapshot.md; TheDelybird template-archetypes in team_archetypes.md.
- **A1/A2 evals — NO-GOs.** Groq Llama 3.3 70B parser rejects Llama tool format + 12k TPM cap. Ollama 7-8B Q4 all below 10/13 bar (qwen2.5-7b best at 8/13). Registry adds retained.
- **OpenRouter paid bake-off — DeepSeek V3.2 / GLM-4.5-Air / Gemini 2.5 Flash Lite / GPT-OSS 20B.** None beat Gemma on cost+quality. All retained as registry opt-ins. Memos in `.claude/projects/.../memory/`.
- **Jina default fix** — `lib/rag.ts` default reranker `"jina"` → `"none"`. Retrieval unchanged; saved 300-500ms/call on silent 403s. (Superseded by full reranker cleanup later in the session.)
- **Pre-existing GH Actions infra bug fix** (same-session side quest) — secrets scoped to `Production` environment + workflow declared `environment: Production` + reindex step plumbs via `env:` block. Was gating A10/A11.
- **Per-model memo files** ([.claude/projects/.../memory/](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/)): `project_deepseek_v32_eval.md`, `project_glm_45_air_eval.md`, `project_gemini_25_flash_lite_eval.md`, `project_phantom_pokemon_systemic.md`, `project_claude_opus_selfeval.md`, `project_groq_llama33_eval.md`, `project_qwen3_8b_eval.md`, `project_qwen25_coder_7b_eval.md`.

## Per-intent baseline (post reranker cleanup, 2026-04-24) · snapshot: [retrieval-2026-04-24T05-27-53-696Z.json](eval-baselines/retrieval-2026-04-24T05-27-53-696Z.json)

| Intent | n | nDCG@10 | Recall@10 | P@10 | Gate |
|---|---|---|---|---|---|
| Overall | 100 | 0.844 | 0.86 | 0.33 | ✓ Δ-0.1% vs 0.845 post-A3 |
| matchup | 10 | 0.752 | 1.00 | 0.47 | ✓ |
| counter | 18 | 0.692 | 0.67 | 0.41 | ✓ |
| team | 14 | 0.780 | 0.93 | 0.41 | ✓ |
| adversarial | 20 | 0.686 | 0.60 | 0.17 | ✓ invariant held |
| item | 14 | 0.989 | 0.93 | 0.24 | ✓ |
| move | 9 | 0.995 | 0.89 | 0.28 | ✓ |
| usage | 9 | 0.985 | 1.00 | 0.29 | ✓ |
| stat | 26 | 0.838 | 0.81 | 0.27 | ✓ |

## Phase history — archived in [progress.md](progress.md)

Phases 1-5 (Phase 1 Italian translation cleanup; Phase 2 citation validation; Phase 3 reranker blocked then dropped; Phase 4 `lib/rag.ts` module split; Phase 5 executor redesign) and Stage 5/6.3 detail live in [progress.md](progress.md). Read that doc when diving into historical reasoning; don't re-archive here.

## Hard constraints

- **Budget:** No paid APIs outside the allowlist (OpenRouter Gemma tier + optional Anthropic). Jina permanently OFF. See [memory/project_no_paid_apis.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Golden set frozen this cycle** — don't edit `evals/golden-set.jsonl`.
- **Vercel Lambda 250MB bundle.** `onnxruntime-node` doesn't bundle; HF Inference API is the query-embedding path on prod. See [memory/project_vercel_embedding_constraint.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Rollback triggers:** any intent > 3% regression, agentic < 12/13 variance, Lambda > 240MB.

## Key code pointers

- [lib/rag.ts](../lib/rag.ts) — thin `query()` orchestrator. Post-cleanup (2026-04-23) reranker dispatch removed; re-exports classify/route types.
- [lib/rag/classify.ts](../lib/rag/classify.ts) — dictionaries + `QueryIntent` + `classifyQuery()`.
- [lib/rag/route.ts](../lib/rag/route.ts) — `QueryRoute` + `ARCHETYPE_PATTERNS` + `PHANTOM_TO_EVOLVED` + `routeQuery()`.
- [lib/rag/structured-filter.ts](../lib/rag/structured-filter.ts) — `runStructuredFilter()`.
- [lib/rag/force-includes.ts](../lib/rag/force-includes.ts) — `collectForceIncludes()` returning `Map<id, ForcedChunk>`. Phase 5's consumption point.
- [lib/rag/boost.ts](../lib/rag/boost.ts) — `applyBoosts()` + `BoostCandidate` interface.
- [lib/query-planner.ts](../lib/query-planner.ts) / [lib/query-executor.ts](../lib/query-executor.ts) — Stage 6.3. Phase 5 redesigns the executor to re-apply force-includes/boosts post-merge against original query.
- ~~`lib/rerank.ts`~~ — deleted 2026-04-23 late evening as part of B1 permanent deferral. Prior clients (Jina, Gemma pointwise, BGE cross-encoder) preserved only in git history.
- [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5 (Stage 1.2).
- [src/app/api/team/route.ts:160](../src/app/api/team/route.ts) — agent loop, `Promise.all` (Stage 6.3).
- [evals/golden-set.jsonl](../evals/golden-set.jsonl) — 100-case graded-relevance set.
