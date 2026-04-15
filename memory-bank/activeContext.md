# Active Context (2026-04-14)

## Current State: Efficiency Coefficient Matrix Complete

All planned systems are production-ready. This session designed and built a comprehensive efficiency coefficient matrix extending the matchup matrix with 6 weighted sub-scores across all 59,292 Pokemon pairs.

### What Was Done (2026-04-14 — this session)

**Efficiency Coefficient Matrix:**
- Designed and implemented `lib/calc/efficiency.ts` — composite coefficient E(A,B) on [-1, +1]
- Formula: `E = 0.30*offense + 0.25*defense + 0.20*speed + 0.10*typing + 0.10*movepool + 0.05*mega`
- 6 sub-scores, each [-1, +1]: Offensive Threat, Defensive Resilience, Speed Dynamics, Type Advantage, Move Pool Flexibility, Mega Context
- Added `EfficiencySubScores` and `EfficiencyEntry` types to `lib/calc/types.ts`
- Added `--efficiency` flag to `scripts/build-matchup-matrix.ts`
- Output: `efficiency_matrix.csv` (59,292 rows, 26 columns, ~9.6 MB, builds in ~15s)
- Verification: Mean=-0.040, StdDev=0.219, Range=[-0.720, +0.603], Anti-symmetry corr=0.792
- Meta-weighted rankings: Mega Dragonite, Mega Aggron, Mega Gyarados, Mega Garchomp, Archaludon top 5

### What Was Done (2026-04-14 — previous session: Transcripts)

**Project Initialization:**
- LanceDB index was missing on session start — rebuilt from scratch with `/reindex --force`
- 1,815 chunks indexed across 53 files; embedding model downloaded (~300MB, `onnx-community/embeddinggemma-300m-ONNX`)
- Verified `/lookup` functional with smoke test

**YouTube Transcript Expansion:**
- Diagnosed transcript gap: `scraper_youtube.py` uses `yt-dlp` + `youtube-transcript-api` — no browser/API key needed
- Installed missing Python deps: `yt-dlp`, `youtube-transcript-api`
- Ran `python scraper_youtube.py --max 10` — checked 155 videos across 21 queries
- **18 new transcripts saved** (was 25, now 43 total)
- New channels added: ADrive, CybertronVGC (new video), False Swipe Gaming, Kneeckoh (new video), Moxie Boosted, Nivag, PanfroGames (new video), PokeAimMD+JoeUX9 collab, Poplove Gaming, SkrawVGC (new video), ThatSaVGC (new video), TrickRubyVGC, 13Yoshi37, Solemn PKM, Temp6T
- YouTube IP-blocked the transcript API after ~55 fetches (100 failed); safe to re-run after cooldown
- Incremental reindex: 1,819 → 1,891 chunks (+72)

**Notable new content found:**
- `adrive-all-13-new-mega-abilities-for-pokemon-champions.md` — Mega ability deep-dive
- `cybertronvgc-counter-the-top-5-pokémon-dominating-pokemon-champions-vgc.md` — Counter guide
- `moxie-boosted-the-pokemon-champions-item-tier-list.md` — Item tier list
- `trickrubyvgc-how-to-trick-room-in-pokemon-champions.md` — TR archetype guide
- `skraw-vgc-are-the-za-megas-good-in-pokemon-champions.md` — Mega tier update
- `pokeaimmd-and-joeux9-top-5-underrated-megas-in-pokemon-champions.md` — Underrated Megas collab
- `false-swipe-gaming-top-5-winners-losers-of-pokemon-champions.md` — Meta winners/losers

### What Was Fixed (2026-04-14 — previous session)

**Item Data Accuracy:**
- Expanded MISSING ITEMS blacklist in CLAUDE.md from 14 to 24+ items
- Removed phantom items (Clear Amulet, Throat Spray, Expert Belt, Gems, Booster Energy, Metronome) from all knowledge docs
- Added whitelist+blacklist validation to `/team` skill (items.csv + Serebii as ground truth)
- Removed Expert Belt + Gem calc logic from `lib/calc/damage.ts`
- Fixed Clear Amulet → White Herb in team_building_theory.md and meta_snapshot.md
- Verified: items.csv (138 items) matches Serebii exactly

**Phantom Item Sources Identified:**
- AI-authored research files hallucinated S/V items into Champions
- Pikalytics "Champions Preview" = Showdown simulator data with unrestricted items
- Dexerto listed datamined sprites as "confirmed" (not obtainable in-game)

**Team Skill Output Redesign:**
- Build/Fill modes now use advisory/workshop format with 2-3 Mega options, slot alternatives, and Workshop Notes
- Core/glue Pokemon presented as clear picks; flex slots get 2-3 candidates with pros/cons

### Systems Status
- **RAG system**: 25/25 eval (100%), MRR 0.958, 8 phases complete; **1,891 chunks across 54 files**
- **Transcripts**: **43 files** from 31 unique channels (was 25 from 16 channels)
- **Damage calculator**: Custom TypeScript engine in `lib/calc/`, Expert Belt + Gem logic removed
- **Matchup matrix**: 244×244 (59,292 pairs) in `matchup_matrix.csv`
- **Efficiency matrix**: 244×244 (59,292 pairs, 26 columns) in `efficiency_matrix.csv` — composite coefficient + 6 sub-scores + meta weight
- **Skills**: `/lookup`, `/team`, `/calc`, `/research`, `/refresh`, `/reindex` all operational

### Running Tests
```bash
npx tsx scripts/eval.ts          # 25/25 RAG eval suite
npx tsx scripts/test-suite.ts    # 51-test comprehensive suite
npx tsx scripts/test-calc.ts     # 24-test damage calc suite
npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"  # CLI smoke test
```

### Known Issues
- Floette has no base stats (Serebii page layout issue — 1/186 affected)
- 106/186 Pokemon have no Pikalytics data (insufficient tournament appearances)
- Mr. Rime has no Pikalytics page (slug format unknown)
- LanceDB scalar index bug: workaround in place (omit category from structured WHERE)

### What's Next
- YouTube scraper re-run when IP cooldown lifts (run `python scraper_youtube.py --max 10` — auto-skips already-downloaded)
- WolfeyVGC daily series (April 11–30) still mostly uncaptured — high-value target for next scrape
- Meta evolution: new regulations, balance patches, data refreshes via `/refresh`
- Matrix can be rebuilt any time with `npm run calc:matrix` after data changes
