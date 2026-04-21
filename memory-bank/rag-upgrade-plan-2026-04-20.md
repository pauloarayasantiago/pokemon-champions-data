# RAG Upgrade — Staged Implementation Plan

**Date:** 2026-04-20
**Status:** Plan approved; Stage 0 in execution
**Companion doc:** [rag-improvements-research-2026-04-20.md](rag-improvements-research-2026-04-20.md) (research findings catalog)
**Original plan file:** `~/.claude/plans/read-the-memory-bank-an-flickering-quasar.md`

## Context

The Pokemon Champions VGC RAG system is architecturally sound: Gemma 4 26B scores 12/13 on the eval harness, retrieval passes 25/25 with MRR 1.0, and guardrails (hard pokedex dedup, post-loop force-completion) stabilized variance. But the eval ceiling is hiding problems:

- **MRR 1.0 on 25 easy cases is saturated** — blind to faithfulness, context precision beyond rank 1, adversarial distractors.
- **`creator_opinion` test is flaky (~50%)** because the re-ranker biases tournament/usage chunks above transcripts for Pokemon-name intents.
- **MiniLM-L6 embedding model is ~15 nDCG points behind SOTA** (BEIR/MTEB).
- **No cross-encoder reranker** — research PDF calls this "the single highest-ROI upgrade."
- **2,383-entry Italian translation dictionary** runs at chunk time, adding drift and maintenance cost.

**Intended outcome:** Escape the MRR 1.0 saturation, get visibility into real retrieval quality, add a reranker, and upgrade the embedding model — in that order, with a baseline snapshot at each stage so regressions are catchable.

---

## Stage 0 — Baseline & Findings Capture (0.5 day)

**Goal:** Freeze the current baseline so every subsequent stage has a measurable delta.

- [x] Write `memory-bank/rag-improvements-research-2026-04-20.md` with the findings catalog
- [x] Write this plan to `memory-bank/rag-upgrade-plan-2026-04-20.md`
- [ ] Run `scripts/eval-models.ts` 3× at temp > 0 to capture variance baseline (Gemma 4 26B: 12/13, 22,193 tok/pass, 19.2s avg)
- [ ] Snapshot eval output to `memory-bank/eval-baselines/2026-04-20-pre-rag-upgrade.json`
- [ ] Update `memory-bank/activeContext.md` with the RAG upgrade initiative

## Stage 1 — Schema + Embedding + Reranker (Week 1, P0)

**Goal:** Lock in low-risk wins the research PDF calls "unblocks everything downstream."

**1.1 halfvec migration**
- New Supabase migration: alter `pc_chunks.embedding` from `vector(384)` to `halfvec(384)`
- Update HNSW index DDL to use `halfvec_cosine_ops`
- Re-build HNSW (2× speed)
- Files: new `supabase/migrations/<ts>_halfvec.sql`; touch `lib/rag.ts`, `scripts/index-data.ts`

**1.2 Embedding swap (MiniLM-L6 → bge-small-en-v1.5)**
- Same 384 dims → no schema impact
- Same Xenova ONNX pipeline → same Vercel deployment constraints
- Add instruction prefix per model spec (3–8 nDCG points if skipped)
- File: `lib/embed.ts`
- Re-index: `npx tsx scripts/index-data.ts --full`

**1.3 Jina Reranker v2**
- `jina-reranker-v2-base-multilingual` via Jina API, single `fetch()`
- Pipeline: RPC top-40 → rerank → top-8 → existing 8-boost layer recalibrated to [0, 1]
- Cache by `sha256(normalize(query) ‖ sorted(candidate_ids).join(","))`
- Fallback: Cohere Rerank 3.5
- File: `lib/rag.ts` (new `rerankTopK()`)

**1.4 Stage 1 verification**
- Re-run eval 3× → expected 12/13 → 13/13 (creator_opinion unblocked), tokens roughly flat
- Record `memory-bank/eval-baselines/2026-04-20-post-stage1.json`

## Stage 2 — Evaluation Escape (Week 1–2, P0)

**Goal:** Replace binary MRR with stratified suite so later stages have real signal.

**2.1 Graded-relevance golden set**
- Convert 25 existing cases from binary to graded {0,1,2,3} on top-10
- Grow to ~100 by end of week 2
- Format: JSONL `(query, expected_output, expected_contexts, intent_tag, difficulty_tier)`
- Tiers: Easy / Medium / Hard / Adversarial
- File: new `evals/golden-set.jsonl`, new `scripts/eval-retrieval.ts`

**2.2 Retrieval metrics harness**
- nDCG@10, Recall@10, Context Precision@10
- Per-intent slices: 7 intents (usage, counter, stat, item, move, team, matchup)
- Hard-negative mining (arXiv 2505.18366)
- File: `scripts/eval-retrieval.ts`

**2.3 Optional: Giskard RAGET one-shot** — `giskard[llm]>=2,<3`, ~200 stratified cases
**2.4 Optional: Langfuse TS SDK** — `@langfuse/tracing` + `@langfuse/client` (decide during stage)
**2.5 Stage 2 verification** — publish per-intent metrics; identify weakest intents

## Stage 3 — Contextual Retrieval + Groundedness (Week 3–4, P1)

**Goal:** Hit the "-49% retrieval failure" Anthropic benchmark and block hallucinations.

**3.1 Contextual Retrieval ingestion**
- Add `context` column to `pc_chunks`
- Call Claude Haiku with full parent doc in `cache_control: { type: "ephemeral" }`
- Prepend 50–100 token context to embedding AND TSVECTOR input
- One-off cost: ~$20–40
- Files: `lib/chunker.ts` (new `contextualizeChunk()`), `scripts/index-data.ts` (`--contextualize` flag)

**3.2 Re-ingest** — `npx tsx scripts/index-data.ts --full --contextualize`, shadow column during transition

**3.3 Groundedness loop**
- Force JSON: `{ answer, claims: [{ text, chunk_ids: [] }] }`
- Server-side validate every `chunk_id`
- Post-hoc Haiku claim-support check; flag <80% supported
- Optional CoVe (arXiv 2309.11495) on flagged
- Files: `src/lib/llm.ts`, `src/lib/system-prompt.ts`

**3.4 Stage 3 verification** — +10–20% Context Precision@10, <5% unsupported claims

## Stage 4 — Chunking & Metadata (Week 3–4, P1, parallel with Stage 3)

**4.1 Team chunking** — one chunk per team (not per slot); preserves archetype coherence
**4.2 Metadata prefix** — `[pokemon_name][tier][types][generation]` before embedding
**4.3 MarkdownHeaderTextSplitter** — preserve H1→H3 hierarchy on `data/knowledge/*.md`
**4.4 TSVECTOR fix** — `setweight(to_tsvector('simple', names), 'A')`, `setweight(to_tsvector('english', prose), 'B')`
**4.5 Verification** — `creator_opinion` test consistently passes

## Stage 5 — EmbeddingGemma Migration (Week 5–6, P1)

**Goal:** Retire MiniLM legacy + 2,383-entry Italian dictionary.

**5.1 Dual-write shadow column** — `embedding_v2 halfvec(384)`; Matryoshka-truncate 768→384 + L2-renormalize (MRL-native required); model-specific prefix
**5.2 Side-by-side eval** — 50-query bilingual set; cutover if cross-lingual nDCG within 2% of monolingual
**5.3 Retire Italian dictionary** — delete chunker translation layer; migrate to query-time expansion
**5.4 Verification** — cross-lingual parity; regression test for Italian move names

## Stage 6 — Agentic Patterns (Month 2, P2)

**6.1 Self-RAG retrieve-gate** — `{ retrieve: bool, confidence: 0..1 }`; skip pgvector on chit-chat
**6.2 CRAG grader** — Haiku per-chunk {correct, ambiguous, incorrect}; ~$0.0005/call
**6.3 Plan-and-Execute DAG** — JSON DAG of tool calls with `$variable` placeholders; Claude 4+ parallel tool use; 2–3× latency win on `/team counter`

## Stage 7 — Late Chunking + Subagents (Month 2–3, P2, opportunistic)

- Late chunking on team markdowns (once EmbeddingGemma live)
- `/team build`, `/team evaluate`, `/team counter` → Claude Agent SDK subagents with restricted tool allowlists
- CLAUDE.md persona → `.claude/skills/pokemon/SKILL.md` progressive disclosure

---

## Critical Files to Modify

| Component | Primary Files | Stages |
|-----------|---------------|--------|
| LLM dispatch | `src/lib/llm.ts`, `src/lib/llm/types.ts` | 3, 6 |
| System prompt | `src/lib/system-prompt.ts` | 3 |
| RAG query pipeline | `lib/rag.ts`, `lib/structured-query.ts` | 1, 4, 6 |
| Embedding | `lib/embed.ts` | 1, 5 |
| Chunking | `lib/chunker.ts` | 3, 4, 5 |
| Indexing | `scripts/index-data.ts` | 1, 3, 5 |
| Eval harness | `scripts/eval-models.ts` | 0, 2 |
| Search CLI | `scripts/search.ts` | 1, 4 |
| Supabase schema | `supabase/migrations/` | 1, 3, 4, 5 |

## Verification Strategy

**At every stage:**
- Agentic eval 3× at temp > 0 → pass rate + token/latency
- Retrieval eval (nDCG@10, Recall@10, Context Precision@10) per intent
- Snapshot to `memory-bank/eval-baselines/<date>-post-stage<N>.json`
- Block if critical test regresses or pass rate drops >5%

**Milestones (end of Stage 1, 3, 5):**
- Manual webapp smoke: `/team build rain`, `/team counter Dragonite`
- Prompt cache hit rate check: `usage.cache_read_input_tokens > 0`
- Vercel 250 MB Lambda budget check

**Rollback triggers:**
- nDCG@10 drops >5% on any intent
- Agentic pass rate <12/13
- Latency >30s p95
- Lambda size over budget

## Decisions (2026-04-20, user-approved)

1. **Eval tracing:** Local JSONL only — skip Langfuse
2. **Embedding scope:** Full upgrade path — bge-small-en-v1.5 (Stage 1) + EmbeddingGemma (Stage 5)
3. **Skip anything with extra costs** (paid Anthropic API):
   - ❌ Stage 3.1–3.2 Contextual Retrieval (Haiku ingestion, ~$20–40 one-off)
   - ❌ Stage 3.3 groundedness Haiku post-hoc claim-support check
   - ❌ Stage 6.2 CRAG per-chunk grader (Haiku per call)
   - ✓ KEEP: Stage 3.3 server-side chunk_id validation (no paid-API cost)
   - ✓ KEEP: Stage 6.1 Self-RAG gate (uses existing Gemma, reduces cost)
   - ✓ KEEP: Stage 6.3 Plan-and-Execute DAG using Gemma Planner call
4. **Reranker:** Jina Reranker v2 — free tier API (Jina offers free credits); self-host via ONNX as fallback if quota exhausts

## Revised Stage 3 (after cost-skip)

Stage 3 shrinks to: forced-JSON output (`{ answer, claims: [{ text, chunk_ids }] }`) + server-side `chunk_id` validation + auto-retry on invalid. No Haiku calls. Contextual Retrieval (3.1–3.2) and post-hoc Haiku claim check DROPPED.

## Revised Stage 6 (after cost-skip)

Stage 6 keeps **6.1 Self-RAG gate** and **6.3 Plan-and-Execute DAG** — both use existing Gemma. **6.2 CRAG grader DROPPED.**
