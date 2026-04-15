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

### RAG System Overhaul — Phases 5-8 (2026-04-14)

Executed in order: Phase 8 → 5 → 6 → 7, single `--force` reindex at end.

- **Phase 8: Pikalytics Italian Fix**
  - Added `Accept-Language: en-US,en;q=0.9` header to `scraper_pikalytics.py`
  - Built IT→EN translation dictionary via PokeAPI: 2,383 translations (904 moves, 1,178 items, 301 abilities) in `lib/translations.json` via `scripts/build-translations.ts`
  - Added translation layer in `lib/chunker.ts` — `translatePairs()` function applies dictionary at chunk time, lazy-loaded singleton
  - All 5 affected Pokemon (Kingambit, Venusaur, Lucario, Meowstic, Manectric) verified clean — zero Italian strings in index

- **Phase 5: Embedding Upgrade**
  - `Xenova/all-MiniLM-L6-v2` (22M, 384-dim, fp32) → `onnx-community/embeddinggemma-300m-ONNX` (308M, 768-dim, q8)
  - Added `mode: "query" | "document"` parameter to `embed()` with EmbeddingGemma prefixes
  - `BATCH_SIZE` reduced from 64 → 16 (larger model)
  - Updated `rag.ts` query call: `embed([question], "query")`
  - Added move name dictionary + exact move name boost (+0.04) to re-ranker — fixes Protect regression from stronger model
  - **MRR improved: 0.944 → 0.958**

- **Phase 6: Chunking Overlap**
  - Added trailing-paragraph overlap in `chunkMarkdownFile()` `flush()` function
  - When splitting large sections (>2000 chars) on paragraph breaks, last 3 lines of previous paragraph prepended to next chunk
  - Markdown chunks only (CSV chunks are atomic rows)
  - Chunk count stable (overlap prepends to existing chunks, doesn't create new ones)

- **Phase 7: Index Lifecycle**
  - Replaced hardcoded FILES array with glob-based auto-discovery for markdown/text files
  - 5 glob patterns: `data/knowledge/*.md`, `research/*.md`, `research/*.txt`, `data/transcripts/*.md`, `memory-bank/*.md`
  - CSVs and specific text files remain hardcoded (have specific chunker functions)
  - Added `.lancedb/index-meta.json` — written after each reindex with: `indexed_at`, `embedding_model`, `chunk_count`, `file_count`, `file_mtimes`
  - Added staleness detection in `rag.ts` — `checkStaleness()` compares current file mtimes against stored, warns on stderr if stale (runs once per process)

- **Final metrics**: 25/25 eval (100%), MRR 0.958, 1,559 chunks across 52 files
- **Comprehensive test suite**: 77 tests total (50 custom + 25 eval + 2 scraper), 76 passed (98.7%) — 1 borderline test expectation (transcript ranking vs knowledge docs for ambiguous query)
- New files: `scripts/build-translations.ts`, `lib/translations.json`, `scripts/test-suite.ts`
- Modified files: `lib/embed.ts` (rewrite), `lib/rag.ts` (move name detection, staleness), `lib/chunker.ts` (translation, overlap), `scripts/index-data.ts` (glob discovery, meta write), `lib/eval-data.ts` (relaxed 1 expectation), `scraper_pikalytics.py` (header)

### Damage Calculator + Matchup Matrix (2026-04-13)
- **Custom TypeScript damage calculator** built in `lib/calc/` — no external dependencies needed
  - `lib/calc/types.ts` — Core interfaces (PokemonData, MoveData, CompetitiveSet, CalcResult, FieldConditions, MatchupEntry)
  - `lib/calc/data.ts` — CSV data loader with lazy caching, 18x18 type chart, move flag sets (contact/sound/pulse/slicing/bite/punch), type-boost items map, resist berry map
  - `lib/calc/stats.ts` — Champions Stat Points calculator (all IVs=31, SP system with 66 total, max 32/stat)
  - `lib/calc/damage.ts` — Full damage engine with ordered modifier chain (spread, weather, crit, random, STAB, effectiveness, burn, screens, items, ~15 attacker abilities, ~10 defender abilities, Friend Guard, Helping Hand, Protect)
  - `lib/calc/matchup.ts` — Standard set generator from Pikalytics data + heuristics, matchup scorer with speed U-curve, full matrix builder
  - `lib/calc/index.ts` — Barrel export
- **CLI tool**: `npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"` — single move or all-moves mode
- **`/calc` skill** (`.claude/commands/calc.md`) — Claude Code skill for ad-hoc damage calculations
- **Matchup matrix**: 244×244 (186 base + 59 mega, minus 1 overlap) = 59,292 pairs computed in ~1 second
  - Output: `matchup_matrix.csv` (3.8 MB)
  - Per-Pokemon standard sets generated from Pikalytics data (80 with data) + heuristics (106 without)
  - Score formula: offensive pressure - defensive pressure + speed U-curve advantage
- **RAG integration**:
  - `chunkMatchupMatrixCsv()` in `lib/chunker.ts` — aggregates 59K rows into ~244 per-Pokemon matchup profile chunks
  - Registered in `scripts/index-data.ts` as "matchup" category
  - `isMatchupQuery` intent detection added to `lib/rag.ts` with +0.06/+0.12 boost for matchup data
  - `/team` skill updated to run `scripts/calc.ts` for Key Calcs, Evaluate, and Counter modes
- **NCP reference calculator** cloned to `tools/NCP-VGC-Damage-Calculator/` (gitignored) for validation
- **Validation**: 24/24 tests pass (`scripts/test-calc.ts`) — stats, type chart, damage calcs, immunities, weather, screens, burn, protect
- **npm scripts**: `calc`, `calc:web`, `calc:matrix`, `calc:test` added to package.json
- **Web research**: Surveyed all available calculators — @smogon/calc (no Champions support), NCP (jQuery web-only), Porygon Labs (closed source), @pkmn/dmg (no Champions). Custom build was the clear best path.

### Item Data Accuracy Fix + Team Skill Redesign (2026-04-14)
- **Root cause**: AI-authored research files hallucinated S/V items into Champions knowledge docs. Pikalytics "Champions Preview" (Showdown simulator data) also included items not in the actual game. Dexerto listed datamined sprites as "confirmed."
- **Verification**: Cross-referenced items.csv against Serebii (serebii.net/pokemonchampions/items.shtml) — 138-item exact match. No items added in post-launch patches.
- **Phantom items removed**: Clear Amulet, Throat Spray, Expert Belt, Booster Energy, Metronome (item), Normal Gem, typed Gems, Weakness Policy, Black Sludge, Safety Goggles
- **Files fixed**:
  - `CLAUDE.md` — Expanded MISSING ITEMS blacklist from 14 to 24+ items
  - `data/knowledge/champions_rules.md` — Rewrote Available Staple Items with verified categories, expanded Missing list
  - `data/knowledge/damage_calc.md` — Removed phantom items, added explicit "NOT available" section
  - `lib/calc/damage.ts` — Removed Expert Belt check + Gem logic (items don't exist)
  - `data/knowledge/team_building_theory.md` — Clear Amulet → White Herb, fixed Inner Focus description
  - `data/knowledge/meta_snapshot.md` — Clear Amulet → White Herb
  - `.claude/commands/team.md` — Added whitelist+blacklist item validation, redesigned Build/Fill output to advisory format with Mega options, slot alternatives, and Workshop Notes
  - `memory-bank/productContext.md` — Removed Expert Belt reference

### Efficiency Coefficient Matrix (2026-04-14)
- **Designed composite efficiency coefficient** E(A,B) on [-1, +1] combining 6 weighted sub-scores
- **Created `lib/calc/efficiency.ts`** — 6 sub-score calculators + composite formula + matrix builder + CSV exporter
  - Offense (0.30): damage % (150% cap), OHKO/2HKO flags, coverage depth (SE move fraction)
  - Defense (0.25): survival margin, bulk ratio vs median (physical/special), STAB type resistance count
  - Speed (0.20): continuous speed diff, Trick Room favorability, priority access, speed control moves
  - Typing (0.10): log2 STAB effectiveness differential, resistance balance
  - Movepool (0.10): coverage type diversity, context-dependent status threats, setup potential
  - Mega (0.05): opportunity cost, ability bonuses (Shadow Tag, Magic Bounce, Multiscale)
- **Modified `lib/calc/types.ts`** — added `EfficiencySubScores` and `EfficiencyEntry` interfaces
- **Modified `scripts/build-matchup-matrix.ts`** — added `--efficiency` flag, meta-weighted ranking output
- **Output**: `efficiency_matrix.csv` — 59,292 rows, 26 columns, ~9.6 MB
  - First 8 columns match existing `matchup_matrix.csv` for backward compatibility
  - 6 sub-score columns + composite E + meta weight + isMeta flag + 9 diagnostic columns
- **Build**: `npx tsx scripts/build-matchup-matrix.ts --efficiency` (~15s full, ~1.4s --top-only)
- **Verification**:
  - Distribution: Mean=-0.040, StdDev=0.219, Range=[-0.720, +0.603]
  - Anti-symmetry: Corr(E(A,B), -E(B,A)) = 0.792
  - Top meta-weighted Pokemon: Mega Dragonite, Mega Aggron, Mega Gyarados, Mega Garchomp, Archaludon

### Session Initialization + YouTube Transcript Expansion (2026-04-14)

- **LanceDB rebuilt from scratch** — index was missing at session start, `/reindex --force` rebuilt 1,815 chunks from 53 files
- **Froslass Snow team built** as live `/team` skill test — verified full research→validate→output pipeline works end-to-end
- **YouTube scraper re-run** after diagnosing that `scraper_youtube.py` (yt-dlp + youtube-transcript-api) is the correct approach — no browser/API key needed
  - Installed `yt-dlp` + `youtube-transcript-api` Python deps (were missing)
  - Ran `python scraper_youtube.py --max 10` — checked 155 videos, saved 18 new transcripts
  - YouTube IP-blocked transcript API after ~55 fetches (100 failed); safe to re-run after ~1-24hr cooldown
- **Transcript corpus**: 25 → **43 files** from 16 → **31 unique channels**
- **New channels captured**: ADrive, False Swipe Gaming, Moxie Boosted, Nivag, PokeAimMD, Poplove Gaming, TrickRubyVGC, 13Yoshi37, Solemn PKM, Temp6T + new videos from CybertronVGC, Kneeckoh, PanfroGames, SkrawVGC, ThatSaVGC
- **Incremental reindex**: 1,819 → 1,891 chunks (+72)
- **Agent prompt investigation**: Determined that web-search/WebFetch agents can't retrieve YouTube transcripts — the Python scraper is the only viable approach

## Pending
- YouTube scraper re-run when IP cooldown lifts (`python scraper_youtube.py --max 10` — auto-deduplicates)
- WolfeyVGC daily April series (April 11–30) — ~18 videos still uncaptured

## Known Issues
- Castform shows Normal/Fire because Serebii lists its form types together
- Lycanroc shows 6 abilities (combines all 3 form abilities)
- Training mechanics page has minimal content (just VP costs)
- YouTube transcript API rate-limited — IP block with no documented cooldown duration
- LanceDB scalar index bug: combining scalar-indexed column with non-indexed columns in WHERE returns incomplete results — workaround in place
- Floette has no base stats (Serebii page layout issue — 1/186 affected)
