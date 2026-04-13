Search the project's vector database before reading files.

This project has a LanceDB vector index containing all Pokémon Champions game data, documentation, and project context files — pre-chunked and embedded for semantic search.

## How to search

Run one or more semantic queries against the index:

```bash
npx tsx scripts/search.ts "<natural language question>" [topK]
```

- `topK` defaults to 5. Use 10-15 for broader exploration, 3 for focused lookups.
- Results include similarity scores, source file paths, and chunk text.
- You can run multiple searches in parallel with different queries.

## What's indexed

The index (`scripts/index-data.ts` -> `.lancedb/`) contains:

- **Pokémon** (186): Names, types, abilities, and full move lists from `pokemon_champions.csv`
- **Mega Evolutions** (59): Base Pokémon, mega form name, types, and abilities from `mega_evolutions.csv`
- **Moves** (494): Name, type, category, PP, power, accuracy, and effects from `moves.csv`
- **Items** (138): Name, effect description, and location/cost from `items.csv`
- **Updated Attacks** (21): Moves changed from Scarlet/Violet with both old and new stats from `updated_attacks.csv`
- **New Abilities** (4): Champions-exclusive abilities from `new_abilities.csv`
- **Mega Abilities** (23): Mega Evolution ability changes from `mega_abilities.csv`
- **Status Conditions**: Freeze, Paralysis, Sleep mechanic changes from `status_conditions.txt`
- **Training Mechanics**: VP cost system from `training_mechanics.txt`
- **Project Context**: All markdown files from `memory-bank/`

## When to use this

Use `/lookup` as your **first step** when you need to understand something about the project — before manually reading files. It's faster and uses less context than reading full CSVs or reports.

**After getting search results, answer directly from the returned chunks. Do NOT use Read, Glob, or Grep unless a chunk is visibly truncated.**

## Argument

Pass your search query as the argument: `/lookup your question here`
