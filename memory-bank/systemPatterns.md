# System Patterns

## Repository Structure

```
1-pokemon-skill/
├── scraper.py              Main scraper script (all data extraction)
├── pokemon_champions.csv   186 Pokémon: name, type1, type2, abilities, moves
├── mega_evolutions.csv     59 Mega forms: pokemon, mega_name, type1, type2, ability
├── items.csv               138 items: name, effect, location
├── moves.csv               494 moves: name, type, category, pp, power, accuracy, effect
├── updated_attacks.csv     21 changed moves: Champions vs S/V stats
├── new_abilities.csv       4 new abilities: name, effect
├── mega_abilities.csv      23 megas with new abilities (subset of mega_evolutions)
├── status_conditions.txt   Freeze/Paralysis/Sleep mechanic changes
├── training_mechanics.txt  VP costs for customization
├── memory-bank/            Project context files
└── memory-bank-example/    Template (from another project)
```

## Data Relationships
- `pokemon_champions.csv` → moves column references names in `moves.csv`
- `pokemon_champions.csv` → abilities can be cross-referenced with `new_abilities.csv`
- `mega_evolutions.csv` → links to base Pokémon in `pokemon_champions.csv` by base name
- `items.csv` Mega Stones → correspond to Pokémon with Mega Evolutions
- `updated_attacks.csv` → shows what changed from S/V for moves in `moves.csv`

## Scraper Design Patterns
- `fetch(url)` → returns BeautifulSoup, raises on HTTP errors
- `type_from_src(src)` → extracts type name from img src path
- Per-page parsers: `parse_types()`, `parse_abilities()`, `parse_moves()`
- Multi-form extraction: `extract_all_forms()` handles base + mega from same page
- CSV output via `csv.DictWriter`
- Text content (status conditions, training) saved as plain `.txt`
