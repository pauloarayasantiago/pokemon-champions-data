# Active Context (2026-04-12)

## Current Phase: System Fully Operational — RAG Quality Improved

All data scraping, competitive meta data, and indexing is complete. The RAG system has 1,550 chunks across 52 files. Semantic search retrieval quality has been improved with over-fetch + metadata re-ranking.

### Completed
- Scraped 186 base Pokémon with types, abilities, moves, and base stats → `pokemon_champions.csv`
- Scraped 59 Mega Evolutions with types, abilities, and base stats → `mega_evolutions.csv`
- Scraped 138 items, 494 moves, 21 updated attacks, 4 new abilities, 23 mega abilities
- **Scraped 136 tournament teams** from VGCPastes Google Sheets → `tournament_teams.csv`
- **Scraped 80 Pokémon usage stats** from Pikalytics → `pikalytics_usage.csv`
- Built LanceDB RAG system with `/lookup`, `/reindex`, and **`/refresh`** skills
- Built YouTube transcript scraper; 24 transcripts (868KB) collected
- 3 deep research documents → `research/`
- **CLAUDE.md** — Expert persona with mandatory lookup rule
- **`/team` skill** — 5 modes + data freshness check (warns if data >3 days old)
- **`/research` skill** — Web-based competitive data gathering
- **`/refresh` skill** — Re-scrapes Pikalytics + Google Sheets + reindexes
- 7 knowledge documents in `data/knowledge/`
- **Reindexed**: 1,550 chunks across 52 files
- **RAG retrieval fix**: Over-fetch + metadata re-rank in `lib/rag.ts` — usage chunks now surface correctly when queries contain usage keywords + Pokemon name

### Known Issues
- Floette has no base stats (Serebii page layout issue)
- Pikalytics move names may be in non-English languages (tournament submission language)
- 106/186 Pokemon have no Pikalytics data (insufficient tournament appearances)
- Mr. Rime has no Pikalytics page (slug format unknown)
- Rotom form names (Rotom-Wash, Rotom-Heat) have low embedding similarity — hyphenated names don't embed well with MiniLM-L6-v2

### Pending / Next Steps
- YouTube scraper re-run when IP cooldown lifts
- **PROPOSED: Pokemon Matchup Matrix** — Mathematical scoring system (see productContext.md)
- Consider hybrid search (BM25 + vector) via LanceDB FTS index for further retrieval improvements

### Key Decisions
- Research-first approach completed successfully
- Using multiple data sources: Serebii (game data), Pikalytics (usage stats), VGCPastes (tournament teams), YouTube creators (meta opinions), AI research (comprehensive analysis)
- Champions ≠ Scarlet/Violet — all data must be verified as Champions-specific
- Target format: VGC Doubles, Regulation M-A
- RAG re-ranking: boost only when usage-intent keywords detected (not on every Pokemon name query) to avoid regressions on type/ability/moveset queries
