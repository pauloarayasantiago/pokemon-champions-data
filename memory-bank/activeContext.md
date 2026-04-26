# Active Context

_Last updated: 2026-04-25 late night (post 9-model comparison + paid-routing fix + system prompt v4.5 + 7 new memory memos). Purpose: one-page "right now" snapshot for next-agent handoff. Forward plan: [rag-master-plan.md](rag-master-plan.md). Detailed history: [progress.md](progress.md). Bug log: [errors.md](errors.md). Data-pipeline source-of-truth: [techContext.md § Data Pipeline](techContext.md#data-pipeline)._

## TL;DR

**RAG declared feature-complete 2026-04-25**. Active track since the pivot is **Tier D — Webapp UX**. Tier D Phase 1+2, A15 validator, R1-R3 RAG follow-ups all shipped earlier today.

**Late-night session (2026-04-25 17:30-19:30):** Built [scripts/test-team.ts](../scripts/test-team.ts) capture tool, ran 9-model comparison batches on the prompt "Build a team around Froslass and Krookodile". Discovered the OpenRouter adapter sent NO `provider` routing field — explaining why 6/9 models hit shared-pool 429s or transport timeouts despite a paid account. Shipped:
- **Paid routing fix** in [src/lib/llm/openrouter.ts](../src/lib/llm/openrouter.ts) + [src/lib/llm/openai-compat.ts](../src/lib/llm/openai-compat.ts): per-call config injects `provider.{allow_fallbacks:false, sort:throughput, require_parameters:true}` plus per-model `provider.order` first-party pinning.
- **System prompt v4.5** (`2026-04-25.v4.5-reemit-both`) in [src/lib/system-prompt.ts](../src/lib/system-prompt.ts): rule 3 strengthened (must omit pokedex/validate/calc claims), STOP CONDITION after blocks, rule 6 fixed (re-emit BOTH blocks on citation_retry — v4.4's "only claims" version was broken).
- **AVAILABLE_MODELS curated** in [src/lib/llm.ts](../src/lib/llm.ts): dropped `gemini-2.5-flash` (Google free-tier daily quota); kept 8 paid OpenRouter models.
- **7 new memory memos** in `.claude/projects/.../memory/` covering: paid routing, MiniMax pair, Kimi, Grok, DeepSeek V4 pair, full Gemini 2.5 Flash (distinct from Lite), system prompt v4.5.

**Result:** 7 of 9 models verified passing on the prompt. Failing: `deepseek-v4-pro` (transient OpenRouter capacity — all 3 tool-supporting providers 429 simultaneously today; routing config is correct), `gemini-2.5-flash` (Google free-tier quota — needs paid Google key to re-enable, separate from OpenRouter).

**Working tree:** uncommitted changes spanning earlier ships PLUS today's session (test-team.ts, openrouter.ts, openai-compat.ts, types.ts, system-prompt.ts, llm.ts, CLAUDE.md, memory-bank/activeContext.md, runs/* gitignored, .gitignore). Recommend a single feature commit before next session.

## Active model dropdown (curated `AVAILABLE_MODELS`)

Verified 2026-04-25 with paid routing + v4.5 prompt. **Tiers below combine operational + quality dimensions** — see [systemPatterns.md § Model Tier Classification](systemPatterns.md) for the full rubric.

| Combined tier | Model | Op-tier | Q-tier | Notes |
|---|---|---|---|---|
| **S — production default** | `gemini-3-flash` | S (~21s) | A (clean) | `TEAM_BUILDING_MODEL` default. Targeted tool flow + sound team |
| **A — recommended alternatives** | `grok-4-1-fast` | A (~63s) | A | Citation hallucination fixed by v4.5 |
| **A — recommended alternatives** | `minimax-m2-5` | A (~67s) | A | Sophisticated team, multiple win conditions |
| **B — slow but consistent** | `minimax-m2-7` | B (~265s) | B | First-party pinned. Krook/Basc minor strategic flaws |
| **B — slow but consistent** | `kimi-k2-6` | B (~221s) | B | Lists base Froslass ability vs Mega ability (system-prompt convention slip) |
| **C — fast but flawed** | `gemma-4-26b` | A (~81s) | **D** ⚠️ | **Skipped `validate_set` → shipped banned Assault Vest on Incineroar AND Focus-Sash-with-Acrobatics conflict.** OK for batch/eval (suite catches it); **avoid for end-user output** until compliance improves. Was `DEFAULT_MODEL`; recommend NOT promoting to webapp default |
| **C — very slow** | `deepseek-v4-flash` | C (~30min) | B | First-party pinned. Sound team but base-vs-Mega ability slip like Kimi |
| **C — intermittent** | `deepseek-v4-pro` | C (429-prone) | n/a (no successful run today) | All 3 tool-supporting providers throttled today. Routing pinned correctly; retest when capacity recovers |

**Dropped from dropdown** (still in `MODEL_REGISTRY`):
- `gemini-2.5-flash` — routes through Google API, free-tier 5 RPM daily quota = unusable in any session > 5 LLM calls. Re-add when paid Google key configured.

`MODEL_REGISTRY` also retains opt-in models (Groq Llama 3.3 70B, Ollama locals, Claude Sonnet/Opus, etc.) for `eval-models.ts` benchmarking.

**Quality audit rubric** (applied to each model's final team-json from 2026-04-25 runs against CLAUDE.md banned-items list, item-move interactions, system-prompt format conventions, Champions VGC strategic principles): A = clean; B = minor convention/strategic flaw (functions but reads as broken to a careful reader); D = illegal team (banned item OR moveset conflict that nullifies a slot).

## Next actions (in priority order)

1. **Smoke + commit** the 2026-04-25 session bundle. Touched files span earlier ships (D7-D9, R1-R3, A15) + tonight (paid routing in openrouter.ts + openai-compat.ts + types.ts, system-prompt v4.5, AVAILABLE_MODELS curation in llm.ts, scripts/test-team.ts, CLAUDE.md). Run any model in `/team` to smoke. Suggested commit: `git commit -m "feat(ux+rag+routing): Tier D, R1-R3, A15, system prompt v4.5, OpenRouter paid routing, test-team capture CLI"`.
2. **Retest `deepseek-v4-pro` periodically.** All 3 tool-supporting OpenRouter providers were simultaneously throttled today. Routing config (`provider.order: [DeepSeek, SiliconFlow, Together, Io Net]` + `require_parameters=true`) is correct — just need OpenRouter capacity to recover. Try: `npx tsx scripts/test-team.ts deepseek-v4-pro` after a few hours.
3. **Optional: paid Google API for gemini-2.5-flash.** If user wants this back in the dropdown, set a paid Google AI Studio key (currently free tier hits 5 RPM daily cap). Adapter at [src/lib/llm/gemini.ts](../src/lib/llm/gemini.ts) just needs the env var.
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

- **Budget:** Paid OpenRouter account confirmed 2026-04-25 (`is_free_tier: false`, $4.42/month usage). All 9 dropdown models are paid. Per-model pinning in `MODEL_REGISTRY.openrouterProviderOrder` favors first-party endpoints (typically cheapest AND least throttled). Jina permanently OFF. See [memory/project_no_paid_apis.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md) for legacy context (now partially superseded by paid OpenRouter usage); [memory/project_openrouter_paid_routing.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_openrouter_paid_routing.md) for the routing pattern.
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
