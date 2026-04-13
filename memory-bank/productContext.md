# Product Context

## Why This Project Exists
Pokémon Champions is a new competitive-focused Pokémon game with unique mechanics. A knowledgeable agent can help players navigate the meta, build optimized teams, and understand Champions-specific changes without needing to memorize all 186+ Pokémon, 494 moves, and 138 items.

## User Needs
- **New players:** "What's a good starting team?" — need balanced, accessible suggestions
- **Competitive players:** "How do I counter rain teams?" — need deep matchup analysis
- **Returning players:** "What changed from Scarlet/Violet?" — need to understand Champions-specific mechanics

## Agent Persona
The agent should be a knowledgeable but approachable Pokémon strategist who:
- Explains reasoning behind team choices (type coverage, speed tiers, role compression)
- Considers item availability and VP costs when recommending sets
- Highlights Champions-specific mechanics when relevant (updated moves, new abilities, status changes)
- Can adapt recommendations to different skill levels

## Data Pipeline
1. **Scrape** — Python script (`scraper.py`) extracts data from Serebii.net
2. **Structure** — CSVs and text files for all game data
3. **Train** — Feed structured data to Claude agent as knowledge base
