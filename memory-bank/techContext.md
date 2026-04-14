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
- `@lancedb/lancedb` (^0.27.2) — Vector database
- `apache-arrow` (^18.1.0) — Data serialization
- `csv-parse` (^6.2.1) — CSV parsing
- `tsx` (^4.21.0) — TypeScript executor
- `typescript` (^6.0.2)

## npm Scripts
- `calc` — `npx tsx scripts/calc.ts` (CLI damage calculator)
- `calc:web` — `npx serve tools/NCP-VGC-Damage-Calculator` (reference web calc)
- `calc:matrix` — `npx tsx scripts/build-matchup-matrix.ts` (full 244×244 matrix)
- `calc:test` — `npx tsx scripts/test-calc.ts` (24-test validation suite)

## Embedding Model
- **Current**: `onnx-community/embeddinggemma-300m-ONNX` (308M params, 768-dim, q8 quantization)
  - Does NOT support fp16 — use fp32, q8, or q4
  - Requires task prefixes: queries = `task: search result | query: <text>`, documents = `title: none | text: <text>`
  - Apache 2.0 license, proven Transformers.js support
  - `embed(texts, mode)` — mode is `"query"` or `"document"` (default `"document"`)
  - Batch size: 16 (reduced from 64 for larger model)
- Download: ~300MB (first run, cached locally in `~/.cache/huggingface/hub/`)
- Normalization: L2 for cosine distance
- **Previous**: `Xenova/all-MiniLM-L6-v2` (22M params, 384-dim) — replaced in Phase 5

## RAG Architecture (Post-Phase 8 Overhaul)
- **Hybrid search**: LanceDB native FTS (BM25 via Tantivy) + vector search + RRF reranker (k=60)
  - Import: `import { connect, rerankers } from "@lancedb/lancedb"` (NOT from subpath `/rerankers`)
  - Chained: `table.vectorSearch(vector).distanceType("cosine").fullTextSearch(question).rerank(reranker).limit(k)`
  - RRF scores are ~0.02-0.035 scale (not 0-1)
- **Intent classification**: Rule-based `classifyQuery()` in `lib/rag.ts` — detects usage/counter/stat/item/move/team queries via word-boundary matching against keyword sets + Pokemon name dictionary + move name dictionary
- **Source filtering**: `data_category` column with scalar index, applied as `where()` predicate
- **Structured queries**: `lib/structured-query.ts` — NL→SQL for stat-based filtering (type, speed, attack, etc.)
  - **IMPORTANT**: Do NOT combine `data_category` scalar index with non-indexed stat columns in WHERE — LanceDB returns incomplete results. Stat columns are null for non-Pokemon chunks, so category filter is redundant.
- **Multi-signal re-ranking**: 6 additive boosts calibrated to RRF scale:
  - Structured results: +0.1
  - Usage intent + matching Pokemon: +0.1
  - General usage intent: +0.05
  - Exact Pokemon name match: +0.04
  - Exact move name match: +0.04
  - Counter query + knowledge docs: +0.015
  - Project docs penalty: -0.08
- **Translation layer**: Italian→English translations applied at chunk time for Pikalytics data (`lib/translations.json`, 2,383 entries)
- **Chunk overlap**: Trailing-paragraph overlap for markdown chunks split on paragraph breaks (last 3 lines of previous paragraph prepended)
- **Staleness detection**: `checkStaleness()` in `rag.ts` reads `.lancedb/index-meta.json`, compares file mtimes, warns on stderr if stale (runs once per process)
- **Matchup intent**: `isMatchupQuery` detection + MATCHUP_KEYWORDS + category boosting (+0.06 matchup data, +0.06 Pokemon name match)
- **Eval**: 25 test cases, `npx tsx scripts/eval.ts` — current: 100% pass, MRR 0.958
- **Comprehensive test suite**: `npx tsx scripts/test-suite.ts` — 51 tests across embedding, translation, search quality, overlap, lifecycle, scraper

## Damage Calculator (`lib/calc/`)
- **Custom TypeScript engine** — no external deps beyond csv-parse (already in project)
- `lib/calc/types.ts` — Core interfaces: PokemonData, MoveData, CompetitiveSet, CalcResult, FieldConditions, MatchupEntry
- `lib/calc/data.ts` — CSV data loader with lazy caching, 18×18 type chart, move flag sets (contact/sound/pulse/slicing/bite/punch), type-boost items map, resist berry map
- `lib/calc/stats.ts` — Champions SP calculator: HP = `floor((2*Base + 31 + SP*2) * 50/100) + 60`, Other = `floor((floor((2*Base + 31 + SP*2) * 50/100) + 5) * Nature)`
- `lib/calc/damage.ts` — Full damage engine with ordered modifier chain: spread → weather → crit → random → STAB → effectiveness → burn → screen → item → ~15 attacker abilities → ~10 defender abilities → Friend Guard → Helping Hand → Protect
- `lib/calc/matchup.ts` — Standard set generator (80 Pikalytics + 106 heuristic), matchup scorer with speed U-curve, full N×N matrix builder
- `lib/calc/index.ts` — Barrel export
- **CLI**: `npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"` — supports --weather, --spread, --crit, --mega, --item, --sp, --burned, --reflect, --screen, --helping-hand, --all
- **Matrix**: 244×244 (186 base + 59 mega - 1 overlap) = 59,292 pairs in ~1 second → `matchup_matrix.csv` (3.8 MB)
- **Validation**: 24/24 tests pass (`scripts/test-calc.ts`) — stats, type chart, damage calcs, immunities, weather, screens, burn, protect
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
