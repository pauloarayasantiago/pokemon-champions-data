# Project Brief: Pokémon Champions Expert Agent

## Goal
Train a Claude agent to be a Pokémon Champions (released April 8, 2026) expert that helps build competitive teams.

## Core Capabilities
1. **Team Building** — Suggest 6-Pokémon teams with synergy, coverage, and role balance
2. **Set Optimization** — Recommend moves, abilities, items, and natures for each Pokémon
3. **Matchup Analysis** — Evaluate team strengths/weaknesses against common threats
4. **Meta Awareness** — Understand the Champions-specific mechanics (changed moves, new abilities, Mega Evolutions, status condition changes)

## Data Sources
All data scraped from Serebii.net (`serebii.net/pokemonchampions/` and `/pokedex-champions/`).

## Key Game Differences from Mainline
- 186 base Pokémon + 59 Mega Evolutions
- 4 new abilities: Piercing Drill, Dragonize, Mega Sol, Spicy Spray
- 21 updated attacks (changed PP/power/accuracy/effects)
- Changed status conditions: Freeze (25% thaw + guaranteed turn 3), Paralysis (12.5% immobility), Sleep (guaranteed wake turn 3)
- VP-based training system (no grinding): stats 2VP, moves 100VP, nature 200VP, ability 400VP
- No wild catching — recruit or import from Pokémon HOME
