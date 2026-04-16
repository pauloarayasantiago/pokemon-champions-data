# Active Context (2026-04-16)

## Current State: System Accuracy Audit Complete + All Improvements Implemented

234-test audit identified 3 ranking weaknesses and 6 improvement areas. All recommendations (A-F) implemented and validated. Full regression: **251/251 tests passing** across 4 test suites.

### What Was Done (2026-04-16 — this session)

**A. Mega Charizard X/Y Data Fix:**
- Renamed both forms in `mega_evolutions.csv` from "Mega Charizard" to "Mega Charizard X" / "Mega Charizard Y"
- Added prefix matching in `lib/calc/data.ts` `findMega()` so "Mega Charizard" still resolves (to X)
- Fixed critical bug: both X and Y shared Map key "mega charizard", Y overwrote X — Mega Charizard X was completely inaccessible in damage calc

**B. RAG Ranking Improvements (lib/rag.ts):**
- Added `hasItemKeyword` and `hasTeamKeyword` to QueryIntent interface
- Item chunk boost: +0.03 when query has item intent
- Team chunk penalty: -0.015 for non-team queries (prevents tournament teams drowning entity data)
- B1 (knowledge boost for usage queries) was attempted but reverted — cascading failures across eval/test suites; the boost was too aggressive for the RRF score scale

**C. Structured Query Fixes (lib/structured-query.ts):**
- C1: Wired up "worst"/"bad" stat qualifiers (were in STAT_QUALIFIERS but not extractStatConditions)
- C2: Added SpDef to "bulky" filter (was only HP + Def)
- C3: Word-boundary regex for type matching (prevents "water" matching "waterproof")

**D. Data Quality:**
- Removed duplicate tournament team PC99 (identical to PC132, same replica code SNE72HTH6T)

**E. Ability Modifier Calc Tests (scripts/test-calc.ts):**
- Added 16 new ability tests: Helping Hand (1.5x), Friend Guard (0.75x), Multiscale (Mega Dragonite), Thick Fat (Mega Venusaur), Tough Claws (Mega Charizard X), Mega Launcher (Mega Blastoise), Adaptability (Mega Beedrill), Guts (Machamp), Tinted Lens (Vivillon), Filter (Aggron), Technician (Scizor), Sharpness (Garchomp), Aurora Veil (phys+spec), Piercing Drill (Mega Excadrill)
- Tests use mega-vs-base comparison pattern (mega?.ability takes precedence over set.ability)

**F. npm Test Scripts (package.json):**
- `npm test` — runs all 4 suites sequentially
- `npm run test:calc` / `test:rag` / `test:integration` / `test:stress` — individual suites

**Stress Test Suite (scripts/stress-test.ts):**
- 111 tests across 7 tiers: Simple Lookups (23), Champions Mechanics (10), Negative/Absence (29), Damage Calc Edge Cases (19), Complex Multi-Entity (10), Intent Classification (10), Strategic Reasoning (10)

### Systems Status
- **RAG system**: 1,911 chunks across 72 files; MiniLM-L6-v2 (384-dim, ~80MB)
- **Test suites**: **251/251 total** — calc 41/41, integration 74/74, eval 25/25, stress 111/111
- **Pokemon data**: 191 Pokemon (186 base + 5 Rotom forms)
- **Tournament teams**: 135 teams (was 136, removed duplicate)
- **Matrices**: 249 sets × 249 = 61,752 matchup + efficiency pairs
- **Pikalytics**: 84 Pokemon with tournament data
- **Transcripts**: 43 files from 31 unique channels
- **Skills**: `/lookup`, `/team`, `/calc`, `/research`, `/refresh`, `/reindex` all operational

### Running Tests
```bash
npm test                          # All 251 tests (calc + integration + eval + stress)
npm run test:calc                 # 41-test calc suite (stats, damage, abilities)
npm run test:integration          # 74-test RAG suite (embedding, translation, search, lifecycle)
npm run test:rag                  # 25-test eval suite (recall, MRR, per-category)
npm run test:stress               # 111-test stress suite (7 tiers of accuracy)
npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"  # CLI smoke test
```

### Known Issues
- Floette has no base stats (Serebii page layout issue — 1/186 affected)
- 102/191 Pokemon have no Pikalytics data (insufficient tournament appearances)
- Mr. Rime has no Pikalytics page (slug format unknown)
- Alolan Ninetales forms still outstanding
- LanceDB scalar index bug: workaround in place (omit category from structured WHERE)
- Vague meta queries ("what's good in the meta") return transcripts instead of meta_snapshot — known ranking gap, B1 fix reverted due to cascading failures

### What's Next
- Alolan Ninetales form variants (same pattern as Rotom forms)
- YouTube scraper re-run when IP cooldown lifts
- WolfeyVGC daily series (April 11-30) still mostly uncaptured
- Meta evolution: new regulations, balance patches, data refreshes via `/refresh`
