# Pokemon Champions RAG — Master Plan (Canonical)

_Last revision: 2026-04-23 (post 7-model bake-off + phantom-Pokemon interceptor ship). This doc is the canonical forward plan. History is archived in [progress.md](progress.md); right-now state in [activeContext.md](activeContext.md)._

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
| **A3** | **Content enrichment round** | A | **NOT STARTED → NEXT** | Singles meta doc; tier list reconciliation; fresh tournament data |
| A4b | Prompt hardening follow-up (optional belt-and-suspenders alongside interceptor) | A | DEFERRED | Tighten system prompt "call pokedex first" — only if interceptor alone shows gaps |
| A5 | Haiku 4.5 / Sonnet 4.6 eval (paid premium tier) | A | NOT STARTED | Optional — run if user wants a premium option |
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
| qwen2.5-7b (Ollama local) | 8/13 | 60% | 17k | 100s | $0 | Below bar |
| llama3.1-8b (Ollama local) | 4/13 | 20% | 17.4k | 124s | $0 | Below bar |
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

qwen2.5-7b: 8/13 @ 17k tok/pass, 60% citation validity, 100s/test avg. llama3.1-8b: 4/13 @ 17.4k tok/pass, 20% citation validity, 124s/test. Neither hit the 10/13 viable-local bar; the "smaller models lose coherence after 2-3 steps" pattern matches community reports for this class. Registry entries retained for future stronger local models. qwen3:8b pull was in-flight at end of session; if smoke finishes a future session can add a memo.

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

### A5 — Haiku 4.5 / Sonnet 4.6 eval _(optional premium tier)_

**Rationale.** If the user wants a "best-quality, pay a bit more" path for complex queries (full team audits, large counter-team requests), Anthropic models are available. Worth a quick eval so the option is measurable.

**Tasks.**
- [ ] `npx tsx scripts/eval-models.ts --models haiku-4-5 --real-rag` × 1 (if registered; if not, skip — model needs registry entry).
- [ ] `npx tsx scripts/eval-models.ts --models sonnet-4-6 --real-rag` × 1.
- [ ] Document: pass rate, tok/pass, estimated $/test.

**Decision.** If Sonnet 4.6 hits 13/13 at <$0.10/query for a team-building call, document as the "premium" option but leave default as Gemma 4 26B or Llama 3.3 70B (whichever wins A1).

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
| **A4 interceptor ship (2026-04-23)** | **0.853 confirmed unchanged** | **13/13, 13/13, 12/13** with phantom_pokemon 3/3 | `team_json` is the new Run-3 flake (pre-existing). phantom_pokemon now short-circuits pre-LLM. Citation still 80-100% (Gemma-side hallucination, separate A4c) |
| Post A3 (content enrichment) | 0.853-0.86 | — | Users get better answers on current meta; may not move the frozen-golden-set nDCG |
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
