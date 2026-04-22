# Pokemon Champions RAG — Master Plan (Canonical)

_Last revision: 2026-04-21, post Stage 6.3. This doc is the canonical forward-looking plan; stage-by-stage history lives in [progress.md](progress.md)._

---

## 30-second catch-up

- **Current baseline:** retrieval nDCG@10 = **0.849** on the 100-case golden set (Jina OFF, Stage 4.6); 13-test agentic eval 12/13 at ~22k tok/pass for Gemma 4 26B.
- **Shipped:** Stages 0–2 (eval harness + 100-case golden set), 3/4/4.6 (routing + chunking + precision refinements), 6.1 (Self-RAG routing gate), 6.3 (Plan-and-Execute DAG).
- **Abandoned:** Stage 5 (EmbeddingGemma — Italian not a requirement → rolled back). Stage 3 Contextual Retrieval + 6.2 CRAG dropped (paid APIs).
- **Key constraint:** no paid APIs **except** OpenRouter Gemma 4 26B. Jina is permanently OFF (no balance top-up). See [memory/project_no_paid_apis.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md).
- **Next move:** Phase 1 cleanup → Phase 2 Gemma pointwise reranker (single highest-leverage retrieval win). See Part 4 below.

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
| 6.3 | Rule-driven Plan-and-Execute DAG ([lib/query-planner.ts](../lib/query-planner.ts) + [lib/query-executor.ts](../lib/query-executor.ts)) + agent-loop `Promise.all` over tool calls ([src/app/api/team/route.ts:160](../src/app/api/team/route.ts)) | Retrieval flat (Stage 4.6 saturated); framework in place for Phase 4 executor redesign |

### What was abandoned or dropped

- **Stage 5 EmbeddingGemma (MRL-384).** Built end-to-end dual-write shadow, fully evaluated, rolled back. Italian turned out to be a non-requirement; on pure English Gemma is −1.3% overall nDCG and −6.6% on `team` intent. Supabase shadow column dropped via migration `stage5_rollback_drop_embedding_v2`. Dormant evidence: `evals/golden-set-bilingual.jsonl` + `memory-bank/eval-baselines/retrieval-shadow-*.json` (untracked).
- **Stage 3.1–3.2 Contextual Retrieval** (paid Haiku ingestion) — dropped for cost.
- **Stage 3.3 post-hoc Haiku claim-support check** — dropped for cost.
- **Stage 6.2 CRAG per-chunk grader** (paid Haiku per call) — dropped for cost.
- **Revised Stage 3 scope (forced-JSON + `chunk_id` validator)** — was planned as the free part of Stage 3, **never shipped**. See Phase 5 below.
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
- **All numbers above are Jina OFF.** Every baseline going forward is Jina OFF until Phase 2 ships a free reranker.

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

| Concern | Files | Stage touches |
|---|---|---|
| Query pipeline orchestrator | [lib/rag.ts](../lib/rag.ts) — 1083 LOC, ripe for split (see Phase 3) | 1, 3, 4, 4.6, 6.3 |
| Query decomposition | [lib/query-planner.ts](../lib/query-planner.ts) (rules-based), [lib/query-executor.ts](../lib/query-executor.ts) (parallel fan-out + merge) | 6.3 |
| Embedding | [lib/embed.ts](../lib/embed.ts) — BGE-small-en-v1.5, HF Inference fallback for Vercel | 1, 5 (abandoned) |
| Reranker | [lib/rerank.ts](../lib/rerank.ts) — Jina client (currently returns null); sha256 cache | 1.3, Phase 2 |
| Chunking | [lib/chunker.ts](../lib/chunker.ts) — 794 LOC, 11 chunker functions | 3, 4, 5 (residue to delete Phase 1) |
| Indexing | [scripts/index-data.ts](../scripts/index-data.ts) | 1, 3, 5 |
| Retrieval eval | [scripts/eval-retrieval.ts](../scripts/eval-retrieval.ts), [evals/golden-set.jsonl](../evals/golden-set.jsonl) | 2 |
| Agentic eval | [scripts/eval-models.ts](../scripts/eval-models.ts) — 1341 LOC, ripe for split (see Phase 8) | 0, 2, 6 |
| LLM dispatch + system prompt | [src/lib/llm.ts](../src/lib/llm.ts), [src/lib/system-prompt.ts](../src/lib/system-prompt.ts), [src/lib/llm/*.ts](../src/lib/llm) | 3 (revised — unshipped), 5, 6 |
| Agent loop | [src/app/api/team/route.ts](../src/app/api/team/route.ts) | 6.3 (Promise.all) |
| Tool definitions | [src/lib/tools.ts](../src/lib/tools.ts) | 6.3 |
| Supabase schema | `supabase/migrations/` | 1, 3, 4, 5 |

### Force-include helpers in `lib/rag.ts` (target of Phase 3 extraction)

Six blocks inside `query()` that inject specific chunks into the candidate pool before the boost layer:

1. **Rules doc mechanic keywords** — when query contains `change|differ|banned|nerf|how does` tokens, FTS-match against `champions_rules.md`.
2. **Banned-item bullets** — fetch all `list_kind=banned-item` bullets, filter in-memory by whether query text contains any bullet's `metadata.entries`.
3. **Phantom pre-evo section** — FTS-match phantom name against rules doc.
4. **Phantom-evolved co-surface** — direct ID fetch `pokemon:<evolved>` when `route.phantomEvolved` is set.
5. **vsPair primary chunks** — fetch both Pokemon rows via `ilike` on CamelCase names.
6. **Type-chart on vsPair** — translate vsPair sides' types via `getPokemonTypes()`, FTS-match type sections.

Plus exact-entity force-include (move/item/strategic-Pokemon by id).

### Boost layer (`lib/rag.ts` lines ~800–1038)

~200 LOC applying 14 categories of domain-specific scoring adjustments (calibrated to RRF scale ~0.02–0.035, multiplied by `boostMul=20` when a reranker is active). Covers tier baselines, exact-entity matches, structured results, strategic intent, rules doc mechanic lift, theory routing, archetype matching, vsPair boost, phantom-evolved priority. Critical to extract as `applyBoosts()` in Phase 3.

---

## Part 4 — Forward roadmap (13 phases)

Each phase is one focused session. Run both retrieval + agentic eval between phases so regressions are catchable at the boundary.

### Phase 1 — Cleanup + clean baseline (half session)

**Goal:** clear Stage 5 residue; establish clean post-6.3 reference.

- Delete the Italian translation layer in [lib/chunker.ts](../lib/chunker.ts) (`translatePairs()` + call sites) and `lib/translations.json` (2,383 entries).
- Delete `evals/golden-set-bilingual.jsonl` (100-line manual IT translation fixture).
- Delete the two `retrieval-shadow-2026-04-21T20-*.json` snapshots in `memory-bank/eval-baselines/`.
- Reindex: `npx tsx scripts/index-data.ts --force`.
- Full 100-case retrieval eval with planner ON, snapshot to `memory-bank/eval-baselines/retrieval-post-stage6.3-clean.json`.

**Gate.** All intents within ±0.5% of Stage 4.6 baseline.

**Commit.** `chore(stage5): remove Italian translation residue`.

### Phase 2 — Gemma pointwise reranker ⭐ (1 session)

**Goal:** replace dropped Jina path with free Gemma-based reranker. Lands the Stage 1.3 goal that's been open since the start; biggest single retrieval win.

**Design rationale.** Pointwise (not listwise) because Gemma's known JSON-completeness flake is fatal for a single listwise call but survivable for pointwise — individual candidate retries don't lose the whole rerank. Also caches per-candidate.

**Implementation.**
- Add `rerankWithGemma(query, candidates)` to [lib/rerank.ts](../lib/rerank.ts) alongside the existing `rerankCandidates()` (Jina, kept for future if budget changes).
- Between hybrid RPC and boost layer in `query()`, take top-40 candidates. For each: prompt Gemma with `{query, candidate_snippet}` and ask for a 0.0–1.0 relevance score. Parse, validate, default to 0.5 on parse fail.
- Cache by `sha256(normalize(query) ‖ sorted(candidate_ids).join(","))` keyed lookup (reuse existing cache infrastructure from Jina path).
- `boostMul=20` when active (existing mechanic — keeps the additive boost layer meaningful on top of reranker scores in [0,1]).
- Graceful fallback to RRF ordering on timeout / parse fail / OpenRouter 5xx.

**Cost.** ~12k input + 2k output tokens/rerank ≈ $0.001/query. User pre-approved.

**Gate.** matchup nDCG ≥ 0.77 (from 0.740), counter ≥ 0.72 (from 0.691), overall ≥ 0.87. Agentic 3-run variance holds ≥ 12/13.

**Commit.** `feat(rag): Gemma pointwise reranker [Stage 1.3 replacement]`.

### Phase 3 — `lib/rag.ts` split (1 session)

**Goal:** prerequisite for Phase 4. Pure refactor, behavior-preserving.

- `rag/classify.ts` — `classifyQuery()`, `QueryIntent`, all keyword lists, name/move/item/type dictionaries.
- `rag/route.ts` — `routeQuery()`, `QueryRoute`, `ARCHETYPE_PATTERNS`, `PHANTOM_TO_EVOLVED`.
- **`rag/force-includes.ts`** — key extraction: `collectForceIncludes(question, intent, route, supabase): Promise<Map<string, ForcedChunk>>` wraps all 6 force-include blocks. Unblocks Phase 4.
- `rag/boost.ts` — `applyBoosts(candidates, intent, route, question, boostMul): Result[]` — the 200-LOC scoring layer.
- `rag/structured-filter.ts` — `runStructuredFilter()`.
- `lib/rag.ts` shrinks to the `query()` orchestrator (~100 LOC).

**Gate.** Retrieval eval bit-for-bit identical to Phase 2 baseline.

**Commit.** `refactor(rag): split lib/rag.ts into focused modules`.

### Phase 4 — Executor redesign (1 session)

**Goal:** close the aspirational Stage 6.3 nDCG gap (sub-queries currently can't out-score the original's boosted chunks).

- Drop the original query from `executePlan()`'s parallel batch.
- After sub-query merge: call `collectForceIncludes(originalQuery, intent, route, supabase)`, inject into merged pool, then `applyBoosts(pool, originalIntent, originalRoute, originalQuery, boostMul)`, sort, slice topK.
- Net effect: sub-queries contribute their diverse candidates, force-includes/boosts still key off the user's original wording (Stage 4.6 invariant preserved), sub-query chunks now compete.

**Gate.** matchup ≥ 0.79 (further +0.02), counter ≥ 0.73, adversarial holds ≥ 0.68 (force-includes still fire against original).

**Commit.** `feat(rag): Stage 6.3 executor redesign — sub-queries compete with post-merge force-includes`.

### Phase 5 — Revised Stage 3: forced-JSON + `chunk_id` validation (1 session)

**Goal:** land the only unshipped faithfulness defense from the master plan. Free, orthogonal to retrieval.

- System-prompt change: final answer MUST be `{"answer": string, "claims": [{"text": string, "chunk_ids": string[]}]}`.
- Server-side validator in [src/lib/llm.ts](../src/lib/llm.ts) or new middleware: for each claim, verify every `chunk_id` is in the set returned by `search` calls this conversation. On invalid, auto-retry once with a system nudge ("chunk_id X was not in your retrieved results — re-ground or remove the claim").
- Add agentic eval metric: `citation_validity_rate`.
- Gemma JSON-repair layer: tolerate double-braced, trailing commas, markdown fences.

**Gate.** Agentic pass rate holds ≥ 12/13. Citation validity ≥ 95% on the 5 retrieval-category tests.

**Commit.** `feat(llm): forced-JSON output with chunk_id validation [Stage 3 revised]`.

### Phase 6 — Gemma behavior flakes (half session, can be inline)

**Goal:** fix the two known Gemma quirks.

- `team_json` 1/3 failure: prompt tightening to emit the fenced block earlier. Phase 5's forced-JSON may fix this incidentally.
- `tournament_retrieval` 1/4 flake: system-prompt directive — force `search` before any `pokedex` lookup when query contains tournament/meta keywords (partial directive exists, needs strengthening).

**Gate.** 3-run agentic variance → 13/13 on all 3 runs.

**Commit.** `fix(agent): Gemma team_json + tournament_retrieval flake mitigations`.

### Phase 7 — Stage 7a Subagents + progressive disclosure (1–2 sessions)

**Goal:** shift from CLAUDE.md monolith to per-workflow subagents. Independent of embedding model (no longer gated on Stage 5).

- Create `.claude/skills/pokemon/SKILL.md` as new top-level skill.
- Split CLAUDE.md persona + `/team` rules into three subagents with restricted tool allowlists:
  - `team-build` — full RAG + calc + validate_set + pokedex.
  - `team-evaluate` — RAG read-only + calc (no validate_set; evaluates existing, doesn't propose).
  - `team-counter` — RAG + calc (restricted set forces counter-archetype path).
- Trim CLAUDE.md to: lookup-first rule, Champions ≠ S/V delta, banned items, roster. Move persona and workflow detail into the skill.
- Verify via webapp smoke + CLI: `/team build rain`, `/team counter Dragonite`.

**Gate.** Output parity with main branch on smoke cases.

**Commit.** `feat(skills): /team subagents + progressive disclosure [Stage 7a]`.

### Phase 8 — `scripts/eval-models.ts` split (1 session)

**Goal:** housekeeping — 1341 LOC → organized modules. No user-visible change.

- `eval-harness/tests.ts` — 13 test definitions + scorers.
- `eval-harness/adapters.ts` — per-provider call paths (OpenRouter, Ollama, Anthropic, Gemini) incl. `toAnthropicFormat()` + `toAnthropicTools()`.
- `eval-harness/scoring.ts` — loop-detection, pokedex-cap, force-completion fallback.
- `eval-harness/cli.ts` — argv + snapshot + report.
- `scripts/eval-models.ts` → thin entry (~50 LOC).

**Gate.** Full 13-test suite bit-for-bit identical.

**Commit.** `refactor(evals): split eval-models.ts into eval-harness modules`.

### Phase 9 — `lib/chunker.ts` split (1 session)

**Goal:** housekeeping — 794 LOC → per-source modules. Lower priority, less frequently touched.

- `lib/chunker/pokemon.ts`, `mega.ts`, `move.ts`, `item.ts`, `team.ts`, `usage.ts`, `matchup.ts`, `markdown.ts` (incl. `chunkMarkdownFile` + `RULES_LIST_SECTIONS` splitter), `ability.ts`.
- `lib/chunker.ts` → barrel export.

**Gate.** Reindex + full retrieval eval bit-for-bit identical.

**Commit.** `refactor(chunker): split lib/chunker.ts into per-source modules`.

### Phase 10 — Stage 6.3 P2 extensions (opportunistic)

Land only if real queries surface the need — don't build speculatively.

- **P2a LLM-driven planner fallback** — Gemma emits `QueryPlan` JSON for queries that `routeQuery()` rules don't catch. Parse-retry loop on malformed JSON. Behind `PLANNER_LLM_FALLBACK=true`.
- **P2b `$variable` step-dependencies** — topological executor with variable interpolation (e.g., step 2 uses `$step1.result[0].pokemon`). Add when a concrete query needs it.

### Phase 11 — Stage 7b Late chunking (opportunistic, low priority)

Was gated on EmbeddingGemma (abandoned). On BGE alone value is smaller but non-zero.

- Late chunking on team markdowns + long knowledge docs (`team_building_theory.md`, `meta_snapshot.md`).
- Compute `[CLS]` over full doc once, sub-slice per section — preserves document-level context in each chunk embedding.

**Gate.** Modest retrieval improvement on hard-difficulty tier; no regression elsewhere.

### Phase 12 — Content & data (rolling, slotted between phases)

- `creator_opinion` test verification — may already be passing post-4.5 but unverified in current 13-test suite.
- `data/knowledge/singles_meta.md` — Singles ladder diverges from Doubles, no KB coverage.
- Reconcile `meta_snapshot.md` with AngrySlowbroPlus tier list (Sinistcha-first vs Incineroar-first drift).
- Codify TheDelybird's 5 template archetypes with EV pastes.

### Phase 13 — Webapp + regression (separate track)

Not RAG — can land anytime, doesn't block the RAG roadmap.

- Webapp Tailwind 4 blocker (tracked in `webapp/HANDOVER.md`).
- Full `npm test` regression against Supabase backend (251 tests; only smoke-tested since LanceDB migration).

---

## Part 5 — Critical path + dependencies

```
Phase 1 (cleanup + baseline)
   ↓
Phase 2 (Gemma reranker) ──────────── biggest single retrieval win
   ↓
Phase 3 (rag.ts split)
   ↓
Phase 4 (executor redesign) ────── closes Stage 6.3 aspirational gap
   ↓
Phase 5 (forced-JSON + chunk_id) ── only unshipped faithfulness defense
   ↓
Phase 6 (Gemma flakes)
   ↓
Phase 7 (subagents)

Phase 8 / 9 (eval-models / chunker splits) — can slot anywhere, no deps
Phase 10 (P2 extensions) — after Phase 4; wait for real need
Phase 11 (late chunking) — after Phase 4; opportunistic
Phase 12 (content) — rolling
Phase 13 (webapp) — separate track
```

**Hard dependencies:**
- Phase 3 before Phase 4 (executor redesign needs `collectForceIncludes()` extracted).
- Phase 5 before Phase 7 if subagents emit validated JSON (soft dependency — can ship subagents without validated JSON and retrofit).

**Soft dependencies:**
- Phase 2 before Phase 4 eval cleanly (otherwise can't isolate the reranker's vs executor's contribution).

---

## Part 6 — Expected nDCG trajectory

| After phase | Overall nDCG | Driver |
|---|---|---|
| Current (Stage 6.3) | 0.849 | — |
| Phase 2 (Gemma reranker) | 0.87–0.89 | Ordering fix on matchup/counter/team (Recall@10 already saturated; reranker closes rank-order gap) |
| Phase 4 (executor redesign) | 0.88–0.90 | Sub-queries finally compete for top-10 |
| Phase 7–11 | marginal gains | Diminishing returns; maintenance mode |

Phase 5 (forced-JSON) doesn't move retrieval metrics — it adds a new faithfulness metric (`citation_validity_rate` ≥ 95%).

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
- **Stage 4.6 invariant** — force-includes + banned-item/phantom boosts must key off the ORIGINAL user query, never sub-queries. Protected by Phase 4 executor redesign (post-merge force-includes pass against original).

---

## Part 8 — Pointers

### Research source

- `research/agent-rag-research.pdf` — canonical research that motivated the initiative. Original research catalog + stage handovers consolidated into this doc and [progress.md](progress.md).

### Memory (cross-session, project-level)

- [project_no_paid_apis.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_no_paid_apis.md) — **budget constraint** (no paid APIs except Gemma).
- [project_default_model.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_default_model.md) — DEFAULT_MODEL = gemma-4-26b.
- [project_gemma_agentic_quirks.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemma_agentic_quirks.md) — known Gemma failure modes (informs Phase 5 + 6).
- [project_vercel_embedding_constraint.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md) — Lambda constraint (informs reranker options in Phase 2).
- [project_gemini3_eval.md](../../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_gemini3_eval.md) — Gemini 3 Flash eval results (for future model decisions).

### Eval baselines

- Current reference: `memory-bank/eval-baselines/2026-04-21-retrieval-stage4.6-p3-jina-off.json` (0.849 overall).
- Phase 1 goal: `retrieval-post-stage6.3-clean.json` (same numbers, Stage 5 residue cleaned).
- Phase 2 target snapshot: `retrieval-post-phase2-gemma-rerank.json` (expect 0.87–0.89 overall).

### Key code

- [lib/rag.ts](../lib/rag.ts) — `query()` orchestrator. Split target in Phase 3.
- [lib/query-planner.ts](../lib/query-planner.ts) / [lib/query-executor.ts](../lib/query-executor.ts) — Stage 6.3 planner + executor.
- [lib/rerank.ts](../lib/rerank.ts) — reranker client. Currently Jina (403). Add `rerankWithGemma()` in Phase 2.
- [src/app/api/team/route.ts:160](../src/app/api/team/route.ts) — agent loop with `Promise.all` tool-call parallelization (Stage 6.3).
- [evals/golden-set.jsonl](../evals/golden-set.jsonl) — 100-case graded-relevance set.

---

## Part 9 — Future-agent quickstart

If you're a future agent landing cold:

1. **Read this doc top to bottom** — it's ~1200 lines of dense summary but replaces reading ~5 handovers + the original master plan.
2. **Check [activeContext.md](activeContext.md)** for the current "right now" state — what was touched last session, what's in-flight.
3. **Check [progress.md](progress.md)** Completed vs Pending for what's shipped.
4. **Do NOT** propose paid APIs other than Gemma on OpenRouter. Do NOT suggest "top up Jina." Do NOT reintroduce the Italian translation layer.
5. **Do NOT** edit the golden set to fix gate failures — the user has explicitly frozen it for this cycle.
6. **Run evals between phases.** Retrieval (`npx tsx scripts/eval-retrieval.ts --snapshot`) and agentic (`npx tsx scripts/eval-models.ts --real-rag --runs 3`). Commit after each gate passes.
7. **Update this doc** when a phase lands — move it from "Part 4 (roadmap)" to "Part 1 (shipped)" with the new numbers. Update the expected trajectory table. Add a new handover file and reference it.
8. **When in doubt about budget:** any stage that needs per-call spending on a non-Gemma-OpenRouter service is dead. Find a free or self-hosted alternative.
