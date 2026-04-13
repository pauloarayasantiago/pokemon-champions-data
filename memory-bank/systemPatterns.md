# System Patterns

## Repository Structure

```
1-pokemon-skill/
├── CLAUDE.md                   Always-on expert persona (Champions VGC specialist)
├── .claude/
│   ├── commands/
│   │   ├── lookup.md           /lookup skill — semantic search against LanceDB
│   │   ├── reindex.md          /reindex skill — rebuild vector index
│   │   ├── team.md             /team skill — team building (build/fill/evaluate/counter/sets)
│   │   └── research.md         /research skill — web-based competitive data gathering
│   └── settings.local.json     Permissions for scrapers, npm, git
├── .lancedb/                   Vector database (Apache Arrow format, 1330 chunks)
├── lib/
│   ├── chunker.ts              Text chunking (CSV→natural language, markdown→sections)
│   ├── embed.ts                HuggingFace Xenova/all-MiniLM-L6-v2 (384-dim)
│   └── rag.ts                  LanceDB cosine similarity search
├── scripts/
│   ├── index-data.ts           Chunks all files → embeds → stores in LanceDB (50 files registered)
│   └── search.ts               CLI: npx tsx scripts/search.ts "query" [topK]
├── data/
│   ├── knowledge/              Structured competitive knowledge (7 files, 101 chunks)
│   │   ├── type_chart.md       18-type offensive + defensive matchups
│   │   ├── damage_calc.md      Champions damage formula, modifiers, SP system
│   │   ├── team_archetypes.md  Rain, Sun, Sand, TR, Tailwind, Balance, Semi-Room
│   │   ├── team_building_theory.md  Coverage, speed control, role compression, Doubles tactics
│   │   ├── meta_snapshot.md    Top 20 usage, WR, cores, archetypes, S-tier Megas
│   │   ├── speed_tiers.md      Lv50 benchmarks, TR tiers, weather/Tailwind speeds
│   │   └── champions_rules.md  Reg M-A rules, timer, bans, bugs, event schedule
│   └── transcripts/            YouTube creator transcripts (24 markdown files, 868KB)
├── research/                   External AI research documents (3 files)
│   ├── claude-research.md
│   ├── Gemini.txt
│   └── Pokémon Champions (2026) — Competitive Knowledge Base.md
├── memory-bank/                Project context files (this directory)
├── scraper.py                  Python: Serebii.net game data scraper (now w/ base stats)
├── scraper_youtube.py          Python: YouTube transcript scraper (yt-dlp + youtube-transcript-api)
├── pokemon_champions.csv       186 Pokémon: name, types, abilities, moves, stats (stats pending re-run)
├── mega_evolutions.csv         59 Mega forms: pokemon, mega_name, types, ability, stats (pending)
├── items.csv                   138 items: name, effect, location
├── moves.csv                   494 moves: name, type, category, pp, power, accuracy, effect
├── updated_attacks.csv         21 changed moves: Champions vs S/V stats
├── new_abilities.csv           4 new abilities: name, effect
├── mega_abilities.csv          23 megas with new abilities
├── status_conditions.txt       Freeze/Paralysis/Sleep mechanic changes
├── training_mechanics.txt      VP costs for customization
├── package.json                Node.js deps (lancedb, huggingface, csv-parse)
└── tsconfig.json               TypeScript config (ES2022, Node16)
```

## Data Relationships
- `pokemon_champions.csv` → moves column references names in `moves.csv`
- `pokemon_champions.csv` → abilities can be cross-referenced with `new_abilities.csv`
- `mega_evolutions.csv` → links to base Pokémon in `pokemon_champions.csv` by base name
- `items.csv` Mega Stones → correspond to Pokémon with Mega Evolutions
- `updated_attacks.csv` → shows what changed from S/V for moves in `moves.csv`
- `data/transcripts/*.md` → content creator opinions, indexed as markdown chunks
- `research/*.md` → deep competitive analysis, will be indexed as markdown chunks

## Scraper Design Patterns
- `scraper.py`: `fetch(url)` → BeautifulSoup, per-page parsers, CSV output, 1s delay
- `scraper_youtube.py`: yt-dlp search → youtube-transcript-api fetch → markdown output, 1s delay
  - Date filter: only videos from April 8, 2026 (release day) onward
  - Auto-skips previously downloaded transcripts
  - Filters out wrong-game content (S/V, Sword/Shield, Unite, etc.)

## RAG Pipeline
1. **Chunk** — `lib/chunker.ts` converts each data type to natural language text chunks
2. **Embed** — `lib/embed.ts` uses HuggingFace local model (384-dim, batch size 64)
3. **Store** — LanceDB table "chunks" with id, text, source, source_type, metadata, vector
4. **Query** — `lib/rag.ts` embeds question → cosine similarity search → **over-fetch 3x → metadata re-rank → top-K results**
5. **Re-rank** — Usage chunks boosted when query contains usage-intent keywords (USAGE_KEYWORDS list) AND Pokemon name matches metadata. Two boost levels: +0.10 (specific Pokemon + usage intent) or +0.05 (general usage intent, no specific Pokemon)
6. **Incremental** — index-data.ts checks existing chunk IDs, only inserts new ones (--force rebuilds)
