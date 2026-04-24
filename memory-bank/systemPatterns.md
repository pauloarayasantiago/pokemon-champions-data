# System Patterns

## Repository Structure

```
1-pokemon-skill/
├── CLAUDE.md                   Always-on expert persona (Champions VGC specialist)
├── .claude/
│   ├── commands/
│   │   ├── lookup.md           /lookup skill — semantic search against Supabase pc_chunks
│   │   ├── reindex.md          /reindex skill — rebuild vector index
│   │   ├── refresh.md          /refresh skill — re-scrape Pikalytics + Sheets + reindex
│   │   ├── team.md             /team skill — team building (build/fill/evaluate/counter/sets)
│   │   ├── calc.md             /calc skill — ad-hoc damage calculations
│   │   └── research.md         /research skill — web-based competitive data gathering
│   └── settings.local.json     Permissions for scrapers, npm, git
├── supabase/
│   └── migrations/             pc_chunks + pc_index_meta schema, pc_hybrid_search RPC
├── lib/
│   ├── chunker.ts              Text chunking (CSV→NL, markdown→sections w/ overlap)
│   ├── embed.ts                BGE-small-en-v1.5 (384-dim, fp32, CLS pool, BGE query prefix, batch 64)
│   ├── rag.ts                  Hybrid search (pc_hybrid_search RPC) + intent classification + structured queries + re-ranking dispatch (RERANKER env: crossencoder|gemma|jina|none) + staleness (A13, 2026-04-23: getStaleness() returning StalenessInfo — per-source mtime ages surfaced via SSE in route.ts, health endpoint, search.ts CLI line)
│   ├── rerank.ts               Three reranker clients (Phase 3, BLOCKED-pending-Phase-5): rerankCandidates (Jina, dormant), rerankWithGemma (OpenRouter pointwise, 10-slot worker pool), rerankWithCrossEncoder (BAAI/bge-reranker-base via HF Inference, batched). All return null on failure → caller falls through to RRF + boosts (boostMul=1). Default RERANKER is "none" since 2026-04-23 (was silently "jina" before, wasting 300-500ms/call on 403s)
│   ├── phantom-guard.ts        Pre-flight agent-layer interceptor (Phase A4, 2026-04-23): detectPhantomPokemon() scans user message for pre-evos (PRE_EVO_MAP, 23 entries) + explicit roster-excluded names (EXPLICIT_PHANTOMS — Amoonguss; extensible). formatPhantomRefusal() emits user-facing redirect text. Used by src/app/api/team/route.ts POST handler + scripts/eval-models.ts runAgent() to short-circuit the agent loop before LLM call
│   ├── supabase.ts             Supabase client factory (supabaseServer / supabaseAnon) with root .env loader
│   ├── structured-query.ts     NL→SQL stat filter builder (type, speed, attack thresholds)
│   ├── eval-data.ts            25 eval test cases across 8 categories
│   ├── validate-citations.ts   Phase 2 — claims-json parser + chunk_id validator + retry nudge (shared by prod + eval)
│   └── calc/                   Custom damage calculator engine
│       ├── types.ts            Core interfaces (CompetitiveSet, CalcResult, FieldConditions, MatchupEntry)
│       ├── data.ts             CSV loader, 18×18 type chart, move flag sets, item/berry maps
│       ├── stats.ts            Champions Stat Points calculator (66 total, 32 max, all IVs=31)
│       ├── damage.ts           Damage engine: ordered modifier chain, ~25 ability handlers
│       ├── matchup.ts          Standard set gen (Pikalytics + heuristic), matchup scorer, matrix builder
│       ├── efficiency.ts       Efficiency coefficient: 6 sub-scores, composite E(A,B), matrix builder, CSV export
│       └── index.ts            Barrel export
├── scripts/
│   ├── index-data.ts           Chunks all files → embeds → upserts to pc_chunks (glob discovery, incremental + --force modes)
│   ├── search.ts               CLI: npx tsx scripts/search.ts "query" [topK]
│   ├── eval.ts                 RAG eval harness: Recall@5, MRR, pass rate, per-category breakdown
│   ├── eval-models.ts          LLM model eval harness: 13-test agentic loop (tool_workflow, team_json, validate_loop, pokedex_dedup, item_availability, phantom_pokemon, stat_accuracy, banned_comprehensive, usage_lookup, usage_teammates, tournament_retrieval, creator_opinion, meta_core_attribution). 10-entry search stub (incl. real Golurk tournament teams). Guardrails: hard pokedex dedup cap + post-loop force-completion + Phase 2 citation-validity retry. `citation_validity_rate` metric aggregates chunk_id-validation pass rate across the 5 retrieval-tagged tests. Anthropic call path for claude-sonnet model. --real-rag flag for production Supabase search
│   ├── test-suite.ts           Comprehensive test suite (embedding, search, realistic queries, overlap, lifecycle, scraper header)
│   ├── debug-db.ts             DB inspection utility (temporary)
│   ├── calc.ts                 CLI damage calculator ("Garchomp EQ vs Incineroar" → damage range)
│   ├── build-matchup-matrix.ts 244×244 matchup matrix builder → matchup_matrix.csv
│   ├── test-calc.ts            41-test validation suite (stats, type chart, damage, 16 ability modifiers)
│   └── stress-test.ts          111-test stress suite (7 tiers: lookups, mechanics, absence, calc, multi-entity, intent, strategic)
├── data/
│   ├── knowledge/              Structured competitive knowledge (7 files, auto-discovered)
│   │   ├── type_chart.md       18-type offensive + defensive matchups
│   │   ├── damage_calc.md      Champions damage formula, modifiers, SP system
│   │   ├── team_archetypes.md  Rain, Sun, Sand, TR, Tailwind, Balance, Semi-Room
│   │   ├── team_building_theory.md  Coverage, speed control, role compression, Doubles tactics
│   │   ├── meta_snapshot.md    Top 20 usage, WR, cores, archetypes, S-tier Megas
│   │   ├── speed_tiers.md      Lv50 benchmarks, TR tiers, weather/Tailwind speeds
│   │   └── champions_rules.md  Reg M-A rules, timer, bans, bugs, event schedule
│   └── transcripts/            YouTube creator transcripts (63 markdown files, auto-discovered)
├── research/                   External AI research documents (3 files, auto-discovered)
│   ├── claude-research.md
│   ├── Gemini.txt
│   └── Pokémon Champions (2026) — Competitive Knowledge Base.md
├── memory-bank/                Project context files (this directory, auto-discovered)
├── scraper.py                  Python: Serebii.net game data scraper (w/ base stats)
├── scraper_pikalytics.py       Python: Pikalytics usage scraper (Accept-Language: en header)
├── scraper_sheets.py           Python: VGCPastes tournament team scraper (Google Sheets API)
├── scraper_youtube.py          Python: YouTube transcript scraper (yt-dlp + youtube-transcript-api)
├── pokemon_champions.csv       216 Pokémon: name, types, abilities, moves, stats (186 base + 30 form variants: 5 Rotom, 12 regional, 3 Paldean Tauros, 10 other forms — auto-generated by scraper.py FORM_VARIANTS dict)
├── mega_evolutions.csv         59 Mega forms: pokemon, mega_name, types, ability, stats (Mega Charizard X/Y disambiguated by scraper)
├── items.csv                   138 items: name, effect, location
├── moves.csv                   494 moves: name, type, category, pp, power, accuracy, effect
├── updated_attacks.csv         21 changed moves: Champions vs S/V stats
├── new_abilities.csv           4 new abilities: name, effect
├── mega_abilities.csv          23 megas with new abilities
├── pikalytics_usage.csv        91 Pokémon (incl. 11 form variants): usage %, rank, top moves/items/abilities/teammates
├── tournament_teams.csv        314 teams: team ID, player, Pokemon, items, tournament info
├── matchup_matrix.csv          75,350 matchup pairs: attacker, defender, best_move, damage_pct, score (275 attackers: 216 Pokemon + 59 Megas)
├── efficiency_matrix.csv       75,350 efficiency entries: 26 columns (6 sub-scores + composite E + meta weight + diagnostics)
├── status_conditions.txt       Freeze/Paralysis/Sleep mechanic changes
├── training_mechanics.txt      VP costs for customization
├── package.json                Node.js deps (@supabase/supabase-js, huggingface, csv-parse)
└── tsconfig.json               TypeScript config (ES2022, Node16, resolveJsonModule)
```

## Data Relationships
- `pokemon_champions.csv` → moves column references names in `moves.csv`
- `pokemon_champions.csv` → abilities can be cross-referenced with `new_abilities.csv`
- `mega_evolutions.csv` → links to base Pokémon in `pokemon_champions.csv` by base name
- `items.csv` Mega Stones → correspond to Pokémon with Mega Evolutions
- `updated_attacks.csv` → shows what changed from S/V for moves in `moves.csv`
- `pikalytics_usage.csv` → scraped with `Accept-Language` + Cloudflare cache-bust query param + post-parse non-ASCII detection + retry + prior-EN fallback (A6, 2026-04-23) — Pikalytics' Cloudflare layer occasionally serves non-English variants per-URL (JP/CN/ES/DE/FR/KR all observed); scraper self-heals by falling back to prior English row when fresh scrape regresses
- `matchup_matrix.csv` → computed from pokemon_champions.csv + mega_evolutions.csv + moves.csv + pikalytics_usage.csv via `lib/calc/matchup.ts`
- `efficiency_matrix.csv` → extends matchup_matrix with 6 sub-scores via `lib/calc/efficiency.ts`, also uses pikalytics_usage.csv for meta weights
- `data/transcripts/*.md` → content creator opinions, indexed as markdown chunks
- `research/*.md` → deep competitive analysis, indexed as markdown chunks

## Scraper Design Patterns
- `scraper.py`: `fetch(url)` → BeautifulSoup, per-page parsers, CSV output, 1s delay
  - `FORM_VARIANTS` dict (21 base → 30 variants) + `parse_section_moves()` / `parse_section_stats()` helpers extract alt-form rows from the same base page (regional, Rotom appliances, Paldean Tauros, Floette-Eternal, Aegislash-Blade, Lycanroc poses, Gourgeist sizes, etc.)
  - Duplicate mega name disambiguation: when Serebii labels X/Y megas identically (e.g., Charizard), emit loop appends " X" / " Y" in page-order
- `scraper_pikalytics.py`: `Accept-Language: en` header, per-Pokemon page scraping, pipe-delimited output. Iterates `pokemon_champions.csv` names directly — form variants auto-covered when present in CSV. **A6 (2026-04-23):** cache-bust query param `?_r=<random>` + `Cache-Control: no-cache` defeats Cloudflare per-URL cache; post-parse non-ASCII regex `[^\x00-\x7f]` + retry loop (`MAX_LANG_RETRIES=2`) + `load_prior_english_rows()` fallback + `sys.exit(1)` final assertion ensure CSV stays English across cron runs even when Pikalytics rotates locales
- `scraper_sheets.py`: Google Visualization API, single HTTP request, CSV output
- `scraper_youtube.py`: yt-dlp search → youtube-transcript-api fetch → markdown output, 1s delay
  - Date filter: only videos from April 8, 2026 (release day) onward
  - Auto-skips previously downloaded transcripts
  - Filters out wrong-game content (S/V, Sword/Shield, Unite, etc.)

## RAG Pipeline (Post-Supabase Migration)
1. **Discover** — `scripts/index-data.ts` uses glob patterns to auto-discover markdown files in `data/knowledge/`, `research/`, `data/transcripts/`, `memory-bank/`. CSVs/text files remain hardcoded (have specific chunker functions)
2. **Chunk** — `lib/chunker.ts` converts each data type to NL text chunks with `data_category` tags. Pikalytics chunks pass through raw — scrape-side `Accept-Language` header + cache-bust + non-ASCII detection + prior-EN fallback (A6, 2026-04-23) keep source data English; the chunk-time IT→EN translation layer was removed in Phase 1 (commit `7767a0a`). Markdown chunks get trailing-paragraph overlap
3. **Embed** — `lib/embed.ts` uses BGE-small-en-v1.5 (384-dim, fp32, batch size 64). CLS pooling + L2 normalize; BGE query prefix applied on `mode='query'`, raw text on `mode='doc'`
4. **Store** — Supabase `pc_chunks`: id (PK), text, embedding VECTOR(384), source, source_type, data_category, metadata JSONB, pokemon_name, col_type1/2, stat_hp/attack/defense/sp_atk/sp_def/speed/bst (null for non-Pokemon), text_tsv TSVECTOR GENERATED
5. **Index** — HNSW on embedding (`vector_cosine_ops`), GIN on text_tsv, btree on data_category + pokemon_name
6. **Meta** — `pc_index_meta` upserted after reindex (keys: indexed_at, embedding_model, chunk_count, file_count, file_mtimes)
7. **Classify** — `classifyQuery()` in [lib/rag/classify.ts](../lib/rag/classify.ts): rule-based intent detection (usage, counter, stat, item, move, team) via word-boundary matching against keyword sets + Pokemon/move/item/type dictionaries.
8. **Route** — `routeQuery()` in [lib/rag/route.ts](../lib/rag/route.ts): emits `QueryRoute { route, archetype, vsPair, phantomName, phantomEvolved }` driving force-includes and boost routing.
9. **Search** — Single RPC `pc_hybrid_search(p_embedding, p_query, p_categories, p_fetch_k, p_rrf_k=60)` fuses pgvector ANN + Postgres FTS via RRF in one round-trip.
10. **Structured** — `runStructuredFilter()` in [lib/rag/structured-filter.ts](../lib/rag/structured-filter.ts): if stat query detected, parallel supabase-js query with `.or()` per type + `.gte()/.lte()` per stat + `.not('pokemon_name','is',null)`.
11. **Force-include** — `collectForceIncludes()` in [lib/rag/force-includes.ts](../lib/rag/force-includes.ts): 7 blocks (rules, phantom, phantom-evolved, vsPair, type-chart, exact-entity, banned-item) returning `Map<id, ForcedChunk>` with first-wins insert.
12. **Merge + Re-rank** — Dedup hybrid + structured + forced results, then `applyBoosts()` in [lib/rag/boost.ts](../lib/rag/boost.ts) applies 14 boost categories (structured +0.1, usage +0.1/0.05, exact Pokemon/move/item +0.04, counter knowledge +0.04, adversarial banned-item +0.15, vsPair primaries +0.12, phantom/phantomEvolved +0.12/+0.14, theory-route +0.025, archetype +0.025, speed-tiers +0.035, item intent +0.03, team-chunk penalty -0.015 on non-team, project -0.08). Sort by score, return topK.
12a. **Planner-decomposed branch (Stage 6.3 + Phase 5)** — when `planQuery()` in [lib/query-planner.ts](../lib/query-planner.ts) returns multiple sub-queries (vspair / counter-archetype / team-archetype), [lib/query-executor.ts](../lib/query-executor.ts) `executePlan()` runs a parallel flow instead of steps 9-12: sub-queries fan out via `rawCandidates` (embed + RPC only) → `Promise.all` merge with max rrf_score by id → `collectForceIncludes(plan.originalQuery, originalIntent, originalRoute, supabase)` → `runStructuredFilter` (if `originalIntent.isStructured`) → parse → `applyBoosts(..., plan.originalQuery, boostMul=1)` → sort + slice. Force-includes and boosts key off the USER's ORIGINAL wording, not each sub-query — Stage 4.6 invariant holds by construction. `perStep` floor raised to 160 on theory/counter/matchup routes.
13. **Staleness** — `checkStaleness()` in [lib/rag.ts](../lib/rag.ts) runs once per process, reads `pc_index_meta.file_mtimes`, compares against disk, warns on stderr. **A13 (2026-04-23)** added sibling `getStaleness(): Promise<StalenessInfo | null>` — per-source mtime ages (youtube/pikalytics/sheets/serebii/knowledge) + global `indexedAt` + fs-drift flags (skipped on Vercel). 60s in-process cache. Surfaced to users via SSE `{type:"staleness"}` in route.ts (once per request after `meta`), `staleness` field in health-endpoint GET response (powers webapp footer on mount), and one-liner print in search.ts CLI
14. **Eval** — 25 test cases: `npx tsx scripts/eval.ts` → 100% pass, MRR 1.000
15. **Incremental** — index-data.ts paginates `SELECT id FROM pc_chunks` into a Set, skips already-indexed chunks (--force wipes pc_chunks before re-upsert)
16. **Full test suite** — 251 tests via `npm test`: calc (41), integration (74), eval (25), stress (111)

## Agent Loop Pipeline (webapp + eval harness)

The agent layer wraps the RAG layer. It runs in two places: [src/app/api/team/route.ts](../src/app/api/team/route.ts) POST handler (production webapp, SSE streaming) and [scripts/eval-models.ts](../scripts/eval-models.ts) `runAgent()` (eval harness, no streaming). Both share the same interceptor + agent loop shape.

1. **Parse request** — `TeamRequestBody = {model, messages[], systemPromptVersion?}`. Validate model against `MODEL_REGISTRY`, messages array non-empty.
2. **Emit `meta` SSE** — `{type: "meta", requestId, model, provider, remoteName, tier, systemPromptVersion}` fires on request start (webapp only).
3. **Phantom-Pokemon interceptor (Phase A4, 2026-04-23)** — `detectPhantomPokemon(lastUserContent)` from [lib/phantom-guard.ts](../lib/phantom-guard.ts). If any phantom (pre-evo from `PRE_EVO_MAP` or explicit-banned) is found, emit `{type: "phantom_pokemon_refused", phantoms}` + `{type: "content", delta: formatPhantomRefusal(phantoms)}` + `{type: "done", finishReason: "phantom_refusal", totalMs}` and close. **LLM is never called for phantom queries** (0 tokens, <100ms). Eval harness `runAgent()` returns a synthetic result with `finalContent = formatPhantomRefusal(...)` and `turns: 0` instead of streaming.
4. **Agent loop** (up to `MAX_TOOL_ITERATIONS = 20`) — `chatStream()` against the model with `TOOL_DEFINITIONS` and `SYSTEM_PROMPT`. For each iteration: stream `content` deltas, collect `tool_call`s, emit `iter_start`/`iter_end`, push assistant message onto `messages[]`.
5. **Tool execution** — Stage 6.3 parallelism: `Promise.all` over the turn's tool calls; each runs via `executeTool()` which routes to `search` / `calc` / `pokedex` / `validate_set`. `tool_start`/`tool_end`/`tool_result` SSE events fire for UI; `search` results feed `seenChunkIds` for citation validation.
6. **Termination** — when `finishReason !== "tool_calls"`, validate claims-json against `seenChunkIds` via `validateCitations()` (Phase 2). If invalid and retry not yet fired, nudge once (`citation_retry`), continue. Otherwise emit `citation_result` + `done` and close.
7. **Guardrails** — eval harness only: hard pokedex dedup cap (3rd+ identical call refused, not logged), post-loop force-completion (fires once if lastContent empty or no team-json block, disables tools for pure text), tool-syntax-garbage nudge (catches raw `call:name{args}` text output instead of real tool_calls — known Gemma failure mode).
