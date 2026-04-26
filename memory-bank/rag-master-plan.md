# Pokemon Champions RAG — Master Plan (Canonical)

_Last revision: 2026-04-25 (RAG → UI/UX pivot; Tier D activated). This doc is the canonical forward plan. History is archived in [progress.md](progress.md); right-now state in [activeContext.md](activeContext.md); data-pipeline source-of-truth in [techContext.md](techContext.md#data-pipeline)._

---

## Mission

Build a RAG + agent harness that helps competitive VGC players build and plan teams for Pokemon Champions 2026. Two delivery surfaces:

- **Online web app** (`src/app/api/team/route.ts`): Next.js agent loop. Lightweight-model default (currently Gemma 4 26B via OpenRouter). Must work reliably without the user's machine being on.
- **Local CLI** (this conversation): I interpret the repo directly via `/lookup` (`scripts/search.ts`) and `/team` skills. Human-in-the-loop, higher reasoning budget.

Both surfaces pull from the same Supabase-backed RAG index. Retrieval is shared; only the model on top differs.

---

## 30-second catch-up

- **Retrieval:** nDCG@10 = **0.853** on the 100-case golden set (unchanged by the 2026-04-23 interceptor — it runs at the agent layer, not RAG). Citation validation (Phase 2) still hits chunk_ids 80-100%.
- **Online model:** `gemma-4-26b` (`google/gemma-4-26b-a4b-it` via OpenRouter, **paid $0.06/$0.33 per M, ~$0.008/run** — earlier docs mis-labeled this as free tier; only the 31B variant has a `:free` suffix). 12-13/13 pass on the 13-test agentic suite, ~25k tok/pass, ~44s/test avg. `phantom_pokemon` used to fail ~1/3 runs — **now fixed by the 2026-04-23 tool-layer interceptor** (short-circuits the agent loop when the user names a pre-evo or roster-excluded Pokemon).
- **7-model bake-off (2026-04-23):** tested Groq Llama 3.3 70B, GPT-OSS 20B, qwen2.5-7b, llama3.1-8b, DeepSeek V3.2, GLM-4.5-Air, Gemini 2.5 Flash Lite alongside Gemma. **No challenger beat Gemma on cost+quality.** DeepSeek matches at 3× cost; GLM matches at 5× cost with 3.4× token-variance. All but Gemma fail `phantom_pokemon` too — it's systemic, not Gemma-specific. Detail in [progress.md](progress.md) "Session 2026-04-23" entry.
- **Local CLI:** Claude Opus/Sonnet via this conversation. `/lookup` returns RAG results; I synthesize. Works well for open-ended analysis.
- **Provider keys available today:** OpenRouter (multiple paid + free), Anthropic (Sonnet 4.6, Opus 4.7), Groq (Llama 3.3 70B free but unusable — see memo), HF Inference. **Ollama local** now installed; qwen2.5-7b + llama3.1-8b pulled, both below viable bar at Q4.
- **Dormant code:** three reranker clients (Jina, Gemma pointwise, BGE cross-encoder) behind `RERANKER` env var. Default was silently firing Jina on every request before 2026-04-23 (fix: [lib/rag.ts:223](../lib/rag.ts) default now `"none"`).

---

## Strategic pivot (2026-04-25) — RAG → UI/UX

The RAG roadmap is **feature-complete for the current product surface**. All four user-value quality levers from the 2026-04-23 reframe shipped that session (model selection, content freshness, citation hardening, phantom interceptor). Diminishing-returns signals are now decisive:

| Signal | Reading | Verdict |
|---|---|---|
| Retrieval nDCG | Plateau at **0.844** for 2+ weeks (+0.8pp absolute over 13 phases) | Saturated; bounded by index content, not tuning |
| Agentic eval (13-test) | Gemma 13/13 + 13/13 + 12/13; Claude Opus 10/10 applicable | Suite ceiling — can't differentiate models |
| Citation validity | 80% → **100/100/100** after A4c | Resolved |
| Phantom Pokemon | 3/3 pass via interceptor (model-agnostic, 0 tokens) | Resolved structurally |
| Data freshness | YouTube + Pikalytics + Sheets 2×/day; Serebii weekly | At API ceiling |
| Tier A | A1-A7, A10-A13 shipped; A8/A9 explicitly "optional, low user value" | Tier complete |
| Budget constraint | No paid APIs outside OpenRouter Gemma | Hard ceiling |

**Decision.** Activate **Tier D — Webapp UX** (previously the open "webapp regression / Tailwind 4 unblock" track). Three concrete improvements scoped (D1/D2/D3 — see roadmap table). RAG re-entry only on these triggers: real-user quality complaint not caught by the eval suite, Champions patch ships, budget unlocks paid APIs, or A9 demand emerges.

**Phase 1 (passive RAG verification):** observation gates fire 2026-04-26 (YouTube task 24h gate), 2026-04-28 + 2026-05-05 (Serebii weekly cron). No keyboard time required.

---

## Strategic reframe (2026-04-23)

Through Phases 0-5 we moved retrieval from 0.849 → 0.853 (+0.4 pp) over ~2 weeks of structural work. Agentic pass rate has been flat at 12-13/13 the whole time. **The user-visible quality lever is not RAG tuning anymore.** The levers that actually move end-user experience:

1. **Which LLM drives the agent loop.** We've only benchmarked one: Gemma 4 26B. Groq's Llama 3.3 70B is already configured (free) and untested. Anthropic Haiku 4.5 and Sonnet 4.6 are configured (paid) and untested.
2. **Content freshness.** The golden set doesn't test this — but users ask about the current meta, fresh tournament results, tier list deltas. If the index is stale, retrieval quality doesn't matter.
3. **Agent ergonomics.** System prompt is 141 lines. CLAUDE.md is 159 lines. Both grew organically. Tighter prompts → faster, cheaper, more consistent answers.
4. **Known Gemma flakes.** `phantom_pokemon` (no-tools failure) and chunk_id hallucinations on some retrieval tests hurt trust. Not a RAG problem — an LLM behavior problem.

**Downgraded:** Phase 3 reranker retry. Two prior attempts regressed matchup 15-18%. Even with Phase 5's structural fix, the expected +0.02 matchup gain is marginal for typical user queries. Complexity tax (reranker client + executor plumbing + tuning) is high. Keep dormant, revisit only if Tier A fails to deliver user-visible wins.

---

## Roadmap status (live)

| # | Phase | Tier | Status | Owner next action |
|---|---|---|---|---|
| 0-5 | RAG infra + Phase 2 citation + Phase 4 split + Phase 5 executor | — | SHIPPED | History in [progress.md](progress.md) |
| A1 | Groq Llama 3.3 70B eval | A | **SHIPPED — NO-GO (2026-04-23)** | Tool parser rejects Llama native format + 12k TPM cap. Memo: `project_groq_llama33_eval.md` |
| A2 | Ollama local model eval (qwen2.5-7b + llama3.1-8b) | A | **SHIPPED — NO-GO (2026-04-23)** | 8/13 + 4/13 on Q4 smoke; registry retained for future stronger models |
| A1-alt | OpenRouter paid bake-off (DeepSeek V3.2, GLM-4.5-Air, Gemini 2.5 Flash Lite, GPT-OSS 20B) | A | **SHIPPED (2026-04-23)** | No challenger beat Gemma on cost+quality. Memos: `project_deepseek_v32_eval.md`, `project_glm_45_air_eval.md`, `project_gemini_25_flash_lite_eval.md` |
| A4 | Phantom Pokemon interceptor (model-agnostic) | A | **SHIPPED (2026-04-23)** | `lib/phantom-guard.ts` + wiring in route.ts + eval-models.ts. Single-test smoke 1/1 in 0ms |
| A3 | Content enrichment round | A | **SHIPPED (2026-04-23)** | Fresh Pikalytics + tournament CSVs; singles_meta.md; AngrySlowbroPlus viability section in meta_snapshot; TheDelybird templates in team_archetypes. Accepted team-intent -7.0% regression (fresh-data churn, not stale-doc). Baseline: [retrieval-post-A3.json](eval-baselines/retrieval-post-A3.json) |
| A4b | Prompt hardening follow-up (optional belt-and-suspenders alongside interceptor) | A | DEFERRED | Tighten system prompt "call pokedex first" — only if interceptor alone shows gaps |
| A5 | Claude Opus 4.7 self-eval on 13-test suite (CLI surface) | A | **SHIPPED (2026-04-23)** | 10/10 applicable, 3 N/A (programmatic tool-call predicates). Ties Gemma at ceiling. Report: [team_outputs/claude-opus-self-eval-2026-04-23.md](../team_outputs/claude-opus-self-eval-2026-04-23.md) |
| A6 | Multilingual locale flips in pikalytics scrape (originally framed as "JP→EN cleanup for 14 rows") | A | **SHIPPED (2026-04-23 evening)** | Scope proved wider than framed — Pikalytics intermittently serves JP/CN (trad+simp)/ES/DE/FR/KR depending on URL cache. Fix: cache-bust query param + retry + prior-EN fallback + non-ASCII detection + manual English seed for Floette-Eternal (permanently stuck). `scraper_pikalytics.py` self-heals across cron runs. See [errors.md](errors.md) row 47 for detail |
| A7 | Retrieval hardening for "X+Y core WR" NL queries | A | **SHIPPED (2026-04-23 late evening)** | Two-layer fix: prose restatement in [meta_snapshot.md](../data/knowledge/meta_snapshot.md) top-cores section + `+0.08` boost in [lib/rag/boost.ts](../lib/rag/boost.ts) gated on `\bcore\b` AND `\b(win rate\|winrate\|wr)\b`. Gate met: rain-core query returns meta_snapshot top-cores chunk at rank 3 (was absent from top-20). No eval regression |
| A8 | CLI harness wrapper for eval parity | A | OPTIONAL | Capture `/lookup` + Read into `toolCallLog` shape so 3 N/A tests become applicable to Claude-via-CLI |
| A9 | Harder eval tests (adversarial retrieval) | A | OPTIONAL | Current 13-test suite saturates at Gemma 10/10 + Claude 10/10 — can't differentiate premium models. Add misleading-top-1, multi-hop, longer-synthesis cases |
| A10 | YouTube scraper on 2×/day cadence (cloud-ban-aware hybrid arch) | A | **SHIPPED (2026-04-23 evening, revised + scheduled)** | Initial ship added the step to [refresh.yml](../.github/workflows/refresh.yml); manual workflow_dispatch returned `Saved: 0 transcripts` (YouTube IP-bans cloud providers — see [errors.md](errors.md)). Reverted workflow step + `yt-dlp` pip dep. Final ship: [scripts/scrape-youtube-local.bat](../scripts/scrape-youtube-local.bat) invoked via Windows Task Scheduler on user's residential IP; commits+pushes new transcripts for GH Actions cron to reindex. `schtasks /create` executed same evening — task `pokemon-youtube-scraper` Ready, next fire 2026-04-24 07:57 local, 12h interval |
| A11 | Increase Pikalytics + Sheets cron frequency | A | **SHIPPED (2026-04-23 evening)** | Bundled with A10 — same cron edit. Both sources now fire 2×/day instead of every 3 days |
| A12 | Add Serebii scraper to cron (weekly) | A | **SHIPPED (2026-04-23 late evening)** | New workflow [.github/workflows/refresh-serebii.yml](../.github/workflows/refresh-serebii.yml); cron `0 4 * * 0` (Sunday 04:00 UTC); `continue-on-error: true` on the scrape step given known Serebii fragilities (Mega X/Y, FORM_VARIANTS, Floette-Eternal); reindex follows with Supabase env wiring; auto-commit "refresh: weekly serebii scrape". Two-week observation gate (2026-04-28, 2026-05-05) still pending |
| A13 | Surface "last refreshed" staleness telemetry | A | **SHIPPED (2026-04-23 evening, commit `740ef9b`)** | New `getStaleness()` + `StalenessInfo` types in [lib/rag.ts](../lib/rag.ts) (5 source buckets, 60s cache, fs-drift detection); SSE event in [src/app/api/team/route.ts](../src/app/api/team/route.ts); staleness field in [src/app/api/team/health/route.ts](../src/app/api/team/health/route.ts) response; `<StalenessFooter>` expand-on-click grid in [src/app/team/page.tsx](../src/app/team/page.tsx); one-liner print in [scripts/search.ts](../scripts/search.ts) |
| Haiku-eval | Register + eval Haiku 4.5 / Sonnet 4.6 as web-agent providers | A | DEFERRED | Originally A5's scope before user reframed — only pursue if A9 delivers a differentiating test set |
| B1 | Phase 3 reranker retry (cross-encoder, post-merge in executor) | B | **PERMANENTLY DEFERRED (2026-04-23 late evening)** — dormant code removed | Marginal +0.02 matchup gain vs high complexity + 2 prior failed attempts. Cleanup ship removed all 3 reranker clients + dispatch + `boostMul` plumbing (~230 LOC). Re-introduction requires rebuild from git history |
| B2 | Subagents + progressive disclosure (split CLAUDE.md) | B | DEFERRED | Ergonomics; no user-visible urgency |
| C1 | eval-models.ts / chunker.ts splits | C | DEFERRED | Housekeeping; ship if actively blocking |
| C2 | Stage 6.3 P2 (LLM planner fallback, $var deps) | C | DEFERRED | Wait for concrete need |
| C3 | Late chunking | C | DEFERRED | BGE headroom check first |
| C4 | Exclude `memory-bank/**` from indexer ingest | C | OPEN | Stale-index warnings on plan-doc edits + planning chunks pollute retrieval. Add `memory-bank/` to chunker ignore globs. Discovered 2026-04-25 during gemini-3-flash run observation (see [progress.md](progress.md)). 5-min fix; ship when convenient |
| D1 | Mobile-friendly Team debugger (sidebar → Sheet on mobile) | D | **SHIPPED (2026-04-25)** | Convert `<aside>` (lg-only) to `<Sheet>`-backed bottom drawer + header toggle; preserve all existing debug components |
| D2 | Async UX hardening (retry, skeleton, empty-bubble fallback, debounce) | D | **SHIPPED (2026-04-25)** | Add retry button to transport-error card; skeleton loader for assistant pre-first-token; "stream ended early" fallback when content empty at done; debounce resubmits |
| D3 | Form & a11y baseline (`Label`/`FieldError`/`FormGroup` + ARIA) | D | **SHIPPED (2026-04-25)** | New components in [src/components/ui/](../src/components/ui); apply to `/team`, `/calc`, `/search`; ARIA labels + heading hierarchy + focus rings |
| D7+D9 | Clear assistant content on `iter_start` (iter > 0) | D | **SHIPPED (2026-04-25)** | Single edit in [src/app/team/page.tsx](../src/app/team/page.tsx) `applyEvent` — wipes accumulated content at every non-first iter. Handles both citation-retry duplicate (D7) and chain-of-thought thinking accumulation (D9, e.g. DeepSeek's ~6.8k chars of pre-final reasoning). Tool calls preserved across iters |
| D8 | Stop / Cancel button on `/team` | D | **SHIPPED (2026-04-25)** | `AbortController` ref in `streamReply()`, Send button swaps to destructive Stop button (`<Square>` icon) when `isStreaming`. AbortError caught silently with `errorStage: "cancelled"` instead of transport error. Necessary for prod given Vercel Lambda timeout |
| R1 | Audit chunk_id formats; fix misleading system-prompt example | R | **SHIPPED (2026-04-25)** | Audit found chunker emits 12 real prefixes (pokemon/mega/move/item/ability/mega-ability/updated-attack/team/usage/matchup/txt/md) — heterogeneity is by design, validator is correctly strict. Real bug: system-prompt example listed `knowledge:meta_snapshot.md#top-cores` which the chunker NEVER emits. Replaced with full real-shape list + actual `md:data/knowledge/meta_snapshot.md:5` example. Prompt version bumped to v4.2 |
| R2 | Enrich `pokedex` tool output with Pikalytics usage stats | R | **SHIPPED (2026-04-25)** | New `loadPikalyticsContext()` + `lookupPikalytics()` helpers in [src/lib/tools.ts](../src/lib/tools.ts) (module-level cache, parses `pikalytics_usage.csv`). Pokedex case appends `competitive: {rank, usagePct, topMoves, topItems, topAbilities, topTeammates, source}` block (capped 4-6 each) when the mon is in the index. Tool description updated. Smoke test [scripts/smoke-pokedex-enrich.ts](../scripts/smoke-pokedex-enrich.ts) confirms: 89 rows loaded, Froslass enriched (rank 19, 10% usage), low-usage mons (Krookodile, Flapple) gracefully fall through to base-only response |
| R3 | Strip wasteful "Pokemon Champions"/"Regulation M-A" prefix at search tool | R | **SHIPPED (2026-04-25)** | New `stripChampionsPrefix()` regex in [src/lib/tools.ts](../src/lib/tools.ts) `executeSearch()` — anchored, case-insensitive, handles "Pokemon Champions ", "Champions ", "Reg M-A ", "Regulation MA ", "PoChamp " variants. Smoke test confirms strip on all variants, no-op on clean queries, preserves original if strip would yield <3 chars. System-prompt also nudges models to skip the prefix |
| A14 | Pikalytics non-EN detection misses ASCII-Latin scripts (Italian) | A | OPEN | Discovered during R2 smoke test 2026-04-25: `pikalytics_usage.csv` Froslass row currently in Italian (Bora=Blizzard, Protezione=Protect, Velaurora=Aurora Veil, etc.). A6's `[^\x00-\x7f]` detector misses Italian/Spanish/French because they use the standard Latin alphabet without diacritics on common words. Fix: cross-check scraped move names against canonical English `moves.csv` and trigger retry/fallback when >50% don't match. Surfaced from R2 smoke. Detail in [progress.md](progress.md) |
| A15 | Team-level structural validation (item clause + species clause + SP caps) | A | **SHIPPED (2026-04-25 night)** | New [lib/validate-team.ts](../lib/validate-team.ts) (extract+validate+nudge formatter, mirrors validate-citations.ts shape). Wired into [src/app/api/team/route.ts](../src/app/api/team/route.ts) (one-shot `team_retry` SSE event + final `team_result` event for observability) and [scripts/eval-models.ts](../scripts/eval-models.ts) (parallel one-shot retry + AgentResult/TestResult `teamValid`/`teamRetryFired`/`teamDuplicateItemCount`/`teamDuplicateSpeciesCount`/`teamSpreadIssueCount` fields). Catches: items appearing >1×, Pokemon appearing >1×, per-stat >32 SP, total >66 SP. Smoke test [scripts/smoke-validate-team.ts](../scripts/smoke-validate-team.ts) confirms detection on real-world bad teams: Gemma `aw0u5a` (Milotic+Kingambit spread 84) and Kimi `6nfkt7` (2× Black Glasses). Runs BEFORE citation validation in both surfaces (a team-retry regenerates the whole response, so citation check on the failed draft would be wasted) |
| M | 9-model comparison + paid OpenRouter routing + system prompt v4.5 + tier classification | M | **SHIPPED (2026-04-25 late night)** | (1) Built [scripts/test-team.ts](../scripts/test-team.ts) capture CLI; (2) discovered adapter sent NO `provider` field — fixed in [src/lib/llm/openrouter.ts](../src/lib/llm/openrouter.ts) `buildConfig()` with `allow_fallbacks=false + sort=throughput + require_parameters=true` + per-model `provider.order` first-party pinning via new `MODEL_REGISTRY.openrouterProviderOrder` field; (3) system prompt v4.5 (`2026-04-25.v4.5-reemit-both`): rule 3 strengthened (MUST omit pokedex/validate/calc claims), STOP after team-json+claims-json, rule 6 fixed (re-emit BOTH blocks on citation_retry — v4.4 "claims only" version regressed Grok+M2.7 to `team=no-block`); (4) `AVAILABLE_MODELS` curated by tier in [src/lib/llm.ts](../src/lib/llm.ts); dropped `gemini-2.5-flash` (Google free quota); (5) 7 new memory memos. **Result: 7/9 models valid teams + 9/9 citations on test prompt.** Outstanding: deepseek-v4-pro (transient OpenRouter capacity, all 3 tool-supporting providers throttled today), gemini-2.5-flash (Google free-tier daily quota — needs paid Google key, separate from OpenRouter). Tier classification (S/A/B/C/X) documented in [systemPatterns.md § Model Tier Classification](systemPatterns.md). 5 batch logs in `runs/_batch{1..5}.log` |
| B3 | Harness improvements detected from M comparison (per-iter tokens, route short-circuit, validate_set chunk_ids, etc.) | B | **OBSERVED (2026-04-25)** | 6 small wins captured in [Part B § B3](#b3--harness-improvements-detected-from-9-model-comparison-2026-04-25). None block current usage |

---

## Session findings (eval bake-offs)

Full per-model eval data lives in `.claude/projects/.../memory/project_<model>_eval.md` files. Cross-session memory is the canonical source per model. The 2026-04-23 7-model bake-off retained Gemma 4 26B as default; no challenger beat on cost+quality. The 2026-04-25 5-model real-world team-build compare (Gemini 3 Flash, Gemma, DeepSeek V4 Flash, Kimi K2.6, DeepSeek V4 Pro [429]) is captured in [progress.md](progress.md) "Compare" entries — full headlines: Gemini 3 Flash 21.3s 8/8 citations (fastest, default for `/team`); Kimi K2.6 18.2 min slowest; DeepSeek V4 Flash 11.3 min most thorough; Gemma 58.8s with retry (eval default). 4 untested: MiniMax M2.7, MiniMax M2.5, Grok 4.1 Fast, DeepSeek V4 Pro (BYOK needed).

**Key cross-session insight:** every LLM fails `phantom_pokemon` at 1/3-3/3 rate. Switching LLMs does NOT fix it — A4 interceptor is the structural model-agnostic fix. Same for citation hallucination (A4c) and team-level constraints (A15) — structural validators, not prompt-only nudges.

---

## Part A — Active priorities (user-value first)

All A1-A13 + A15 SHIPPED rows have detail in the roadmap-status table above and full archive entries in [progress.md](progress.md). A14 (Pikalytics ASCII-Latin detection gap) is the only OPEN item — see roadmap row for fix candidate. A8/A9 remain optional (deferred unless concrete need surfaces).



_A3-A7, A10-A13 detail moved to [progress.md](progress.md). Roadmap-status table above carries the canonical 1-line summary per phase._


**Gates.**
- [ ] Reindex produces ≥ 2,329 chunks (baseline) + new content. No translation-missing warnings.
- [ ] Retrieval eval shows no regression on existing intents.
- [ ] Spot-check: `npx tsx scripts/search.ts "best singles Pokemon" 5` returns singles-meta.md in top-3.

**No commit gate** — content updates are low-risk; ship per item.

### A8 — CLI harness wrapper _(optional)_

**Rationale.** Master plan Mission names "Local CLI (this conversation)" as a first-class delivery surface. But A5 revealed 3/13 eval tests are structurally inapplicable to the CLI surface because they score programmatic `pokedex` / `validate_set` call patterns from `toolCallLog`. Claude-via-CLI uses `/lookup` + direct Read instead — same semantic work, different tool names.

**Tasks.**
- [ ] Build a thin wrapper around `runAgent()` in [scripts/eval-models.ts](../scripts/eval-models.ts) that, when invoked with a Claude-CLI-backed provider, maps `/lookup` calls to `{name: "pokedex", args: {name: <query>}}` entries in `toolCallLog` and Read calls on `mega_evolutions.csv` / `pokemon_champions.csv` to `{name: "validate_set", args: {name: <row>}}`.
- [ ] Register an "anthropic-cli" provider in the model registry with this shim.
- [ ] Re-run 13-test suite with the shim — score should move from 10/10 applicable → 13/13 full.

**Note.** Not urgent — A5's report already documents the N/A commentary. Only pursue if we want to sell the CLI path as a first-class eval target.

### A9 — Harder eval tests _(optional)_

**Rationale.** Current 13-test suite saturates: Gemma 4 26B = 13/13, Claude Opus 4.7 = 10/10 applicable. At this ceiling the eval can't differentiate premium models. If we want to justify a paid-premium tier (Sonnet 4.6 / Opus 4.7 as web-agent providers), we need tests where a bigger model actually scores higher.

**Candidate test types.**
- **Misleading top-1 chunk:** construct a query where the top-retrieved chunk is *almost* right but contradicted by a better chunk at rank 3-5. Score on whether the agent uses the better source.
- **Multi-hop:** "What held item does the top-used Pokemon on rain teams use?" — requires querying rain archetype → identifying the top user → then looking up that user's items. Single-shot retrieval won't satisfy.
- **Longer synthesis:** "Compare the Torkoal+Venusaur sun core vs the Archaludon+Pelipper rain core — which would you bring into a timer-pressure tournament and why?" Score on fact coverage from both sides + defensible argument.
- **Intentional pre-evo / banned-item traps beyond the current phantom test:** probe whether model actually reads CLAUDE.md banned-items list or just memorizes that Life Orb is missing.

**Tasks.**
- [ ] Draft 5-10 new test cases in the style of existing eval-models.ts tests.
- [ ] Validate with Gemma baseline first: if Gemma still hits 10/10, tests aren't differentiating. Tune difficulty until Gemma sits at 6/10-8/10.
- [ ] Then run Sonnet 4.6 / Opus 4.7 against the harder set to justify "premium tier" if the delta is >2 tests.

**Note.** Only pursue if user actually wants a premium-tier option. Today there's no clear demand.

_A10-A13 detail moved to [progress.md](progress.md). Roadmap-status table above carries the canonical 1-line summary per phase._



**Initial attempt (reverted same session).** [.github/workflows/refresh.yml](../.github/workflows/refresh.yml) got a `Scrape YouTube transcripts` step between Sheets and reindex; `yt-dlp` added to pip install. Manual `workflow_dispatch` (run 24867630255) returned green but `Saved: 0 transcripts` — every fetch failed with `YouTube is blocking requests from your IP. [...] most IPs from cloud providers are blocked by YouTube`. `continue-on-error: true` hid it. Root cause: `youtube-transcript-api` categorically blocks cloud provider IPs (GH Actions runs on Azure). Not a rate-limit — a blanket IP-range ban. Step + `yt-dlp` dep reverted. Logged in [errors.md](errors.md) "YouTube cloud-IP ban".

**Final architecture (hybrid).**
- **Cloud (GH Actions, 2×/day):** Pikalytics + Sheets scrape + reindex. Cron `0 0,12 * * *` (unchanged from initial A10/A11 ship — still correct).
- **Local (Windows Task Scheduler, 2×/day):** [scripts/scrape-youtube-local.bat](../scripts/scrape-youtube-local.bat) wraps `python scraper_youtube.py`, logs to `scripts/logs/youtube-YYYY-MM-DD.log`, commits `data/transcripts/` only, then `git pull --rebase --autostash origin main` + push. Runs on user's residential IP which YouTube doesn't block. Scrape-only — reindex is picked up by the next GH Actions cron fire.

**Scheduled task.** Registered 2026-04-23 evening:
```bash
schtasks /create /tn "pokemon-youtube-scraper" \
  /tr "C:\Users\paulo\Documents\LOCAL_WORKSPACE\1-pokemon-skill\scripts\scrape-youtube-local.bat" \
  /sc hourly /mo 12 /ru paulo /it
```
`schtasks /query` reports Status=Ready, Schedule=Every 12 Hours, Run As=paulo, Next Run=2026-04-24 07:57 local. `/it` fits the desktop use case (fires only when logged on, no stored password).

**Why not a Claude-product scheduler.** Investigated all three tiers: `/loop` and Desktop Scheduled Tasks require Claude Code / Desktop to be open (unsuitable for unattended 12h cadence); Cloud Routines run on Anthropic infra → same cloud-IP ban + daily caps. Windows Task Scheduler is the correct tool — native residential IP, zero app dependency, no caps.

**Constraints respected.**
- `scraper_youtube.py` unchanged. `DELAY_SECONDS=1` + filename-based dedup against `data/transcripts/` already present.
- `git pull --rebase --autostash` hardens the script against GH Actions cron pushing between scheduled fires (smoke test revealed the edge case where `.claude/scheduled_tasks.lock` + unstaged team_outputs broke a plain rebase).
- `.bat` exits 0 unconditionally so Windows Task Scheduler doesn't flag empty runs as failures.

**Gate.**
- [x] YAML still parses; `.bat` runs cleanly on the user's machine (smoke test 2026-04-23 19:49 CST: 22 new transcripts saved, commit `dfc3664` pushed to main as author `paulo`).
- [x] Scheduled task registered + verified via `schtasks /query`.
- [ ] After 2 scheduled fires (~24h), `data/transcripts/` has new `.md` files dated ≥ 2026-04-24 and a `refresh: local youtube scrape` commit by `paulo` on main (NOT `github-actions[bot]`).
- [ ] Subsequent GH Actions cron reindex commit includes chunks from those new transcripts.

**Rollback.** `schtasks /delete /tn "pokemon-youtube-scraper" /f` + `git revert` the .bat. Transcripts stay — they accumulate additively.

**Risk remaining.** User's machine must be logged on when schtasks fires. Desktop use case makes this fine; if it becomes a gap, options are (a) drop `/it` and store password for unattended runs, (b) add `/wake` flag, (c) migrate to a residential-IP proxy in GH Actions (no budget today).

---

## Part B — Deferred / reassess

### B1 — Phase 3 reranker retry

**Status:** DEFERRED. Phase 5 structurally unblocks this (reranker can live at the post-merge stage in `executePlan` against the original query), but the ROI is questionable:

- Two prior attempts regressed matchup 15-18% under the old executor.
- Even if Phase 5 fixes the structural issue, the expected +0.02 matchup gain is marginal for typical user queries.
- Maintenance cost: reranker client + executor plumbing + tuning iterations.

**Revisit trigger:** if Tier A closes out and retrieval remains the bottleneck on specific user complaints. Then wire `rerankWithCrossEncoder` between `collectForceIncludes` and `applyBoosts` in [lib/query-executor.ts](../lib/query-executor.ts), flip `boostMul=20`, re-run gates.

### B2 — Subagents + progressive disclosure

**Status:** DEFERRED. Ergonomics-only — splits CLAUDE.md persona + `/team` rules into restricted-tool subagents (`team-build`, `team-evaluate`, `team-counter`). Improves maintainability but no user-visible urgency. Revisit after Tier A.

---

### B3 — Harness improvements detected from 9-model comparison (2026-04-25)

**Status:** OBSERVED, NOT YET SHIPPED. The 5-batch comparison surfaced harness-level patterns worth capturing as future work. None block current usage; each is a small win.

- **B3a — Per-request token usage in SSE.** [src/app/api/team/route.ts](../src/app/api/team/route.ts) doesn't emit token totals; the test-team CLI shows `tokens: not exposed by /api/team`. Adding `usage` from the LLM `done` event would let us compare per-model cost per run without parsing logs. ~5 LOC in route.ts (plumb `delta.usage` from `compatChatStream`'s final event into the route's `done` SSE).
- **B3b — Route loop short-circuit on first valid team_result + citation_result.** Gemma's iter 4 emits a valid team-json with valid citations, then iter 5 emits a near-duplicate (small SP rebalance) — wasting ~35s of regen. Cause: route currently runs the team validator + citation validator unconditionally even when the first emission is clean. Fix: short-circuit to `done` after the first iteration where `teamRetryFired === false && citationRetryFired === false && team_result.valid && citation_result.valid`. Doesn't help quirky models (MiniMax) but trims best-case latency.
- **B3c — `validate_set` could return chunk_ids.** When a Pokemon's competitive set matches a known Pikalytics top-set, `validate_set` could include the originating `usage:<slug>` chunk_id in its response so models can legitimately cite their validation source. Currently the strict v4.5 rule 3 ("MUST omit pokedex/validate/calc data from claims") leaves no room to cite legitimate Pikalytics-backed set choices. Same idea for `pokedex` (cite `pokemon:<slug>` when the data came from the chunked CSV row). Tradeoff: subtly weakens v4.5 rule 3's strictness; may need careful prompt wording so models don't backslide to citation hallucination.
- **B3d — Per-iteration tool-call cap (anti-spam).** Grok and MiniMax M2.7 hit 8-9 tool calls in single iterations (parallel pokedex × 4-7). Most are redundant. A soft cap of 6 per iteration (with the rest deferred to next iter) would smooth latency and surface the model's prioritization. Probably only worth doing if a future model emits 15+ in one turn.
- **B3e — Explicit RAG schema doc in system prompt.** Models guess what `usage:*` vs `team:*` vs `md:*` vs `pokemon:*` chunks contain. A 5-line schema in the system prompt ("`usage:<slug>` = Pikalytics row with usage %, top moves/items/abilities/teammates; `team:<id>` = tournament team roster + items; `md:<path>:<n>` = markdown knowledge chunk; `pokemon:<slug>` = base data CSV row from `pokemon_champions.csv`") would help models cite better and make the right tool choices. Keep concise — the prompt is already 150 lines.
- **B3f — 429 retry-with-backoff for `deepseek-v4-pro`.** All 3 of its tool-supporting providers were simultaneously throttled today. A single retry after `retry_after_seconds` (which OpenRouter returns in error metadata) would handle the brief windows. Risk: masks systemic throttling; only worth shipping if the user wants V4 Pro specifically and accepts longer effective latency.

**Revisit trigger:** B3a/B3b are quick wins with no downside — ship if you have 30 minutes free. B3c-B3e are research-needed (have to test against the model lineup to confirm they don't regress). B3f only when V4 Pro becomes a recurring user choice.

---

## Part C — Cut / permanently deferred

- **C1 — `scripts/eval-models.ts` / `lib/chunker.ts` refactors.** Housekeeping. 1341 LOC and 794 LOC respectively. Only ship if they're actively blocking work.
- **C2 — Stage 6.3 P2 extensions** (LLM planner fallback, `$variable` step dependencies). Wait for a concrete query that the rule-based planner can't handle.
- **C3 — Late chunking.** Deferred after Stage 5 EmbeddingGemma was abandoned; BGE alone hasn't shown the kind of ceiling that would motivate this.
- **Dormant reranker cleanup — SHIPPED (2026-04-23 late evening).** Committed to B1 permanently deferred; dropped `lib/rerank.ts` (3 clients — Jina, Gemma pointwise, BGE cross-encoder), `RERANKER` env-var dispatch in [lib/rag.ts](../lib/rag.ts), and `boostMul` plumbing through [lib/rag/boost.ts](../lib/rag/boost.ts) + [lib/query-executor.ts](../lib/query-executor.ts). Net ~230 LOC removed. Progress event `rerank_end` renamed to `boost_end`; stage-color map in [src/app/team/page.tsx](../src/app/team/page.tsx) updated. To re-introduce a reranker later: rebuild the clients (git history preserves the prototypes) + wire in post-merge in `executePlan` between `collectForceIncludes` and `applyBoosts` + plumb `boostMul` back through `applyBoosts`.

---

## Constraints (unchanged)

- **Budget:** No paid APIs except OpenRouter Gemma 4 26B (free tier) and optional Anthropic if the user wants to pay. Don't propose "top up Jina." See [memory/project_no_paid_apis.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Golden set:** frozen this cycle. Don't edit to close gate failures.
- **Vercel Lambda 250MB bundle:** `onnxruntime-node` doesn't bundle reliably. Query embedding routes through HF Inference API on prod. See [memory/project_vercel_embedding_constraint.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Rollback triggers:** any intent >3% nDCG regression, agentic <12/13 on any of 3 runs, Lambda >240MB.

---

## Expected trajectory

| After | Overall nDCG | Agentic pass rate | Commentary |
|---|---|---|---|
| Pre-Phase-5 | 0.849 | 12/13 | Prior baseline |
| Phase 5 ship (2026-04-23 AM) | 0.853 | 12-13/13 @ Gemma | Executor redesign |
| A1/A2 bake-off (2026-04-23) | 0.853 | 12-13/13 @ Gemma (retained) | No challenger beat Gemma on cost+quality |
| A4 interceptor ship (2026-04-23) | 0.853 confirmed unchanged | 13/13, 13/13, 12/13 with phantom_pokemon 3/3 | `team_json` is the Run-3 flake; phantom_pokemon short-circuits pre-LLM |
| A3 ship (2026-04-23 PM) | 0.845 (-0.94%) | 13/13 @ Gemma, 100% cit-rate, 16327 tok/pass | Team intent -7.0% (fresh-data churn accepted) |
| **A5 ship (2026-04-23 evening)** | unchanged | **Claude Opus 10/10 applicable, 3 N/A** | CLI surface ties Gemma on ceiling; eval saturation identified → A9 backlog |
| **A7 ship (2026-04-23 late evening)** | unchanged (boost trigger doesn't match any golden case) | 13/13 @ Gemma | Closes the top-cores NL-query gap for direct `/lookup` users; planner-decomposition-free path now surfaces 55.8% |
| **A10/A11 ship (2026-04-23 evening)** | expected ≥0.845 drifting up as new transcripts land | 13/13 @ Gemma (unchanged at ship; gains accrue as cron lands fresh data) | Freshness — YouTube + Pikalytics + Sheets all now 2×/day; lag 72h → 12h max. Next scheduled run will be the first validation |
| **A13 ship (2026-04-23 evening)** | unchanged (read-only side-channel) | unchanged | UX transparency — staleness now visible on webapp footer + `/lookup` CLI; closes feedback loop on A10/A11 |
| **A6 ship (2026-04-23 late evening)** | unchanged at ship; expected pure-win on retrieval over time as previously-multilingual rows settle to English | 13/13 @ Gemma (unchanged at ship; pikalytics chunks now uniformly English so cleaner clustering) | Scope reframe from "JP→EN 14 rows" to "multilingual locale flips" (7 locales observed); structural fix self-heals across cron runs |
| **A12 ship (2026-04-23 late evening)** | unchanged (new workflow; no retrieval impact until Nintendo patches Champions) | 13/13 @ Gemma (unchanged at ship) | Patch safety — Serebii CSVs now refresh weekly; two-scheduled-fire observation gate (2026-04-28, 2026-05-05) still pending |
| **A4c ship (2026-04-23 late evening)** | unchanged (agent-layer change, no retrieval impact) | **12-13/13 @ Gemma, citation validity 100/100/100** (up from 80/100/80 baseline), ~27k avg tok/pass | Retry nudge now enumerates valid chunk_ids; closes the guess loop that was letting the model re-hallucinate after the first invalid-ID nudge |
| If B1 ever ships | 0.87-0.90 est | 12-13/13 | Marginal UX gain vs infra cost |

---

## Memory-bank hygiene rules (2026-04-23)

To prevent context bloat from derailing future sessions:

1. **This doc** (`rag-master-plan.md`) is the **lean forward plan**. Shipped phases are single-table rows. Detail goes to `progress.md`. Target ≤ 400 lines.
2. **[progress.md](progress.md)** is the **archive**. Grows over time; no compression of old entries. Future agents read it for reasoning about past decisions, not for forward planning.
3. **[activeContext.md](activeContext.md)** is the **right-now snapshot**. Overwrite freely between sessions. Target ≤ 150 lines.
4. **[techContext.md](techContext.md)** + **[systemPatterns.md](systemPatterns.md)** describe **current architecture**. Update when architecture changes; don't pile on history.
5. **[errors.md](errors.md)** is **bug-log-only**. Don't add architecture notes.
6. **[productContext.md](productContext.md)** + **[projectbrief.md](projectbrief.md)** are **stable anchors**. Only update if the mission changes.
7. **When a phase ships**: one table-row update here + one detailed entry in `progress.md` + activeContext TL;DR flip. Don't mirror the same detail in three docs.
8. **When strategically reframing** (like today): add a "Strategic reframe (<date>)" section here, don't delete the prior structure blind; preserve the "what changed and why" trail.

---

## Pointers

- **Canonical research:** `research/agent-rag-research.pdf` (untouched).
- **Memory (cross-session):** [project_no_paid_apis.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md), [project_default_model.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_default_model.md), [project_gemma_agentic_quirks.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemma_agentic_quirks.md), [project_gemini3_eval.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemini3_eval.md), [project_vercel_embedding_constraint.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md), [project_phase3_reranker_blocked.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_phase3_reranker_blocked.md).
- **Key code:**
  - [lib/rag.ts](../lib/rag.ts) — `query()` orchestrator + `rawCandidates` helper.
  - [lib/rag/](../lib/rag) — Phase 4 module split: `classify.ts`, `route.ts`, `force-includes.ts`, `boost.ts`, `structured-filter.ts`.
  - [lib/query-planner.ts](../lib/query-planner.ts) / [lib/query-executor.ts](../lib/query-executor.ts) — Stage 6.3 planner + Phase 5 post-merge executor.
  - [lib/rerank.ts](../lib/rerank.ts) — three reranker clients (dormant).
  - [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5.
  - [src/app/api/team/route.ts](../src/app/api/team/route.ts) — agent loop with citation validation.
  - [src/lib/llm.ts](../src/lib/llm.ts) + [src/lib/llm/](../src/lib/llm) — multi-provider LLM dispatch (OpenRouter, Anthropic, Gemini, Groq, Ollama).
  - [src/lib/system-prompt.ts](../src/lib/system-prompt.ts) — agent system prompt (v4.1).
  - [src/lib/tools.ts](../src/lib/tools.ts) — 4 tools: search, calc, pokedex, validate_set.
  - [scripts/eval-models.ts](../scripts/eval-models.ts) — 13-test agentic eval harness, all providers wired.
  - [scripts/eval-retrieval.ts](../scripts/eval-retrieval.ts) — 100-case retrieval eval.
  - [evals/golden-set.jsonl](../evals/golden-set.jsonl) — golden set.
- **Eval baselines:**
  - [retrieval-post-phase5-executor.json](eval-baselines/retrieval-post-phase5-executor.json) — current canonical retrieval snapshot (0.8529 overall).
  - [retrieval-phase4-refactor.json](eval-baselines/retrieval-phase4-refactor.json) — Phase 4 = pre-Phase-5 baseline.
  - Older Phase 3 reranker snapshots retained for history; see progress.md.

---

## Future-agent quickstart

If you're landing cold:

1. Read the **30-second catch-up** above.
2. Check the **Roadmap status** table — find the first "NEXT" row in Tier A. That's your next action.
3. Read [activeContext.md](activeContext.md) for what was touched last session.
4. Only dive into [progress.md](progress.md) if you need historical reasoning about past decisions.
5. Before proposing work: ask "does this move user-visible quality?" If no, it belongs in Tier C.
6. Don't re-propose: paid APIs outside the allowlist, Italian translation layer, Stage 3 Contextual Retrieval, Stage 5 EmbeddingGemma, editing the golden set.
