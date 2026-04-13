# Tech Context

## Environment
- **Platform:** Windows 11 Pro
- **Python:** 3.13 (system)
- **Libraries:** requests, beautifulsoup4
- **Shell:** bash (Git Bash on Windows)
- **Encoding:** UTF-8 (set PYTHONIOENCODING=utf-8 for Windows console)

## Scraper Architecture
Single script `scraper.py` using requests + BeautifulSoup4.
- 1-second delay between individual Pokémon page requests
- Deduplicates Pokémon by URL (Mega/regional forms share base URLs)
- Extracts all forms (base + Mega) from each individual page

## Data Source: Serebii.net
- **Pokémon list:** `/pokemonchampions/pokemon.shtml` — table with `<a href="/pokedex-champions/{name}/">`
- **Individual pages:** `/pokedex-champions/{name}/` — types via `<img src="/pokedex-bw/type/{type}.gif">`, abilities via `<a href="/abilitydex/">`, moves in "Standard Moves" `dextable`
- **Mega forms:** Same URL as base form, separate Name/Type/Abilities sections further down the page
- **Items:** `/pokemonchampions/items.shtml` — 4 `dextable` tables (Hold Items, Mega Stones, Berries, Misc)
- **Moves:** `/pokemonchampions/moves.shtml` — `class="tab"` table, 7 columns
- **Updated attacks:** `/pokemonchampions/updatedattacks.shtml` — paired rows (Champions/S/V), 9+5 cells

## Key HTML Patterns
- Type images: `<img src="/pokedex-bw/type/{type}.gif">` — extract type from src filename
- Move type in individual pages: alt text like `"Assurance - Dark-type"` (different from list page)
- Category: `physical.png`, `special.png`, `other.png` in same directory
- Abilities: `<td class="fooleft"><b>Abilities</b>: <a href="/abilitydex/...">`
- Mega sections: separate Name/Type `dextable` blocks with `class="fooevo"` headers
