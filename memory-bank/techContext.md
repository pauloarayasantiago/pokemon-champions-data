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

**Current DEFAULT_MODEL**: `gemma-4-26b` (Gemma 4 26B A4B via OpenRouter)

### Adapters
| File | Provider | Notes |
|------|----------|-------|
| `anthropic.ts` | Anthropic SDK | Claude Sonnet/Opus — paid |
| `gemini.ts` | Google AI Studio | `gemini-2.5-flash` — free, available as fallback |
| `groq.ts` | Groq | `llama-3.3-70b-versatile` — free |
| `openrouter.ts` | OpenRouter | `gemma-4-26b` (default), `gpt-oss-120b`, `gemma-4-31b` |
| `ollama.ts` | Ollama (local + remote) | Wired but untested — server GPU unknown |

### Ollama (wired, not yet validated)
- Local: `OLLAMA_BASE_URL` (default `http://localhost:11434`) — for 7-9B models on RTX 2070 SUPER 8GB
- Remote: `OLLAMA_REMOTE_URL` + `OLLAMA_REMOTE_KEY` — for larger models on a managed server
- Routes by model ID prefix: `remote-*` → remote config, others → local config

### Model Registry
```
DEFAULT → gemma-4-26b

Free hosted (OpenRouter):
  gemma-4-26b     → google/gemma-4-26b-a4b-it   ← CURRENT DEFAULT (6-7/7 eval score)
  nemotron-super  → openai/gpt-oss-120b:free      (3/7)
  gemma-4-31b     → google/gemma-4-31b-it:free   (auth error — Google key needed in OpenRouter)

Free hosted (direct):
  gemini-2.5-flash → gemini-2.5-flash (Gemini API — former default, available as fallback)
  llama-3.3-70b    → llama-3.3-70b-versatile (Groq)

Paid:
  sonnet-4-6      → claude-sonnet-4-6 (Anthropic)
  opus-4-7        → claude-opus-4-7 (Anthropic)

Ollama local (wired, needs install + model pull):
  qwen2.5-7b      → qwen2.5:7b-instruct-q4_K_M
  llama3.1-8b     → llama3.1:8b-instruct-q4_K_M

Ollama remote (wired, server GPU TBD):
  remote-gemma4   → gemma4:27b-it-q4_K_M    (corrected from gemma3 placeholder)
  remote-qwen32b  → qwen2.5:32b-instruct-q4_K_M
```

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
- **Current baseline**: Gemma 4 26B **12/13** (creator_opinion flaky ~50%; all others consistent). DeepSeek V3.2 evaluated 9/13 — rejected due to hallucination failures
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
- **Reranker dispatch (Phase 3 dormant, Phase 5-unblocked)**: [lib/rag.ts:169-210](../lib/rag.ts) reads `RERANKER` env (`crossencoder|gemma|jina|none`, default falls through to "jina"). [lib/rerank.ts](../lib/rerank.ts) holds three reranker clients:
  - `rerankCandidates` (Jina v2, dormant — balance depleted, returns null without API key)
  - `rerankWithGemma` (~140 LOC, Gemma 4 26B pointwise via OpenRouter, inline 10-slot worker pool, manual `AbortController` + `clearTimeout`, 800-char snippet, per-query SHA256 LRU cache)
  - `rerankWithCrossEncoder` (~80 LOC, BAAI/bge-reranker-base via HF Inference `text-classification` pipeline, single batched HTTP call for all 40 candidates, 1500-char snippet)
  - All return `Map<id, score>` in [0,1] or `null` on failure → caller falls through to RRF + boosts (boostMul=1). RERANK_POOL=40.
  - Phase 3 retry is next (post-Phase 5): wire a reranker step post-merge in [lib/query-executor.ts](../lib/query-executor.ts) (between `collectForceIncludes` and `applyBoosts`) that scores the merged pool against `plan.originalQuery`. The Phase 5 executor already parameterizes `boostMul` for this. On planner-decomposed paths, sub-query-level reranking is silently skipped today because `rawCandidates` doesn't call any reranker — the dormant passthrough reranker only fires on non-decomposed queries. Phase 3 retry target: 0.87-0.90 overall with cross-encoder re-enabled.
- **Chunk overlap**: Trailing-paragraph overlap for markdown chunks split on paragraph breaks (last 3 lines of previous paragraph prepended)
- **Staleness detection**: `checkStaleness()` in [lib/rag.ts](../lib/rag.ts) (kept in the orchestrator since it's a once-per-process initialization concern) reads `pc_index_meta` row `file_mtimes`, compares against current filesystem mtimes, warns on stderr if stale.
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

### scraper_sheets.py (VGCPastes)
- Google Visualization API — single HTTP request
- 136 teams from 118 players
- Output: `tournament_teams.csv`
