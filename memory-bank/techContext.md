# Tech Context

## Environment
- **Platform:** Windows 11 Pro
- **Python:** 3.13 (system, miniconda3)
- **Node.js:** with npx tsx for TypeScript execution
- **Shell:** bash (Git Bash on Windows)
- **Encoding:** UTF-8 (set PYTHONIOENCODING=utf-8 for Windows console)

## Python Dependencies
- `requests` + `beautifulsoup4` — Web scraping (Serebii)
- `yt-dlp` — YouTube search and metadata extraction
- `youtube-transcript-api` (v1.2.4) — YouTube transcript fetching
  - API: `YouTubeTranscriptApi().fetch(video_id, languages=["en"])` returns `FetchedTranscript` with `.text` snippets
  - **Known issue:** YouTube rate-limits/IP-blocks after ~24 sequential requests; no documented cooldown period (community reports 1-24 hours)

## TypeScript / Node.js Dependencies
- `@huggingface/transformers` (^4.0.0) — Local embedding model
- `@supabase/supabase-js` (^2.x) — Supabase client (pgvector-backed vector store)
- `csv-parse` (^6.2.1) — CSV parsing
- `tsx` (^4.21.0) — TypeScript executor
- `typescript` (^6.0.2)

## Supabase Project
- Project: `store-and-dashboard` (ref `xvddfzeimjmfzznhqutb`), shared with `pokeke.shop`
- Namespace: all project tables prefixed `pc_` (pc_chunks, pc_index_meta)
- Env vars (accepted in either form — root `.env` or `webapp/.env.local`):
  - URL: `NEXT_PUBLIC_SUPABASE_URL` or `VITE_SUPABASE_URL`
  - Anon: `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`
  - Service: `SUPABASE_SERVICE_KEY` or `SUPABASE_SECRET`
- Client factory: `lib/supabase.ts` → `supabaseServer()` / `supabaseAnon()`; manually loads root `.env` once at startup so CLI scripts work without dotenv

## LLM Provider Layer (`src/lib/llm/`)

All providers route through `openai-compat.ts` (OpenAI chat completions format). The dispatcher in `src/lib/llm.ts` picks the right adapter from `MODEL_REGISTRY`.

**Current DEFAULT_MODEL**: `gemma-4-26b` (Gemma 4 26B A4B via OpenRouter). **Paid tier** — $0.06/M input, $0.33/M output (~$0.008 per 13-test run at the ~25k tok/pass baseline). The `:free` suffix in our registry applies to the 31B variant, NOT the default 26B A4B. Retained as default after 2026-04-23 7-model bake-off — no challenger beat it on cost+quality.

### Adapters
| File | Provider | Notes |
|------|----------|-------|
| `anthropic.ts` | Anthropic SDK | Claude Sonnet/Opus — paid |
| `gemini.ts` | Google AI Studio | `gemini-2.5-flash` — free (not currently registered in eval harness) |
| `groq.ts` | Groq | `llama-3.3-70b-versatile` — free. Tested 2026-04-23: 0/13 (Groq parser rejects Llama native tool format + 12k TPM cap). NO-GO |
| `openrouter.ts` | OpenRouter | Default `gemma-4-26b`; paid opt-ins `deepseek-v3`, `gpt-oss-20b`, `gemini-2.5-flash-lite`, `glm-4.5-air`; free `nemotron-super` (gpt-oss-120b), `gemma-4-31b` |
| `ollama.ts` | Ollama (local + remote) | Installed 2026-04-23; `qwen2.5-7b` + `llama3.1-8b` pulled. Both below 10/13 viable bar at Q4. Registry retained for future stronger local models |

### Ollama (installed 2026-04-23; 7-8B Q4 below viable bar)
- Local: `OLLAMA_BASE_URL` (default `http://localhost:11434`) — for 7-9B models on RTX 2070 SUPER 8GB
- Remote: `OLLAMA_REMOTE_URL` + `OLLAMA_REMOTE_KEY` — for larger models on a managed server
- Routes by model ID prefix: `remote-*` → remote config, others → local config
- **2026-04-23 eval (4 local models tested — none viable):**
  - qwen2.5-7b: 8/13 @ 17k tok/pass, 60% citations, ~100s/test — **best of the four**
  - llama3.1-8b: 4/13 @ 17k tok/pass, 20% citations, 124s/test
  - qwen3:8b: 4/13 @ 8.9k tok/pass, 40% citations, 136s/test — behavior 0/5 (all timeouts); NOT an upgrade over qwen2.5-7b despite being newer
  - qwen2.5-coder:7b: 2/13 @ 34k tok/pass, **0% citations**, 73s/test — coder variant fails retrieval
  - All four now pass `phantom_pokemon` in 0.0s (interceptor handles it pre-LLM — confirms the interceptor is model-agnostic).
  - **Conclusion:** 7-8B Q4 class of local model doesn't clear the 10/13 viable bar for this workload. Would need a 12GB+ server GPU (`remote-qwen32b` or similar) to get meaningful local performance.

### Model Registry (post 2026-04-23 bake-off)
```
DEFAULT → gemma-4-26b

Paid hosted (OpenRouter):
  gemma-4-26b     → google/gemma-4-26b-a4b-it     ← CURRENT DEFAULT ($0.06/$0.33 per M)
  deepseek-v3     → deepseek/deepseek-v3.2        (12/13, 100% cit, ~$0.022/run — 3× default)
  gpt-oss-20b     → openai/gpt-oss-20b            (NO-GO — reasoning bloat + socket timeout)
  gemini-2.5-flash-lite → google/gemini-2.5-flash-lite (10/13, 20% cit — chaotic)
  glm-4.5-air     → z-ai/glm-4.5-air              (3-run 13/12/12, 100% cit but 3.4× tok variance, ~$0.038/run)

Free hosted (OpenRouter):
  nemotron-super  → openai/gpt-oss-120b:free      (not run this session)
  gemma-4-31b     → google/gemma-4-31b-it:free    (auth issues historically)

Paid hosted (direct):
  sonnet-4-6      → claude-sonnet-4-6 (Anthropic)
  opus-4-7        → claude-opus-4-7 (Anthropic)
  claude-sonnet-or → anthropic/claude-sonnet-4-5 (via OpenRouter — uses OR key)

Free hosted (Groq):
  llama-3.3-70b   → llama-3.3-70b-versatile        (NO-GO — tool_use_failed + 12k TPM cap)

Ollama local (RTX 2070 SUPER — 8GB → 7-9B Q4 only; all below 10/13 viable bar):
  qwen2.5-7b         → qwen2.5:7b-instruct-q4_K_M     (8/13, 60% cit, 100s — best of 4 locals)
  llama3.1-8b        → llama3.1:8b-instruct-q4_K_M    (4/13, 20% cit)
  qwen3-8b           → qwen3:8b                       (4/13, 40% cit, behavior 0/5 all timeouts)
  qwen2.5-coder-7b   → qwen2.5-coder:7b               (2/13, 0% cit — coder variant not agentic)

Ollama remote (server GPU TBD):
  remote-gemma4      → gemma4:27b-it-q4_K_M
  remote-qwen32b     → qwen2.5:32b-instruct-q4_K_M
```

### Agent-layer interceptor (Phase A4 — 2026-04-23)
- **`lib/phantom-guard.ts`** — pre-flight scan of last user message for pre-evolution names (from `PRE_EVO_MAP` in `lib/team-validator.ts`, 23 entries) + explicit roster-excluded fully-evolved Pokemon (`EXPLICIT_PHANTOMS` — Amoonguss; extensible). If any match, short-circuits the agent loop with a hard refusal directing to the legal form. Hyphen-aware word-boundary regex `(?<![a-z0-9-])name(?![a-z0-9-])` so "porygon" inside "porygon-z" doesn't match.
- **Wired into:** [src/app/api/team/route.ts](../src/app/api/team/route.ts) POST handler (post-meta / pre-loop; emits `phantom_pokemon_refused` SSE event + content delta + done) and [scripts/eval-models.ts](../scripts/eval-models.ts) `runAgent()` (same short-circuit; returns synthetic result with `finalContent = formatPhantomRefusal(phantoms)`).
- **Why it exists:** 7-model bake-off (2026-04-23) confirmed `phantom_pokemon` fails on every LLM tested at 1/3-3/3 rate. Systemic LLM-behavior issue, not a Gemma quirk. Prompt hardening alone relies on LLM compliance — the interceptor is the structural fix.
- **Impact:** phantom_pokemon now passes 3/3 on Gemma `--real-rag` 3-run (was 2/3 pre-interceptor). LLM never called for phantom queries — 0 tokens, <100ms. No regressions on other 12 tests.

### Eval Harness (`scripts/eval-models.ts`) — v4
- **13 tests** (5 behavior + 5 retrieval + 3 hallucination):
  - Behavior: `tool_workflow`, `team_json`, `validate_loop`, `pokedex_dedup`, `item_availability`
  - Retrieval: `usage_lookup`, `usage_teammates`, `tournament_retrieval`, `creator_opinion`, `meta_core_attribution`
  - Hallucination: `phantom_pokemon`, `stat_accuracy`, `banned_comprehensive`
- **10-entry search stub** (was 9) — 10th entry: real Mega Golurk tournament teams (PC38/PC105/PC227/PC234)
- **TOURNAMENT directive** in SYSTEM constant — forces `search("{pokemon} tournament team")` before answering; never invent tournament rosters
- **Registered MODELS**: `gemma-4-26b` (default), `deepseek-v3`, `nemotron-super`, `gemma-4-31b`, `claude-sonnet` (Anthropic direct), `claude-sonnet-or` (OpenRouter)
- **Anthropic call path**: `toAnthropicFormat()` / `toAnthropicTools()` / `callAnthropic()` — dispatched when `model.provider === "anthropic"`; converts OAI message format to Anthropic format
- **Guardrails**: hard pokedex dedup cap (3rd+ identical call refused, log-push AFTER refusal check); post-loop force-completion (fires once if lastContent empty or no team-json block, disables tools for pure text)
- Per-call timeout: 120s; loop detection: dedup nudge after 2 identical tool calls; pokedex-cap nudge after >12 total pokedex calls
- `requireTeamJson` per-test flag; `lastContent` filters thinking-only responses ("thought\n\n")
- `--real-rag` flag: replaces stub with production Supabase search
- **Current baseline**: Gemma 4 26B `--real-rag` 3-run post-interceptor (2026-04-23): **13/13, 13/13, 12/13** @ 30k avg tok/pass, ~36s/test avg. Run-3 miss is `team_json` (pre-existing "forgot JSON block" flake). `phantom_pokemon` passes 3/3 runs (interceptor handles it pre-LLM). Citation validity 80/100/80 on retrieval tests — separate Gemma-side hallucination issue. 2026-04-23 bake-off verdicts summarized above in Model Registry
- `npm run eval:models` — supports `--models`, `--tests`, `--verbose`, `--real-rag`
- Results snapshot to `snapshots/model-eval-[timestamp].json`

## npm Scripts
- `calc` — `npx tsx scripts/calc.ts` (CLI damage calculator)
- `calc:web` — `npx serve tools/NCP-VGC-Damage-Calculator` (reference web calc)
- `calc:matrix` — `npx tsx scripts/build-matchup-matrix.ts` (full 275×274 matrix)
- `calc:test` — `npx tsx scripts/test-calc.ts` (41-test calc validation suite)
- `test` — Runs all 4 test suites sequentially (251 tests total)
- `test:calc` — `npx tsx scripts/test-calc.ts` (41 tests: stats, damage, 16 ability modifiers)
- `test:rag` — `npx tsx scripts/eval.ts` (25 tests: recall, MRR, per-category)
- `test:integration` — `npx tsx scripts/test-suite.ts` (74 tests: embedding, translation, search, realistic queries, lifecycle)
- `test:stress` — `npx tsx scripts/stress-test.ts` (111 tests: 7 tiers from simple lookups to strategic reasoning)

## Embedding Model
- **Current**: `Xenova/bge-small-en-v1.5` (33M params, 384-dim, fp32) — Stage 1.2 swap.
  - CLS pooling + L2 normalize; BGE query prefix (`Represent this sentence for searching relevant passages:`) on query-side `mode='query'`, raw text for `mode='doc'`.
  - MIT license, Transformers.js support.
  - Batch size: 64.
- Download: ~130MB (first run, cached locally in `~/.cache/huggingface/hub/`).
- **Production query path**: Hugging Face Inference API (`feature-extraction` endpoint) — `onnxruntime-node` does not bundle under Vercel's 250MB Lambda budget. See [memory/project_vercel_embedding_constraint.md](../.claude/projects/C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill/memory/project_vercel_embedding_constraint.md).
- **Previous**: `Xenova/all-MiniLM-L6-v2` (22M, 384-dim) — replaced in Stage 1.2 for ~+10 nDCG baseline shift. Earlier: `onnx-community/embeddinggemma-300m-ONNX` (too resource-heavy) and Stage 5 shadow attempt with `google/embeddinggemma-300m` MRL-384 (abandoned — Italian not a requirement).

## RAG Architecture (Post-Supabase Migration)
- **Storage**: Supabase `pc_chunks` (pgvector HNSW, `vector_cosine_ops`, 384-dim) + `pc_index_meta`
  - Generated `text_tsv TSVECTOR` column + GIN index for Postgres FTS
  - HNSW index on embedding for ANN
  - RLS on with anon/authenticated SELECT; writes via service role (bypasses RLS)
- **Hybrid search**: Single RPC `pc_hybrid_search(p_embedding, p_query, p_categories, p_fetch_k, p_rrf_k)` — combines ANN + FTS via RRF in one round-trip, returns `rrf_score` (~0.02-0.035 scale)
  - Uses `websearch_to_tsquery('english', p_query)` for FTS
  - CTEs for vec + fts rankings, `RANK() OVER` → `1/(k+rank)` combined
- **Intent classification**: Rule-based `classifyQuery()` in [lib/rag/classify.ts](../lib/rag/classify.ts) — detects usage/counter/stat/item/move/team queries via word-boundary matching against keyword sets + Pokemon name dictionary + move name dictionary. Dictionaries (`getPokemonNames`/`getMoveNames`/`getItemNames`/`getPokemonTypes`) are lazy-loaded from the CSVs in the same module.
- **Query routing (Stage 6.1)**: `routeQuery()` in [lib/rag/route.ts](../lib/rag/route.ts) — emits `QueryRoute { route, archetype, vsPair, phantomName, phantomEvolved }` used by force-include, pool-sizing, and boost logic. `ARCHETYPE_PATTERNS` + `PHANTOM_TO_EVOLVED` also live here.
- **Source filtering**: `data_category` array passed to the RPC (`ANY(p_categories)`)
- **Structured queries**: [lib/structured-query.ts](../lib/structured-query.ts) + `runStructuredFilter()` in [lib/rag/structured-filter.ts](../lib/rag/structured-filter.ts) — NL→supabase-js query builder chain (`.or()` per type, `.gte()/.lte()` per stat, `.not('pokemon_name','is',null)`)
  - Runs as a second round-trip alongside the hybrid RPC; results merged and deduped in TS
- **Force-include subsystem (post-Phase 4)**: `collectForceIncludes(question, intent, route, supabase): Promise<Map<string, ForcedChunk>>` in [lib/rag/force-includes.ts](../lib/rag/force-includes.ts). 7 blocks merged with first-wins insert (matches old global first-seen dedup), insertion order rules(0.08) → phantom(0.10) → phantomEvolved(0.09) → vsPair(0.08) → typeChart(0.07) → entity(0.08) → bannedItem(0.08). Called twice in the system now: (1) once in the single-query path inside `query()` against the user question; (2) once post-merge in `executePlan()` against the ORIGINAL query after sub-query merge (Phase 5 structural fix).
- **Planner-decomposed path (post-Phase 5)**: when `planQuery()` emits a multi-step plan (vspair / counter-archetype / team-archetype strategies), [lib/query-executor.ts](../lib/query-executor.ts) `executePlan()` runs a separate post-merge pipeline: fan out sub-queries via `rawCandidates` (embed + RPC only, no rerank/force-includes/boosts per sub-query) → `Promise.all` merge with max rrf_score by id → `collectForceIncludes(plan.originalQuery, originalIntent, originalRoute, supabase)` → optional `runStructuredFilter` (gated on `originalIntent.isStructured`) → parse → `applyBoosts(..., originalIntent, originalRoute, plan.originalQuery, boostMul=1)` → sort → slice topK. Stage 4.6 invariants hold by construction because force-includes and boosts key off the user's original wording. `perStep` floor raised to 160 on theory/counter/matchup routes to compensate for dropping the original query from the parallel batch.
- **Raw candidates primitive (Phase 5 Step 1)**: `rawCandidates(question, fetchK, onProgress?): Promise<{raw, intent, route}>` — private helper in [lib/rag.ts](../lib/rag.ts). Does embed + classify + route + RPC only. Shared between the single-query path (where `query()` applies rerank/structured/force-includes/boosts downstream) and the Phase 5 executor callback (which accumulates raw rows across sub-queries, then applies force-includes/boosts post-merge against the original query).
- **Multi-signal re-ranking**: 14 boost categories in [lib/rag/boost.ts](../lib/rag/boost.ts) via `applyBoosts(candidates, intent, route, question, boostMul)`. Calibrated to RRF scale (~0.02-0.035), multiplied by `boostMul` (1 when no reranker active, 20 when reranker scores in [0,1] replace RRF). Categories include: tier baselines (knowledge/team/usage/transcript/matchup/older-reference), structured results (+0.1), exact-entity matches (+0.04), counter/matchup knowledge-doc lift (+0.04), rules-doc mechanic lift (+0.035), adversarial banned-item rank-1 boost (+0.15), Stage 6.1 theory-route / archetype / vsPair / phantom / phantomEvolved boosts, speed-tiers doc (+0.035), item-intent (+0.03), team-intent usage/team lift (+0.03), project-doc penalty (-0.08). Full list in source.
- **Reranker dispatch (Phase 3 dormant, Phase 5-unblocked)**: [lib/rag.ts](../lib/rag.ts) reads `RERANKER` env (`crossencoder|gemma|jina|none`, **default `"none"` since 2026-04-23** — was silently `"jina"` before, wasting 300-500ms per RAG call on 403s from the depleted Jina account). [lib/rerank.ts](../lib/rerank.ts) holds three reranker clients:
  - `rerankCandidates` (Jina v2, dormant — balance depleted, returns null without API key)
  - `rerankWithGemma` (~140 LOC, Gemma 4 26B pointwise via OpenRouter, inline 10-slot worker pool, manual `AbortController` + `clearTimeout`, 800-char snippet, per-query SHA256 LRU cache)
  - `rerankWithCrossEncoder` (~80 LOC, BAAI/bge-reranker-base via HF Inference `text-classification` pipeline, single batched HTTP call for all 40 candidates, 1500-char snippet)
  - All return `Map<id, score>` in [0,1] or `null` on failure → caller falls through to RRF + boosts (boostMul=1). RERANK_POOL=40.
  - Phase 3 retry is next (post-Phase 5): wire a reranker step post-merge in [lib/query-executor.ts](../lib/query-executor.ts) (between `collectForceIncludes` and `applyBoosts`) that scores the merged pool against `plan.originalQuery`. The Phase 5 executor already parameterizes `boostMul` for this. On planner-decomposed paths, sub-query-level reranking is silently skipped today because `rawCandidates` doesn't call any reranker — the dormant passthrough reranker only fires on non-decomposed queries. Phase 3 retry target: 0.87-0.90 overall with cross-encoder re-enabled.
- **Chunk overlap**: Trailing-paragraph overlap for markdown chunks split on paragraph breaks (last 3 lines of previous paragraph prepended)
- **Staleness detection**: `checkStaleness()` in [lib/rag.ts](../lib/rag.ts) (kept in the orchestrator since it's a once-per-process initialization concern) reads `pc_index_meta` row `file_mtimes`, compares against current filesystem mtimes, warns on stderr if stale. **A13 (2026-04-23 evening, commit `740ef9b`)** added sibling `getStaleness(): Promise<StalenessInfo | null>` returning per-source mtime ages (youtube/pikalytics/sheets/serebii/knowledge) + global `indexedAt`, with 60s in-process cache and fs-drift detection (skipped on Vercel where Lambda mtimes are build-time, not reindex-time). Surfaces: SSE `{type: "staleness", data}` event in [src/app/api/team/route.ts](../src/app/api/team/route.ts) once per request; `staleness` field in GET response of [src/app/api/team/health/route.ts](../src/app/api/team/health/route.ts) (powers the webapp footer on mount); one-line print in [scripts/search.ts](../scripts/search.ts). Webapp renders via `<StalenessFooter>` in [src/app/team/page.tsx](../src/app/team/page.tsx) — amber styling when max source age > 72h, expand-on-click per-source grid.
- **Citation validation (Phase 2, 2026-04-22)**: [lib/validate-citations.ts](../lib/validate-citations.ts) — shared module. Agent responses must end with a `claims-json` fenced block; server-side validator checks every cited `chunk_id` against the set returned by `search` calls in the conversation. Hallucinated IDs trigger one auto-retry nudge. Used by both the prod agent loop ([src/app/api/team/route.ts](../src/app/api/team/route.ts)) and the eval harness ([scripts/eval-models.ts](../scripts/eval-models.ts)). Prod streams a `citation_result` SSE event; eval exposes `citation_validity_rate` in the summary + snapshot.
- **Matchup intent**: `isMatchupQuery` detection + MATCHUP_KEYWORDS + category boosting (+0.06 matchup data, +0.06 Pokemon name match)
- **Eval**: 25 test cases, `npx tsx scripts/eval.ts` — current: 100% pass, MRR 1.000
- **Comprehensive test suite**: `npx tsx scripts/test-suite.ts` — embedding, search quality, realistic queries (15 natural-language tests), overlap, lifecycle, scraper-header assertion
- **Stress test suite**: `npx tsx scripts/stress-test.ts` — 111 tests across 7 tiers (simple lookups, Champions mechanics, negative/absence, calc edge cases, multi-entity, intent classification, strategic reasoning)
- **Total test coverage**: 251 tests across 4 suites, all passing. Run all via `npm test`
- **Intent classification enhancements**: Move/item queries with Pokemon name now also pull "usage" category; "vs" added to MATCHUP_KEYWORDS; "most popular" added to USAGE_KEYWORDS; `hasItemKeyword`/`hasTeamKeyword` added to QueryIntent for ranking signals

## Damage Calculator (`lib/calc/`)
- **Custom TypeScript engine** — no external deps beyond csv-parse (already in project)
- `lib/calc/types.ts` — Core interfaces: PokemonData, MoveData, CompetitiveSet, CalcResult, FieldConditions, MatchupEntry
- `lib/calc/data.ts` — CSV data loader with lazy caching, 18×18 type chart, move flag sets (contact/sound/pulse/slicing/bite/punch), type-boost items map, resist berry map
- `lib/calc/stats.ts` — Champions SP calculator: HP = `floor((2*Base + 31 + SP*2) * 50/100) + 60`, Other = `floor((floor((2*Base + 31 + SP*2) * 50/100) + 5) * Nature)`
- `lib/calc/damage.ts` — Full damage engine with ordered modifier chain: spread → weather → crit → random → STAB → effectiveness → burn → screen → item → ~15 attacker abilities → ~10 defender abilities → Friend Guard → Helping Hand → Protect
- `lib/calc/matchup.ts` — Standard set generator (91 Pikalytics + 125 heuristic), matchup scorer with speed U-curve, full N×N matrix builder
- `lib/calc/efficiency.ts` — Efficiency coefficient engine: 6 sub-score calculators (offense, defense, speed, typing, movepool, mega), composite E(A,B) on [-1,+1], matrix builder, CSV exporter
- `lib/calc/index.ts` — Barrel export
- **CLI**: `npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"` — supports --weather, --spread, --crit, --mega, --item, --sp, --burned, --reflect, --screen, --helping-hand, --all
- **Matrix**: 275×274 (216 Pokemon + 59 Mega) = 75,350 pairs in ~1 second → `matchup_matrix.csv` (~5 MB)
- **Efficiency Matrix**: Same 75,350 pairs with 26 columns → `efficiency_matrix.csv` (~12 MB, builds in ~20s)
  - Formula: `E = 0.30*offense + 0.25*defense + 0.20*speed + 0.10*typing + 0.10*movepool + 0.05*mega`
  - Sub-scores: offense (dmg%, OHKO/2HKO, coverage depth), defense (survival margin, bulk ratio, type resist), speed (continuous diff, TR favor, priority, speed control), typing (log2 STAB diff, resist balance), movepool (coverage types, status threats, setup potential), mega (opportunity cost, ability bonuses)
  - Meta weight = `usagePct / maxUsagePct` stored as separate column; `isMeta` flag for Pikalytics-tracked Pokemon
  - Build: `npx tsx scripts/build-matchup-matrix.ts --efficiency` (full) or `--efficiency --top-only` (meta subset ~1.4s)
- **Validation**: 41/41 tests pass (`scripts/test-calc.ts`) — stats, type chart, damage calcs, immunities, weather, screens, burn, protect, 16 ability modifier tests (Helping Hand, Multiscale, Tough Claws, Mega Launcher, Adaptability, Guts, Tinted Lens, Filter, Technician, Sharpness, Aurora Veil, Piercing Drill, Friend Guard)
- **Reference calc**: NCP-VGC-Damage-Calculator cloned to `tools/` (gitignored) for cross-validation

## Data Pipeline

_This section is the single source of truth for "how data gets into the RAG index and how fresh it is." Per-script implementation detail follows in "Scraper Architecture" below. Automation lives in [.github/workflows/refresh.yml](../.github/workflows/refresh.yml)._

### Source inventory

| # | Source | Script (root dir) | Output(s) | Auth / Rate limit | Current schedule | Invocation |
|---|--------|-------------------|-----------|-------------------|------------------|------------|
| 1 | **Serebii** (`serebii.net/pokemonchampions/`) | `scraper.py` | `pokemon_champions.csv` (216 rows incl. forms), `mega_evolutions.csv` (59), `moves.csv` (494), `items.csv` (138), `mega_abilities.csv` (23), `new_abilities.csv` (4), `updated_attacks.csv` (21), `status_conditions.txt`, `training_mechanics.txt` | No auth; self-imposed 1s delay per Pokémon page. No documented rate-limit ceiling. | **MANUAL ONLY** — not in cron | `python scraper.py` (via `/refresh` or shell) |
| 2 | **Pikalytics** (`pikalytics.com/pokedex/championstournaments`) | `scraper_pikalytics.py` | `pikalytics_usage.csv` (89/216 mons have tournament data; 125 return 404 for form variants) | No auth. Cloudflare layer caches per-URL and ignores `Accept-Language` header; mitigated A6 (2026-04-23) via cache-bust query param + retry + prior-EN fallback + `sys.exit(1)` on no-fallback. No documented ceiling; behaves politely | **GH Actions cron `0 0,12 * * *`** (2×/day @ 00:00 + 12:00 UTC) | `python scraper_pikalytics.py` |
| 3 | **VGCPastes Google Sheets** (public Google Vis API) | `scraper_sheets.py` | `tournament_teams.csv` (current: 445 teams from 118+ players, post-A3) | No auth (public sheet); single HTTP request | **GH Actions cron `0 0,12 * * *`** (2×/day) | `python scraper_sheets.py` |
| 4 | **YouTube Transcripts** (creator videos via yt-dlp + `youtube-transcript-api`) | `scraper_youtube.py` (via [scripts/scrape-youtube-local.bat](../scripts/scrape-youtube-local.bat)) | `data/transcripts/unknown_<channel>_<slug>.md` (YAML frontmatter + transcript body) | No auth required, but **`youtube-transcript-api` is IP-banned on cloud providers (AWS/Azure/GCP)** — must run from residential IP. Also throttles after ~24 sequential requests with 1–24h cooldown. `DELAY_SECONDS=1` polite delay between fetches. 21 search queries × dateafter=20260408. Dedupes against existing transcript filenames | **Local Windows Task Scheduler, 2×/day** (residential IP required — see [errors.md](errors.md) "YouTube cloud-IP ban"). NOT in GH Actions cron | `scripts/scrape-youtube-local.bat` (wraps scrape + commit/push) or direct `python scraper_youtube.py` |
| 5 | **Research docs + creator knowledge** (manually curated) | n/a (human edit) | `data/knowledge/*.md` (meta_snapshot, team_archetypes, speed_tiers, champions_rules, singles_meta, team_building_theory, damage_calc, type_chart), `research/*.md` | n/a | Manual commit when user ships analysis | Direct `Edit`/`Write` |

### Reindex step (always runs after any scrape)

- `npx tsx scripts/index-data.ts` — embeds all CSVs + knowledge .md + transcripts into Supabase `pc_chunks` (HNSW + text_tsv). Post-A3 baseline: **2,511 chunks**. This step IS in the GH Actions workflow (runs after the two scrapers that are in cron).

### Current automation state (as of 2026-04-23 evening — post A10-revised/A11)

- **In GH Actions cron (`.github/workflows/refresh.yml`, `0 0,12 * * *`):** Pikalytics + VGCPastes Sheets + reindex + git commit/push. Runs **2×/day @ 00:00 + 12:00 UTC** from the `Production` environment (supabase secrets scoped there). Both scrape steps have `continue-on-error: true`. Reindex step has `env:` block passing `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET` from env-level secrets.
- **On local Windows Task Scheduler (user's residential IP):** `scripts/scrape-youtube-local.bat` wrapping `python scraper_youtube.py`. Cannot run in GH Actions because `youtube-transcript-api` blocks all cloud-provider IPs (Azure, AWS, GCP). Scrape-only — the GH Actions cron handles reindex on its next fire once local pushes a new transcript commit to main. See [errors.md](errors.md) "YouTube cloud-IP ban" for evidence.
- **NOT in cron:** Serebii (mostly-static game data — only drifts on patches; tracked as A12, low urgency).
- **User-triggered `/refresh` skill** (`.claude/commands/refresh.md`): can run any scraper on demand. Invoked by conversational `/refresh pikalytics|sheets|all`.

### Local YouTube task — registered 2026-04-23 evening

**Status:** `pokemon-youtube-scraper` is live on the user's desktop. `schtasks /query /tn "pokemon-youtube-scraper"` reports Status=Ready, Schedule=Every 12 Hours, Run As User=paulo, Next Run=2026-04-24 07:57 local.

**Registration command** (already executed; kept here for re-registration / second-machine setup):

```bash
schtasks /create /tn "pokemon-youtube-scraper" \
  /tr "C:\Users\paulo\Documents\LOCAL_WORKSPACE\1-pokemon-skill\scripts\scrape-youtube-local.bat" \
  /sc hourly /mo 12 /ru paulo /it
```

- `/mo 12` → every 12 hours. Matches the GH Actions cadence.
- `/ru paulo /it` → run as the logged-in user, interactive-only (no password prompt; fires only when the user is logged on — fine for a desktop box).
- Logs land in `scripts/logs/youtube-YYYY-MM-DD.log`.
- Inspect: `schtasks /query /tn "pokemon-youtube-scraper" /fo LIST /v`.
- Trigger on demand: `schtasks /run /tn "pokemon-youtube-scraper"`.
- Remove: `schtasks /delete /tn "pokemon-youtube-scraper" /f`.

### Freshness SLOs (target state — see A10/A11/A12 for rollout)

| Source | Volatility | Target cadence | Current cadence | Gap |
|--------|-----------|----------------|-----------------|-----|
| YouTube transcripts | **HIGH** — creators drop videos daily post-release | ≥ 2×/day (or max the API allows without 24h cooldown) | 2×/day via local Windows Task Scheduler (A10 revised 2026-04-23 after cloud-IP ban discovered) | CLOSED (local-IP dependent) |
| Pikalytics usage | MEDIUM — tournament stats shift weekly | Every 1–2 days | 2×/day (A11 shipped 2026-04-23) | CLOSED |
| VGCPastes Sheets | MEDIUM — new teams as tournaments happen | Every 1–2 days | 2×/day (A11 shipped 2026-04-23) | CLOSED |
| Serebii (static game data) | LOW — changes only on patches | Weekly or bi-weekly | Manual only | A12 (low priority) |
| Knowledge/research docs | Author-driven | As-authored | As-authored | No gap |

### Known scrape-time data-quality issues

- **Multilingual locale flips in pikalytics scrape (RESOLVED via A6, 2026-04-23 late evening, commit `6c2c101`)** — originally discovered as "Japanese text in 14 rows" during A5 self-eval. Investigation across 3 consecutive scrapes revealed contamination was multilingual (JP, CN-trad, CN-simp, ES, DE, FR, KR all observed) with the affected set drifting per scrape. Root cause: Pikalytics' Cloudflare layer caches per-URL and ignores the `Accept-Language` header. Fix layered into [scraper_pikalytics.py](../scraper_pikalytics.py): cache-bust query param `?_r=<random>` + `Cache-Control: no-cache` + post-parse non-ASCII detection (`[^\x00-\x7f]`) + in-scrape retry loop + `load_prior_english_rows()` fallback when retries exhausted + final `sys.exit(1)` if any row remains non-EN with no EN fallback + manual English seed for Floette-Eternal (Pikalytics appears permanently non-EN for that URL). Self-healing property: future cron runs that hit new Pokemon preserve prior EN automatically. Detection command (Python, covers all locales): `python -c "import csv,re; NE=re.compile(r'[^\x00-\x7f]'); [print(r['pokemon']) for r in csv.DictReader(open('pikalytics_usage.csv',encoding='utf-8')) if NE.search(r.get('top_moves','')) or NE.search(r.get('top_items',''))]"`.
- **Staleness telemetry (RESOLVED via A13, 2026-04-23 evening, commit `740ef9b`)** — `pc_index_meta.file_mtimes` is now surfaced via `getStaleness()` returning `StalenessInfo` with per-source mtime ages. Visible on webapp `/team` footer ("Data refreshed Nh ago"), `/lookup` CLI one-liner before results, and SSE `{type: "staleness"}` event in the agent-loop route. Amber warning banner above 72h stale.

## Scraper Architecture

### scraper.py (Serebii)
- Source: `serebii.net/pokemonchampions/` and `/pokedex-champions/`
- 1-second delay between Pokémon page requests
- Deduplicates by URL (Mega/regional forms share base URLs)
- Extracts all forms (base + Mega) from each page
- Key HTML patterns:
  - Type images: `<img src="/pokedex-bw/type/{type}.gif">`
  - Abilities: `<a href="/abilitydex/...">`
  - Moves: "Standard Moves" `dextable`
  - Mega sections: `class="fooevo"` headers

### scraper_pikalytics.py (Pikalytics)
- Source: `pikalytics.com/pokedex/championstournaments`
- Headers: `Accept-Language: en-US,en;q=0.9` (prevents Italian text)
- Iterates `pokemon_champions.csv` names directly — covers all 216 rows incl. form variants (`Rotom-Wash`, `Ninetales-Alola`, `Tauros-Paldea-Aqua`, etc.)
- 91/216 Pokemon have tournament data (125 return 404, incl. 4 form variants that Pikalytics aggregates under base species: Basculegion-F, Palafin-Hero, Lycanroc poses, Gourgeist sizes)
- Output: `pikalytics_usage.csv` with pipe-delimited top moves/items/abilities/teammates

### scraper_youtube.py (YouTube)
- yt-dlp for search (no API key needed)
- youtube-transcript-api for transcripts (auto-captions)
- Date filter: `--dateafter 20260408` (release day)
- Keyword filter on titles; rejects S/V, Sword/Shield, Unite, TCG, etc.
- Output: `data/transcripts/{date}_{channel}_{slug}.md` with YAML frontmatter
- Deduplication: reads existing transcripts to skip re-downloads
- 21 search queries covering competitive topics, specific creators, and mechanics
- **Must run from residential IP.** `youtube-transcript-api` hard-blocks AWS/Azure/GCP. GH Actions runners are Azure → step returned `Saved: 0 transcripts` when initially wired in A10 (2026-04-23). Scraper itself works identically on any network; only the API it calls rejects cloud IPs. Local wrapper at [scripts/scrape-youtube-local.bat](../scripts/scrape-youtube-local.bat) handles scheduling via Windows Task Scheduler + commits/pushes new transcripts to main for the GH Actions cron to reindex.

### scraper_sheets.py (VGCPastes)
- Google Visualization API — single HTTP request
- 136 teams from 118 players
- Output: `tournament_teams.csv`
