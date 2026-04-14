# Active Context (2026-04-13)

## Current Phase: RAG System Overhauled — Phases 5-8 Ready for Implementation

The RAG system underwent a major overhaul (Phases 0-4). Current score: **25/25 eval cases pass (100%), MRR 0.944, zero forbidden results.** Four more phases are planned and ready to implement.

### RAG Overhaul Complete (Phases 0-4)
- **Phase 0**: Built eval framework — 25 test cases across 8 categories (`lib/eval-data.ts`, `scripts/eval.ts`)
- **Phase 1**: Hybrid search — LanceDB native FTS (BM25/Tantivy) + Vector + RRF reranker (`rerankers.RRFReranker.create(60)`)
- **Phase 2**: Intent classification — rule-based `classifyQuery()` with word-boundary matching, `data_category` column + scalar index for source filtering
- **Phase 3**: Structured stat queries — top-level stat columns (hp, attack, speed, etc.) + `lib/structured-query.ts` NL→SQL parser. **LanceDB bug workaround**: omit `data_category` from structured WHERE clauses (scalar index + non-indexed columns return incomplete results)
- **Phase 4**: Multi-signal re-ranking — boosts for exact name (+0.04), usage intent (+0.05/0.10), structured results (+0.1), knowledge for counter queries (+0.015), project penalty (-0.08)

### New/Modified Files from Overhaul
- `lib/rag.ts` — Completely rewritten: hybrid search, intent classification, structured queries, multi-signal re-ranking
- `lib/structured-query.ts` — NEW: NL→SQL stat filter builder (type, speed, attack thresholds)
- `lib/eval-data.ts` — NEW: 25 test cases with expected/forbidden IDs
- `scripts/eval.ts` — NEW: eval harness (Recall@5, MRR, pass rate, per-category breakdown)
- `scripts/debug-db.ts` — DB inspection utility (temporary, can be deleted)
- `scripts/index-data.ts` — Added FTS index, scalar index, `data_category` column, top-level stat columns

### Phases 5-8: Ready to Implement (see plan file)

**Phase 5: Embedding Upgrade** — `Xenova/all-MiniLM-L6-v2` (384-dim) → `onnx-community/embeddinggemma-300m-ONNX` (768-dim, q8 quantization). Modify `lib/embed.ts` to add query/document prefix support. Requires `--force` reindex.

**Phase 6: Chunking Overlap** — Add sliding paragraph overlap to markdown chunk splits in `lib/chunker.ts`. ~10-15% more storage, better cross-boundary recall.

**Phase 7: Index Lifecycle** — Add `.lancedb/index-meta.json` with file mtimes for staleness detection. Replace hardcoded FILES array with glob-based auto-discovery for `data/knowledge/`, `research/`, `data/transcripts/`.

**Phase 8: Pikalytics Italian Fix** — 5 Pokemon (Kingambit #5, Venusaur #17, Lucario, Meowstic, Manectric) have Italian move/item/ability names. Fix: (1) Add `Accept-Language: en` header to `scraper_pikalytics.py`, (2) Build IT→EN translation dictionary via PokeAPI (`scripts/build-translations.ts` → `lib/translations.json`), (3) Apply translations in `lib/chunker.ts` during Pikalytics chunk creation.

**Optimal order**: Phase 8 → 5 → 6 → 7 (combine 5+6+8 code changes, single `--force` reindex).

### Known Issues
- Floette has no base stats (Serebii page layout issue)
- 5 Pikalytics entries in Italian (Kingambit, Venusaur, Lucario, Meowstic, Manectric) — Phase 8 fix planned
- 106/186 Pokemon have no Pikalytics data (insufficient tournament appearances)
- Mr. Rime has no Pikalytics page (slug format unknown)
- LanceDB scalar index bug: combining `data_category` scalar index with non-indexed columns in WHERE returns incomplete results — workaround in place (omit category filter from structured queries)

### Key Decisions
- Hybrid search (BM25 + vector + RRF) is the foundation — compensates for smaller embedding model
- Intent classification is rule-based (not LLM) — fast, deterministic, zero API cost
- Structured stat queries bypass vector search entirely — SQL WHERE on pre-computed columns
- EmbeddingGemma 300M chosen as upgrade path (Apache 2.0, proven Transformers.js support, q8 quantization)
- PokeAPI used for Italian→English translation dictionary (confirmed: move endpoint returns multi-language names)
