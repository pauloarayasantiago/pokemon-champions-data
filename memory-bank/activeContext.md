# Active Context

_Last updated: 2026-04-25 night (post A15 ship + R-tier ship + Tier D Phase 1+2 ship + 5-model real-world compare). Purpose: one-page "right now" snapshot for next-agent handoff. Forward plan: [rag-master-plan.md](rag-master-plan.md). Detailed history: [progress.md](progress.md). Bug log: [errors.md](errors.md). Data-pipeline source-of-truth: [techContext.md § Data Pipeline](techContext.md#data-pipeline)._

## TL;DR

**RAG declared feature-complete 2026-04-25** after the 2026-04-23 Tier-A close. Diminishing-returns signals decisive: nDCG plateau 0.844, agentic eval saturated at 13/13 + 100% citations, all 4 user-value quality levers shipped. Active track since the pivot is **Tier D — Webapp UX**. Three D-tier improvements + three R-tier RAG-quality follow-ups + one A-tier structural validator (A15) all shipped 2026-04-25 night.

**Current state:** webapp surface is hardened, validator covers item-clause + species-clause + SP caps server-side, multi-model dropdown is testing-ready with 9 OpenRouter models. User has been comparison-testing models (5 done so far). 4 more pending: MiniMax M2.7, MiniMax M2.5, Grok 4.1 Fast, DeepSeek V4 Pro (BYOK needed for the latter — 429s on shared OpenRouter pool).

**Working tree:** uncommitted changes from 2026-04-25 evening/night session — D7+D8+D9 + R1+R2+R3 + A15 + CLAUDE.md + system-prompt v4.3 + 9-model dropdown (curated to 5 visible). Plus memory-bank docs. Recommend a single feature commit before next session.

## Active model dropdown (curated `AVAILABLE_MODELS`)

1. Gemini 3 Flash Preview (paid) — TEAM_BUILDING_MODEL default
2. DeepSeek V4 Flash (paid)
3. DeepSeek V4 Pro (paid — 429-prone on shared pool)
4. Kimi K2.6 (paid — slowest tested at 18.2 min)
5. MiniMax M2.7 (paid — untested)
6. MiniMax M2.5 (paid — untested)
7. Grok 4.1 Fast (paid — untested)
8. Gemma 4 26B (paid) — DEFAULT_MODEL for batch/eval
9. Gemini 2.5 Flash (free)

`MODEL_REGISTRY` retains additional opt-in models (Groq Llama 3.3 70B, Ollama locals, Claude Sonnet/Opus, etc.) for `eval-models.ts` benchmarking.

## Next actions (in priority order)

1. **Smoke + commit** the 2026-04-25 session bundle. Run any model in `/team`, confirm: D8 stop button works, D7+D9 wipes intermediate-iter content, R2 pokedex now returns `competitive` block, A15 catches a deliberate item-clause violation if you craft one. Then `git commit -m "feat(ux+rag): Tier D Phase 1+2, R1-R3, A15, model-list curation"`.
2. **Resume model testing** on the 4 untested models. Use the same Snow-Balance prompt for apples-to-apples; collect run logs. Append a row per model to the [progress.md](progress.md) "5-model compare" table.
3. **A14 — Pikalytics non-EN ASCII-Latin detection.** Currently leaks Italian (Bora/Velaurora) past the `[^\x00-\x7f]` regex. Fix candidate: cross-check scraped move names against canonical `moves.csv` and trigger retry/fallback when >50% don't match. Currently degrading R2 enrichment for Froslass specifically.
4. **C4 — exclude `memory-bank/**` from indexer ingest.** Stale-warning noise on every memory-bank edit. 5-min fix in chunker ignore globs.

## Optional / deferred

- **A1-alt-2** — schedule a 3-run agentic eval on `gemini-3-flash` (newer than the Gemini 2.5 Flash Lite tested in the original A1-alt bake-off). Could justify flipping the default if the banned-item hallucination from [project_gemini3_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemini3_eval.md) doesn't re-appear post-A4 + post-A15. Only worth it if there's appetite to switch defaults.
- **D4** — Mobile bottom-nav consistency audit across pages.
- **D5** — `/pokedex` & `/sets` polish (search-as-you-type, archetype/core filter).
- **D6** — Tailwind v4 design-token formalization (semantic color names: `--color-success`, `--color-info`).
- **A8 / A9** — CLI harness wrapper / harder eval tests. Tier-A residue, deferred unless concrete need surfaces.

## Re-entry triggers for RAG work

Don't touch RAG further unless one fires:
- Real users surface a quality issue not caught by the eval suite
- New Champions patch ships (mechanic/roster delta)
- Budget unlocks paid APIs beyond the OpenRouter Gemma allowlist
- A9 demand emerges (paid premium tier)

## Observation gates pending

- **YouTube local task** (`pokemon-youtube-scraper` Windows schtasks, 12h, run-as-paulo). Confirm 2026-04-26 (~24h after first scheduled fire 2026-04-24 07:57 local): `data/transcripts/` has new `.md` files + non-bot commit on `main`. Manual smoke (2026-04-23) landed 22 transcripts as `dfc3664` — script proven.
- **Serebii weekly cron**: first scheduled fire 2026-04-28 04:00 UTC; second 2026-05-05. Both green + row-counts stable closes A12 verified-shipped.

## Hard constraints

- **Budget:** No paid APIs outside the allowlist (OpenRouter Gemma + opt-in Anthropic, plus the user-added paid OpenRouter models for testing). Jina permanently OFF. See [memory/project_no_paid_apis.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Golden set frozen this cycle** — don't edit `evals/golden-set.jsonl`.
- **Vercel Lambda 250MB bundle** — `onnxruntime-node` doesn't bundle; HF Inference API is the query-embedding path on prod. See [memory/project_vercel_embedding_constraint.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Rollback triggers:** any intent > 3% regression, agentic < 12/13 variance, Lambda > 240MB.

## Per-intent retrieval baseline (post-reranker-cleanup, 2026-04-24)

Snapshot: [retrieval-2026-04-24T05-27-53-696Z.json](eval-baselines/retrieval-2026-04-24T05-27-53-696Z.json). Overall **nDCG@10 = 0.844**; per-intent (matchup 0.752, counter 0.692, team 0.780, adversarial 0.686, item 0.989, move 0.995, usage 0.985, stat 0.838) all stable. Read the snapshot for full Recall@10 / P@10 numbers.

## Key code pointers

- **Agent loop:** [src/app/api/team/route.ts](../src/app/api/team/route.ts) — POST handler, phantom-guard pre-check, 20-iter agent loop, citation+team validation post-emission.
- **Tools:** [src/lib/tools.ts](../src/lib/tools.ts) — search/calc/pokedex/validate_set definitions + `executeTool`. Pikalytics enrichment + R3 prefix strip live here.
- **System prompt:** [src/lib/system-prompt.ts](../src/lib/system-prompt.ts) — current version `2026-04-25.v4.3-item-clause`.
- **LLM dispatch:** [src/lib/llm.ts](../src/lib/llm.ts) + [src/lib/llm/types.ts](../src/lib/llm/types.ts) (MODEL_REGISTRY) + adapters in `src/lib/llm/`.
- **Webapp `/team` UI:** [src/app/team/page.tsx](../src/app/team/page.tsx) — has D1 mobile sheet, D2 retry, D7+D9 iter-clear, D8 stop button.
- **RAG core:** [lib/rag.ts](../lib/rag.ts) thin orchestrator + module split [lib/rag/](../lib/rag) (classify/route/structured-filter/force-includes/boost) + [lib/query-planner.ts](../lib/query-planner.ts) / [lib/query-executor.ts](../lib/query-executor.ts).
- **Validators:** [lib/validate-citations.ts](../lib/validate-citations.ts) (A4c) + [lib/validate-team.ts](../lib/validate-team.ts) (A15).
- **Phantom guard:** [lib/phantom-guard.ts](../lib/phantom-guard.ts) (A4).
- **Embedding:** [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5; Vercel routes to HF Inference API.
- **Eval harnesses:** [scripts/eval-models.ts](../scripts/eval-models.ts) (13-test agentic), [scripts/eval-retrieval.ts](../scripts/eval-retrieval.ts) (100-case retrieval).
- **Smoke tests:** [scripts/smoke-pokedex-enrich.ts](../scripts/smoke-pokedex-enrich.ts) (R2), [scripts/smoke-validate-team.ts](../scripts/smoke-validate-team.ts) (A15).

## Hygiene reminders for next agent

- This doc is the **right-now snapshot**. Overwrite freely; target ≤ 150 lines.
- [rag-master-plan.md](rag-master-plan.md) is the **lean forward plan** with a single roadmap table. Target ≤ 400 lines.
- [progress.md](progress.md) is the **archive**. Append shipped phases with detail; never compress old entries.
- When a phase ships: update the roadmap-table row, write a detailed progress.md entry, flip activeContext TL;DR. **Don't mirror detail across all three.**
- Cross-session memory at `.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/` holds per-model eval memos and project-level constraints; check there before re-evaluating any model.
