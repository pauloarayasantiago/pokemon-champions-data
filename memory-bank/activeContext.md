# Active Context

_Last updated: 2026-04-26 21:30 (post prompt-loop session). Purpose: one-page "right now" snapshot for next-agent handoff. Forward plan: [rag-master-plan.md](rag-master-plan.md). Detailed history: [progress.md](progress.md). Bug log: [errors.md](errors.md). Data-pipeline source-of-truth: [techContext.md § Data Pipeline](techContext.md#data-pipeline)._

> 🔬 **Prompt-loop session completed 2026-04-26** (11 iters, $8.16 of $13.50 budget, ~7h wall). v4.8 prompt UNCHANGED in production — every prompt edit attempted introduced regressions on a hardened 13-case dev suite. Real findings: (1) v4.8 is at a brittle local optimum for Gemini 3 Flash; (2) berries failure unfixable via prompt — needs structural item-type validator; (3) off-meta-required failure is `findCounters` calc-spam tool-loop bug — needs consecutive-tool-call cap in route.ts; (4) negative imperatives generalize beyond paragraph scope on Gemini 3 Flash. Full audit at [runs/prompt-loop/](../runs/prompt-loop/) — see HISTORY.md / BEST.md / RATIONALE.md / RESEARCH-INDEX.md (22+ findings). Surviving improvements (durable, NOT in production prompt): test predicate fixes, dev set 4→13 cases, acceptance-gate v2 with anti-cherry-pick check.

> ⚠️ **Multiple agents may be active in this repo.** Other webapp/UI changes (`src/app/globals.css`, `src/app/meta/page.tsx`, `src/app/api/pokemon/`, `src/components/ui/type-badge.tsx`, `src/lib/markdown.tsx`) appeared in the working tree this session and are NOT from the YouTube-triage track. Don't bundle them into a YouTube commit; check with the user about their provenance before any commit.

> ✅ **Whisper backfill completed 2026-04-26 02:30** (wall time ~4h 50min). **Saved 101 new transcripts (all via whisper, 0 via ytdlp** — captions endpoint stayed 429'd the entire run, validating the fallback architecture). 155 ytdlp attempts → all 429; 155 whisper attempts → 101 success + 54 audio-download failures (newer "Sign in to confirm you're not a bot" challenge — YouTube's tier-2 bot detection on the audio CDN, distinct from the captions 429). 24 candidates filtered by REJECT_KEYWORDS. **Total corpus: 212 transcripts** (was 110). Reindex run via `/reindex` skill — see chunk delta in [techContext.md](techContext.md). **Pending:** `git add data/transcripts/ memory-bank/ scraper_youtube.py scraper_youtube_whisper.py && git commit`.

## TL;DR

**RAG declared feature-complete 2026-04-25**. Active track since the pivot is **Tier D — Webapp UX**. Tier D Phase 1+2, A15 validator, R1-R3 RAG follow-ups all shipped earlier today.

**This session (2026-04-25 evening — YouTube triage + whisper fallback):** Discovered that A10's local YouTube scraper regressed (every 12h fire since 2026-04-23 returned `Saved: 0` — YouTube rate-limited the residential IP at the captions endpoint). Mitigated in **five** parts:

1. **Backend swap** — [scraper_youtube.py](../scraper_youtube.py) `get_transcript()` rewritten from `youtube-transcript-api` to `yt-dlp --write-auto-subs --impersonate Chrome` (different HTTP path + curl_cffi 0.14 browser TLS fingerprint).
2. **Volume controls** — `DELAY_SECONDS` 1→5 + new `MAX_FETCH_PER_RUN=20` env-overridable cap.
3. **429-streak early-exit** — `RATE_LIMIT_STREAK_ABORT=3` (env-overridable). Aborts after 3 consecutive 429s across BOTH methods, capping wasted time at ~15s.
4. **Schedule retune** — schtasks `pokemon-youtube-scraper` retuned 12h → daily 03:00. Daily aligns with VGC content publication; volume controls keep weekly worst-case at ~140 fetches vs. original ~2000.
5. **NEW — Whisper fallback as second method.** Per-video waterfall: yt-dlp tries first; if it returns no transcript (429 or no captions), [scraper_youtube_whisper.py](../scraper_youtube_whisper.py) downloads audio via yt-dlp -x (different YouTube CDN, **NOT rate-limited**) and runs faster-whisper `medium.en` on RTX 2070 SUPER (~10× realtime, ~2-3 min/video). End-to-end test 2026-04-25: yt-dlp 429'd → whisper picked up → saved 36 KB transcript with `source: whisper` frontmatter. Cap `MAX_WHISPER_PER_RUN=5` (heavier compute). Installed `faster-whisper==1.2.1` + `ctranslate2==4.7.1` + `medium.en` model (~1.5 GB at `~/.cache/huggingface/hub/`).

Bottom line: even with the captions endpoint blocked, we now successfully extract transcripts via the audio path. Verification gate is the 2026-04-26 03:00 daily fire on completely fresh search candidates. See [errors.md](errors.md) row "YouTube residential-IP rate-limit".

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

1. **M1 — Consecutive-tool-call cap in route.ts** (NEW 2026-04-26, ~30 LOC). Off-meta-required #1 fails because Gemini 3 Flash spam-calls `calc` 17× after `findCounters` returns, hitting the 20-iter cap. Reproducible 4× in prompt-loop iters 7/8/10. Prompt-only fixes generalize (iter 9 caused banned-item leak). Fix: after every tool call, if same tool name has fired N≥4 consecutively, inject "you have enough data — emit final blocks now" nudge into `messages` (same pattern as existing `citation_retry` / `team_retry` nudges). Should convert off-meta-required FAIL → PASS deterministically. See [errors.md](errors.md) row "Gemini 3 Flash spam-calls calc". File: [src/app/api/team/route.ts](../src/app/api/team/route.ts).
2. **M2 — Pre-flight item-type validator** (NEW 2026-04-26, ~80 LOC). all-different-berries fails because model's `Mega Pokemon = Mega Stone` heuristic resists 3 distinct prompt mechanisms (enumeration / priority / worked-example). Fix: build [lib/item-type-guard.ts](../lib/item-type-guard.ts) analogous to [lib/phantom-guard.ts](../lib/phantom-guard.ts). Detect item-type-constraint phrases ("all berries", "different berry per slot", "all type-boost"). Intercept the `team_result` event server-side; check each item's type in `items.csv`; if mismatch, inject corrective nudge ("the user requested berries — Gengarite is a Mega Stone. Replace it with one of: Sitrus, Lum, ..."). Prompt-only is empirically exhausted on this case. Wire in [src/app/api/team/route.ts](../src/app/api/team/route.ts) + eval-models.ts. See [errors.md](errors.md) row "Gemini 3 Flash item-type-constraint heuristic conflict".
3. **Verify YouTube weekly fire on 2026-04-26 03:00.** Check `scripts/logs/youtube-2026-04-26.log` Sunday morning + `git log --since="2026-04-26 03:00" --author="paulo"` for a `refresh: local youtube scrape` commit. **If `Saved: N>0`** → mitigation worked, observe across 2-3 weekly fires. **If still 429** → escalate: drop schedule entirely, switch to manual-only invocation, or revisit when IP-ban window closes (often days–weeks).
4. **Retest `deepseek-v4-pro` periodically.** All 3 tool-supporting OpenRouter providers were simultaneously throttled 2026-04-25. Routing config (`provider.order: [DeepSeek, SiliconFlow, Together, Io Net]` + `require_parameters=true`) is correct — just need OpenRouter capacity to recover. Try: `npx tsx scripts/test-team.ts deepseek-v4-pro` after a few hours.
5. **Optional: paid Google API for gemini-2.5-flash.** If user wants this back in the dropdown, set a paid Google AI Studio key (currently free tier hits 5 RPM daily cap). Adapter at [src/lib/llm/gemini.ts](../src/lib/llm/gemini.ts) just needs the env var.
6. **A14 — Pikalytics non-EN ASCII-Latin detection.** A6's `[^\x00-\x7f]` regex misses Italian/Spanish/French/Portuguese/German on common words. Currently SELF-RESOLVED as of 2026-04-25 (Froslass row is clean English) but the detector gap could cause a future regression. Fix candidate: cross-check scraped move names against canonical `moves.csv` and trigger retry/fallback when >50% don't match. Preventive — no current breakage.
7. **C4 — exclude `memory-bank/**` from indexer ingest.** Stale-warning noise on every memory-bank edit. 5-min fix in chunker ignore globs.

## Planned focused sessions

- ~~**Perfect the system prompt — dedicated session with research.**~~ **EXECUTED 2026-04-26**, outcome: prompt-only is exhausted for v4.8 + Gemini 3 Flash. Loop ran 11 iters across $8.16 of budget; every prompt edit attempted introduced regressions. v4.8 stays in production. Real improvements pivoted to structural fixes (M1 + M2 above). Full audit at [runs/prompt-loop/](../runs/prompt-loop/). **Open question for any future re-launch:** is the brittleness Gemini-3-Flash-specific, v4.8-specific, or general? Multi-model bake-off using the same 13-case suite would tell — see roadmap M3.

## Optional / deferred

- **M3 — Multi-model bake-off using prompt-loop's 13-case suite** (2026-04-26 idea). Re-run [scripts/prompt-loop/score.ts](../scripts/prompt-loop/score.ts) on `minimax-m2-7`, `minimax-m2-5`, `deepseek-v4-flash`, `kimi-k2-6`, `grok-4-1-fast`, `claude-sonnet-or` to see if the brittleness observed on Gemini 3 Flash is model-specific. ~$1.04/run × 5-6 models = ~$5-6. Would yield a per-model brittleness/coverage report. Only worth it after M1+M2 ship (so the same baseline applies to all).
- **R-prompt-trim** — relaxed-gate efficiency loop variant (2026-04-26 idea). Same prompt-loop infrastructure, but acceptance gate becomes `paired_score >= 0 AND prompt is >=3% shorter AND no regressions`. Tests whether v4.8 has redundancy that can be cut while preserving 24/26. Per Gemini 3 research, shorter prompts tend to follow instructions better. Only after M1+M2 (to remove the brittleness floor).
- **A1-alt-2** — schedule a 3-run agentic eval on `gemini-3-flash` (newer than the Gemini 2.5 Flash Lite tested in the original A1-alt bake-off). Could justify flipping the default if the banned-item hallucination from [project_gemini3_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemini3_eval.md) doesn't re-appear post-A4 + post-A15. Only worth it if there's appetite to switch defaults.
- **D4** — Mobile bottom-nav consistency audit across pages.
- **D5** — `/pokedex` & `/sets` polish (search-as-you-type, archetype/core filter).
- **D6** — Tailwind v4 design-token formalization (semantic color names: `--color-success`, `--color-info`).
- **A8 / A9** — CLI harness wrapper / harder eval tests. Tier-A residue, deferred unless concrete need surfaces.
- **B4** — Speed tier matrix proposal (2026-04-26). Pre-compute speed comparisons under speed-control modes (Tailwind, Trick Room, Sand Rush, Swift Swim, Chlorophyll, Surge Surfer) + `findSpeedTier(threat, mode?)` agent tool analogous to `findCounters`. Extends existing speed layer (matchup `speed_advantage` col, calc `speedUCurve`, [data/knowledge/speed_tiers.md](../data/knowledge/speed_tiers.md)). Aspirational — start when Phase 3 settles AND a real speed-tier question surfaces that current tools answer poorly. See [rag-master-plan.md § B4](rag-master-plan.md#b4--speed-tier-matrix-proposal-not-yet-started).

## Re-entry triggers for RAG work

Don't touch RAG further unless one fires:
- Real users surface a quality issue not caught by the eval suite
- New Champions patch ships (mechanic/roster delta)
- Budget unlocks paid APIs beyond the OpenRouter Gemma allowlist
- A9 demand emerges (paid premium tier)

## Observation gates pending

- **YouTube local task** (`pokemon-youtube-scraper` Windows schtasks, **NOW daily 03:00**, run-as-paulo). First post-mitigation fire: 2026-04-26 03:00 local. Pass = `Saved: N>0` in `scripts/logs/youtube-2026-04-26.log` (split between `via ytdlp` and `via whisper` in summary) AND a `refresh: local youtube scrape` commit by `paulo` on `main`. Fail = `Saved: 0` + `(rate-limit abort)` in summary → both endpoints throttled simultaneously, escalate per Next Action #1. Original 12h cadence and `youtube-transcript-api` backend regressed 2026-04-23 → 2026-04-25 (see [errors.md](errors.md) "YouTube residential-IP rate-limit"); current architecture is **two-method waterfall** — primary: yt-dlp + Chrome impersonation (cap-20/run, 5s delay, 3-streak 429 early-exit); fallback: faster-whisper medium.en on audio CDN (cap-5/run, ~2-3min/video on RTX 2070).
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
