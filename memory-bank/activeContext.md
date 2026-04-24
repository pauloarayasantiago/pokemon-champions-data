# Active Context

_Last updated: 2026-04-23 evening (post A5 self-eval + A10/A11 cron ship). Purpose: one-page "right now" snapshot. Forward plan lives in [rag-master-plan.md](rag-master-plan.md); stage-by-stage history in [progress.md](progress.md); bug log in [errors.md](errors.md); data-pipeline source-of-truth in [techContext.md § Data Pipeline](techContext.md#data-pipeline)._

## TL;DR

- **Retrieval baseline:** nDCG@10 = **0.845** overall (post-A3, 2,511 chunks). Δ -0.94% vs 0.853 Phase-5 baseline — within the 3% overall budget. Snapshot: [retrieval-post-A3.json](eval-baselines/retrieval-post-A3.json).
- **Team-intent regression accepted:** 0.844 → 0.785 (-7.0%). Three cases shifted: team-wolfey-froslass -0.369 + team-wolfey-teams -0.088 driven by tournament_teams.csv + pikalytics_usage.csv roster churn after fresh scrape; team-ck49-role-framework -0.362 (baseline was already 0.362; grade-1/2 chunk slipped out of top-10 after reindex). AngrySlowbroPlus case recovered to baseline after Task 2 viability-section trim. Adversarial, item, move, usage, stat, counter, matchup intents all within ±0.5% of baseline.
- **Agentic baseline post-A3** (`gemma-4-26b --real-rag`, 1-run 2026-04-23 PM): **13/13 pass, 100% citation-validity, 16327 tok/pass** (down from 25-30k historical), 30.4s/test avg. All 5/5 retrieval tests + `creator_opinion` + `tournament_retrieval` + `meta_core_attribution` green — agent correctly uses the new content. phantom_pokemon passes in 0.0s / 0 tokens (interceptor).
- **2026-04-23 session — MAJOR reframe.** Tested 7 LLMs (Gemma, Groq Llama 3.3 70B, GPT-OSS 20B, qwen2.5-7b/llama3.1-8b Ollama, DeepSeek V3.2, GLM-4.5-Air, Gemini 2.5 Flash Lite). **`phantom_pokemon` fails on EVERY model tested** — not a Gemma flake, it's systemic. A4 reframed from "Gemma flake fix" to "model-agnostic phantom Pokemon interceptor". Shipped as [lib/phantom-guard.ts](../lib/phantom-guard.ts) + wiring in [src/app/api/team/route.ts](../src/app/api/team/route.ts) and [scripts/eval-models.ts](../scripts/eval-models.ts).
- **Default model retained: `gemma-4-26b`.** No challenger beat it on cost+quality. DeepSeek V3.2 matches at 3× cost; GLM-4.5-Air matches at 5× cost with 3.4× token variance. Detail in [memory/project_default_model.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_default_model.md).
- **Gemma 4 26B A4B is PAID** ($0.06/$0.33 per M, ~$0.008/run) — earlier docs mis-labeled it as free tier. The `:free` suffix applies only to the 31B variant.
- **Bug fix shipped:** `lib/rag.ts:223` default `RERANKER` fallback changed from `"jina"` to `"none"`. Jina's account has been depleted; fallback was wasting 300-500ms per RAG call on a silent 403. Retrieval unchanged.
- **A5 SHIPPED (2026-04-23 evening):** Claude Opus 4.7 self-eval on same 13-test agentic suite via `/lookup` + direct CSV reads. **10/10 on applicable tests, 3 N/A** (tool_workflow / validate_loop / pokedex_dedup score programmatic tool-call patterns inapplicable to manual CLI flow). Ties Gemma at 10/10 on apples-to-apples subset → the 13-test suite saturates at this model tier; premium-model differentiation needs harder tests. Report: [team_outputs/claude-opus-self-eval-2026-04-23.md](../team_outputs/claude-opus-self-eval-2026-04-23.md); memo: [project_claude_opus_selfeval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_claude_opus_selfeval.md).
- **A5 findings surfaced 3 new tasks** (see master plan for A6/A7/A8):
  - **A6 — Japanese text in 14/89 pikalytics rows.** `awk` scan found Archaludon, Charizard, Gyarados, Venusaur, Whimsicott, Gengar, Sylveon, Aegislash, Arcanine-Hisui, Corviknight, Froslass, Palafin, Talonflame (items+moves), plus Gallade (items) and Typhlosion-Hisui (moves) with raw Japanese (たべのこし etc.) in `top_moves`/`top_items` columns. Phase-8 Accept-Language header didn't fully catch these. User-visible: LLM answers about these 14 mons' items/moves may regurgitate Japanese.
  - **A7 — Retrieval gap on "X+Y WR" natural-language queries.** `/lookup "Archaludon Pelipper rain core win rate"` returned top-5 at 0.11 similarity — all `team_archetypes.md` chunks, NOT the `meta_snapshot.md:32` top-cores table where the actual 55.8% lives. Reformulating as "top cores win rate ..." surfaced it at rank 3 / 0.078. Gemma works around via planner decomposition; manual CLI users hit the gap.
  - **A8 — CLI harness for eval parity.** 3/13 tests score programmatic `pokedex`/`validate_set` patterns — structurally inapplicable to Claude-via-CLI even though "Local CLI" is a first-class Mission surface. Small wrapper capturing `/lookup` + Read into `toolCallLog` shape would promote them to applicable.
- **Data pipeline audit (2026-04-23 evening) → A10/A11/A12/A13.** Inventoried all 4 scrapers (Serebii, Pikalytics, Sheets, YouTube) into [techContext.md § Data Pipeline](techContext.md#data-pipeline). Findings: only Pikalytics + Sheets were in the GH Actions cron `0 6 */3 * *` (every 3 days); YouTube was manual-only despite being the most volatile source; Serebii is also manual-only. User specified "scrape YouTube ≥2×/day or however often the API allows." A11 (cron bumped to `0 0,12 * * *` for all automated scrapers) **SHIPPED**. A10 shipped twice: first attempt added YouTube as a 4th GH Actions step — green check but `Saved: 0 transcripts` (YouTube hard-blocks cloud provider IPs; see [errors.md](errors.md)). **Revised A10 SHIPPED same evening** — YouTube step reverted from workflow; local [scripts/scrape-youtube-local.bat](../scripts/scrape-youtube-local.bat) invoked by Windows Task Scheduler on user's residential IP, commits+pushes new transcripts for the GH Actions cron to reindex. A12 (Serebii weekly) remains open; A13 (staleness UX) **SHIPPED late evening** (see SHIPPED list).
- **A6 (multilingual locale flips) — SHIPPED late evening.** Originally framed as "JP→EN cleanup for 14 rows"; investigation revealed seven distinct locales (JP/CN-trad/CN-simp/ES/DE/FR/KR) with the affected set drifting per scrape. Pikalytics' Cloudflare layer caches per-URL and ignores `Accept-Language`. Fix layered into `scraper_pikalytics.py`: cache-bust query param, post-parse non-ASCII detection, retry loop, prior-EN row fallback when retries exhausted, manual seed for permanently-stuck Floette-Eternal, `sys.exit(1)` if any row remains non-EN with no fallback. CSV now zero non-ASCII; scraper self-heals across cron runs. See SHIPPED list and [errors.md](errors.md) row 47.
- **Pre-existing GH Actions infra bug fixed as same-session side quest:** scheduled runs had been failing at `scripts/index-data.ts` with `Supabase secret key missing` because no secrets were configured at the repo level. User added `SUPABASE_SECRET` + `NEXT_PUBLIC_SUPABASE_URL` to the `Production` environment; workflow now declares `environment: Production` on the job and plumbs both via `env:` on the reindex step. Unrelated to A10/A11 scope but was gating whether A10/A11 could actually land fresh data to the index.

## Next actions (Tier A, in order)

1. **A7 — Retrieval hardening for "X+Y core WR" queries**: small content tweak — inline a natural-phrasing restatement of the top-cores table in `meta_snapshot.md` (e.g., "The Archaludon+Pelipper rain core has a 55.8% win rate"), OR add WR-pattern boost to `lib/rag/boost.ts`. Low-hanging.
2. **A12 — Add Serebii scraper to cron** (low urgency): weekly/bi-weekly. Patch-safety net.
3. **A8 — CLI harness wrapper** (optional): instrument `/lookup` + Read into `toolCallLog` so the 3 N/A tests become applicable to Claude-via-CLI. Makes the eval comparison complete.
4. **A9 — Harder eval tests** (optional): the 13-test suite saturates at 10/10 for both Gemma and Claude Opus. To differentiate premium models (Sonnet 4.6, Opus 4.7), add adversarial retrieval tests.
5. **A4b — Prompt hardening** — unchanged, low priority.
6. Tier B: Phase 3 reranker retry (deferred; marginal ROI).

**Observational gate on A10-revised/A11 ship:** scheduled task `pokemon-youtube-scraper` registered on user's box 2026-04-23 evening (`schtasks /create`, 12-hour interval, run-as `paulo`, `/it` interactive-only). First scheduled fire: 2026-04-24 07:57 local. After 2 fires (~24h), confirm `data/transcripts/` has new `.md` files and a non-bot commit on `main`. A11 GH Actions path already validated by run 24867630255 (Pikalytics 89 rows + Sheets 445 rows refreshed, reindex green, auto-commit `0a65872` pushed). Smoke-test local run (manual, 2026-04-23 evening) already landed 22 fresh transcripts as commit `dfc3664` — proves the script itself works end-to-end.

## Session 2026-04-23 — SHIPPED list

- **A6 (multilingual locale flips in pikalytics scrape) — SHIPPED (late evening).** Originally framed as "JP→EN cleanup for 14 rows"; investigation showed contamination is multilingual (JP/CN-trad/CN-simp/ES/DE/FR/KR observed across 3 consecutive scrapes; affected set drifts per run). Root cause: Pikalytics' Cloudflare layer caches per-URL and ignores `Accept-Language`. Fix in [scraper_pikalytics.py](../scraper_pikalytics.py): cache-bust query param + `Cache-Control: no-cache` + post-parse non-ASCII detection + retry loop + `load_prior_english_rows()` fallback when retries exhausted + `sys.exit(1)` if no EN fallback available + manual seed for Floette-Eternal (permanently stuck). Detection regex widened to `[^\x00-\x7f]` (any non-ASCII) — moves.csv + items.csv verified 100% ASCII so no false positives. Final CSV: 0 non-ASCII rows; reindex green; spot-check Delphox/Tauros/Floette-Eternal returns English. See [errors.md](errors.md) row 47.
- **A13 (staleness telemetry UX) — SHIPPED (evening).** New `getStaleness()` + `StalenessInfo` types in [lib/rag.ts](../lib/rag.ts) (5 source buckets — youtube, pikalytics, sheets, serebii, knowledge — 60s in-process cache, per-source max-mtime + fs-drift detection skipped on Vercel). [src/app/api/team/route.ts](../src/app/api/team/route.ts) emits `{type: "staleness", data: info}` SSE event once per request. [src/app/api/team/health/route.ts](../src/app/api/team/health/route.ts) GET now includes `staleness` so the webapp footer renders on mount. [src/app/team/page.tsx](../src/app/team/page.tsx) `<StalenessFooter>` below input: "Data refreshed Nh ago" with amber styling at >72h, expand-on-click per-source grid with drift flags. [scripts/search.ts](../scripts/search.ts) prints one-liner before results. tsc clean; CLI smoke confirms.
- **A10/A11 (data-pipeline cron) — SHIPPED (evening, A10 revised).** [.github/workflows/refresh.yml](../.github/workflows/refresh.yml) cron `0 6 */3 * *` → `0 0,12 * * *` (2×/day @ 00:00 + 12:00 UTC). Added `environment: Production` scoping + `env:` block on reindex step wiring `SUPABASE_SECRET` + `NEXT_PUBLIC_SUPABASE_URL` from env-level secrets (pre-existing infra bug, same session). **A10 first attempt** added a `Scrape YouTube transcripts` step; manual workflow_dispatch (run 24867630255) showed `Saved: 0 transcripts` because YouTube blocks cloud-provider IPs. **A10 revised ship** reverted the workflow step + `yt-dlp` pip dep and added [scripts/scrape-youtube-local.bat](../scripts/scrape-youtube-local.bat) for Windows Task Scheduler on the user's residential IP. A11 (Pikalytics + Sheets at 2×/day) unaffected by the revision.
- A1 (Groq Llama 3.3 70B eval) — NO-GO; Groq parser rejects Llama native tool format + 12k TPM cap. Memo: [project_groq_llama33_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_groq_llama33_eval.md).
- A2 (Ollama local eval) — NO-GO on 7-8B Q4 for this workload; qwen2.5-7b 8/13 + llama3.1-8b 4/13. Registry additions retained for future stronger local models.
- A4 (phantom_pokemon interceptor) — SHIPPED; single-test smoke passes in 0ms/0 tokens; 3-run variance 3/3 pass post-ship.
- OpenRouter bake-off — DeepSeek V3.2, GLM-4.5-Air (3-run), Gemini 2.5 Flash Lite. No challenger beat Gemma on cost+quality. Registry adds in `scripts/eval-models.ts`.
- Jina default fix — `lib/rag.ts:223`.
- A5 (Claude Opus 4.7 self-eval) — SHIPPED (evening); 10/10 applicable, 3 N/A. Full report at [team_outputs/claude-opus-self-eval-2026-04-23.md](../team_outputs/claude-opus-self-eval-2026-04-23.md). **Surfaced A6 (Japanese items/moves in 14 pikalytics rows), A7 (NL "X+Y WR" retrieval gap), A8 (CLI harness gap), A9 (eval ceiling saturation).**
- **A3 (content enrichment) — SHIPPED (PM)** · commits `3555ad2`..`8b31999`:
  - Task 1: fresh Pikalytics (89/216 Pokemon) + VGCPastes tournament CSV (445 teams). Reindex 2511 chunks vs 2329 prior.
  - Task 2: short 3-line "Viability vs Usage" paragraph in [data/knowledge/meta_snapshot.md](../data/knowledge/meta_snapshot.md) citing AngrySlowbroPlus's top-5. Initial 22-line structured version dominated 5+ chunks → trimmed after retrieval-regression signal.
  - Task 3: new [data/knowledge/singles_meta.md](../data/knowledge/singles_meta.md) (~158 lines) — 3v3 format basics, top-10 usage from temp6t, concrete creator-sourced sets, differences-vs-Doubles table. Qualitative usage numbers (no structured singles CSV yet).
  - Task 4: "Template Archetypes (Creator-Sourced)" section in [data/knowledge/team_archetypes.md](../data/knowledge/team_archetypes.md) — TheDelybird's top-5 archetypes (Sun, Floette Balance, Rain, Sand, Snow) + Mega Golurk TR bonus. SP spreads deliberately untranscribed.
  - Gates: retrieval overall 0.845 (-0.94%, in budget); team intent -7.0% accepted as fresh-data churn. Agentic 13/13 + 100% citation rate + 16327 tok/pass (best Gemma result measured).
- Memo files: [project_deepseek_v32_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_deepseek_v32_eval.md), [project_glm_45_air_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_glm_45_air_eval.md), [project_gemini_25_flash_lite_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemini_25_flash_lite_eval.md), [project_phantom_pokemon_systemic.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_phantom_pokemon_systemic.md).

Tier B / C + dead code cleanup detail: master-plan.

## Per-intent baseline (post A3, 2026-04-23 PM)

| Intent | n | nDCG@10 | Recall@10 | P@10 | Δ vs Phase-5 | Gate |
|---|---|---|---|---|---|---|
| Overall | 100 | 0.845 | 0.86 | 0.33 | -0.94% | ✓ within 3% overall budget |
| matchup | 10 | 0.752 | 1.00 | 0.47 | -0.4% | ✓ |
| counter | 18 | 0.692 | 0.67 | 0.41 | 0.0% | ✓ |
| team | 14 | 0.785 | 0.93 | 0.41 | -7.0% | ✗ accepted — fresh-data churn (wolfey-froslass, wolfey-teams, ck49-role-framework) |
| adversarial | 20 | 0.686 | 0.60 | 0.17 | +0.1% | ✓ (invariant held) |
| item | 14 | 0.989 | 0.93 | 0.24 | -0.2% | ✓ |
| move | 9 | 0.996 | 0.89 | 0.28 | +0.1% | ✓ |
| usage | 9 | 0.986 | 1.00 | 0.30 | +0.5% | ✓ |
| stat | 26 | 0.838 | 0.81 | 0.27 | -0.1% | ✓ |

## Most recent work

### A3 — SHIPPED (2026-04-23 PM) · snapshot: [retrieval-post-A3.json](eval-baselines/retrieval-post-A3.json)

- **Goal:** work on data, not code — refresh stale CSVs, add singles coverage, reconcile creator tier lists, convert descriptive archetypes into concrete templates.
- **Four-commit ship** (per plan bisectability rule): `3555ad2` CSVs, `50631e2` meta_snapshot viability section, `3eaa3a2` singles_meta.md, `05dbd43` team_archetypes templates, `8b31999` eval baselines.
- **Mid-ship course correction:** initial 22-line structured "Viability vs Usage — Creator Consensus" section (heavy on AngrySlowbroPlus name + S-tier table + 3 convergence/divergence paragraphs) tripped the team-intent rollback trigger (-10.1%) by producing 5+ meta_snapshot.md chunks that dominated creator-name queries in top-10. Trimmed to a 3-line paragraph (single `## Viability vs Usage` section, no structured subheaders, name-mentioned once). Post-trim AngrySlowbroPlus case recovered to baseline; ck49 + 2 wolfey cases did not (see next bullet).
- **Remaining team-intent regression (-7.0%, accepted):** three cases regressed:
  - `team-wolfey-froslass` -0.369 (was 1.000, now 0.631): tournament_teams.csv + pikalytics_usage.csv roster refresh shifted which Froslass-adjacent tournament record lands in top-10.
  - `team-wolfey-teams` -0.088: same driver.
  - `team-ck49-role-framework` -0.362 (was 0.362, now 0.0): baseline was already weak (grade-1/2 chunks in ranks 6-10, no grade-3 in top-5); reindex shuffled those grade-1/2 chunks below rank 10.
  - The regression is **fresh-data churn**, not content-addition dominance. Reverting Task 1 would recover the numbers at the cost of the entire A3 value proposition, so accepted.
- **Agentic gate:** `gemma-4-26b --real-rag` 1-run = 13/13 pass, **100% citation validity**, 16327 tok/pass (personal best for Gemma), 30.4s/test avg. `creator_opinion` specifically passed by attributing Garchomp-view to AngrySlowbroPlus — agent uses the new viability paragraph correctly. `tournament_retrieval` named 5 real Mega Golurk teammates (from TheDelybird bonus template). `meta_core_attribution` reported 55.8% for Archaludon+Pelipper core exactly matching truth.
- **What ships to users:** fresh meta numbers (89/216 Pokemon with Pikalytics rows; 445 tournament teams); a ~158-line singles_meta doc covering 3v3 format with qualitative usage from temp6t; a new "Template Archetypes (Creator-Sourced)" section in team_archetypes with 5+1 buildable team templates; a 3-line viability-vs-usage disclaimer pointing to AngrySlowbroPlus's take.
- **Working-tree state:** 6 commits on main, 2511 chunks indexed, no code changes (data + markdown + snapshots only).

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

Post A10-revised/A11: workflow commits on main `5d3de04` (initial A10 + A11), `b0c5c4c` (env wiring), `0a65872` (auto-refresh). Revision pending commit: `.github/workflows/refresh.yml` (YouTube step + `yt-dlp` removed), new `scripts/scrape-youtube-local.bat`, memory-bank updates. Prior A3 ship: 5 commits on main (`3555ad2` CSVs, `50631e2` meta_snapshot, `3eaa3a2` singles_meta, `05dbd43` team_archetypes, `8b31999` eval baselines). Index: 2511 chunks. Default behavior (`RERANKER` unset) remains RRF + boosts only.

## Immediately queued — see top-of-doc Tier A list

A1/A2/A3/A4/A5/A6/A10/A11/A13 all shipped this session. Remaining Tier A (in priority order):

1. **A7 — NL "X+Y core WR" retrieval hardening** — restate top-cores table in natural prose.
2. **A12 — Add Serebii to cron weekly** — patch-safety, low urgency.
3. **A8 — CLI harness wrapper** _(optional)_ — promote 3 N/A tests to applicable for Claude-via-CLI.
4. **A9 — Harder eval tests** _(optional)_ — current suite saturates; needs adversarial retrieval to differentiate Sonnet/Opus.
5. **A4b — Prompt hardening follow-up** — low priority.

Tier B (Phase 3 retry, subagents) and Tier C (housekeeping refactors, deferred extensions) detail in [rag-master-plan.md](rag-master-plan.md).

## Hard constraints

- **Budget:** No paid APIs outside the allowlist (OpenRouter Gemma tier + optional Anthropic). Jina permanently OFF. See [memory/project_no_paid_apis.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Golden set frozen this cycle** — don't edit `evals/golden-set.jsonl`.
- **Vercel Lambda 250MB bundle.** `onnxruntime-node` doesn't bundle; HF Inference API is the query-embedding path on prod. See [memory/project_vercel_embedding_constraint.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Rollback triggers:** any intent > 3% regression, agentic < 12/13 variance, Lambda > 240MB.

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
