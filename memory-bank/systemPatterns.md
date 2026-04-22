# System Patterns

## Repository Structure

```
1-pokemon-skill/
├── CLAUDE.md                   Always-on expert persona (Champions VGC specialist)
├── .claude/
│   ├── commands/
│   │   ├── lookup.md           /lookup skill — semantic search against Supabase pc_chunks
│   │   ├── reindex.md          /reindex skill — rebuild vector index
│   │   ├── refresh.md          /refresh skill — re-scrape Pikalytics + Sheets + reindex
│   │   ├── team.md             /team skill — team building (build/fill/evaluate/counter/sets)
│   │   ├── calc.md             /calc skill — ad-hoc damage calculations
│   │   └── research.md         /research skill — web-based competitive data gathering
│   └── settings.local.json     Permissions for scrapers, npm, git
├── supabase/
│   └── migrations/             pc_chunks + pc_index_meta schema, pc_hybrid_search RPC
├── lib/
│   ├── chunker.ts              Text chunking (CSV→NL, markdown→sections w/ overlap, Pikalytics translation)
│   ├── embed.ts                BGE-small-en-v1.5 (384-dim, fp32, CLS pool, BGE query prefix, batch 64)
│   ├── rag.ts                  Hybrid search (pc_hybrid_search RPC) + intent classification + structured queries + re-ranking + staleness
│   ├── supabase.ts             Supabase client factory (supabaseServer / supabaseAnon) with root .env loader
│   ├── structured-query.ts     NL→SQL stat filter builder (type, speed, attack thresholds)
│   ├── eval-data.ts            25 eval test cases across 8 categories
│   ├── translations.json       2,383 IT→EN translations (moves, items, abilities) — auto-generated
│   └── calc/                   Custom damage calculator engine
│       ├── types.ts            Core interfaces (CompetitiveSet, CalcResult, FieldConditions, MatchupEntry)
│       ├── data.ts             CSV loader, 18×18 type chart, move flag sets, item/berry maps
│       ├── stats.ts            Champions Stat Points calculator (66 total, 32 max, all IVs=31)
│       ├── damage.ts           Damage engine: ordered modifier chain, ~25 ability handlers
│       ├── matchup.ts          Standard set gen (Pikalytics + heuristic), matchup scorer, matrix builder
│       ├── efficiency.ts       Efficiency coefficient: 6 sub-scores, composite E(A,B), matrix builder, CSV export
│       └── index.ts            Barrel export
├── scripts/
│   ├── index-data.ts           Chunks all files → embeds → upserts to pc_chunks (glob discovery, incremental + --force modes)
│   ├── search.ts               CLI: npx tsx scripts/search.ts "query" [topK]
│   ├── eval.ts                 RAG eval harness: Recall@5, MRR, pass rate, per-category breakdown
│   ├── eval-models.ts          LLM model eval harness: 13-test agentic loop (tool_workflow, team_json, validate_loop, pokedex_dedup, item_availability, phantom_pokemon, stat_accuracy, banned_comprehensive, usage_lookup, usage_teammates, tournament_retrieval, creator_opinion, meta_core_attribution). 10-entry search stub (incl. real Golurk tournament teams). Guardrails: hard pokedex dedup cap + post-loop force-completion. Anthropic call path for claude-sonnet model. --real-rag flag for production Supabase search
│   ├── build-translations.ts   Fetches PokeAPI IT→EN name mappings → lib/translations.json
│   ├── test-suite.ts           Comprehensive 74-test suite (embedding, translation, search, realistic queries, overlap, lifecycle)
│   ├── debug-db.ts             DB inspection utility (temporary)
│   ├── calc.ts                 CLI damage calculator ("Garchomp EQ vs Incineroar" → damage range)
│   ├── build-matchup-matrix.ts 244×244 matchup matrix builder → matchup_matrix.csv
│   ├── test-calc.ts            41-test validation suite (stats, type chart, damage, 16 ability modifiers)
│   └── stress-test.ts          111-test stress suite (7 tiers: lookups, mechanics, absence, calc, multi-entity, intent, strategic)
├── data/
│   ├── knowledge/              Structured competitive knowledge (7 files, auto-discovered)
│   │   ├── type_chart.md       18-type offensive + defensive matchups
│   │   ├── damage_calc.md      Champions damage formula, modifiers, SP system
│   │   ├── team_archetypes.md  Rain, Sun, Sand, TR, Tailwind, Balance, Semi-Room
│   │   ├── team_building_theory.md  Coverage, speed control, role compression, Doubles tactics
│   │   ├── meta_snapshot.md    Top 20 usage, WR, cores, archetypes, S-tier Megas
│   │   ├── speed_tiers.md      Lv50 benchmarks, TR tiers, weather/Tailwind speeds
│   │   └── champions_rules.md  Reg M-A rules, timer, bans, bugs, event schedule
│   └── transcripts/            YouTube creator transcripts (63 markdown files, auto-discovered)
├── research/                   External AI research documents (3 files, auto-discovered)
│   ├── claude-research.md
│   ├── Gemini.txt
│   └── Pokémon Champions (2026) — Competitive Knowledge Base.md
├── memory-bank/                Project context files (this directory, auto-discovered)
├── scraper.py                  Python: Serebii.net game data scraper (w/ base stats)
├── scraper_pikalytics.py       Python: Pikalytics usage scraper (Accept-Language: en header)
├── scraper_sheets.py           Python: VGCPastes tournament team scraper (Google Sheets API)
├── scraper_youtube.py          Python: YouTube transcript scraper (yt-dlp + youtube-transcript-api)
├── pokemon_champions.csv       216 Pokémon: name, types, abilities, moves, stats (186 base + 30 form variants: 5 Rotom, 12 regional, 3 Paldean Tauros, 10 other forms — auto-generated by scraper.py FORM_VARIANTS dict)
├── mega_evolutions.csv         59 Mega forms: pokemon, mega_name, types, ability, stats (Mega Charizard X/Y disambiguated by scraper)
├── items.csv                   138 items: name, effect, location
├── moves.csv                   494 moves: name, type, category, pp, power, accuracy, effect
├── updated_attacks.csv         21 changed moves: Champions vs S/V stats
├── new_abilities.csv           4 new abilities: name, effect
├── mega_abilities.csv          23 megas with new abilities
├── pikalytics_usage.csv        91 Pokémon (incl. 11 form variants): usage %, rank, top moves/items/abilities/teammates
├── tournament_teams.csv        314 teams: team ID, player, Pokemon, items, tournament info
├── matchup_matrix.csv          75,350 matchup pairs: attacker, defender, best_move, damage_pct, score (275 attackers: 216 Pokemon + 59 Megas)
├── efficiency_matrix.csv       75,350 efficiency entries: 26 columns (6 sub-scores + composite E + meta weight + diagnostics)
├── status_conditions.txt       Freeze/Paralysis/Sleep mechanic changes
├── training_mechanics.txt      VP costs for customization
├── package.json                Node.js deps (@supabase/supabase-js, huggingface, csv-parse)
└── tsconfig.json               TypeScript config (ES2022, Node16, resolveJsonModule)
```

## Data Relationships
- `pokemon_champions.csv` → moves column references names in `moves.csv`
- `pokemon_champions.csv` → abilities can be cross-referenced with `new_abilities.csv`
- `mega_evolutions.csv` → links to base Pokémon in `pokemon_champions.csv` by base name
- `items.csv` Mega Stones → correspond to Pokémon with Mega Evolutions
- `updated_attacks.csv` → shows what changed from S/V for moves in `moves.csv`
- `pikalytics_usage.csv` → Italian names translated via `lib/translations.json` at chunk time
- `matchup_matrix.csv` → computed from pokemon_champions.csv + mega_evolutions.csv + moves.csv + pikalytics_usage.csv via `lib/calc/matchup.ts`
- `efficiency_matrix.csv` → extends matchup_matrix with 6 sub-scores via `lib/calc/efficiency.ts`, also uses pikalytics_usage.csv for meta weights
- `data/transcripts/*.md` → content creator opinions, indexed as markdown chunks
- `research/*.md` → deep competitive analysis, indexed as markdown chunks

## Scraper Design Patterns
- `scraper.py`: `fetch(url)` → BeautifulSoup, per-page parsers, CSV output, 1s delay
  - `FORM_VARIANTS` dict (21 base → 30 variants) + `parse_section_moves()` / `parse_section_stats()` helpers extract alt-form rows from the same base page (regional, Rotom appliances, Paldean Tauros, Floette-Eternal, Aegislash-Blade, Lycanroc poses, Gourgeist sizes, etc.)
  - Duplicate mega name disambiguation: when Serebii labels X/Y megas identically (e.g., Charizard), emit loop appends " X" / " Y" in page-order
- `scraper_pikalytics.py`: `Accept-Language: en` header, per-Pokemon page scraping, pipe-delimited output. Iterates `pokemon_champions.csv` names directly — form variants auto-covered when present in CSV
- `scraper_sheets.py`: Google Visualization API, single HTTP request, CSV output
- `scraper_youtube.py`: yt-dlp search → youtube-transcript-api fetch → markdown output, 1s delay
  - Date filter: only videos from April 8, 2026 (release day) onward
  - Auto-skips previously downloaded transcripts
  - Filters out wrong-game content (S/V, Sword/Shield, Unite, etc.)

## RAG Pipeline (Post-Supabase Migration)
1. **Discover** — `scripts/index-data.ts` uses glob patterns to auto-discover markdown files in `data/knowledge/`, `research/`, `data/transcripts/`, `memory-bank/`. CSVs/text files remain hardcoded (have specific chunker functions)
2. **Chunk** — `lib/chunker.ts` converts each data type to NL text chunks with `data_category` tags. Pikalytics chunks translated IT→EN. Markdown chunks get trailing-paragraph overlap
3. **Embed** — `lib/embed.ts` uses BGE-small-en-v1.5 (384-dim, fp32, batch size 64). CLS pooling + L2 normalize; BGE query prefix applied on `mode='query'`, raw text on `mode='doc'`
4. **Store** — Supabase `pc_chunks`: id (PK), text, embedding VECTOR(384), source, source_type, data_category, metadata JSONB, pokemon_name, col_type1/2, stat_hp/attack/defense/sp_atk/sp_def/speed/bst (null for non-Pokemon), text_tsv TSVECTOR GENERATED
5. **Index** — HNSW on embedding (`vector_cosine_ops`), GIN on text_tsv, btree on data_category + pokemon_name
6. **Meta** — `pc_index_meta` upserted after reindex (keys: indexed_at, embedding_model, chunk_count, file_count, file_mtimes)
7. **Classify** — Rule-based `classifyQuery()` detects intent (usage, counter, stat, item, move, team) via word-boundary matching against keyword sets + Pokemon name dictionary + move name dictionary
8. **Search** — Single RPC `pc_hybrid_search(p_embedding, p_query, p_categories, p_fetch_k, p_rrf_k=60)` fuses pgvector ANN + Postgres FTS via RRF in one round-trip
9. **Structured** — If stat query detected, parallel supabase-js query: `.or()` per type + `.gte()/.lte()` per stat + `.not('pokemon_name','is',null)`
10. **Merge + Re-rank** — Deduplicate hybrid + structured results, apply 8 additive boosts (structured +0.1, usage +0.1/0.05, exact Pokemon name +0.04, exact move name +0.04, counter knowledge +0.015, item intent +0.03, team penalty -0.015, project -0.08), sort by score, return topK
11. **Staleness** — `checkStaleness()` runs once per process, reads `pc_index_meta.file_mtimes`, compares against disk, warns on stderr
12. **Eval** — 25 test cases: `npx tsx scripts/eval.ts` → 100% pass, MRR 1.000
13. **Incremental** — index-data.ts paginates `SELECT id FROM pc_chunks` into a Set, skips already-indexed chunks (--force wipes pc_chunks before re-upsert)
14. **Full test suite** — 251 tests via `npm test`: calc (41), integration (74), eval (25), stress (111)
