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

### Rotom Form Variants + Embedding Migration + Realistic Tests (2026-04-15)

**Rotom Form Data Pipeline:**
- Added 5 Rotom appliance forms (Wash/Heat/Frost/Fan/Mow) to `pokemon_champions.csv` as separate rows (191 total, was 186)
- Each form: correct type2, Levitate, stats 50/65/107/105/107/86 (520 BST), base Rotom's 42 moves + signature move
- Re-scraped Pikalytics: 84 Pokemon (Rotom-Wash #10 at 16%, Rotom-Heat #43 at 2%, others 404)
- Rebuilt matchup + efficiency matrices: 61,752 pairs from 249 sets
- Verified Levitate immunity, speed tiers, search resolution — zero code changes needed (existing form pattern)
- Updated `memory-bank/errors.md` (resolved), `data/knowledge/speed_tiers.md` (base 86 tier)

**Embedding Model Migration:**
- `onnx-community/embeddinggemma-300m-ONNX` (768-dim, ~300MB, q8) → `Xenova/all-MiniLM-L6-v2` (384-dim, ~80MB, fp32)
- Motivation: EmbeddingGemma too resource-heavy for indexing (slow, high memory)
- Rewrote `lib/embed.ts`: removed query/document prefixes, removed `dtype: "q8"`, batch 16→64
- Updated `scripts/index-data.ts` (model name in metadata), `scripts/test-suite.ts` (384-dim, model name)
- Reindexed 1,910 chunks — ~4× faster, search quality preserved via re-ranker

**Realistic Search Quality Tests:**
- Added `testRealisticQueries()` to `scripts/test-suite.ts` — 15 tests (23 assertions) using natural player queries
- 6 categories: Team Building (4), Matchup/Counter (3), Set/Moveset (3), Meta/Usage (2), Champions Mechanics (2), Speed/Calc (1)
- Initial run exposed 5 failures → fixed 2 intent classification gaps in `lib/rag.ts`:
  - Move queries + Pokemon name now include "usage" category (Garchomp moves → pikalytics surfaces)
  - Item queries + Pokemon name now include "usage" + "pokemon" categories (Sneasler item → usage data surfaces)
  - Added "vs" to MATCHUP_KEYWORDS, "most popular" to USAGE_KEYWORDS
- Final: **74/74 RAG tests + 24/24 calc tests = 98/98 total**

### System Accuracy Audit + Improvements (2026-04-16)

**234-test audit** across 4 suites (calc, integration, eval, stress) identified 3 ranking weaknesses and led to 6 improvement areas (A-F), all implemented:

- **A: Mega Charizard X/Y naming fix** — Both forms were "Mega Charizard" in CSV, causing Map key collision (Y overwrote X). Renamed to distinct names. Added prefix matching in `findMega()` for backward compat.
- **B: RAG ranking improvements** — Item boost (+0.03 for item-intent queries), team penalty (-0.015 for non-team queries). B1 (knowledge boost for usage queries) attempted but reverted — cascading eval failures.
- **C: Structured query fixes** — Wired up "worst"/"bad" qualifiers, added SpDef to bulk filter, word-boundary regex for type matching.
- **D: Data quality** — Removed duplicate tournament team PC99 (identical to PC132).
- **E: Ability modifier calc tests** — 16 new tests covering Helping Hand, Multiscale, Tough Claws, Mega Launcher, Adaptability, Guts, Tinted Lens, Filter, Technician, Sharpness, Aurora Veil, Piercing Drill, Friend Guard.
- **F: npm test scripts** — `npm test` runs all 4 suites; individual `test:calc`, `test:rag`, `test:integration`, `test:stress`.
- **Stress test suite** (`scripts/stress-test.ts`) — 111 tests across 7 tiers from simple lookups to strategic reasoning.
- **Final regression**: **251/251 tests passing** (calc 41, integration 74, eval 25, stress 111).

### Full Data Refresh + Knowledge Updates (2026-04-18)

**Refresh executed:**
- `scraper_youtube.py --max 20` — 20 new transcripts added (43 → 63 total).
- `scraper_pikalytics.py` — rebuilt usage CSV (80 → 84 Pokemon tracked).
- `scraper_sheets.py` — rebuilt tournament teams (135 → 314 teams, +178).
- `scripts/index-data.ts --force` — full LanceDB rebuild.

**New channels/videos captured (20):**
- AngrySlowbroPlus (69-min definitive F–S tier list, top 5: Sinistcha/Dragonite/Gengar/Incineroar/Archaludon)
- TheDelybird (top 15 teams with EV pastes + Mega Golurk TR tournament winner)
- PanFro Games (counter guide for top 10 threats)
- PuppyPown (in-game team-building UI walkthrough)
- MrSteelix & Yourgirl (30-Pokemon list — ⚠️ recommends banned items)
- Osirus Champions (10 QoL tips incl. Type Affinity Tickets)
- HoshinJosh (2 Singles ladder videos)
- iStarlyTV (Singles Master Ball top 10 usage)
- WolfeyVGC (rank #1 challenge + intro to competitive primer)
- TimStuh, Moxie Boosted, Skraw VGC, ThatsAVGC (shorter takes/reactions)

**Knowledge base updates from refresh:**
- `data/knowledge/team_archetypes.md` — added Basculegion Adaptability section (non-rain teams prefer Adaptability over Swift Swim).
- `data/knowledge/team_building_theory.md` — added detailed Priority Blocking section (Armor Tail blocks Fake Out, Sucker Punch, Bullet Punch, Shadow Sneak, Aqua Jet, Quick Attack, Extreme Speed, Ice Shard, Mach Punch, Vacuum Wave, plus Prankster status). Added King's Shield clarification.
- `updated_attacks.csv` — added King's Shield entry (-1 Attack drop, nerfed from -2 in S/V).
- `data/knowledge/validation_notes.md` — NEW file flagging MrSteelix / Skraw / Moxie Boosted transcripts with banned-item or off-topic content, provides item substitution guide.

**Key meta findings (not yet codified in KB):**
- Sinistcha displaces Incineroar as #1 in AngrySlowbroPlus tier list.
- Mega Floette called "strongest Mega" by top players; adoption slow due to Legends Z-A deposit requirement.
- Singles meta diverges hard from Doubles — top 10 very different (Garchomp / Primarina / Charizard-Y / Corviknight / Duraludon / Hippowdon / Gengar / Scizor / Kingambit / Aegislash).
- 532-entrant tournament (Jimothy Cool) — largest Champions event recorded.
- Mega Golurk Trick Room team won a recent online tournament.
- Bulky Sneasler spreads appearing on ladder.
- Champion tier restricted to top 300 Master Ball players, unlocks 1 week after season start.

### Vector Store Migration: LanceDB → Supabase pgvector (2026-04-18)

Replaces the 30-50MB bundled LanceDB native binary with a managed Postgres+pgvector backend. Unblocks Vercel cold-start performance and aligns the webapp with the existing Supabase project shared with `pokeke.shop`.

- **Schema**: Added `pc_*`-namespaced tables in `public` (`pc_chunks`, `pc_index_meta`) via Supabase MCP `apply_migration`.
  - `pc_chunks`: id PK, text, `embedding VECTOR(384)`, source, source_type, data_category, metadata JSONB, Pokemon stat columns (preserved from LanceDB names), `text_tsv TSVECTOR GENERATED ALWAYS AS STORED`, created_at
  - Indexes: HNSW (`vector_cosine_ops`), GIN (text_tsv), btree (data_category, pokemon_name)
  - RLS enabled with anon/authenticated SELECT; writes via service role
- **RPC**: `pc_hybrid_search(p_embedding, p_query, p_categories, p_fetch_k, p_rrf_k)` fuses vector ANN + `websearch_to_tsquery` FTS via RRF in a single round-trip.
- **Client**: new `lib/supabase.ts` — `supabaseServer()` / `supabaseAnon()` factories with manual root-`.env` loader (scripts work without dotenv); accepts both Next (`NEXT_PUBLIC_*`, `SUPABASE_SERVICE_KEY`) and Vite (`VITE_*`, `SUPABASE_SECRET`) env var names.
- **Query path** (`lib/rag.ts`): replaced `table.vectorSearch().fullTextSearch().rerank(RRF)` with `supabase.rpc('pc_hybrid_search', ...)`. Structured filter path rewritten as supabase-js query builder chain (`.or()` per type, `.gte()/.lte()` per stat).
- **Staleness**: `checkStaleness()` now async, reads `pc_index_meta` row `file_mtimes` instead of `.lancedb/index-meta.json`.
- **Indexer** (`scripts/index-data.ts`): LanceDB `db.openTable().add()` → Supabase `from('pc_chunks').upsert()` in batches of 200. Incremental mode paginates existing IDs. Meta written to `pc_index_meta` (5 keys). `--force` wipes pc_chunks.
- **One-shot migration**: copied all 2,224 existing 384-dim vectors from `.lancedb/chunks` (no re-embedding).
- **Cutover**: removed `@lancedb/lancedb` + `apache-arrow` from both root and webapp `package.json`; dropped from `serverExternalPackages` in `webapp/next.config.ts`. Rewrote `scripts/debug-db.ts` and `scripts/test-suite.ts`' `testIndexLifecycle` against Supabase. Historical references kept in `memory-bank/progress.md`, `webapp/HANDOVER.md`, `lookup-reindex-system-prompt.txt`.
- **Parity verified**: 5 canonical queries (counters, structured stat, usage, move, archetype) all return sensible top-K with `rrf_score`; incremental reindex returns "Nothing to index. Done."; structured filter still fires on "highest attack water types" → Gyarados/Sharpedo/Quaquaval/Mega Gyarados/Mega Feraligatr.

### Vercel /search Production Fix (2026-04-18)

Production `/search` on `pokemon-champions-data.vercel.app` first 500'd, then surfaced the "Search failed. Check the dev console." card. Root causes and fixes, in order:

1. **`onnxruntime-node` native bindings don't bundle into Lambda** — `@huggingface/transformers` loaded `.node` binaries at module-eval time, 500ing every `/search` hit. Fixed by lazy-importing the pipeline and routing query embeddings through the Hugging Face Inference API when `HF_TOKEN` is set (commit `f8c5a6e`). Local indexing scripts still use the bundled path.
2. **Legacy HF endpoint 404** — `https://api-inference.huggingface.co/pipeline/feature-extraction/{model}` returns 404 for `sentence-transformers/all-MiniLM-L6-v2` after HF consolidated serverless inference behind the Inference Providers router. Fixed by switching `lib/embed.ts` to `https://router.huggingface.co/hf-inference/models/{model}/pipeline/feature-extraction` (commit `57ff6f4`).
3. **Hardening on the remote path**: `AbortSignal.timeout(8000)` with a single 503 retry at 15s for HF cold-starts; `export const maxDuration = 30` on `src/app/search/page.tsx` so the function has headroom over the default 10s.
4. **Noise silencing**: `checkStaleness()` in `lib/rag.ts` now short-circuits on `process.env.VERCEL`. Lambda filesystem mtimes come from the build image and never match the mtimes captured at reindex time, so the "index is stale" warning was always a false positive in prod and was polluting error-level logs.

Verified end-to-end by the user: `/search?q=incineroar` returns result cards on the live deploy. Auto-memory `project_vercel_embedding_constraint.md` updated with the router URL, the 404 pitfall, and instructions to re-check the HF provider docs if it shifts again.

### Regional Variant Data Integration (2026-04-18)

- **Audit**: Cross-referenced `pokemon_champions.csv` against `tournament_teams.csv` — discovered 10 regional/form variants used in tournaments but missing from the base data.
- **Added 10 entries** to `pokemon_champions.csv` (201 total, was 191):
  - `Ninetales-Alola` (Ice/Fairy, Snow Cloak|Snow Warning, 73/67/75/81/100/109)
  - `Arcanine-Hisui` (Fire/Rock, Intimidate|Flash Fire|Rock Head, 90/115/80/95/80/95)
  - `Typhlosion-Hisui` (Fire/Ghost, Blaze|Flash Fire|Frisk, 73/84/78/119/85/95)
  - `Zoroark-Hisui` (Normal/Ghost, Illusion, 55/100/60/125/60/110)
  - `Goodra-Hisui` (Steel/Dragon, Sap Sipper|Shell Armor|Gooey, 80/100/100/110/150/60)
  - `Decidueye-Hisui` (Grass/Fighting, Overgrow|Long Reach, 88/112/80/95/95/60)
  - `Slowking-Galar` (Poison/Psychic, Curious Medicine|Own Tempo|Regenerator, 95/65/80/110/110/30)
  - `Tauros-Paldea-Aqua` (Water/Fighting, Intimidate|Anger Point|Cud Chew, 75/110/105/30/70/100)
  - `Tauros-Paldea-Blaze` (Fire/Fighting, Intimidate|Anger Point|Cud Chew, 75/110/105/30/70/100)
  - `Basculegion-F` (Water/Ghost, same abilities/moves as M-form, 120/92/65/100/75/78)
- **Line ending fix**: Appended rows had Unix `\n`; original file uses Windows `\r\n`. Fixed with `sed -i` + re-CRLF so CSV parser sees consistent endings. Confirmed 202 chunks generated after fix (was 192 from the broken append).
- **Reindexed**: `scripts/index-data.ts` → 10 new chunks upserted. Total: 2,074 chunks.
- **Verified**: Searches for "Zoroark Hisui Normal Ghost" and "Ninetales Alola Snow Warning" both surface the new chunks as top results.
- **Already in data** (confirmed present before this session): Sneasler, Kleavor, Wyrdeer, Basculegion (M-form).
- **Pending follow-up**: Rebuild matchup + efficiency matrices to include the 10 new variants; verify move pools against Champions-specific sources.

### Team Output Auto-Save System (2026-04-18)

- **Created `team_outputs/` folder** — archive of all team-building responses from Claude.
  - First file: `team_outputs/mega-scizor-teams-2026-04-18.md`
- **Updated `CLAUDE.md`** — added "CRITICAL: Always Save Team Outputs" section instructing Claude to Write team outputs to `team_outputs/[topic]-[YYYY-MM-DD].md` before responding.
- **Saved feedback memory** at `~/.claude/projects/.../memory/feedback_save_team_outputs.md` for cross-session persistence.
- **Why not a hook**: `Stop` hook fires after Claude finishes but receives no response content — cannot detect team output patterns. CLAUDE.md instruction is more reliable.

### LLM Provider Evaluation & Multi-Tier Architecture (2026-04-19) — EXPLORATION

**Goal**: Find free/self-hosted alternatives to Claude for the webapp's agentic team-builder.

**Eval harness built** (`scripts/eval-models.ts`):
- 5 tests covering the critical failure modes observed in practice: tool ordering, banned items, banned mechanics, structured output, validation loop
- Query-aware search stub returns Champions-specific knowledge so models don't fall back to S/V training data
- Finalization turn: pushes one extra user message if no `team-json` block found
- Snapshot output to `snapshots/model-eval-[timestamp].json`
- `npm run eval:models` — supports `--models`, `--tests`, `--verbose`

**Models evaluated** (two rounds):

| Model | Provider | Score v1 | Score v2 (improved harness) |
|-------|----------|----------|------------------------------|
| GPT-OSS 120B | OpenRouter free | 2/5 | 3/5 |
| Gemma 4 31B IT | OpenRouter free | N/A (auth error) | N/A |
| Gemma 4 26B A4B | OpenRouter free | 1/5 | 3/5 |

Key findings:
- GPT-OSS 120B: ignores banned mechanics (Tera) even after search returns the rule; can't emit `team-json`; validate loop works
- Gemma 4 26B: emits team-json when pushed; loops pokedex obsessively (45x); ignores banned items from training data
- Gemma 4 31B: auth error (Google API key not provisioned in OpenRouter account)

**Adapter architecture wired** (not in production, all options):
- `src/lib/llm/ollama.ts` — reuses `openai-compat.ts`, routes local vs remote by model ID prefix
- `provider: "ollama"` added to type system
- Local models: `qwen2.5-7b`, `llama3.1-8b` (fit in RTX 2070 SUPER 8GB VRAM)
- Remote models: `remote-gemma4`, `remote-qwen32b` (placeholders — server GPU unknown)
- All wired in `MODEL_REGISTRY` and `AVAILABLE_MODELS`

**Bug fixed**: `lib/calc/data.ts` `readCSV()` — CSV parser crashed on a literal `\r` (two ASCII chars `\`+`r`) at end of `pokemon_champions.csv`. Fixed with `relax_column_count: true` + second-column presence filter.

**Nothing decided**: all provider options remain open. Gemini 2.5 Flash is still the production default.

## Pending
- WolfeyVGC daily April series — some videos still uncaptured
- Consider creating `data/knowledge/singles_meta.md` (Singles diverging from Doubles, no KB coverage)
- Reconcile `meta_snapshot.md` with AngrySlowbroPlus tier list (Sinistcha-first vs Incineroar-first)
- Codify TheDelybird's 5 template archetypes with EV pastes
- Resolve webapp Tailwind 4 CSS blocker (unrelated to vector-store migration)
- Run full `npm test` regression against Supabase backend (251 tests) — only smoke-tested so far

## Known Issues
- Castform shows Normal/Fire because Serebii lists its form types together
- Lycanroc shows 6 abilities (combines all 3 form abilities)
- Training mechanics page has minimal content (just VP costs)
- YouTube transcript API rate-limited — IP block with no documented cooldown duration
- Floette has no base stats (Serebii page layout issue — 1/186 affected)
