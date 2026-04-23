# Pokemon Champions RAG — Master Plan (Canonical)

_Last revision: 2026-04-23, post strategic reframe. This doc is the canonical forward plan. History is archived in [progress.md](progress.md); right-now state in [activeContext.md](activeContext.md)._

---

## Mission

Build a RAG + agent harness that helps competitive VGC players build and plan teams for Pokemon Champions 2026. Two delivery surfaces:

- **Online web app** (`src/app/api/team/route.ts`): Next.js agent loop. Lightweight-model default (currently Gemma 4 26B via OpenRouter). Must work reliably without the user's machine being on.
- **Local CLI** (this conversation): I interpret the repo directly via `/lookup` (`scripts/search.ts`) and `/team` skills. Human-in-the-loop, higher reasoning budget.

Both surfaces pull from the same Supabase-backed RAG index. Retrieval is shared; only the model on top differs.

---

## 30-second catch-up

- **Retrieval:** nDCG@10 = **0.853** on the 100-case golden set. Planner-decomposed queries (vsPair / counter-archetype / team-archetype) now apply force-includes + boosts post-merge against the user's original query (Phase 5 fix). Citation validation (Phase 2) hits chunk_ids 80-100% per run across 3 runs — agent-side hallucinations, not retrieval.
- **Online model:** `gemma-4-26b` (`google/gemma-4-26b-a4b-it` via OpenRouter, free). 12-13/13 pass on the 13-test agentic suite, ~25k tok/pass, ~44s/test avg. Known flake: `phantom_pokemon` (1/3 rate) where the model fails to refuse a query about an unavailable Pokemon without consulting tools.
- **Local CLI:** Claude Opus/Sonnet via this conversation. `/lookup` returns RAG results; I synthesize. Works well for open-ended analysis.
- **Provider keys available today** (no infra changes): OpenRouter, Anthropic (Sonnet 4.6, Opus 4.7), Groq (Llama 3.3 70B free), HF Inference. **Not yet:** Ollama local (not installed).
- **Dormant code:** three reranker clients (Jina, Gemma pointwise, BGE cross-encoder) behind `RERANKER` env var. Default is RRF + boosts only. Not re-enabled this cycle.

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
| **A1** | **Groq Llama 3.3 70B eval (free, already configured)** | A | **NOT STARTED → NEXT** | Run 13-test agentic suite, compare vs Gemma 4 26B |
| **A2** | **Ollama install + local model eval** | A | **NOT STARTED** | Install Ollama, pull qwen2.5-7b + qwen2.5:14b-Q4, run eval |
| **A3** | **Content enrichment round** | A | **NOT STARTED** | Singles meta doc; tier list reconciliation; fresh tournament data |
| **A4** | **Gemma flake fixes** (phantom_pokemon + chunk_id hallucination) | A | **NOT STARTED** | Prompt tightening + measure via 3-run variance |
| A5 | Haiku 4.5 / Sonnet 4.6 eval (paid premium tier) | A | NOT STARTED | Optional — run if user wants a paid-quality option |
| B1 | Phase 3 reranker retry (cross-encoder, post-merge in executor) | B | DEFERRED (reassess after Tier A) | Only if Tier A doesn't close UX gap |
| B2 | Subagents + progressive disclosure (split CLAUDE.md) | B | DEFERRED | Ergonomics; no user-visible urgency |
| C1 | eval-models.ts / chunker.ts splits | C | DEFERRED | Housekeeping; ship if actively blocking |
| C2 | Stage 6.3 P2 (LLM planner fallback, $var deps) | C | DEFERRED | Wait for concrete need |
| C3 | Late chunking | C | DEFERRED | BGE headroom check first |
| D | Webapp regression / Tailwind 4 unblock | Separate | OPEN TRACK | webapp/HANDOVER.md |

---

## Part A — Active priorities (user-value first)

### A1 — Groq Llama 3.3 70B eval

**Rationale.** Already configured (`GROQ_API_KEY` set, `llama-3.3-70b` in `MODEL_REGISTRY`). Free tier. Groq's infrastructure is known for low latency (often <10s/call vs Gemma 4 26B's ~2-8s per tool call via OpenRouter). Never run through the 13-test suite.

**Tasks.**
- [ ] `npx tsx scripts/eval-models.ts --models llama-3.3-70b --real-rag` × 1 smoke run. Confirm it doesn't crash on tool use.
- [ ] Full 3-run variance: `for i in 1 2 3; do npx tsx scripts/eval-models.ts --models llama-3.3-70b --real-rag; done`.
- [ ] Compare vs Gemma 4 26B baseline (13/13, 13/13, 12/13 @ ~25k tok, 44s avg): pass rate, tok/pass, latency, citation validity.

**Gates.**
- [ ] ≥ 12/13 on all 3 runs.
- [ ] Citation validity ≥ 80% on retrieval-category tests (matching Gemma's floor).
- [ ] No forbidden hits.

**Decision after eval.**
- If Llama 3.3 70B beats Gemma on pass rate AND latency: flip `DEFAULT_MODEL` in [src/lib/llm.ts](../src/lib/llm.ts). Online webapp gets faster, free, higher-quality responses.
- If it matches at lower latency: make it the default but keep Gemma as fallback.
- If it underperforms: document and skip.

### A2 — Ollama local model eval

**Rationale.** Not installed today. Local inference means (1) the local CLI doesn't burn OpenRouter credits, (2) user could serve the webapp from their own machine via a tunnel if desired, (3) offline capability. System constraints: Windows 11, RTX 2070 SUPER 8GB VRAM → fits Q4 models up to ~8B cleanly, can push 14B with partial CPU offload.

**Tasks.**
- [ ] Install Ollama: https://ollama.com/download/windows
- [ ] Start service: `ollama serve` (should auto-start as service on install)
- [ ] Pull models: `ollama pull qwen2.5:7b-instruct-q4_K_M` then `ollama pull llama3.1:8b-instruct-q4_K_M`. Optional stretch: `ollama pull qwen2.5:14b-instruct-q4_K_M` (will be slow but tests reasoning ceiling).
- [ ] Verify: `curl http://localhost:11434/api/tags` lists the models.
- [ ] Eval: `npx tsx scripts/eval-models.ts --models qwen2.5-7b,llama3.1-8b --real-rag` (single-run smoke first, then 3-run variance on the winner).

**Gates.**
- [ ] At least one local model hits ≥ 10/13 on the 13-test suite.
- [ ] Tool use works (Ollama supports OpenAI-compatible function calling on qwen2.5 + llama3.1).
- [ ] No OOM on the user's 8GB VRAM.

**Decision after eval.**
- Local Ollama viable → add `/team --model qwen2.5-7b` as a free offline path for local CLI work.
- Local Ollama not viable at 7-8B → consider whether a remote Ollama box (rented GPU) is worth it for `remote-qwen32b`. Probably not unless the user has a GPU server already.

### A3 — Content enrichment round

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

### A4 — Gemma flake fixes

**Rationale.** Phase 5's 3-run variance exposed two Gemma behaviors that directly hurt user trust:
1. `phantom_pokemon` test: Gemma sometimes answers from training data without calling tools (1 fail in 3 runs). Run-3 had 0 tools, 4330 tokens, failed.
2. Citation hallucination: Run-3 had 3/37 invalid chunk_ids even after auto-retry nudge. Gemma occasionally fabricates plausible-looking chunk IDs.

**Tasks.**
- [ ] `phantom_pokemon`: strengthen system prompt directive — "IF the user names a Pokemon, you MUST call `pokedex` BEFORE answering. Do not answer from memory even if you think you know." Verify via re-run of the failing test.
- [ ] chunk_id hallucination: tighten the retry nudge in [lib/validate-citations.ts](../lib/validate-citations.ts) to explicitly list the valid chunk_ids from the search result set, so the retry has the true IDs to pick from.
- [ ] Full 3-run variance to measure improvement.

**Gates.**
- [ ] ≥ 12/13 on all 3 runs (unchanged from Phase 5 gate).
- [ ] `phantom_pokemon` passes on ≥ 2/3 runs (up from 2/3 currently).
- [ ] Citation validity ≥ 95% on retrieval-tagged tests (up from 80-100% currently).

**Target commit:** `fix(agent): Gemma tool-first directive + retry nudge lists valid chunk_ids`.

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
| Today (Phase 5) | 0.853 | 12-13/13 @ Gemma 4 26B | Baseline |
| Post A1 (Groq Llama 3.3 70B default) | 0.853 (unchanged) | 13/13 expected @ faster latency | Same retrieval, better LLM |
| Post A2 (Ollama local) | 0.853 | 10-12/13 @ qwen2.5-7b | Free tier for local CLI; quality tradeoff vs 26B |
| Post A3 (content enrichment) | 0.853-0.86 | — | Users get better answers on current meta; may not move the frozen-golden-set nDCG |
| Post A4 (flake fixes) | 0.853 | **13/13 on all 3 runs** + citation validity ≥95% | Direct trust improvement |
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
