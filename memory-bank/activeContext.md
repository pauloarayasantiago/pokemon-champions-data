# Active Context (2026-04-18)

## Next Steps (2026-04-18, post-regression triage)

- **Data priority hierarchy** implemented in `lib/rag.ts` rerank (see tier baseline block):
  1. Tournament data (`tournament_teams.csv`) — +0.010 on team-intent queries
  2. Usage data (`pikalytics_usage.csv`) — +0.007 on team/usage-intent queries
  3. YouTube transcripts (`data/transcripts/*.md`) — +0.003 baseline
  4. Matrices (`matchup_matrix.csv`) — −0.003 off-intent (still +0.03 on counter)
  5. Older references (`validation_notes.md`) — −0.020 hard demote
  Knowledge docs (curated `data/knowledge/*.md`) sit orthogonal: +0.020 baseline
  only when the query is **not** a pure entity lookup (pokemon/move/item
  name without strategic intent). Intent-specific boosts layered on top.
- Test baseline after hierarchy: **247/251** (calc 41, integration 73,
  stress 111, eval 22). Remaining failures are test-data nits (eval expects
  `team_building_theory.md` for Fake Out / item queries where items.csv is
  clearly more relevant) and one semantic-mismatch case (TR setters query
  where TR transcripts dominate over the TR section of team_archetypes.md).
- Deploy webapp to Vercel preview (per plan step #2).
- Fix Tailwind 4 CSS blocker in webapp.
- Author `data/knowledge/singles_meta.md` from hoshinjosh / istarlytv transcripts.
- Reconcile `meta_snapshot.md` with AngrySlowbroPlus tier list (Sinistcha vs Incineroar #1).
- Codify TheDelybird's 5 template archetypes (sun / Floette-balance / rain / sand / snow) into `team_archetypes.md`.

## Current State: Vector Store Migrated to Supabase pgvector

LanceDB is fully retired. All RAG retrieval and indexing now run against a managed Supabase project shared with `pokeke.shop`, using `pc_`-namespaced tables. Everything else (embedding model, intent classifier, RRF hybrid, boosts, structured stat filters) is unchanged.

### What Was Done (2026-04-18 — migration session)

- Enabled `vector` extension; applied `create_pc_schema` migration (pc_chunks + pc_index_meta + 6 indexes + RLS policies) via `supabase_pokeke` MCP.
- Created `pc_hybrid_search` RPC — single-round-trip RRF over pgvector ANN + Postgres `websearch_to_tsquery` FTS.
- New `lib/supabase.ts` client factory (manual root-`.env` loader, accepts both Next and Vite env names, ref project `xvddfzeimjmfzznhqutb`).
- Rewrote `lib/rag.ts` query path against the RPC; `runStructuredFilter()` uses supabase-js query builder. `checkStaleness()` now async, reads from `pc_index_meta`.
- Rewrote `scripts/index-data.ts` storage: batched upserts to `pc_chunks`, pagination for incremental mode, meta upserted to `pc_index_meta`.
- Rewrote `scripts/debug-db.ts` + `scripts/test-suite.ts`'s `testIndexLifecycle` against Supabase.
- Copied 2,224 existing vectors from `.lancedb/chunks` → `pc_chunks` (no re-embedding).
- Removed `@lancedb/lancedb` and `apache-arrow` from root and webapp `package.json`; cleaned `webapp/next.config.ts serverExternalPackages`.
- Updated `CLAUDE.md`, `.claude/commands/lookup.md`, `.claude/commands/reindex.md`, `scraper_youtube.py` docstring, memory-bank tech/system docs.

### Systems Status
- **RAG system**: Supabase pc_chunks with 2,224 chunks. HNSW (cosine) + GIN FTS. Structured filter + hybrid RPC both verified.
- **Env**: root `.env` holds Vite-style vars; `webapp/.env.local` holds Next-style vars; both work.
- **Pokemon data**: 191 Pokemon (186 base + 5 Rotom forms).
- **Tournament teams**: 314 teams. **Pikalytics**: 84 Pokemon. **Transcripts**: 63 files. **Knowledge files**: 8.
- **Skills**: `/lookup`, `/team`, `/calc`, `/research`, `/refresh`, `/reindex` all operational against Supabase.

### Smoke-tested
- `scripts/debug-db.ts` → 2224 rows, category distribution unchanged from LanceDB.
- `scripts/search.ts "highest attack water types"` → structured filter fires, top results: Gyarados, Sharpedo, Quaquaval, Mega Gyarados, Mega Feraligatr.
- `scripts/index-data.ts` (incremental) → "Nothing to index. Done." Zero new chunks.
- Webapp `/api/search` hit during migration returned Supabase-backed results with `rrf_score` scoring.

### Running Tests
```bash
npm test                          # All 251 tests (calc + integration + eval + stress) — NOT YET RUN against Supabase
npm run test:calc                 # 41-test calc suite (unaffected by migration)
npm run test:integration          # 74-test RAG suite (exercises pc_chunks + pc_index_meta)
npm run test:rag                  # 25-test eval suite
npm run test:stress               # 111-test stress suite
```

### Known Issues
- Floette has no base stats (Serebii page layout issue — 1/186 affected).
- ~107/191 Pokemon have no Pikalytics data (insufficient tournament appearances).
- Mr. Rime has no Pikalytics page (slug format unknown).
- Vague meta queries ("what's good in the meta") return transcripts instead of meta_snapshot — known ranking gap.
- `meta_snapshot.md` still lists Incineroar at the top; conflicts with Sinistcha #1 claim from AngrySlowbroPlus — needs reconciliation.
- Webapp has a separate Tailwind 4 CSS blocker (unrelated to vector store migration).

### What's Next (concrete, ordered by leverage)
1. **Run full `npm test` against Supabase** — confirm no regressions vs the LanceDB-era 251/251 baseline. First real validation beyond smoke tests.
2. **Deploy webapp to Vercel preview** — the whole point of this migration. Confirm cold-start improvement now that the 30-50MB LanceDB native binary is gone.
3. **Resolve webapp Tailwind 4 CSS blocker** — tracked in `webapp/HANDOVER.md`; separate task the user deferred.
4. **Create `data/knowledge/singles_meta.md`** — Singles ladder is diverging from Doubles and has no KB coverage (iStarlyTV + HoshinJosh transcripts already indexed).
5. **Reconcile `meta_snapshot.md`** with AngrySlowbroPlus tier list (Sinistcha #1 vs Incineroar #1 drift).
6. **Codify TheDelybird's 5 template team archetypes** (sun / Floette-balance / rain / sand / snow) with EV pastes — transcripts already indexed, needs structured extraction.
