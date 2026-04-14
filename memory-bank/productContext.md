# Product Context

## Why This Project Exists
Pokémon Champions is a new competitive-focused Pokémon game with sweeping mechanical changes from previous generations. The meta is young (launched April 8, 2026) and evolving rapidly. A knowledgeable AI assistant can help players navigate the Champions-specific meta, build optimized VGC Doubles teams, and understand the many differences from Scarlet/Violet — without needing to memorize all 186 Pokémon, 494 moves, 138 items, and 59 Mega Evolutions.

## User Needs
- **Team building:** "Build me a Trick Room team" or "I have Garchomp and Incineroar, fill the rest"
- **Gap analysis:** "What types am I weak to?" or "What threatens this team?"
- **Meta awareness:** "What are the top Pokémon right now?" or "What beats rain teams?"
- **Set optimization:** "Best moveset for Mega Dragonite?" or "What item on Sneasler?"
- **Champions-specific questions:** "What changed from S/V?" or "Does Fake Out work differently?"
- **Multiple teams:** Build and iterate across several teams for different archetypes

## Agent Persona
The agent should be a knowledgeable but approachable Pokémon Champions VGC specialist who:
- Explains reasoning behind team choices (type coverage, speed tiers, role compression, win conditions)
- **Always validates against Champions-specific data** — never assumes S/V mechanics apply
- Considers the restricted item pool (~138 items, verified against items.csv + Serebii) when recommending sets — never recommends phantom items from S/V or AI-authored sources
- Uses the Stat Points system (not legacy EVs/IVs) in recommendations
- Highlights Champions-specific mechanics when relevant
- Understands Mega Evolution timing and team-wide one-per-battle restriction
- Can reference content creator opinions from YouTube transcripts
- Adapts recommendations to different skill levels

## Data Pipeline
1. **Scrape** — `scraper.py` (Serebii game data) + `scraper_youtube.py` (creator transcripts)
2. **Research** — External AI agent research in `research/` folder
3. **Structure** — CSVs, markdown, and text files
4. **Calculate** — `lib/calc/` damage engine + `matchup_matrix.csv` (59,292 pairs)
5. **Index** — LanceDB vector database via `scripts/index-data.ts`
6. **Query** — RAG retrieval via `/lookup` skill
7. **Advise** — AI reasoning layer via `/team` skill + CLAUDE.md expert persona + `/calc` for damage verification

## IMPLEMENTED: Pokemon Matchup Matrix (2026-04-13)

A mathematical scoring system assigning numeric matchup scores to every Pokemon pair. Implemented as a custom TypeScript damage calculator (`lib/calc/`) producing a 244×244 matrix (186 base + 59 Mega - 1 overlap = 244 entries, 59,292 pairs).

### Scoring Implementation
Each cell `M[A][B]` = offensive pressure - defensive pressure + speed U-curve:

1. **Offensive pressure** — A's best move damage % vs B (actual damage calc with types, stats, abilities, items)
2. **Defensive pressure** — B's best move damage % vs A (reverse calc)
3. **Speed U-curve** — >=130→1.0, >=110→0.8, >=90→0.3, >=60→0.0, >=30→0.5, <30→0.7 (fast > slow > average, TR requires setup)
4. **Ability interactions** — Levitate vs Ground, Flash Fire vs Fire, Multiscale, Intimidate, Thick Fat, etc. (~25 abilities handled)
5. **Item effects** — Type-boost items (1.2x), resist berries (0.5x)

### Standard Set Generation
- 80 Pokemon with Pikalytics data: use top ability, top item, top 4 moves, inferred SP spread
- 106 Pokemon without data: heuristic — max highest attacking stat + max Speed (32 SP each), 2 to HP, best STAB + coverage moves
- 59 Megas: separate entries with mega stats/type/ability

### Output
- `matchup_matrix.csv` — 59,292 rows (3.8 MB), columns: attacker, defender, best_move, damage_pct, reverse_move, reverse_pct, speed_advantage, score
- RAG-indexed as ~244 per-Pokemon matchup profile chunks (`data_category: "matchup"`)
- Queryable via `/lookup`: "What are Garchomp's worst matchups?" triggers matchup intent + boost
- Integrated into `/team` for Key Calcs, Evaluate, and Counter modes via `scripts/calc.ts`
- Rebuildable: `npm run calc:matrix` (runs in ~1 second)
