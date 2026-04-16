# Active Context (2026-04-15)

## Current State: Embedding Model Switch + Realistic Tests + Rotom Forms Complete

All planned systems are production-ready. This session completed three major changes: Rotom form variants across the full data pipeline, embedding model migration to MiniLM-L6-v2, and realistic search quality tests that exposed and fixed intent classification gaps.

### What Was Done (2026-04-15 — this session)

**Rotom Form Variants (5 appliance forms):**
- Added Rotom-Wash/Heat/Frost/Fan/Mow as separate rows in `pokemon_champions.csv` (191 rows, was 186)
- Stats: 50/65/107/105/107/86 (520 BST), type2 varies (Water/Fire/Ice/Flying/Grass), Levitate
- Move pools: base Rotom's 42 moves + form-specific signature (Hydro Pump/Overheat/Blizzard/Air Slash/Leaf Storm)
- Re-scraped Pikalytics: 84 rows (Rotom-Wash #10 at 16%, Rotom-Heat #43 at 2%)
- Rebuilt matchup + efficiency matrices: 61,752 pairs from 249 sets
- Verified Levitate immunity (Garchomp EQ vs Rotom-Wash = no effect)
- Added Rotom forms to speed_tiers.md (base 86 speed tier)

**Embedding Model Migration (EmbeddingGemma → MiniLM-L6-v2):**
- Switched from `onnx-community/embeddinggemma-300m-ONNX` (768-dim, ~300MB, q8) to `Xenova/all-MiniLM-L6-v2` (384-dim, ~80MB, fp32)
- Rewrote `lib/embed.ts`: removed query/document prefixes, removed dtype, batch size 16→64
- Updated `scripts/index-data.ts` model name in metadata
- Updated `scripts/test-suite.ts`: 768→384 dim checks, model name assertions
- Reindexed: 1,910 chunks across 72 files — ~4× faster than EmbeddingGemma
- All search quality preserved with the re-ranker compensating for smaller model

**Realistic Search Quality Tests (15 tests, 23 assertions):**
- Added `testRealisticQueries()` to `scripts/test-suite.ts` with natural-language queries
- 6 categories: Team Building (4), Matchup/Counter (3), Set/Moveset (3), Meta/Usage (2), Champions Mechanics (2), Speed/Calc (1)
- Initial run: 69/74 — 5 failures exposed real intent classification gaps

**Intent Classification Fixes in `lib/rag.ts`:**
- Move queries + Pokemon name now include "usage" category (e.g., "what moves should I run on Garchomp?" → pikalytics data surfaces)
- Item queries + Pokemon name now include "usage" + "pokemon" categories (e.g., "what item should Sneasler hold?" → usage data surfaces)
- Added "vs" to MATCHUP_KEYWORDS (head-to-head comparisons)
- Added "most popular" to USAGE_KEYWORDS (meta queries)
- After fixes: 74/74 all tests pass

### Systems Status
- **RAG system**: 1,910 chunks across 72 files; MiniLM-L6-v2 (384-dim, ~80MB)
- **Test suite**: **74/74** RAG tests + **24/24** calc tests = **98/98 total**
- **Pokemon data**: 191 Pokemon (186 base + 5 Rotom forms)
- **Matrices**: 249 sets × 249 = 61,752 matchup + efficiency pairs
- **Pikalytics**: 84 Pokemon with tournament data
- **Transcripts**: 43 files from 31 unique channels
- **Skills**: `/lookup`, `/team`, `/calc`, `/research`, `/refresh`, `/reindex` all operational

### Running Tests
```bash
npx tsx scripts/test-suite.ts    # 74-test comprehensive suite (embedding, translation, search quality, realistic queries, overlap, lifecycle, scraper)
npx tsx scripts/test-calc.ts     # 24-test damage calc suite
npx tsx scripts/eval.ts          # 25/25 RAG eval suite
npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"  # CLI smoke test
```

### Known Issues
- Floette has no base stats (Serebii page layout issue — 1/186 affected)
- 102/191 Pokemon have no Pikalytics data (insufficient tournament appearances)
- Mr. Rime has no Pikalytics page (slug format unknown)
- Alolan Ninetales forms still outstanding (noted in errors.md)
- LanceDB scalar index bug: workaround in place (omit category from structured WHERE)

### What's Next
- Alolan Ninetales form variants (same pattern as Rotom forms)
- YouTube scraper re-run when IP cooldown lifts
- WolfeyVGC daily series (April 11-30) still mostly uncaptured
- Meta evolution: new regulations, balance patches, data refreshes via `/refresh`
