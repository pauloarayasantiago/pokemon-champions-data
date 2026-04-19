# Active Context (2026-04-19, updated post-model-eval session)

## LLM Provider Exploration (2026-04-19) — OPTIONS ONLY, nothing decided

### Context
Evaluating free/self-hosted alternatives to Claude for the webapp's team-building agent. Two OpenRouter free models were confirmed working (Gemma 4 31B had auth issues). A 5-test eval harness was built (`scripts/eval-models.ts`) and iterated twice.

### Hardware Baseline (user's local machine)
- GPU: RTX 2070 SUPER (8GB VRAM) — limits local Ollama to 7-9B Q4 models
- RAM: 32GB system, i7-10700K 8 cores
- User also manages a remote server (GPU specs TBD)

### Eval Harness (`scripts/eval-models.ts`)
- 5 tests: `tool_workflow`, `banned_item`, `banned_mech`, `team_json`, `validate_loop`
- Agentic loop with real `pokedex`/`validate_set` (in-memory), stubbed `search` (query-aware Champions knowledge KB)
- Finalization turn: if no `team-json` block found, pushes one more message requesting it
- Supports `--models`, `--tests`, `--verbose` flags
- Snapshots saved to `snapshots/model-eval-[timestamp].json`
- `npm run eval:models`

### Latest Eval Results (v2 harness, 2026-04-19)
| Test             | GPT-OSS 120B (OpenRouter) | Gemma 4 26B A4B (OpenRouter) |
|------------------|:-------------------------:|:----------------------------:|
| tool_workflow    | ✓                         | ✓                            |
| banned_item      | ✓ (soft)                  | ✗ recommends Life Orb        |
| banned_mech      | ✗ endorses Tera           | ✓                            |
| team_json        | ✗ never emits block       | ✓ 6-mon Rain team            |
| validate_loop    | ✓ 5x                      | ✗ calls pokedex 45x, no val  |
| **Score**        | **3/5**                   | **3/5**                      |

Key behavioral patterns:
- GPT-OSS: respects some rules but can't emit team-json; validate_loop works but ordered wrong
- Gemma 4 26B: emits team-json when prompted; calls pokedex obsessively (45x in one test); ignores banned items from training data

### Registered Models (all options, none final)
```
OpenRouter hosted (working):
  nemotron-super   → openai/gpt-oss-120b:free
  gemma-4-26b      → google/gemma-4-26b-a4b-it
  gemma-4-31b      → google/gemma-4-31b-it:free  (auth errors — may need Google key in OpenRouter)

Ollama local (wired, not yet tested — needs Ollama install + model pull):
  qwen2.5-7b       → qwen2.5:7b-instruct-q4_K_M  (fits in 8GB VRAM)
  llama3.1-8b      → llama3.1:8b-instruct-q4_K_M (fits in 8GB VRAM)

Ollama remote (wired, pending server GPU info):
  remote-gemma4    → gemma3:27b-it-q4_K_M         (needs ~20GB VRAM)
  remote-qwen32b   → qwen2.5:32b-instruct-q4_K_M  (needs ~20GB VRAM)
```

### Adapter Architecture (wired, not deployed to production)
- `src/lib/llm/ollama.ts` — thin wrapper over `openai-compat.ts`
  - Local: reads `OLLAMA_BASE_URL` (default `http://localhost:11434`)
  - Remote: reads `OLLAMA_REMOTE_URL` + `OLLAMA_REMOTE_KEY`
  - Routes local vs remote by model ID prefix (`remote-*`)
- `provider: "ollama"` added to Provider type
- All new model IDs added to `ModelId` union and `MODEL_REGISTRY`
- `AVAILABLE_MODELS` updated with labels

### Known Issues / Open Questions
- GPT-OSS 120B endorses Tera despite search stub returning the correct rule — model ignores tool results when they contradict training data
- Gemma 4 26B loops pokedex calls uncontrollably on validate_loop test (45x, never transitions to validate_set)
- Gemma 4 31B (free) needs a Google API key provisioned in OpenRouter account — not tested
- Remote server GPU unknown — `remote-gemma4`/`remote-qwen32b` model names are placeholders
- Need to test local Ollama (Ollama not yet installed/models not pulled)

### Bug Fixed This Session
`lib/calc/data.ts` `readCSV()`: CSV parser crashed on trailing literal `\r` (backslash-r text, not carriage return) appended to last row of `pokemon_champions.csv`. Fixed with `relax_column_count: true` + filter on rows missing second column.

---

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
- ~~Deploy webapp to Vercel preview~~ **Done 2026-04-18** — live at `pokemon-champions-data.vercel.app`; `/search` working after the HF Inference API router migration (see progress.md "Vercel /search Production Fix").
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
- **RAG system**: Supabase pc_chunks with 2,074 chunks. HNSW (cosine) + GIN FTS. Structured filter + hybrid RPC both verified.
- **Env**: root `.env` holds Vite-style vars; `webapp/.env.local` holds Next-style vars; both work.
- **Pokemon data**: 201 Pokemon (186 base + 5 Rotom forms + 10 regional/form variants).
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
2. **Resolve webapp Tailwind 4 CSS blocker** — tracked in `webapp/HANDOVER.md`; separate task the user deferred.
3. **Create `data/knowledge/singles_meta.md`** — Singles ladder is diverging from Doubles and has no KB coverage (iStarlyTV + HoshinJosh transcripts already indexed).
4. **Reconcile `meta_snapshot.md`** with AngrySlowbroPlus tier list (Sinistcha #1 vs Incineroar #1 drift).
5. **Codify TheDelybird's 5 template team archetypes** (sun / Floette-balance / rain / sand / snow) with EV pastes — transcripts already indexed, needs structured extraction.
6. **Rebuild matchup + efficiency matrices** with the 10 new regional variants included — current matrices only cover the original 191 Pokemon set.
7. **Verify regional variant move pools** against Champions-specific sources — current moves are based on S/V/Legends Arceus and may diverge.
