# Webapp Handover — Pokemon Champions VGC Mobile App

Source plan: `C:\Users\paulo\.claude\plans\lets-brainstorm-ways-i-cached-puddle.md`

## TL;DR — where we are

Path B chosen (Next.js on Vercel + Anthropic API + free LLMs). Scaffold is up, the `/api/search` endpoint works end-to-end (LanceDB loads and returns real results in Next.js), and the tsx-based CLI still works. **Risk spike is green — the hard part is done.** The rest is mostly UI + LLM adapter glue.

## Decisions locked in (do not revisit without reason)

- **Path B**: Next.js on Vercel, mobile-first PWA
- **LLM model picker**: all 5 — DeepSeek V3 (OpenRouter free), Gemini 2.5 Flash (free), Llama 3.3 70B (Groq free), Sonnet 4.6 (Anthropic paid), Opus 4.7 (Anthropic paid). Default to a free model; user toggles per request.
- **Refresh cadence**: GitHub Actions cron every 3 days (`0 6 */3 * *`) + `workflow_dispatch` for manual
- **No auth, no DB in v1**: localStorage only. Supabase upgrade path stays open but deferred.
- **Primary use case**: team-building/brainstorming — prioritize `/team` UX
- **No offline requirement**

## Status (vs the original 12-item todo list)

| # | Task | Status |
|---|---|---|
| 1 | Scaffold Next.js 15 in `webapp/` with Tailwind | ✅ Done (Next.js 16.2.4 installed) |
| 2 | tsconfig paths for `../lib` | ✅ Done (`@core/*` alias + `../lib/**/*.ts` in include) |
| 3 | LanceDB risk spike | ✅ **GREEN** — verified live via `/api/search?q=...` |
| 4 | `/api/search` route | ✅ Done, returning real data |
| 5 | `/api/calc` route | 🔲 Next up — trivial, mirrors search pattern |
| 6 | shadcn/ui + mobile layout | 🔲 |
| 7 | LLM abstraction (5 adapters) | 🔲 |
| 8 | `/api/team` SSE streaming | 🔲 |
| 9 | `/team` chat UI | 🔲 |
| 10 | `/search`, `/calc`, `/pokedex/:name`, `/meta` pages | 🔲 |
| 11 | PWA manifest | 🔲 |
| 12 | `.github/workflows/refresh.yml` | 🔲 |

## Environment / what's installed

- Next.js **16.2.4** (with Turbopack) — **NOT Next.js 15**. There is an `AGENTS.md` and `CLAUDE.md` at `webapp/` pointing at `node_modules/next/dist/docs/`. **Always consult the bundled docs before writing Next.js code** — the API surface differs from Next 13–15 training data.
- React 19.2.4, TypeScript 5, Tailwind 4 (`@tailwindcss/postcss`)
- Shared libs installed in webapp: `@lancedb/lancedb@^0.27.2`, `@huggingface/transformers@^4.0.0`, `csv-parse@^6.2.1`, `apache-arrow@^18.1.0`
- Node runtime forced on API routes: `export const runtime = "nodejs"` (LanceDB native binary needs it)

## Files created / modified so far

### Created
- `webapp/` — entire Next.js project (via `create-next-app`)
- `webapp/src/app/api/search/route.ts` — GET with `q` and `topK` query params, calls `query()` from `@core/rag`
- `webapp/.env.local` — sets `POKEMON_DATA_ROOT=../` so lib/rag.ts finds CSVs and `.lancedb` in project root

### Modified
- `webapp/tsconfig.json` — added `@core/*` path alias to `../lib/*`, added `../lib/**/*.ts` to `include`, **changed `module` and `moduleResolution` to `"nodenext"`** (this is what makes `.js` imports in lib resolve to `.ts` files — do not change back to `"bundler"`)
- `webapp/next.config.ts` — added `serverExternalPackages: ["@lancedb/lancedb", "@huggingface/transformers", "apache-arrow", "onnxruntime-node"]` to keep native binaries out of the bundle
- `lib/rag.ts` — patched the `PROJECT_ROOT` line. Was `resolve(import.meta.dirname, "..")`. Now reads `POKEMON_DATA_ROOT` env var first, falls back to `resolve(dirname(fileURLToPath(import.meta.url)), "..")`. **Verified tsx still works after the change.**

## Gotchas (things you'll hit if you don't know them)

1. **`import.meta.dirname` is undefined in Turbopack bundles** — use `fileURLToPath(import.meta.url)` or env vars. Relevant because original rag.ts used the Node 20 shortcut. Already patched; watch out when touching other files that use it (e.g., `lib/chunker.ts:311` still uses it, but it's only invoked by `scripts/index-data.ts`, not the webapp — safe for now).

2. **`.js` extensions in `lib/*.ts` imports** (Node16 ESM convention) only resolve cleanly because webapp tsconfig uses `"moduleResolution": "nodenext"`. Do NOT switch to `"bundler"` — it'll break every `.js` import chain.

3. **Workspace root warning** — Turbopack detects two lockfiles (root + webapp) and infers the root as the parent. This is actually what we want for `../lib` imports to work. To silence the warning, set `turbopack.root: path.resolve(__dirname, "..")` in next.config.ts.

4. **Vercel deployment concern (unresolved)** — Vercel normally deploys one directory. Our webapp imports files from `../lib/` and reads data files from `../.lancedb`, `../*.csv`. When deploying, need to either:
   - (a) Set "Root Directory" = `webapp/` on Vercel but add `outputFileTracingRoot: path.resolve(__dirname, "..")` in `next.config.ts` so Vercel traces files outside webapp
   - (b) Deploy from the project root and point at `webapp/` as the Next.js app via `next.config.ts`
   - Recommend (a). Validate early before the UI grows.

5. **LanceDB native binary size** — the webapp `node_modules` now includes lancedb binaries (~30-50 MB). Vercel build should handle this via `serverExternalPackages`, but if cold starts balloon, fallback plan is brute-force cosine over the 2,224 chunks (documented in the plan file).

6. **Dev server startup** — `cd webapp && npm run dev` starts on http://localhost:3000. First query is slow (~5s) because the embedding model downloads ~80MB. Subsequent queries are fast.

## Verified working

```bash
# from webapp/
npm run dev

# in another shell
curl "http://localhost:3000/api/search?q=incineroar+set&topK=3"
# → returns real chunks from pokemon_champions.csv, matchup_matrix.csv, pikalytics_usage.csv with scores

# from project root (tsx path not broken)
npx tsx scripts/search.ts "incineroar set" 2
# → returns the same data
```

## Next steps in order (pick up here)

### Step 1 — Wire `/api/calc`

Create `webapp/src/app/api/calc/route.ts`. POST endpoint, body is `{ attacker, defender, move, field? }`. Import `calculateDamage` from `@core/calc` (via `lib/calc/index.ts`).

Reference types: `CompetitiveSet`, `FieldConditions`, `CalcResult` in `lib/calc/types.ts`. See [lib/calc/damage.ts](lib/calc/damage.ts) for the function signature.

A simpler GET alternative for v1: `GET /api/calc?attacker=Incineroar&move=FlareBlitz&defender=Azumarill` and internally construct default CompetitiveSets. The existing `scripts/calc.ts` CLI parses "Attacker Move vs Defender" syntax — reuse that logic.

### Step 2 — Add shadcn/ui

```bash
cd webapp
npx shadcn@latest init
# choose: TypeScript yes, style: default, base color: slate or zinc, CSS variables yes
npx shadcn@latest add button input card sheet tabs select
```

### Step 3 — Basic mobile layout

Replace `webapp/src/app/page.tsx` with a mobile-first home: search bar at top, tile grid for {Team Builder, Calc, Pokedex, Meta, Speed Tiers, Sets}. Add a bottom nav (shadcn Tabs or custom) with 4 tabs: Home, Team, Calc, Meta.

Reference `data/knowledge/meta_snapshot.md` for what goes on `/meta`. Use Tailwind breakpoints `sm:` up for desktop scaling, mobile is default.

### Step 4 — LLM abstraction (`webapp/src/lib/llm.ts`)

Single interface:
```ts
export interface ChatParams {
  model: "deepseek-v3" | "gemini-2.5-flash" | "llama-3.3-70b" | "sonnet-4-6" | "opus-4-7";
  messages: Message[];
  tools?: Tool[];
  system?: string;
  stream?: boolean;
}
export interface ChatResult { content: string; toolCalls?: ToolCall[]; ... }
export async function chat(params: ChatParams): Promise<ChatResult> { ... }
```

Adapters (each in its own file under `webapp/src/lib/llm/`):
- `anthropic.ts` — `@anthropic-ai/sdk`, enable prompt caching (`cache_control: { type: "ephemeral" }`) on system prompt + meta context
- `openrouter.ts` — hits `https://openrouter.ai/api/v1/chat/completions` with OpenAI-compatible request. Uses model string `deepseek/deepseek-chat-v3:free`
- `gemini.ts` — `@google/genai` SDK, gemini-2.5-flash
- `groq.ts` — `groq-sdk` or plain fetch, llama-3.3-70b-versatile model

Tool schemas — use OpenAI function-calling format. Anthropic SDK accepts OpenAI-style with a thin adapter. Only two tools in v1: `search(query, topK)` and `calc(attacker, defender, move, field)`.

Env vars needed (add to `.env.local`, don't commit):
```
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-v1-...
GOOGLE_GENAI_API_KEY=...
GROQ_API_KEY=gsk_...
```

### Step 5 — `/api/team` SSE streaming

Pattern:
1. Accept `{ model, messages, systemPromptVersion }` in POST body
2. Build system prompt — include a condensed meta snapshot (~3-5K tokens) + the 5 champions-specific rules (from `CLAUDE.md`: no Terastallize, IVs eliminated, missing items, etc.)
3. Enter tool-use loop: call model → if tool_calls, execute locally → append tool results → loop until content
4. Stream each delta as SSE: `data: {"type":"content","delta":"..."}\n\n`

Return `new Response(stream, { headers: { "Content-Type": "text/event-stream" } })`.

Check `webapp/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` for the streaming pattern (ReadableStream with iterator — already shown in that doc).

### Step 6 — `/team` chat UI

Client Component (`"use client"`). State: messages[], model, input. Submit → POST to /api/team, read SSE stream, append deltas to last assistant message.

Model picker: segmented control above chat. Display which model is being used next to each assistant message for clarity.

Honor the user's memory `feedback_team_output_flexibility.md` — system prompt should produce advisory output (2-3 Mega options, per-slot alternatives, Workshop Notes).

### Step 7 — remaining pages

- `/search` page — input that posts to `/api/search`, renders result cards with source links
- `/calc` page — three picker dropdowns (attacker / move / defender), a "Calculate" button, renders 16 damage rolls + KO% + avg. Sources from `pokemon_champions.csv` and `moves.csv` via static import or an API route that lists Pokemon/moves
- `/pokedex/[name]` — server component, loads Pokemon row + moves + abilities, with a "Run a calc with this" link
- `/meta` — server component, renders `data/knowledge/meta_snapshot.md` (use `marked` or `react-markdown`)

### Step 8 — PWA manifest

`webapp/public/manifest.webmanifest` + reference in layout.tsx:
```ts
export const metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
}
```

Icons: 192x192 and 512x512 at minimum. Can generate via any Pokeball SVG → export.

See `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` for the Next 16 PWA pattern.

### Step 9 — GitHub Actions refresh workflow

`.github/workflows/refresh.yml`:
```yaml
name: Refresh competitive data
on:
  schedule:
    - cron: '0 6 */3 * *'
  workflow_dispatch:
concurrency:
  group: refresh
  cancel-in-progress: false
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: npm ci
      - run: pip install -r requirements.txt  # check if this file exists; otherwise install from scraper files
      - run: python scraper_pikalytics.py
      - run: python scraper_sheets.py
      - run: npx tsx scripts/index-data.ts
      - name: Commit and push changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --cached --quiet || git commit -m "refresh: auto-update competitive data"
          git push
```

Vercel's GitHub integration will auto-deploy on push to main.

### Step 10 — Deploy to Vercel

1. Push repo to GitHub
2. Vercel → Import Project → select repo
3. Root Directory: `webapp`
4. Add env vars in Vercel dashboard: all four API keys
5. Also in `next.config.ts`, add `outputFileTracingRoot: path.resolve(__dirname, "..")` so Vercel traces `../lib` and `../.lancedb`
6. First deploy — test on phone via preview URL

## Verification plan (before calling v1 done)

- 5 lookup queries parity desktop vs webapp
- Damage calc parity for 3 known matchups (Incineroar Flare Blitz vs Azumarill, etc.)
- `/team` end-to-end: "build a rain team around Pelipper" with each of the 5 models — confirm advisory format per user's `feedback_team_output_flexibility.md`
- PWA install on iOS + Android, touch targets ≥44px
- Refresh workflow manual trigger: `gh workflow run refresh.yml`, confirm commit and redeploy

## References

- Plan: `C:\Users\paulo\.claude\plans\lets-brainstorm-ways-i-cached-puddle.md`
- Next.js docs (version-matched): `webapp/node_modules/next/dist/docs/`
- Project CLAUDE.md: lists all Champions-specific rules to encode in the `/team` system prompt
- Memory: `C:\Users\paulo\.claude\projects\C--Users-paulo-Documents-LOCAL-WORKSPACE-1-pokemon-skill\memory\feedback_team_output_flexibility.md` for the advisory format requirement
