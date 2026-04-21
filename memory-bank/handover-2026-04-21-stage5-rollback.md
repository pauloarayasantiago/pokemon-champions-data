# Stage 5 Rollback — 2026-04-21

## TL;DR

Stage 5 (EmbeddingGemma shadow migration — `bge-small-en-v1.5` → `google/embeddinggemma-300m` MRL-truncated to 384 dims) was built end-to-end and abandoned after the user clarified Italian-query support is not a product requirement. On the English workload that actually matters, Gemma MRL-384 is **−1.3% overall nDCG** vs BGE and regresses the `team` intent by **−6.6%**. Shadow wiring removed from code; Supabase shadow column / index / RPC dropped; bilingual eval fixture preserved untracked as dormant evidence.

Baseline restored to Stage 4.6 at overall nDCG ≈ 0.849.

## What was built and discarded

All Stage 5 code was uncommitted when the rollback decision was made, so rollback was a trivial `git checkout --` plus one DB migration.

| Artifact | Action |
|---|---|
| [lib/embed.ts](../lib/embed.ts) — `embedV2()`, Gemma constants, MRL helper, mean-pooling ONNX path, HF remote path | REVERTED (`git checkout --`) |
| [lib/rag.ts](../lib/rag.ts) — `opts?: { useV2 }` parameter, embedder branch, RPC name branch | REVERTED |
| [scripts/index-data.ts](../scripts/index-data.ts) — dual-embed loop, `embedding_v2` column write, v2 meta rows | REVERTED |
| [scripts/eval-retrieval.ts](../scripts/eval-retrieval.ts) — `--shadow`/`--bilingual` flags, `printShadowDelta`, `printBilingualParity`, `stripBilingualSuffix`, `buildSnapshotBlock`, `runCases` useV2 param | REVERTED |
| `scripts/backfill-embedding-v2.ts` | DELETED |
| `scripts/probe-embed-v2.ts` | DELETED |
| Supabase column `pc_chunks.embedding_v2 halfvec(384)` (2,427 rows populated) | DROPPED |
| Supabase index `pc_chunks_embedding_v2_hnsw_idx` | DROPPED |
| Supabase RPC `pc_hybrid_search_v2(halfvec, text, text[], int, int)` | DROPPED |
| Supabase `pc_index_meta` rows `embedding_model_v2`, `embedding_v2_indexed_at` | DELETED |

Rollback migration applied to project `xvddfzeimjmfzznhqutb` as `stage5_rollback_drop_embedding_v2`.

## Evaluation results at time of rollback

Snapshots (preserved untracked):
- [memory-bank/eval-baselines/retrieval-shadow-2026-04-21T20-34-15-464Z.json](eval-baselines/retrieval-shadow-2026-04-21T20-34-15-464Z.json) — monolingual shadow run (100-case `golden-set.jsonl`)
- [memory-bank/eval-baselines/retrieval-shadow-2026-04-21T20-36-49-332Z.json](eval-baselines/retrieval-shadow-2026-04-21T20-36-49-332Z.json) — bilingual shadow run (100-case `golden-set-bilingual.jsonl`)

| Gate | Threshold | Monolingual | Bilingual | Verdict |
|---|---|---|---|---|
| 1. nDCG regression per intent | ≤5% | team **−6.6%** (overall −1.3%) | team **−9.8%** (overall +3.7%) | ❌ FAIL |
| 2. Agentic pass rate | ≥12/13 | not tested (post-cutover) | n/a | — |
| 3. p95 retrieval latency | <30s | 756ms/case | 636ms/case | ✅ PASS |
| 4. Lambda bundle | <250 MB | unchanged (ONNX not bundled in prod) | unchanged | ✅ PASS |
| 5. Cross-lingual parity | <2% per intent | — | 6/7 intents fail (overall Δabs 3.8%) | ❌ FAIL (moot after decision) |
| 6. No forbidden leak on `golden-set.jsonl` | 0 hits | 0/100 v2 | 0/100 v2 (EN half of bilingual) | ✅ PASS |

### Per-intent nDCG deltas (v2 − v1)

Monolingual (100 cases):

| Intent | v1 | v2 | Δ | %chg |
|---|---:|---:|---:|---:|
| counter | 0.693 | 0.700 | +0.007 | +1.0% |
| item | 0.991 | 0.977 | −0.014 | −1.4% |
| matchup | 0.741 | 0.738 | −0.003 | −0.3% |
| move | 0.995 | 0.983 | −0.013 | −1.3% |
| stat | 0.838 | 0.830 | −0.008 | −1.0% |
| **team** | 0.823 | 0.769 | **−0.054** | **−6.6%** ❌ |
| usage | 0.981 | 0.986 | +0.005 | +0.5% |
| **Overall** | 0.849 | 0.837 | −0.011 | −1.3% |

Bilingual (100 cases, 50 EN + 50 IT translations):

| Intent | v1 | v2 | Δ | %chg |
|---|---:|---:|---:|---:|
| counter | 0.749 | 0.768 | +0.019 | +2.5% |
| item | 0.938 | 0.925 | −0.013 | −1.3% |
| matchup | 0.686 | 0.731 | +0.045 | +6.5% |
| move | 0.987 | 0.981 | −0.007 | −0.7% |
| stat | 0.564 | 0.764 | **+0.200** | **+35.5%** ⚡ |
| **team** | 0.796 | 0.718 | **−0.078** | **−9.8%** ❌ |
| usage | 0.912 | 0.955 | +0.043 | +4.7% |
| **Overall** | 0.804 | 0.834 | +0.030 | +3.7% |

### Team-intent failure analysis

Two transcripts-specific, creator-named queries drove the `team` regression:

- `team-ck49-role-framework` — `"CK49's role framework best Pokemon for every role"` — v1 0.362 (rank 8+9 hits) → v2 0.000 (all 10 slots are `meta_snapshot.md` chunks)
- `team-angryslowbro-tier-list` — `"AngrySlowBroPlus tier list criteria"` — v1 0.446 (rank 7+8+9 hits) → v2 0.000 (all 10 slots are `speed_tiers.md` / `meta_snapshot.md`)

Pattern: Gemma's mean-pooled dense vector blurs out low-frequency named-entity tokens (creator handles) and the query collapses to its generic topical center. BGE's CLS-pooled vector retains enough lexical signal to catch the transcript chunks, albeit at low ranks.

## Why rolled back

1. User confirmed (2026-04-21) that Italian queries are **not** a product requirement. The Italian entries in the research corpus were incidental scrape coverage, not an audience commitment.
2. With the multilingual value prop withdrawn, Gemma's English performance (−1.3% overall, −6.6% on `team` intent) makes the migration strictly net-negative.
3. Plan policy required all 6 gates pass before cutover; two gates failed. Strict plan adherence → rollback path.

## Preserved artifacts (dormant, untracked in git)

- `evals/golden-set-bilingual.jsonl` — 100-line bilingual fixture (50 EN + 50 IT manual translations). Retained because the manual translation work has real asset value if multilingual ever re-enters the roadmap. Untracked so accidental loss is cheap to detect.
- `memory-bank/eval-baselines/retrieval-shadow-2026-04-21T20-34-15-464Z.json` — monolingual shadow snapshot (evidence).
- `memory-bank/eval-baselines/retrieval-shadow-2026-04-21T20-36-49-332Z.json` — bilingual shadow snapshot (evidence).

## Lessons

- **Shadow dual-write pattern worked exactly as designed.** Clean parity comparison, zero production risk, trivial rollback (all code changes were uncommitted in the working tree until cutover). This pattern is reusable for any future embedder migration.
- **Gemma MRL-384 is not a free multilingual upgrade.** Same-dim truncation loses ~1.3% on English retrieval vs BGE for this domain (Pokemon VGC transcripts + tournament data). If Gemma is revisited, try 512 dims or full 768 first — English must not regress.
- **Content-creator named-entity queries are a dense-embedding weak point.** Both models struggled, but v2 collapses to generic topical chunks while v1 retains lexical fallback via BM25. Mitigable via FTS weight tuning in `pc_hybrid_search` (raise `setweight('A')` contribution or add per-intent weight profiles); this is a candidate improvement to the current BGE pipeline regardless of future embedder decisions.
- **The 2,383-entry Italian translation dictionary in the chunker is now dead code** (nothing queries it; all users query English). Candidate for a future cleanup pass if English-only is confirmed permanent.

## Future reference — if multilingual returns to roadmap

Priority order:

1. **MRL dim=512** with `halfvec(512)` — 33% more info than 384, still fits one halfvec column. Lowest-risk first attempt.
2. **Full 768-dim** — rejects MRL; tests Gemma at native capacity. 2× storage but small at ~2k chunks.
3. **Prefix tuning** on the task strings. Google model card lists several variants (e.g. `"task: question answering | query: ..."` vs `"task: search result | query: ..."`).
4. **Alternative multilingual model** — e5-multilingual, jina-embeddings-v3, mxbai-embed-multi.

**Before any of the above**, test the FTS weight bump on the current BGE pipeline — would likely resolve the team-intent named-entity weakness without any model migration.

## Verification (post-rollback)

| Check | Expected | Result |
|---|---|---|
| `grep -rn "embedV2\|embedding_v2\|pc_hybrid_search_v2\|useV2" lib/ scripts/ package.json` | empty | ✅ |
| `npx tsc --noEmit -p .` | zero errors | ✅ |
| Supabase column `embedding_v2` | does not exist | ✅ |
| Supabase RPC `pc_hybrid_search_v2` | does not exist | ✅ |
| Supabase index `pc_chunks_embedding_v2_hnsw_idx` | does not exist | ✅ |
| `pc_index_meta` keys | only `embedding_model` | ✅ |
| `HF_TOKEN= npm run test:retrieval` | overall nDCG ≈ 0.849 | *see latest snapshot* |

## Git state

- Pre-rollback: Stage 5 code in working tree only (never committed).
- Rollback commit touches only `memory-bank/*.md` — this handover, `activeContext.md` update, `progress.md` update.
- No code changes committed. Latest code commit remains `0550650` (Stage 4.6 P3).
- DB migration `stage5_rollback_drop_embedding_v2` applied.
