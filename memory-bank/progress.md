# Progress

## Completed

### Initial Pokémon Scrape (2026-04-12)
- 186 unique Pokémon extracted from Serebii list page
- Types, moves per Pokémon (40-105 moves each)
- Zero failures

### Items Scrape (2026-04-12)
- 138 items: 27 Hold Items, 59 Mega Stones, 27 Berries, 25 Miscellaneous
- Includes effect descriptions and VP costs/locations

### Move Database Scrape (2026-04-12)
- 494 moves with type, category (Physical/Special/Status), PP, power, accuracy, effect

### Updated Attacks Scrape (2026-04-12)
- 21 moves with changed stats from Scarlet/Violet
- Notable: Growth → Grass type, Moonblast effect chance 30→10%, Mountain Gale power 100→120

### New Abilities (2026-04-12)
- 4 new abilities: Piercing Drill, Dragonize, Mega Sol, Spicy Spray

### Mega Abilities (2026-04-12)
- 23 Mega Evolutions with new abilities (partial — only those on megaabilities page)

### Status Conditions & Training (2026-04-12)
- Freeze, Paralysis, Sleep changes documented
- VP cost system documented

### Abilities Added to Pokémon CSV (2026-04-12)
- Re-scraped all 186 Pokémon with abilities column added
- Verified: Machamp = Guts|No Guard|Steadfast, Charizard = Blaze|Solar Power

### Type Parsing Bug Fix (2026-04-12)
- Fixed: single-type Pokémon were picking up move type images as type2
- Solution: restricted type extraction to links pointing to `/pokedex-champions/{type}.shtml`

### RAG System (2026-04-12)
- LanceDB vector database with Xenova/all-MiniLM-L6-v2 embeddings (384-dim)
- Chunking pipeline for all CSV and text file types
- `/lookup` and `/reindex` Claude Code skills
- Incremental indexing with `--force` rebuild option

### YouTube Transcript Scraper (2026-04-12)
- Built `scraper_youtube.py` using yt-dlp + youtube-transcript-api
- 24 transcripts downloaded (868KB total) from competitive creators
- Creators captured: WolfeyVGC, CybertronVGC, TheBattleRoom, Joeux9, Skraw VGC, Kneeckoh, PanfroGames, Pimpnite, Verlisify, ThatsAPlusOne, ThatsAVGC, ChampionMads, CK49, PokeProfessorJosh, KonamiPlsNerf, TrainerHG
- Content: team building guides, tier lists, mega evolution rankings, tournament analysis, beginner guides
- Rate-limited after first batch — YouTube IP block (no documented cooldown period)

### External Research (2026-04-12)
- 3 research documents collected in `research/` folder:
  - `claude-research.md` — Deep competitive analysis covering all mechanic changes, move changelog, new abilities, item pool, usage stats, meta archetypes, community resources
  - `Gemini.txt` — Exhaustive meta-analysis covering EV→Stat Points system, roster pruning, Mega Evolution rules, item economy, and detailed balance changes
  - `Pokémon Champions (2026) — Competitive Knowledge Base.md` — Comprehensive reference with usage data, timer rules, event schedule, Pokémon-specific move pool changes, bug reports

### AI System Architecture (2026-04-12)
- **CLAUDE.md** — Expert persona with mandatory lookup-first rule, Champions mechanics quick reference, missing items list, meta context, skill directory
- **`/team` skill** (.claude/commands/team.md) — 5 modes: Build, Fill, Evaluate, Counter, Sets. Multi-query RAG workflow, validation checklist, structured output templates
- **`/research` skill** (.claude/commands/research.md) — WebSearch/WebFetch workflow with Champions vs S/V disambiguation, priority source list, save-to-research conventions
- **7 knowledge documents** (data/knowledge/):
  - type_chart.md — 18-type offensive + defensive matchups (37 chunks)
  - damage_calc.md — Formula, STAB, weather, items, SP system, spread moves (12 chunks)
  - team_archetypes.md — Rain, Sun, Sand, TR, Tailwind, Balance, Semi-Room (9 chunks)
  - team_building_theory.md — Coverage, speed control, role compression, Doubles tactics (12 chunks)
  - meta_snapshot.md — Top 20 usage, WR, cores, archetypes, S-tier Megas (8 chunks)
  - speed_tiers.md — Lv50 benchmarks, TR tiers, weather/Tailwind speeds (10 chunks)
  - champions_rules.md — Reg M-A rules, timer, bans, bugs, event schedule (13 chunks)
- **Scraper base stats update** — `parse_base_stats()` and `parse_mega_stats()` added to scraper.py; chunker.ts updated to include stats in chunk text and metadata
- **Registered** 7 knowledge docs in index-data.ts
- **Reindexed** to 1,330 chunks (from 1,229)

### Scraper Base Stats Fix & Re-run (2026-04-12)
- Fixed `parse_base_stats()` and `parse_mega_stats()` — Serebii uses fooevo header "Stats" in row 0, column headers in row 1, base stats in row 2 (original code expected headers in row 0)
- Fixed mega stats matching from name-based lookup to index-based pairing (mega stat tables don't contain mega names)
- 185/186 Pokemon now have base stats (Floette missing — Serebii page layout issue)
- All 59 Mega Evolutions have base stats
- All other data files refreshed: 138 items, 494 moves, 21 updated attacks, 4 new abilities, 23 mega abilities

### Reindex with Stats (2026-04-12)
- Force rebuild of LanceDB: 1,335 chunks across 50 files
- All Pokemon and Mega chunks now include base stats in text and metadata
- Up from 1,330 chunks (5 new from updated memory-bank files)

### Pikalytics Usage Scraper (2026-04-12)
- Built `scraper_pikalytics.py` — scrapes per-Pokemon usage stats from Pikalytics Champions tournaments
- 80/186 Pokemon have tournament data (106 return 404 — insufficient appearances)
- Data includes: usage %, rank, top moves, items, abilities, teammates (pipe-delimited name:pct format)
- Bug fix: Pikalytics meta tag uses `name="Description"` (capital D), not `name="description"`
- Known issue: some move names in non-English (depends on tournament submission language)
- Mr. Rime has no Pikalytics page (slug format unknown)
- Output: `pikalytics_usage.csv`

### Google Sheets Tournament Teams Scraper (2026-04-12)
- Built `scraper_sheets.py` — downloads VGCPastes tournament team repository via Google Visualization API
- 136 teams from 118 players with team compositions, items, replica codes, tournament info
- Single HTTP request (no rate limiting needed)
- Output: `tournament_teams.csv`

### Chunker + Index Integration (2026-04-12)
- Added `chunkTournamentTeamsCsv()` and `chunkPikalyticsUsageCsv()` to `lib/chunker.ts`
- Registered both CSVs in `scripts/index-data.ts` FILES array
- Force rebuild: 1,550 chunks across 52 files (up from 1,335)

### /refresh Skill (2026-04-12)
- Created `.claude/commands/refresh.md` — re-scrapes Pikalytics + Google Sheets + reindexes
- Accepts optional argument: `/refresh pikalytics`, `/refresh sheets`, or `/refresh` for both
- Added Step 0 data freshness check to `/team` skill — warns if data >3 days old

### RAG Retrieval Quality Fix (2026-04-12)
- **Problem**: Querying "[Pokemon] competitive usage" returned other chunk types (Mega, items, base stats) above the actual Pikalytics usage chunk for popular Pokemon. Root cause: all 80 usage chunks share identical boilerplate text, and the MiniLM-L6-v2 embedding model weights generic "competitive usage statistics" vocabulary more than the single Pokemon name token.
- **Fix**: Over-fetch + metadata re-rank in `lib/rag.ts`:
  - Over-fetch 3x candidates (`.limit(topK * 3)`)
  - Detect usage intent via keyword matching (USAGE_KEYWORDS list)
  - Extract Pokemon name from results' metadata
  - Boost matching usage chunks +0.10 (specific Pokemon) or +0.05 (general usage)
  - Re-sort by adjusted score, return top `topK`
- **Bug caught during testing**: Initial implementation boosted usage chunks on ANY query mentioning a Pokemon name. Fixed by gating both boost conditions on `wantsUsage` to prevent regressions on non-usage queries ("Dragonite abilities", "Garchomp type matchups").
- **Second bug caught**: `extractPokemonFromQuery()` crashed with `TypeError: name.toLowerCase is not a function` when metadata contained non-string `name` fields (e.g., numeric values from CSV rows). Fixed with `typeof raw !== "string"` guard.
- **Results**: "Garchomp competitive usage" went from rank 4 → rank 1. No regressions on non-usage queries.

### RAG System Overhaul — Phases 0-4 (2026-04-13)
- **Phase 0**: Built eval framework — 25 test cases, 8 categories (exact-lookup, mechanic, move-lookup, item-lookup, counter, stat-filter, usage, strategic). Baseline: 21/25 (84%)
- **Phase 1**: Hybrid search — LanceDB native FTS (BM25 via Tantivy) + vector + RRF reranker. Import: `import { rerankers } from "@lancedb/lancedb"` then `rerankers.RRFReranker.create(60)`. Score improved to 24/25 (96%)
- **Phase 2**: Intent classification — rule-based `classifyQuery()` with word-boundary matching, `data_category` column + scalar index, `where()` pre-filters. Score: 25/25 (100%)
- **Phase 3**: Structured stat queries — top-level stat columns (hp, attack, speed, type1, type2, bst, pokemon_name) on Pokemon/Mega chunks. `lib/structured-query.ts` parses NL to SQL WHERE predicates. **LanceDB bug found**: scalar-indexed `data_category` combined with non-indexed columns in WHERE returns incomplete results — fixed by omitting `data_category` from structured queries (stat columns are null for non-Pokemon chunks, naturally filtering them out)
- **Phase 4**: Multi-signal re-ranking — 5 boost signals calibrated to RRF score scale (~0.02-0.035): structured +0.1, usage match +0.1, general usage +0.05, exact name +0.04, counter knowledge +0.015, project penalty -0.08
- **Final score**: 25/25 (100%), MRR 0.944, 100% no-forbidden, 100% sources-found
- New files: `lib/eval-data.ts`, `scripts/eval.ts`, `lib/structured-query.ts`, `scripts/debug-db.ts`
- Modified files: `lib/rag.ts` (complete rewrite), `scripts/index-data.ts` (FTS index, scalar index, data_category, stat columns)
- 1,556 total chunks across 10 categories: move (515), knowledge (267), pokemon (186), item (138), team (136), transcript (96), mega (82), usage (80), project (52), ability (4)

## Pending
- **Phase 5**: Embedding upgrade — `Xenova/all-MiniLM-L6-v2` → `onnx-community/embeddinggemma-300m-ONNX` (768-dim, q8). Modify `lib/embed.ts`, add query/document prefix support. Requires `--force` reindex.
- **Phase 6**: Chunking overlap — sliding paragraph overlap in `lib/chunker.ts` markdown splits
- **Phase 7**: Index lifecycle — staleness detection (`.lancedb/index-meta.json` with file mtimes) + glob-based auto-discovery for `data/knowledge/`, `research/`
- **Phase 8**: Pikalytics Italian fix — 5 Pokemon (Kingambit, Venusaur, Lucario, Meowstic, Manectric) have Italian text. Fix scraper header + build IT→EN translation dict via PokeAPI + apply in chunker
- YouTube scraper re-run when IP cooldown lifts
- Design and implement Pokemon Matchup Matrix (proposed — see productContext.md)

## Known Issues
- Castform shows Normal/Fire because Serebii lists its form types together
- Lycanroc shows 6 abilities (combines all 3 form abilities)
- Training mechanics page has minimal content (just VP costs)
- YouTube transcript API rate-limited — IP block with no documented cooldown duration
- LanceDB scalar index bug: combining scalar-indexed column with non-indexed columns in WHERE returns incomplete results — workaround in place
- Pikalytics Italian text in 5 Pokemon: Kingambit ("Sbigoattacco" = Sucker Punch), Venusaur ("Fangobomba" = Sludge Bomb), Lucario, Meowstic, Manectric — ~83 Italian strings total (44 moves, 25 items, 14 abilities)
