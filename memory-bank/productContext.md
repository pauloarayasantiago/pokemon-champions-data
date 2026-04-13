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
- Considers the restricted item pool (no Life Orb, Choice Band/Specs, etc.) when recommending sets
- Uses the Stat Points system (not legacy EVs/IVs) in recommendations
- Highlights Champions-specific mechanics when relevant
- Understands Mega Evolution timing and team-wide one-per-battle restriction
- Can reference content creator opinions from YouTube transcripts
- Adapts recommendations to different skill levels

## Data Pipeline
1. **Scrape** — `scraper.py` (Serebii game data) + `scraper_youtube.py` (creator transcripts)
2. **Research** — External AI agent research in `research/` folder
3. **Structure** — CSVs, markdown, and text files
4. **Index** — LanceDB vector database via `scripts/index-data.ts`
5. **Query** — RAG retrieval via `/lookup` skill
6. **Advise** — AI reasoning layer via `/team` skill + CLAUDE.md expert persona

## PROPOSED: Pokemon Matchup Matrix

A mathematical scoring system that assigns a numeric matchup score to every Pokemon vs every other Pokemon in the 186-Pokemon roster, producing a 186×186 matchup matrix.

### Scoring Factors
Each cell `M[A][B]` represents how well Pokemon A performs against Pokemon B, considering:

1. **Type effectiveness** — STAB moves of A vs defensive typing of B, and vice versa. Super effective = positive, resisted = negative, immune = heavily negative.

2. **Base stats** — Raw stat comparison weighted by role. Atk/SpA matters for the attacker, Def/SpD matters for the defender.

3. **Move coverage** — Does A have a viable move (above a power threshold) that hits B super-effectively? A move must be strong enough to matter (e.g., minimum 60-80 BP). Having coverage with a weak move shouldn't count the same as a 120BP STAB nuke.

4. **Speed relationship** — Speed is nuanced and non-linear:
   - **Fast (outspeeds most)**: Strong advantage — moves first, can KO before opponent acts
   - **Slow (underspeeds most)**: Moderate advantage — excellent in Trick Room
   - **Average (middle tier)**: Disadvantage — too slow to outrun fast threats, too fast to benefit from Trick Room
   - The speed scoring should create a U-curve: high speed and very low speed are both better than middling speed, but high speed gets a larger bonus since Trick Room requires setup investment

5. **Ability interactions** — Levitate vs Ground, Flash Fire vs Fire, Intimidate reducing physical damage, etc.

6. **Other considerations** — Priority moves, Protect interaction, item synergies

### Output
- 186×186 matrix stored as CSV or in the vector database
- Each cell is a numeric score (e.g., -10 to +10 or 0 to 100)
- Can be queried: "What are Garchomp's worst matchups?" or "Which Pokemon have the best overall matchup spread?"
- Feeds into `/team` for automated threat analysis and team gap identification

### Implementation Notes
- Requires base stats (pending scraper re-run)
- Move coverage check needs moves.csv cross-referenced with each Pokemon's move pool
- Speed tiers need careful calibration of the U-curve scoring
- Matrix should be recalculable as meta/data changes
