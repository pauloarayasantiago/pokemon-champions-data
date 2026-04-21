# RAG System Improvement Research — Findings

**Date:** 2026-04-20
**Source:** `research/agent-rag-research.pdf` (9-page project-specific playbook) + cross-referenced against current memory-bank state
**Scope:** Translate research recommendations into actionable items for the Pokemon Champions VGC RAG + agentic LLM stack

---

## Current Baseline (what we have)

- **Retrieval:** Supabase pgvector (HNSW) + Postgres FTS, fused via RRF in one RPC (`pc_hybrid_search`), 2,239 indexed chunks
- **Embedding:** `Xenova/all-MiniLM-L6-v2` (384-dim, fp32, no prefixes)
- **Re-ranking:** 8 additive metadata boosts (no cross-encoder)
- **LLM:** Gemma 4 26B via OpenRouter (DEFAULT_MODEL), 12/13 eval pass, ~22k tok/pass, ~$18/10k queries
- **Eval:** 13-test agentic suite + 25-case retrieval suite (MRR 1.0, saturated)
- **Schema:** `vector(384)` column
- **Translation:** 2,383-entry Italian→English dictionary at chunk time

## Diagnosed Weaknesses (PDF's BLUF)

1. **Saturated eval suite** — MRR 1.0 on 25 easy cases is blind to faithfulness, graded relevance, adversarial distractors, per-intent failure modes
2. **Outdated embedding model** — MiniLM-L6 is ~15 nDCG points behind SOTA per BEIR/MTEB
3. **No cross-encoder reranker** — PDF calls this "the single highest-ROI upgrade"
4. **Chunking loses coherence** — team writeups split per-slot; no metadata prefix; markdown hierarchy lost
5. **Re-ranker bias** — Pokemon-name intents push transcripts out of top 5 (why `creator_opinion` test is flaky)
6. **Italian dictionary drift** — chunk-time mutation bakes translation decisions into stored embeddings; can't swap encoders cleanly

---

## Action Catalog

### Priority 0 — Week 1 (Low-risk, high-ROI, unblocks downstream)

| # | Action | Effort | Impact | Files |
|---|--------|--------|--------|-------|
| 1 | `vector(384)` → `halfvec(384)` migration | 0.5 day | 2× storage, 2× HNSW build speed, <1% recall cost | `supabase/migrations/`, `lib/rag.ts`, `scripts/index-data.ts` |
| 2 | Embedding swap: MiniLM-L6 → `BAAI/bge-small-en-v1.5` | 1 day | +10 nDCG@10 (BEIR), drop-in (same 384 dims) | `lib/embed.ts` (+ instruction prefix) |
| 3 | Add Jina Reranker v2 (top-40 → top-8) | 1 day | +5–15 nDCG@10 | `lib/rag.ts` (new `rerankTopK()`) |
| 4 | Stratified eval w/ graded relevance, nDCG@10, Recall@10, Context Precision@10 | 2 days | Unlocks visibility into real retrieval quality | `scripts/eval-models.ts`, new `evals/golden-set.jsonl` |

**Notes:**
- Jina v2 is multilingual, cheap ($0.02/1M tokens), Vercel-friendly single `fetch()` call. Cohere Rerank 3.5 is the fallback.
- Cache reranker results by `sha256(normalize(query) ‖ sorted(candidate_ids).join(","))`.
- bge-small-en-v1.5 REQUIRES an instruction prefix — skipping it costs 3–8 nDCG points. MiniLM didn't need one; adding on upgrade is safe; dropping later is a silent bug.

### Priority 1 — Month 1

| # | Action | Effort | Impact | Files |
|---|--------|--------|--------|-------|
| 5 | Contextual Retrieval at ingestion (Haiku + prompt cache, 50–100 tok prefix per chunk) | 2–3 days, ~$20–40 one-off | −35% to −49% retrieval failure (Anthropic benchmark) | `lib/chunker.ts`, schema `context` col, `scripts/index-data.ts` |
| 6 | Groundedness loop: forced JSON w/ `chunk_ids`, server-side validation, Haiku post-hoc claim-support check | 2 days | Blocks most hallucinations | `src/lib/llm.ts`, `src/lib/system-prompt.ts` |
| 7 | Chunking fixes: one-chunk-per-team; metadata prefix; `MarkdownHeaderTextSplitter` on knowledge docs; TSVECTOR `'simple'` analyzer on names | 2 days | Fixes `creator_opinion` bias + "Garchomp" stemming | `lib/chunker.ts`, `pc_hybrid_search` RPC |
| 8 | EmbeddingGemma-300m migration (shadow column, A/B eval, cutover, retire Italian dict) | 1 week | +10–15% retrieval; 100+ langs; kills 2,383-entry dict | `lib/embed.ts`, `lib/chunker.ts`, schema, `scripts/reindex.ts` |

**Notes:**
- Contextual Retrieval = call Claude Haiku with full parent doc in `cache_control: { type: "ephemeral" }` (90% cache-read discount). Prepend ~50–100 token context to embedding AND TSVECTOR input.
- Groundedness: force `{ answer, claims: [{ text, chunk_ids: [] }] }`. Validate every chunk_id server-side. Haiku pass flags <80% supported. Optional CoVe (arXiv 2309.11495) for revision.
- EmbeddingGemma is Matryoshka-native → can truncate 768→384 + L2-renormalize at <2% cost, preserving our `halfvec(384)` schema. Non-MRL models lose 10–20% on truncation.

### Priority 2 — Month 2

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 9 | Self-RAG retrieve-gate (`{retrieve: bool}` structured output; skip pgvector on chit-chat) | 2 days | Latency + cost savings on non-retrieval queries |
| 10 | CRAG per-chunk grader (Haiku: correct/ambiguous/incorrect) | 2 days | Targets `tournament_retrieval`, `meta_core_attribution`, `usage_teammates` |
| 11 | Plan-and-Execute DAG for `/team` modes (parallel tool use, Claude 4+) | 3 days | 2–3× latency on `/team counter` |
| 12 | Late chunking on team markdowns (anaphora-heavy) | 2 days | +4–9% nDCG; +23% on multi-hop |

### Priority 3 — Opportunistic

- **Subagent decomposition** — migrate `/team build`, `/team evaluate`, `/team counter` to Claude Agent SDK subagents with restricted tool allowlists, optional model variation (Haiku for build, Sonnet for evaluate)
- **CLAUDE.md persona → `.claude/skills/pokemon/SKILL.md`** for progressive disclosure
- **Prompt cache 4-breakpoint structure:** `[tools]` → `[system + CLAUDE.md]` → `[retrieved context]` → `[conversation + query]` → up to ~90% cost reduction on warm cache

### Skip (research-confirmed low ROI at this scale)

| Thing | Why skip |
|-------|----------|
| GraphRAG / LightRAG | Existing relational schema + recursive CTEs cover multi-hop at 1% of cost |
| RAPTOR | 1% of benefit for 80% of indexing cost |
| BGE-M3 | Forces 1024-dim migration; dense-only wastes hybrid value |
| jina-v3 | CC-BY-NC-4.0 (non-commercial) |
| ColBERT as primary retriever | pgvector lacks MaxSim; ~100× more stored vectors; no Node inference |
| ParadeDB pg_search | Not on managed Supabase |
| ARES framework | Needs ~500+ golden set to activate |
| Embedding fine-tuning | Exhaust cheaper wins first |
| Semantic router (as day-1 priority) | Current rule classifier works; this is optimization for long-tail |

---

## Evaluation Overhaul (Priority 0 detail)

Why the current 25-case suite is blind:
- **MRR** only rewards rank-1 on lexically matchable queries
- Binary relevance labels → ignores partial matches
- No adversarial distractors → systems can pass by always returning the entity page
- No per-intent slices → one bad intent can be masked by good performance on others
- No faithfulness metric → generator hallucinations invisible

Replace with four metric families:

1. **Graded retrieval:** nDCG@10, Recall@10, Context Precision@10 with relevance labels {0, 1, 2, 3}
2. **Faithfulness/groundedness (RAGAS):** `|claims supported by context| / |total claims|` — healthy RAG ≥ 0.85
3. **Answer relevancy (RAGAS):** reverse-question method detects evasive generation
4. **Per-intent slice metrics:** compute all three separately for 7 intents (usage, counter, stat, item, move, team, matchup)

Hard-negative mining (arXiv 2505.18366): inject adversarial chunks (phantom Pokemon, similar families, same-entity-wrong-topic) and fail if top-5 contains them.

Golden set starts at ~100, grows to ~500. Difficulty tiers: Easy (single-hop, exact) / Medium (paraphrase) / Hard (multi-hop, 2+ chunks) / Adversarial. PR gate: fail if any tier drops >5%.

**Optional: Giskard RAGET** (`giskard[llm]>=2,<3` — v3 dropped RAGET). Auto-generates ~200 stratified cases (simple, complex, distracting, situational, double, conversational).

**Optional: Langfuse TS SDK** for online tracing + datasets + prompt mgmt. CRITICAL: `await langfuse.shutdownAsync()` in serverless handlers or events drop silently.

**Agentic harness extensions (13 → ~20):** `tool_call_count`, `unique_chunk_ids_used`, `retrieval_precision@k`, `pass^3` consistency at temp > 0, cost/latency budgets per test, cache-hit regression check.

---

## Named Techniques — Codebase Search Checklist

Before implementing any item, grep the codebase for these to check for existing partial implementations:

**Retrieval:** HyDE, RAG-Fusion, Step-back Prompting, Query Decomposition, IRCoT, Contextual Retrieval, Late Chunking, RAPTOR, Dense X Retrieval, Small-to-Large, Hierarchical retrieval, Sentence-window retrieval

**Reranking:** RankGPT, RankZephyr, Cohere Rerank, Jina Reranker, ColBERT-as-reranker

**Generation/Grounding:** Chain-of-Verification (CoVe), Self-RAG, CRAG, Plan-and-Execute, LLMCompiler, ReAct, Reflexion

**Evaluation:** RAGAS, RAGChecker, DeepEval, ARES, Giskard RAGET, TruLens, G-Eval, FActScore, RGB, MultiHop-RAG, τ-bench

**Embeddings:** EmbeddingGemma, BGE-M3, BGE-small-en-v1.5, snowflake-arctic-embed, Qwen3-Embedding, Matryoshka/MRL, Arctic Embed 2.0, jina-embeddings-v3

**Infra:** Langfuse, halfvec, VectorChord, semantic-router

---

## Key arXiv References

- Contextual Retrieval: anthropic.com blog, Sep 2024
- Self-RAG: 2310.11511
- CRAG: 2401.15884
- HyDE: 2212.10496
- Step-back: 2310.06117
- CoVe: 2309.11495
- LLMCompiler: 2312.04511
- RAGAS: 2309.15217
- RAGChecker: 2408.08067
- G-Eval: 2303.16634
- FActScore: 2305.14251
- Hard Negatives: 2505.18366
- Matryoshka: 2205.13147
- Late Chunking: 2409.04701
- Lost-in-the-middle: 2307.03172

---

## Cross-References to Memory-Bank

- [activeContext.md](activeContext.md) — 2026-04-20 findings: `creator_opinion` flakiness, Gemma output-mode edge cases
- [errors.md](errors.md) — Floette stats gap, Ninetales merged abilities, YouTube IP-blocks
- [progress.md](progress.md) — Gemma 4 26B selected; matchup matrices rebuilt; `meta_snapshot.md` vs AngrySlowbroPlus reconciliation pending
- [systemPatterns.md](systemPatterns.md) — Current chunking + 8-boost re-ranker patterns
- [techContext.md](techContext.md) — Supabase pgvector setup, Vercel Lambda constraints

**Companion plan:** `~/.claude/plans/read-the-memory-bank-an-flickering-quasar.md` (staged rollout translating these findings into Stages 0–7)
