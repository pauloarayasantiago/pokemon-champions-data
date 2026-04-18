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

## npm Scripts
- `calc` — `npx tsx scripts/calc.ts` (CLI damage calculator)
- `calc:web` — `npx serve tools/NCP-VGC-Damage-Calculator` (reference web calc)
- `calc:matrix` — `npx tsx scripts/build-matchup-matrix.ts` (full 244×244 matrix)
- `calc:test` — `npx tsx scripts/test-calc.ts` (41-test calc validation suite)
- `test` — Runs all 4 test suites sequentially (251 tests total)
- `test:calc` — `npx tsx scripts/test-calc.ts` (41 tests: stats, damage, 16 ability modifiers)
- `test:rag` — `npx tsx scripts/eval.ts` (25 tests: recall, MRR, per-category)
- `test:integration` — `npx tsx scripts/test-suite.ts` (74 tests: embedding, translation, search, realistic queries, lifecycle)
- `test:stress` — `npx tsx scripts/stress-test.ts` (111 tests: 7 tiers from simple lookups to strategic reasoning)

## Embedding Model
- **Current**: `Xenova/all-MiniLM-L6-v2` (22M params, 384-dim, fp32)
  - No task prefixes needed — raw text embedded directly
  - Apache 2.0 license, Transformers.js support
  - `embed(texts, mode)` — mode parameter retained for API compatibility but MiniLM treats both identically
  - Batch size: 64
  - ~4× faster indexing than EmbeddingGemma, ~4× smaller download
- Download: ~80MB (first run, cached locally in `~/.cache/huggingface/hub/`)
- Normalization: L2 for cosine distance (pooling: mean, normalize: true)
- **Previous**: `onnx-community/embeddinggemma-300m-ONNX` (308M params, 768-dim, q8) — replaced for performance reasons (too resource-heavy)

## RAG Architecture (Post-Supabase Migration)
- **Storage**: Supabase `pc_chunks` (pgvector HNSW, `vector_cosine_ops`, 384-dim) + `pc_index_meta`
  - Generated `text_tsv TSVECTOR` column + GIN index for Postgres FTS
  - HNSW index on embedding for ANN
  - RLS on with anon/authenticated SELECT; writes via service role (bypasses RLS)
- **Hybrid search**: Single RPC `pc_hybrid_search(p_embedding, p_query, p_categories, p_fetch_k, p_rrf_k)` — combines ANN + FTS via RRF in one round-trip, returns `rrf_score` (~0.02-0.035 scale)
  - Uses `websearch_to_tsquery('english', p_query)` for FTS
  - CTEs for vec + fts rankings, `RANK() OVER` → `1/(k+rank)` combined
- **Intent classification**: Rule-based `classifyQuery()` in `lib/rag.ts` — detects usage/counter/stat/item/move/team queries via word-boundary matching against keyword sets + Pokemon name dictionary + move name dictionary
- **Source filtering**: `data_category` array passed to the RPC (`ANY(p_categories)`)
- **Structured queries**: `lib/structured-query.ts` + `runStructuredFilter()` in `lib/rag.ts` — NL→supabase-js query builder chain (`.or()` per type, `.gte()/.lte()` per stat, `.not('pokemon_name','is',null)`)
  - Runs as a second round-trip alongside the hybrid RPC; results merged and deduped in TS
- **Multi-signal re-ranking**: 8 additive boosts calibrated to RRF scale:
  - Structured results: +0.1
  - Usage intent + matching Pokemon: +0.1
  - General usage intent: +0.05
  - Exact Pokemon name match: +0.04
  - Exact move name match: +0.04
  - Counter query + knowledge docs: +0.015
  - Item chunk + item intent: +0.03
  - Team chunk penalty (non-team queries): -0.015
  - Project docs penalty: -0.08
- **Translation layer**: Italian→English translations applied at chunk time for Pikalytics data (`lib/translations.json`, 2,383 entries)
- **Chunk overlap**: Trailing-paragraph overlap for markdown chunks split on paragraph breaks (last 3 lines of previous paragraph prepended)
- **Staleness detection**: `checkStaleness()` in `rag.ts` reads `pc_index_meta` row `file_mtimes`, compares against current filesystem mtimes, warns on stderr if stale (runs once per process)
- **Matchup intent**: `isMatchupQuery` detection + MATCHUP_KEYWORDS + category boosting (+0.06 matchup data, +0.06 Pokemon name match)
- **Eval**: 25 test cases, `npx tsx scripts/eval.ts` — current: 100% pass, MRR 1.000
- **Comprehensive test suite**: `npx tsx scripts/test-suite.ts` — 74 tests across embedding, translation, search quality, realistic queries (15 natural-language tests), overlap, lifecycle, scraper
- **Stress test suite**: `npx tsx scripts/stress-test.ts` — 111 tests across 7 tiers (simple lookups, Champions mechanics, negative/absence, calc edge cases, multi-entity, intent classification, strategic reasoning)
- **Total test coverage**: 251 tests across 4 suites, all passing. Run all via `npm test`
- **Intent classification enhancements**: Move/item queries with Pokemon name now also pull "usage" category; "vs" added to MATCHUP_KEYWORDS; "most popular" added to USAGE_KEYWORDS; `hasItemKeyword`/`hasTeamKeyword` added to QueryIntent for ranking signals

## Damage Calculator (`lib/calc/`)
- **Custom TypeScript engine** — no external deps beyond csv-parse (already in project)
- `lib/calc/types.ts` — Core interfaces: PokemonData, MoveData, CompetitiveSet, CalcResult, FieldConditions, MatchupEntry
- `lib/calc/data.ts` — CSV data loader with lazy caching, 18×18 type chart, move flag sets (contact/sound/pulse/slicing/bite/punch), type-boost items map, resist berry map
- `lib/calc/stats.ts` — Champions SP calculator: HP = `floor((2*Base + 31 + SP*2) * 50/100) + 60`, Other = `floor((floor((2*Base + 31 + SP*2) * 50/100) + 5) * Nature)`
- `lib/calc/damage.ts` — Full damage engine with ordered modifier chain: spread → weather → crit → random → STAB → effectiveness → burn → screen → item → ~15 attacker abilities → ~10 defender abilities → Friend Guard → Helping Hand → Protect
- `lib/calc/matchup.ts` — Standard set generator (80 Pikalytics + 106 heuristic), matchup scorer with speed U-curve, full N×N matrix builder
- `lib/calc/efficiency.ts` — Efficiency coefficient engine: 6 sub-score calculators (offense, defense, speed, typing, movepool, mega), composite E(A,B) on [-1,+1], matrix builder, CSV exporter
- `lib/calc/index.ts` — Barrel export
- **CLI**: `npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"` — supports --weather, --spread, --crit, --mega, --item, --sp, --burned, --reflect, --screen, --helping-hand, --all
- **Matrix**: 244×244 (186 base + 59 mega - 1 overlap) = 59,292 pairs in ~1 second → `matchup_matrix.csv` (3.8 MB)
- **Efficiency Matrix**: Same 59,292 pairs with 26 columns → `efficiency_matrix.csv` (~9.6 MB, builds in ~15s)
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
- 80/186 Pokemon have tournament data (106 return 404)
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
