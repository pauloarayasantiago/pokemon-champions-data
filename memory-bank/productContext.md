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
5. **Index** — Supabase pgvector (`pc_chunks`) via `scripts/index-data.ts`
6. **Query** — RAG retrieval via `/lookup` skill
7. **Advise** — AI reasoning layer via `/team` skill + CLAUDE.md expert persona + `/calc` for damage verification

## IMPLEMENTED: Pokemon Matchup Matrix (2026-04-13)

A mathematical scoring system assigning numeric matchup scores to every Pokemon pair. Implemented as a custom TypeScript damage calculator (`lib/calc/`) producing a 244×244 matrix (186 base + 59 Mega - 1 overlap = 244 entries, 59,292 pairs).

### Basic Scoring (matchup_matrix.csv)
Each cell `M[A][B]` = offensive pressure - defensive pressure + speed U-curve:

1. **Offensive pressure** — A's best move damage % vs B (actual damage calc with types, stats, abilities, items)
2. **Defensive pressure** — B's best move damage % vs A (reverse calc)
3. **Speed U-curve** — >=130→1.0, >=110→0.8, >=90→0.3, >=60→0.0, >=30→0.5, <30→0.7 (fast > slow > average, TR requires setup)
4. **Ability interactions** — Levitate vs Ground, Flash Fire vs Fire, Multiscale, Intimidate, Thick Fat, etc. (~25 abilities handled)
5. **Item effects** — Type-boost items (1.2x), resist berries (0.5x)

### Efficiency Coefficient (efficiency_matrix.csv) — Added 2026-04-14
Composite coefficient E(A,B) on [-1, +1] extending the basic matrix with 6 weighted sub-scores:

- **Offense (0.30)**: damage % normalized to 150% cap, OHKO/2HKO thresholds, coverage depth
- **Defense (0.25)**: survival margin, bulk ratio vs format median, STAB type resistance count
- **Speed (0.20)**: continuous speed diff, Trick Room favorability, priority move access, speed control moves
- **Typing (0.10)**: log2 STAB effectiveness differential, resistance balance
- **Movepool (0.10)**: coverage type diversity, context-dependent status threats, setup potential
- **Mega (0.05)**: opportunity cost (-0.3 for using Mega slot), ability bonuses (Shadow Tag, Magic Bounce, Multiscale)
- **Meta weight**: `usagePct / maxUsagePct` stored as separate column (not baked into E)

26 columns total: 8 backward-compatible with basic matrix + 6 sub-scores + E + meta weight + isMeta + 9 diagnostics.

### Standard Set Generation
- 80 Pokemon with Pikalytics data: use top ability, top item, top 4 moves, inferred SP spread
- 106 Pokemon without data: heuristic — max highest attacking stat + max Speed (32 SP each), 2 to HP, best STAB + coverage moves
- 59 Megas: separate entries with mega stats/type/ability

### Output
- `matchup_matrix.csv` — 59,292 rows (3.8 MB), basic scoring → `npm run calc:matrix`
- `efficiency_matrix.csv` — 59,292 rows (9.6 MB), full coefficient → `npx tsx scripts/build-matchup-matrix.ts --efficiency`
- RAG-indexed as ~244 per-Pokemon matchup profile chunks (`data_category: "matchup"`)
- Queryable via `/lookup`: "What are Garchomp's worst matchups?" triggers matchup intent + boost
- Integrated into `/team` for Key Calcs, Evaluate, and Counter modes via `scripts/calc.ts`
