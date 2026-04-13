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
| youtube-transcript-api API change | 2026-04-12 | v1.2.4 changed from `YouTubeTranscriptApi.get_transcript()` class method to `YouTubeTranscriptApi().fetch()` instance method returning `FetchedTranscript` with `.text` snippets |
| YouTube emoji in titles crash | 2026-04-12 | Windows cp1252 console can't encode emoji. Fixed with `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` |
| yt-dlp duration is float | 2026-04-12 | Video duration from yt-dlp metadata is float, not int. Added `int(duration)` cast before formatting |
| YouTube IP rate limit | 2026-04-12 | After ~24 transcript fetches, YouTube blocks IP. No documented cooldown — community reports suggest 1-24 hours. Scraper auto-skips already-downloaded videos on re-run |
| Base stats parser returning None | 2026-04-12 | `parse_base_stats()` checked `rows[0]` for "HP"/"Attack"/"Speed" headers, but Serebii puts a fooevo "Stats" label in row 0 and column headers in row 1. Fixed to match on fooevo "Stats" text and read data from row 2. Same fix for `parse_mega_stats()` (matches "Stats -") |
| Mega stats name matching failure | 2026-04-12 | `parse_mega_stats()` tried to return `mega_name` from stat table, but Serebii mega stat tables don't contain the mega name. Fixed by matching megas to stats by index order (both appear in same page order) |
| Floette missing base stats | 2026-04-12 | Floette-Eternal has a different page layout on Serebii — stat table header doesn't match "Stats" exactly. 1/186 affected, not critical |
| Pikalytics meta tag case | 2026-04-12 | `parse_usage_rank()` searched for `name="description"` but Pikalytics uses `name="Description"` (capital D). Fixed to match capital D |
| Pikalytics non-English moves | 2026-04-12 | Some Pokemon's move names appear in non-English (e.g., Venusaur: "Fangobomba" instead of "Sludge Bomb"). This comes from tournament submissions in different languages. Not fixable without a translation mapping |
| Mr. Rime no Pikalytics page | 2026-04-12 | No working URL slug found for Mr. Rime on Pikalytics (tried: Mr.%20Rime, Mr.Rime, Mr-Rime, MrRime, mr-rime). Added to SLUG_OVERRIDES as None (skip) |
| Usage chunks ranked low for popular Pokemon | 2026-04-12 | All 80 usage chunks share boilerplate text "competitive usage statistics: Ranked #X with Y%..." — MiniLM-L6-v2 weights this shared vocabulary over the single Pokemon name token. Fixed with over-fetch + metadata re-rank in `lib/rag.ts`. Boost gated on `wantsUsage` detection to avoid regressions |
| extractPokemonFromQuery TypeError | 2026-04-12 | `metadata.name` can be non-string (e.g., numeric from CSV). Casting `as string` then calling `.toLowerCase()` crashed. Fixed with `typeof raw !== "string"` guard |
