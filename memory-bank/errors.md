# Errors Log

| Error | Date | Fix |
|---|---|---|
| Moves returning 0 results | 2026-04-12 | Move links use `href="/attackdex-champions/"` in `td.fooinfo` with `rowspan="2"`. Fixed parser to target these specifically instead of `cells[0]` |
| Type2 contaminated by move types | 2026-04-12 | `parse_types()` was matching ALL type images on page including moves. Fixed to only match type images inside links to `/pokedex-champions/{type}.shtml` |
| New abilities returning 0 | 2026-04-12 | Page uses `class="tab"` not `class="dextable"`. Fixed selector |
| Mega abilities returning 0 | 2026-04-12 | Same `class="tab"` issue, plus cell layout was 6 cells not 5. Fixed both |
| UnicodeEncodeError cp1252 | 2026-04-12 | Windows console issue. Use `PYTHONIOENCODING=utf-8` |
| Items/moves including header row | 2026-04-12 | Added `name != "Name"` filter to skip header rows parsed as data |
| Mega data incomplete (23 vs 59) | 2026-04-12 | `mega_abilities.csv` only lists megas with NEW abilities. Need to extract all megas from individual Pokémon pages where base + mega forms coexist |
