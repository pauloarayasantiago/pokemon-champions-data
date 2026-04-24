# Pokemon Champions RAG — Master Plan (Canonical)

_Last revision: 2026-04-23 evening (post A5 + data-pipeline audit; A6/A7/A8/A9 from A5 findings, A10/A11/A12/A13 from data-freshness audit). This doc is the canonical forward plan. History is archived in [progress.md](progress.md); right-now state in [activeContext.md](activeContext.md); data-pipeline source-of-truth in [techContext.md](techContext.md#data-pipeline)._

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
| **A6** | **Japanese→English cleanup for 14 pikalytics rows** | A | **NEXT** | Archaludon/Charizard/Gyarados/Venusaur/Whimsicott/Gengar/Sylveon/Aegislash/Arcanine-Hisui/Corviknight/Froslass/Palafin/Talonflame/Gallade/Typhlosion-Hisui have raw Japanese in `top_moves`/`top_items`. Re-scrape with stricter language enforcement OR add dictionary translation at chunk-time |
| **A7** | **Retrieval hardening for "X+Y core WR" NL queries** | A | NEXT | Inline NL restatement of `meta_snapshot.md` top-cores table (e.g., "The Archaludon+Pelipper rain core has a 55.8% win rate"), OR add WR-pattern boost to `lib/rag/boost.ts` |
| A8 | CLI harness wrapper for eval parity | A | OPTIONAL | Capture `/lookup` + Read into `toolCallLog` shape so 3 N/A tests become applicable to Claude-via-CLI |
| A9 | Harder eval tests (adversarial retrieval) | A | OPTIONAL | Current 13-test suite saturates at Gemma 10/10 + Claude 10/10 — can't differentiate premium models. Add misleading-top-1, multi-hop, longer-synthesis cases |
| A10 | YouTube scraper on 2×/day cadence (cloud-ban-aware hybrid arch) | A | **SHIPPED (2026-04-23 evening, revised + scheduled)** | Initial ship added the step to [refresh.yml](../.github/workflows/refresh.yml); manual workflow_dispatch returned `Saved: 0 transcripts` (YouTube IP-bans cloud providers — see [errors.md](errors.md)). Reverted workflow step + `yt-dlp` pip dep. Final ship: [scripts/scrape-youtube-local.bat](../scripts/scrape-youtube-local.bat) invoked via Windows Task Scheduler on user's residential IP; commits+pushes new transcripts for GH Actions cron to reindex. `schtasks /create` executed same evening — task `pokemon-youtube-scraper` Ready, next fire 2026-04-24 07:57 local, 12h interval |
| A11 | Increase Pikalytics + Sheets cron frequency | A | **SHIPPED (2026-04-23 evening)** | Bundled with A10 — same cron edit. Both sources now fire 2×/day instead of every 3 days |
| **A12** | **Add Serebii scraper to cron (weekly / bi-weekly)** | A | NEXT (low urgency) | Static game data, but patches happen. Today it's manual-only — a patch would silently leave `pokemon_champions.csv` stale |
| A13 | Surface "last refreshed" staleness telemetry | A | NEXT (UX) | `pc_index_meta.file_mtimes` exists + `checkStaleness()` reads it — not surfaced to users. Expose on `/lookup` progress + webapp footer so users can see data age |
| Haiku-eval | Register + eval Haiku 4.5 / Sonnet 4.6 as web-agent providers | A | DEFERRED | Originally A5's scope before user reframed — only pursue if A9 delivers a differentiating test set |
| B1 | Phase 3 reranker retry (cross-encoder, post-merge in executor) | B | DEFERRED (reassess after Tier A) | Only if Tier A doesn't close UX gap |
| B2 | Subagents + progressive disclosure (split CLAUDE.md) | B | DEFERRED | Ergonomics; no user-visible urgency |
| C1 | eval-models.ts / chunker.ts splits | C | DEFERRED | Housekeeping; ship if actively blocking |
| C2 | Stage 6.3 P2 (LLM planner fallback, $var deps) | C | DEFERRED | Wait for concrete need |
| C3 | Late chunking | C | DEFERRED | BGE headroom check first |
| D | Webapp regression / Tailwind 4 unblock | Separate | OPEN TRACK | webapp/HANDOVER.md |

---

## Session findings (2026-04-23)

Appended post strategic reframe. Captures the 7-model bake-off + phantom interceptor ship in one place so future sessions don't re-read the progress.md entry to orient.

**Models evaluated** (all `--real-rag`, 13-test agentic suite, 1-run smoke unless noted):

| Model | Pass | Citations | Tok/pass | Latency | Est $/run | Verdict |
|---|---|---|---|---|---|---|
| Gemma 4 26B A4B (default, 3-run history) | 12-13/13 | 80-100% | 25k | 44s | ~$0.008 | **Retained as default** |
| Groq Llama 3.3 70B | 0/13 | n/a | n/a | n/a | free | NO-GO (tool_use_failed + 12k TPM) |
| GPT-OSS 20B | crashed | n/a | 550k (test 1) | 665s (test 1) | high | NO-GO (reasoning bloat + socket timeout) |
| qwen2.5-7b (Ollama local) | 8/13 | 60% | 17k | 100s | $0 | Best of 4 locals, still below bar |
| llama3.1-8b (Ollama local) | 4/13 | 20% | 17.4k | 124s | $0 | Below bar |
| qwen3:8b (Ollama local) | 4/13 | 40% | 8.9k | 136s | $0 | Behavior 0/5 (all timeouts); NOT upgrade over qwen2.5-7b |
| qwen2.5-coder:7b (Ollama local) | 2/13 | 0% | 34k | 73s | $0 | Coder variant fails retrieval entirely |
| DeepSeek V3.2 | 12/13 | 100% | 62k | 85s | ~$0.022 | Viable paid opt-in, not default-worthy |
| GLM-4.5-Air (3-run) | 13/12/12 | 100%/100%/100% | avg 92k (46/155/75) | avg 48s | **~$0.038** | Tightest citation floor; token variance disqualifies as default |
| Gemini 2.5 Flash Lite | 10/13 | 20% | 37k | 12s | ~$0.008 | Fast + cheap but chaotic (47 nudges) |

**Key insight:** Every LLM tested (including those matching Gemma's pass rate) failed `phantom_pokemon` at 1/3-3/3 rate. Switching LLMs does NOT fix this — it's systemic. Master plan's A4 reframed from "Gemma flake fix" to "agent-side interceptor (model-agnostic)".

**A4 interceptor shipped:** [lib/phantom-guard.ts](../lib/phantom-guard.ts) + wiring in [src/app/api/team/route.ts](../src/app/api/team/route.ts) (POST handler, post-meta/pre-loop) and [scripts/eval-models.ts](../scripts/eval-models.ts) (`runAgent()`). Reuses `PRE_EVO_MAP` (newly exported from [lib/team-validator.ts](../lib/team-validator.ts)) for 23 pre-evos + small `EXPLICIT_PHANTOMS` table (Amoonguss today; extensible). Hyphen-aware word-boundary match. 18 unit assertions pass; single-test `phantom_pokemon` smoke 1/1 in 0ms / 0 tokens.

**Bug fix:** [lib/rag.ts:223](../lib/rag.ts) default `RERANKER` fallback `"jina"` → `"none"`. Was wasting 300-500ms per RAG call on silent 403s. Retrieval baseline 0.853 unchanged.

**Registry additions in [scripts/eval-models.ts:59-78](../scripts/eval-models.ts):** `llama-3.3-70b` (Groq), `gpt-oss-20b`, `gemini-2.5-flash-lite`, `glm-4.5-air` (paid OR), `qwen3-8b`, `qwen2.5-coder-7b` (Ollama local). Plus new `GROQ_API` endpoint constant alongside `OLLAMA_LOCAL` / `OLLAMA_REMOTE`.

---

## Part A — Active priorities (user-value first)

### A1 — Groq Llama 3.3 70B eval · SHIPPED — NO-GO (2026-04-23)

0/13. Groq's server-side parser rejects Llama 3.3 70B's native XML tool-call format (`<function=name{...}/>`) even with OpenAI-format `tools` + `tool_choice: "auto"` in the request; separately, the free-tier 12k TPM cap can't fit the 13-test suite's ~4k tokens/call bursts. Registry entry retained in case Groq fixes the parser or the user opens a paid tier. Detail: [memory/project_groq_llama33_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_groq_llama33_eval.md).

### A2 — Ollama local model eval · SHIPPED — NO-GO (2026-04-23)

Four local models tested at Q4_K_M on RTX 2070 SUPER 8GB: qwen2.5-7b (8/13 — best), llama3.1-8b (4/13), qwen3:8b (4/13, behavior 0/5 all timeouts), qwen2.5-coder:7b (2/13, 0% citations). None cleared the 10/13 viable-local bar. "Smaller models lose coherence after 2-3 steps" pattern matches community reports. **Every local passed `phantom_pokemon` in 0.0s**, confirming the interceptor works model-agnostic. A genuine free local path would need 12GB+ VRAM (remote server) for a 14B+ Q4 model. Registry entries retained for reference. Memos: [project_qwen3_8b_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_qwen3_8b_eval.md), [project_qwen25_coder_7b_eval.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_qwen25_coder_7b_eval.md).

### A1-alt — OpenRouter paid bake-off · SHIPPED (2026-04-23)

User authorized paid OR credits; tested DeepSeek V3.2, GLM-4.5-Air (3-run), Gemini 2.5 Flash Lite, and GPT-OSS 20B. Full table in the "Session findings (2026-04-23)" section above. Verdict: none beat Gemma 4 26B A4B on cost+quality. DeepSeek is a viable paid opt-in (100% citation floor, 3× cost); GLM matches Gemma on pass rate but with 3.4× token-variance; Gemini 2.5 Flash Lite is fast + cheap but chaotic (20% citations). Registry entries retained as opt-ins. Memos in the memory/ folder.

### A3 — Content enrichment round (NEXT)

**Rationale.** Retrieval quality is a ceiling set by what's in the index. Users ask about the current meta — if the data is 3 months stale, no amount of boost tuning saves the answer. This is the highest-ROI "work on the data, not the code" phase.

**Tasks.**
- [ ] **Singles-meta coverage.** `data/knowledge/singles_meta.md` — Singles ladder diverges from Doubles; users sometimes ask. Write ~150-line doc covering top-20 singles usage, key differences from Doubles, banned-in-Singles mechanics.
- [ ] **Tier-list reconciliation.** `memory-bank/...`-style drift: `meta_snapshot.md` lists Incineroar-first; AngrySlowbroPlus's latest video puts Sinistcha-first. Update `meta_snapshot.md` with a reconciliation section or defer to the creator's take.
- [ ] **Fresh tournament data.** Run `/refresh pikalytics` + scrape any tournaments from the last 2 weeks. `/reindex` after.
- [ ] **Phase 12 items from old plan:** `creator_opinion` test verification (may already pass — confirm), TheDelybird's 5 template archetypes with EV pastes.

**Gates.**
- [ ] Reindex produces ≥ 2,329 chunks (baseline) + new content. No translation-missing warnings.
- [ ] Retrieval eval shows no regression on existing intents.
- [ ] Spot-check: `npx tsx scripts/search.ts "best singles Pokemon" 5` returns singles-meta.md in top-3.

**No commit gate** — content updates are low-risk; ship per item.

### A4 — Phantom Pokemon interceptor · SHIPPED (2026-04-23)

Reframed mid-session from "Gemma flake fixes" to "agent-side interceptor (model-agnostic)" after 7-model bake-off confirmed every LLM fails `phantom_pokemon` at ~1/3-3/3 rate. Fix shipped at [lib/phantom-guard.ts](../lib/phantom-guard.ts); wired into [src/app/api/team/route.ts](../src/app/api/team/route.ts) (post-meta, pre-agent-loop; emits `phantom_pokemon_refused` SSE event + content delta + done) and [scripts/eval-models.ts](../scripts/eval-models.ts) (`runAgent()` short-circuit). Exported `PRE_EVO_MAP` from [lib/team-validator.ts](../lib/team-validator.ts) (23 pre-evolutions) + added small `EXPLICIT_PHANTOMS` table (Amoonguss today; extensible). 18 unit assertions pass; single-test Gemma smoke goes from "fails 1/3 runs" to 1/1 in 0ms / 0 tokens. Detail: [memory/project_phantom_pokemon_systemic.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_phantom_pokemon_systemic.md).

**A4b (deferred):** Prompt hardening as belt-and-suspenders alongside the interceptor — tighten [src/lib/system-prompt.ts](../src/lib/system-prompt.ts) "MUST call pokedex first" clause. Low priority since the interceptor is the structural fix; revisit only if the interceptor shows gaps in production.

**Citation hallucination (separate from phantom_pokemon):** still open as a Gemma-side issue. Gemma occasionally fabricates chunk_ids even after the Phase 2 auto-retry nudge. Fix not shipped this session — the retry nudge in [lib/validate-citations.ts](../lib/validate-citations.ts) could be tightened to explicitly list the valid chunk_ids from the search result set. Fold into A3 or a future A4c if it proves user-visible.

### A5 — Claude Opus 4.7 self-eval · SHIPPED (2026-04-23)

**Outcome.** 10/10 on applicable tests. 3 tests marked N/A because they score programmatic `pokedex` / `validate_set` tool-call patterns that don't exist in the CLI surface. On the apples-to-apples 10-test subset, Claude-via-CLI ties Gemma 4 26B at 100%. Report: [team_outputs/claude-opus-self-eval-2026-04-23.md](../team_outputs/claude-opus-self-eval-2026-04-23.md). Memo: [memory/project_claude_opus_selfeval.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_claude_opus_selfeval.md).

**Strategic finding:** The 13-test eval saturates at this model tier. Both Gemma 4 26B and Claude Opus 4.7 score 10/10 on applicable tests — registering Sonnet 4.6 / Opus 4.7 as web-agent providers (the original A5 scope) won't produce a differentiating result on this test set. Differentiation requires harder tests (see A9) — deferred that work under `Haiku-eval` row.

**Three new-task findings** — see A6/A7/A8 below.

### A6 — Japanese→English cleanup for 14 pikalytics rows (NEXT)

**Rationale.** `awk` scan of [pikalytics_usage.csv](../pikalytics_usage.csv) finds 14/89 Pokemon with raw Japanese text in `top_moves` and/or `top_items` columns: Archaludon, Charizard, Gyarados, Venusaur, Whimsicott, Gengar, Sylveon, Aegislash, Arcanine-Hisui, Corviknight, Froslass, Palafin, Talonflame (both columns), plus Gallade (items only) and Typhlosion-Hisui (moves only). Example from Archaludon: `top_items=たべのこし:52.893|じしゃく:11.157|しろいハーブ:9.091|ヨプのみ:6.749|オボンのみ:4.270|...`. The Phase 8 `Accept-Language: en-US` header fix ([errors.md](errors.md) row 20) caught Italian but missed these — probably because Pikalytics served Japanese when the scraper ran for these particular mons, or the header didn't stick on cached entries.

**User-visible impact.** Any LLM asked about these 14 mons' items/moves will either regurgitate Japanese directly (bad UX), translate on the fly (token cost + mistranslation risk), or misuse the data (e.g., "Archaludon uses じしゃく" in a response). Also hurts retrieval — embedding a mixed-language chunk doesn't cluster well against English queries.

**Tasks.**
- [ ] Option A (re-scrape): re-run `/refresh pikalytics` targeted at the 14 affected Pokemon. Verify the `Accept-Language` header + a cache-busting parameter actually produces English output.
- [ ] Option B (translation layer): add a small Japanese→English item/move dictionary in the scraper (~30-50 items, 50-80 moves worth of coverage for these mons). Apply at scrape-time, not chunk-time (we ripped out chunk-time translation in Phase 1).
- [ ] Either option: `/reindex` after; verify with `npx tsx scripts/search.ts "Archaludon best items" 3` returning English names.

**Gate.** Zero Japanese characters in `top_moves` or `top_items` columns post-fix. Retrieval eval no intent regression.

### A7 — Retrieval hardening for "X+Y core WR" NL queries (NEXT)

**Rationale.** A5 test 13 (meta_core_attribution — "Archaludon+Pelipper rain core WR") exposed a gap: `/lookup "Archaludon Pelipper rain core win rate"` returned top-5 at similarity 0.11 — all `team_archetypes.md` chunks, NOT the `meta_snapshot.md:32` top-cores table where the actual 55.8% lives. Reformulating to "top cores win rate Archaludon Pelipper Electro Shot" surfaced it at rank 3 / 0.078 similarity (still low). Gemma's agent works around this via query-planner decomposition (fans "Archaludon+Pelipper rain WR" into multiple sub-queries), but a direct `/lookup` user (CLI, or a less-capable agent) hits the bare gap.

**Root cause.** The top-cores table is rendered as a markdown table with cells like `| Archaludon + Pelipper | 55.8% | 20.8% | Rain (Electro Shot) |`. The chunker produces a single chunk covering the whole table; the embedding gets dominated by the table-level words ("Top Cores by Win Rate") and loses the row-specific semantics.

**Tasks.**
- [ ] Option A (content tweak): add a short prose paragraph to [data/knowledge/meta_snapshot.md](../data/knowledge/meta_snapshot.md) after the top-cores table, like "The Archaludon+Pelipper rain core posts a 55.8% win rate (20.8% usage) driven by Electro Shot's instant fire in rain. Torkoal+Venusaur sun core 56.8%; Tyranitar+Excadrill sand rush core 56.2%." Natural-language phrasings retrieve better than table cells.
- [ ] Option B (boost tuning): add a "core WR" query-pattern detector to [lib/rag/boost.ts](../lib/rag/boost.ts) that boosts `meta_snapshot.md` chunks when the query contains `<PokemonA> + <PokemonB>` / `<PokemonA> and <PokemonB>` / "core" / "win rate" keywords co-occurring.
- [ ] Option A is cheaper and doesn't touch code. Do Option A first; only add Option B if Option A doesn't close the gap.

**Gate.** `/lookup "Archaludon Pelipper rain core win rate" 3` returns `meta_snapshot.md` chunk containing 55.8% in top-3. Retrieval eval no intent regression.

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

### A10 — YouTube scraper on 2×/day cadence (hybrid local+cron) · SHIPPED (2026-04-23 evening, revised + scheduled)

**User-specific ask (2026-04-23):** "we need to scrape from the youtube transcripts at least twice a day or however often the api allows for because it has very short limits and a lot of content is coming out."

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

### A11 — Increase Pikalytics + Sheets cron frequency · SHIPPED (2026-04-23 evening)

**What shipped.** Bundled into A10's cron edit. Both scrapers now fire 2×/day (`0 0,12 * * *`) instead of every 3 days. Zero extra lines — the existing Pikalytics + Sheets steps stay in place, they just fire more often.

**Gate.**
- [ ] No 429/403 from either source across 5 consecutive runs.
- [ ] Chunk count in `pc_index_meta` grows on at least one run per week (sanity: data IS churning).

### A12 — Serebii scraper in cron (weekly / bi-weekly, low urgency)

**Rationale.** Serebii is static game data — Pokémon rosters, moves, items, abilities. It only drifts when Nintendo patches Champions. Today `scraper.py` is manual-only; a patch drops and `pokemon_champions.csv` / `mega_evolutions.csv` / `moves.csv` silently go stale until someone notices.

**Tasks.**
- [ ] Add a weekly cron `0 4 * * 0` (Sunday @ 04:00 UTC) that runs `scraper.py` + reindex. Separate workflow file or extra job in `refresh.yml` — doesn't need to co-run with the high-frequency scrapers.
- [ ] `continue-on-error: true` — Serebii is Cloudflare-fronted; occasional 503s are routine.
- [ ] Log diff of row-counts per CSV — if `pokemon_champions.csv` suddenly gains 2 rows, that's a patch signal worth a channel notification (not in scope; flag as C-tier).

**Gate.**
- [ ] Weekly run completes cleanly for 2 consecutive weeks.
- [ ] Row-count of each output CSV stable (no unintended data loss).

### A13 — Surface "last refreshed" staleness telemetry (UX)

**Rationale.** Staleness plumbing already exists: [lib/rag.ts](../lib/rag.ts) `checkStaleness()` reads `pc_index_meta.file_mtimes` at query time and warns on stderr. Users never see this. If the pipeline is occasionally down (rate-limit, cron failure), users would benefit from knowing "this answer is based on data refreshed 4 days ago."

**Tasks.**
- [ ] Emit a `staleness` field in the `/lookup` progress stream + the webapp API response — include `{last_refresh_utc, hours_since}` per source.
- [ ] Add a small footer on the webapp `/team` page: "Data refreshed N hours ago."
- [ ] Consider a hard-banner when any source is > 72h stale (would have caught the "YouTube scraper not in cron" gap proactively).

**Gate.**
- [ ] Webapp footer renders with current age on every page load.
- [ ] `/lookup` progress stream includes `staleness` field on at least one stage.
- [ ] Test: manually bump a file's mtime and confirm the UI reflects the new age.

**Note.** Implementation is 1–2 hours of plumbing. Low technical risk, clear user value. Schedule after A10 (which prevents the most common "stale" scenario from occurring in the first place).

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

## Part C — Cut / permanently deferred

- **C1 — `scripts/eval-models.ts` / `lib/chunker.ts` refactors.** Housekeeping. 1341 LOC and 794 LOC respectively. Only ship if they're actively blocking work.
- **C2 — Stage 6.3 P2 extensions** (LLM planner fallback, `$variable` step dependencies). Wait for a concrete query that the rule-based planner can't handle.
- **C3 — Late chunking.** Deferred after Stage 5 EmbeddingGemma was abandoned; BGE alone hasn't shown the kind of ceiling that would motivate this.
- **Dead code to consider dropping:** Jina reranker client (`rerankCandidates` in [lib/rerank.ts](../lib/rerank.ts)) — balance permanently off, kept only as archeology. If we commit to B1 staying deferred for good, drop all three reranker clients + the `RERANKER` env-var dispatch in [lib/rag.ts](../lib/rag.ts) (lines 169-210). Net savings: ~230 LOC of dormant code. Flag as a housekeeping cleanup if/when we decide against B1 permanently.

---

## Constraints (unchanged)

- **Budget:** No paid APIs except OpenRouter Gemma 4 26B (free tier) and optional Anthropic if the user wants to pay. Don't propose "top up Jina." See [memory/project_no_paid_apis.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Golden set:** frozen this cycle. Don't edit to close gate failures.
- **Vercel Lambda 250MB bundle:** `onnxruntime-node` doesn't bundle reliably. Query embedding routes through HF Inference API on prod. See [memory/project_vercel_embedding_constraint.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Rollback triggers:** any intent >3% nDCG regression, agentic <12/13 on any of 3 runs, Lambda >240MB.

---

## Ollama quickstart (for A2)

```powershell
# 1. Install Ollama for Windows
# Download: https://ollama.com/download/windows
# Installer runs as a service; listens on http://localhost:11434

# 2. Pull the candidate models (Q4 quantized, fits 8GB VRAM)
ollama pull qwen2.5:7b-instruct-q4_K_M
ollama pull llama3.1:8b-instruct-q4_K_M

# 3. Verify
curl http://localhost:11434/api/tags
#   Should list both models.

# 4. Smoke test via the eval harness
cd C:\Users\paulo\Documents\LOCAL_WORKSPACE\1-pokemon-skill
npx tsx scripts/eval-models.ts --models qwen2.5-7b --real-rag --tests tool_workflow,stat_accuracy

# 5. If smoke passes, run the full 13-test suite
npx tsx scripts/eval-models.ts --models qwen2.5-7b --real-rag
npx tsx scripts/eval-models.ts --models llama3.1-8b --real-rag
```

**Storage note.** Each Q4 model is ~4-5 GB on disk. Budget ~10 GB for the two.

**Troubleshooting.**
- Tool-use failures: Ollama's OpenAI-compat layer supports `tools` parameter on qwen2.5 and llama3.1. If the model doesn't emit tool calls, check `src/lib/llm/ollama.ts` — it wraps `openai-compat.ts` which handles the translation.
- OOM: drop to `qwen2.5:7b-instruct-q3_K_M` (smaller) or reduce context via `--ctx-size` on the ollama server.

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
| Post A6 (Japanese cleanup) | expected ≥0.845 | 13/13 @ Gemma | Data hygiene; improves retrieval on 14 affected mons |
| Post A7 (NL "X+Y WR" hardening) | expected ≥0.845 | 13/13 @ Gemma | Closes the top-cores NL-query gap |
| **A10/A11 ship (2026-04-23 evening)** | expected ≥0.845 drifting up as new transcripts land | 13/13 @ Gemma (unchanged at ship; gains accrue as cron lands fresh data) | Freshness — YouTube + Pikalytics + Sheets all now 2×/day; lag 72h → 12h max. Next scheduled run will be the first validation |
| Post A12 (Serebii in cron) | expected ≥0.845 | 13/13 @ Gemma | Patch safety; no quality delta under steady state |
| Post A13 (staleness telemetry) | unchanged | unchanged | UX transparency only |
| Post A4c (citation hallucination fix, if pursued) | 0.853 | 13/13 + citation validity ≥95% | Tightens retry-nudge in lib/validate-citations.ts |
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
