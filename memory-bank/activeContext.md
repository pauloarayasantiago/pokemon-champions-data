# Active Context (2026-04-14)

## Current State: Item Data Accuracy Fix + Team Skill Redesign Complete

All planned systems are production-ready. Recent session fixed systemic item data accuracy issues and redesigned the team skill output.

### What Was Fixed (2026-04-14)

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
- **RAG system**: 25/25 eval (100%), MRR 0.958, 8 phases complete
- **Damage calculator**: Custom TypeScript engine in `lib/calc/`, Expert Belt + Gem logic removed
- **Matchup matrix**: 244×244 (59,292 pairs) in `matchup_matrix.csv`
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
- YouTube scraper re-run when IP cooldown lifts
- Meta evolution: new regulations, balance patches, data refreshes via `/refresh`
- Matrix can be rebuilt any time with `npm run calc:matrix` after data changes
