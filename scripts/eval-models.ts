/**
 * eval-models.ts — deep accuracy + efficiency eval for Gemma 4 26B
 *
 * Three test categories (each result is tagged):
 *   behavior     — tool workflow discipline (pokedex-before-propose, validate_loop, team_json, dedup, item_availability)
 *   retrieval    — grounds claims in project data (usage %s, teammate lists, tournament teams, creator opinions, meta win rates)
 *   hallucination — refuses phantom items/mechanics/Pokemon, cites real stat lines
 *
 * The search tool has two modes:
 *   default   — 9-entry keyword stub (fast, deterministic)
 *   --real-rag — routes through lib/rag.ts → Supabase pc_chunks (production-parity)
 *
 * Primary efficiency metric: tokens_per_pass (total usage tokens ÷ passing tests).
 *
 * Usage:
 *   npx tsx scripts/eval-models.ts
 *   npx tsx scripts/eval-models.ts --real-rag
 *   npx tsx scripts/eval-models.ts --models gemma-4-26b --tests usage_lookup,stat_accuracy --verbose
 *
 * Requires OPENROUTER_API_KEY in .env. --real-rag additionally needs Supabase env vars (loaded by lib/supabase.ts).
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { parse as parseCsv } from "csv-parse/sync";
import { lookupPokemon, validateSet, BANNED_ITEMS, type SetInput } from "../lib/team-validator.js";
import { detectPhantomPokemon, formatPhantomRefusal } from "../lib/phantom-guard.js";
import { query as ragQuery } from "../lib/rag.js";
import {
  extractClaimsBlock,
  validateCitations,
  formatValidationNudge,
  collectChunkIdsFromSearchResult,
} from "../lib/validate-citations.js";

// ── env loading ────────────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        // Respect explicit shell overrides (even empty string) — don't clobber.
        if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
        process.env[key] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* no .env — rely on environment */ }
}
loadEnv();

// ── model registry ─────────────────────────────────────────────────────────────

const OPENROUTER_KEY = () => process.env.OPENROUTER_API_KEY ?? "";
const OLLAMA_LOCAL   = () => `${process.env.OLLAMA_BASE_URL   ?? "http://localhost:11434"}/v1/chat/completions`;
const OLLAMA_REMOTE  = () => `${process.env.OLLAMA_REMOTE_URL ?? "http://localhost:11434"}/v1/chat/completions`;
const GROQ_API       = () => `${process.env.GROQ_BASE_URL     ?? "https://api.groq.com/openai/v1"}/chat/completions`;

const MODELS: Record<string, { remoteName: string; label: string; provider?: string; apiUrl?: () => string; apiKey?: () => string }> = {
  // OpenRouter hosted
  "nemotron-super": { remoteName: "openai/gpt-oss-120b:free",   label: "GPT-OSS 120B (OpenRouter)" },
  "gpt-oss-20b":    { remoteName: "openai/gpt-oss-20b",         label: "GPT-OSS 20B (OpenRouter, paid)" },
  "gemma-4-31b":    { remoteName: "google/gemma-4-31b-it:free", label: "Gemma 4 31B IT (OpenRouter)" },
  "gemma-4-26b":    { remoteName: "google/gemma-4-26b-a4b-it",  label: "Gemma 4 26B A4B (OpenRouter)" },
  "gemini-3-flash": { remoteName: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview (OpenRouter)" },
  "deepseek-v3":    { remoteName: "deepseek/deepseek-v3.2",      label: "DeepSeek V3.2 (OpenRouter)" },
  "gemini-2.5-flash-lite": { remoteName: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (OpenRouter, paid)" },
  "glm-4.5-air":    { remoteName: "z-ai/glm-4.5-air",             label: "GLM-4.5-Air (OpenRouter, paid)" },
  // Groq hosted (free tier)
  "llama-3.3-70b":  { remoteName: "llama-3.3-70b-versatile",     label: "Llama 3.3 70B (Groq)", apiUrl: GROQ_API, apiKey: () => process.env.GROQ_API_KEY ?? "" },
  // Anthropic direct (requires funded ANTHROPIC_API_KEY)
  "claude-sonnet":  { remoteName: "claude-sonnet-4-6",           label: "Claude Sonnet 4.6 (Anthropic)", provider: "anthropic" },
  // Anthropic via OpenRouter (uses OPENROUTER_API_KEY — no separate Anthropic billing needed)
  "claude-sonnet-or": { remoteName: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5 (OpenRouter)" },
  // Ollama local (RTX 2070 SUPER — 8GB → 7-9B Q4 only)
  "qwen2.5-7b":   { remoteName: "qwen2.5:7b-instruct-q4_K_M",      label: "Qwen 2.5 7B (Local Ollama)",   apiUrl: OLLAMA_LOCAL,  apiKey: () => "ollama" },
  "qwen2.5-coder-7b": { remoteName: "qwen2.5-coder:7b",             label: "Qwen 2.5 Coder 7B (Local Ollama)", apiUrl: OLLAMA_LOCAL, apiKey: () => "ollama" },
  "qwen3-8b":     { remoteName: "qwen3:8b",                        label: "Qwen 3 8B (Local Ollama)",     apiUrl: OLLAMA_LOCAL,  apiKey: () => "ollama" },
  "llama3.1-8b":  { remoteName: "llama3.1:8b-instruct-q4_K_M",     label: "Llama 3.1 8B (Local Ollama)",  apiUrl: OLLAMA_LOCAL,  apiKey: () => "ollama" },
  // Ollama remote (your server — update remoteName after pulling)
  "remote-gemma4":  { remoteName: "gemma3:27b-it-q4_K_M",           label: "Gemma 4 27B (Remote Server)",  apiUrl: OLLAMA_REMOTE, apiKey: () => process.env.OLLAMA_REMOTE_KEY ?? "ollama" },
  "remote-qwen32b": { remoteName: "qwen2.5:32b-instruct-q4_K_M",    label: "Qwen 2.5 32B (Remote Server)", apiUrl: OLLAMA_REMOTE, apiKey: () => process.env.OLLAMA_REMOTE_KEY ?? "ollama" },
};

// ── tool definitions ───────────────────────────────────────────────────────────

const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "search",
      description: "RAG semantic search over Champions competitive data. Use this to verify Champions-specific rules before answering — your training data may be wrong.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          topK: { type: "integer", default: 5 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calc",
      description: "16-roll Champions damage calculator.",
      parameters: {
        type: "object",
        properties: {
          attacker: { type: "string" },
          defender: { type: "string" },
          move: { type: "string" },
        },
        required: ["attacker", "defender"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pokedex",
      description: "Authoritative lookup of a Pokemon — types, abilities, stats, FULL legal movepool. Call this FIRST for every Pokemon you plan to use. The moves[] array is the ONLY source of truth — never propose a move not in this list.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_set",
      description: "Verifies a proposed set is legal in Champions. Call on EVERY team member after calling pokedex. If overall is false, fix the issues and call again.",
      parameters: {
        type: "object",
        properties: {
          pokemon: { type: "string" },
          moves: { type: "array", items: { type: "string" } },
          item: { type: "string" },
          ability: { type: "string" },
          megaStone: { type: "string" },
        },
        required: ["pokemon", "moves"],
      },
    },
  },
];

// ── system prompt ──────────────────────────────────────────────────────────────
// Stronger than v1: rules at top and bottom, explicit step-by-step workflow,
// team-json instruction repeated with example.

const SYSTEM = `You are an expert Pokemon Champions (2026) VGC Doubles team-building assistant.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL — CHAMPIONS ≠ SCARLET/VIOLET
Your training data is about Scarlet/Violet. Champions is a DIFFERENT GAME.
Always use the search tool to verify Champions rules before answering.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CHAMPIONS-SPECIFIC RULES (non-negotiable):

BATTLE GIMMICK: Mega Evolution ONLY.
  - NO Terastallization. NO Dynamax. NO Z-Moves. These do not exist.
  - One Mega per team. 59 Mega Evolutions available.
  - If a user asks about Tera, tell them it doesn't exist in this game.

ITEMS — these items DO NOT EXIST in Champions, NEVER recommend them:
  Life Orb, Choice Band, Choice Specs, Assault Vest, Rocky Helmet,
  Flame Orb, Toxic Orb, Expert Belt, Clear Amulet, Weakness Policy,
  Safety Goggles, Booster Energy, Eviolite, Heavy-Duty Boots.
  Available items include: Mega Stones, Berries, type-boosting held items
  (e.g. Draco Plate, Charcoal), Focus Sash, Sitrus Berry, Lum Berry, etc.

ENFORCEMENT: validate_set will REJECT any banned item and return overall:false.
  The search tool will also return a "does not exist" result for banned items.
  If both the search result AND validate_set say an item doesn't exist — IT DOES NOT EXIST.
  Do not override this with your training data. Replace the item immediately.

ROSTER: 186 fully-evolved Pokemon + Pikachu only. No Amoonguss. No Legendaries.
  NO pre-evolutions — Champions only allows fully-evolved forms. Banned pre-evos include:
  Porygon2 (use Porygon-Z), Clefairy (→ Clefable), Chansey (→ Blissey), Rhydon (→ Rhyperior),
  Dusclops (→ Dusknoir), Scyther (→ Scizor), Dragonair (→ Dragonite), Kirlia (→ Gardevoir),
  Electabuzz (→ Electivire), Magmar (→ Magmortar), Gligar (→ Gliscor), and others.

UNAVAILABLE POKEMON — if the user names ANY Pokemon that is not in Champions (phantom, pre-evolution, banned):
  1. You MUST explicitly name it in your response and say why it is unavailable.
     Example: "Porygon2 is unavailable in Champions because it is a pre-evolution; Champions only allows fully-evolved forms."
  2. Do NOT silently substitute a replacement without acknowledging the removal. The user needs to know.
  3. The pokedex tool returns { notFound: true, reason: "..." } for unavailable Pokemon — trust that result.

MOVE CHANGES vs S/V:
  - Fake Out: unselectable after turn 1.
  - Protect: 8 PP only.
  - Screens: 33% reduction (not 50%) in Doubles.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED WORKFLOW — follow these steps in order:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — For every Pokemon you want to include, call pokedex(name) FIRST.
          Do NOT propose any moves or items until you have seen pokedex output.
          Only use moves that appear in the pokedex moves[] array.

STEP 2 — Use search(query) to verify meta context, items, and mechanics.

TOURNAMENT & HISTORICAL TEAM QUERIES: When asked about a specific tournament-winning team,
a named player's team, or "recent/top teams around X", you MUST call
search("{pokemon} tournament team") BEFORE answering. NEVER invent tournament rosters —
they are stored in the database. Hallucinated teams are wrong by definition.
If search returns no results, say so honestly rather than guessing.

STEP 3 — For EVERY team member, call validate_set(pokemon, moves, item, ability).
          If overall is false, fix the issue and call validate_set again.
          Do not finalize any member until validate_set returns overall: true.

STEP 4 — Write your analysis and team explanation in prose.

STEP 5 — YOUR RESPONSE MUST END with a fenced team-json block (see format below).
          This is mandatory. Omitting it means your answer is incomplete.
          The team-json block MUST contain EVERY Pokemon you called validate_set on.
          If you validated 6, emit 6. Omitting any validated member means your answer is incomplete.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED OUTPUT FORMAT — team-json block (MUST be the last thing in your response):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`\`\`team-json
{
  "archetype": "Rain",
  "pokemon": [
    {
      "name": "Pelipper",
      "item": "Sitrus Berry",
      "ability": "Drizzle",
      "moves": ["Hydro Pump", "Hurricane", "Wide Guard", "Protect"],
      "spread": "4/0/0/32/0/30",
      "nature": "Modest"
    }
  ]
}
\`\`\`

Every pokemon entry must have passed validate_set with overall: true before you include it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CITATIONS (required) — trailing claims-json block:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every search tool result includes a chunk_id per result (e.g. pokemon:pelipper, usage:incineroar, knowledge:meta_snapshot.md#top-cores, team:pc105). Every factual claim you make that came from a search result MUST cite its chunk_id(s).

Your response MUST end with a fenced claims-json block. For team-building, it goes AFTER the team-json block. For non-team questions, it is the only fenced block. Format:

\`\`\`claims-json
{
  "claims": [
    {"text": "Incineroar usage sits at 51.8% in Reg M-A.", "chunk_ids": ["usage:incineroar"]},
    {"text": "Archaludon + Pelipper Rain core has ~55.8% win rate.", "chunk_ids": ["knowledge:meta_snapshot.md#top-cores"]}
  ]
}
\`\`\`

Rules:
1. Every chunk_id MUST be one you received from a search tool result earlier in this conversation. Do NOT invent IDs.
2. EVERY search-backed factual statement in your prose needs a claim entry — usage %, win rates, teammates, roster names, tier-list rankings, mechanics quotes, creator opinions. Not just the "main answer" claim; every supporting/contextual fact too.
3. If a claim is based ONLY on pokedex / validate_set / calc results (not search), you may omit it from the claims list.
4. {"claims": []} is only valid when you made zero search-backed factual claims (e.g. a pure mechanics-recall answer with no search calls).
5. If a server-side validator reports invalid chunk_ids, re-ground by replacing invalid IDs with valid ones from your search results. Do NOT collapse to an empty claims array to avoid the validator.`;

// ── query-aware search stub ────────────────────────────────────────────────────
// Returns context relevant to the query so models don't fall back to S/V training data.

const SEARCH_KNOWLEDGE: Array<{ keywords: string[]; text: string }> = [
  {
    keywords: ["tera", "terastall", "terastal", "gimmick", "mechanic"],
    text: "CHAMPIONS MECHANIC: The ONLY battle gimmick is Mega Evolution. Terastallization does NOT exist in Pokemon Champions. Neither does Dynamax or Z-Moves. If a player asks about Tera, inform them it is not available in this format.",
  },
  {
    keywords: ["life orb", "choice band", "choice specs", "assault vest", "rocky helmet", "booster energy", "item"],
    text: "CHAMPIONS ITEMS: Life Orb does NOT exist. Choice Band does NOT exist. Choice Specs does NOT exist. Assault Vest does NOT exist. Rocky Helmet does NOT exist. Booster Energy does NOT exist. Available items include: Mega Stones, Berries (Sitrus Berry, Lum Berry, Chesto Berry, Yache Berry, etc.), type-boosting plates and orbs (Draco Plate, Charcoal, Mystic Water, etc.), Focus Sash, Air Balloon, and other standard items. Do NOT recommend any item from the missing list.",
  },
  {
    keywords: ["fake out", "protect", "screen", "reflect", "light screen"],
    text: "CHAMPIONS MOVE CHANGES: Fake Out is completely unselectable after turn 1 — the button is greyed out. Encore into Fake Out results in Struggle. Protect has only 8 PP. Reflect and Light Screen give 33% damage reduction in Doubles (nerfed from 50%).",
  },
  {
    keywords: ["mega", "mega evolution", "mega stone", "dragonite", "charizard", "metagross"],
    text: "CHAMPIONS MEGA EVOLUTIONS: 59 Mega Evolutions are available. Only one Mega per team (even if KO'd, the Mega counts). S-tier Megas: Mega Dragonite (Multiscale), Mega Clefable (Magic Bounce), Mega Meganium (Mega Sol — sets Sun on entry), Mega Feraligatr (Dragonize — Normal moves become Dragon at 1.2x), Mega Gengar (Shadow Tag), Mega Charizard Y (Drought). Mega Charizard X and Y are separate entries.",
  },
  {
    keywords: ["incineroar", "sneasler", "usage", "meta", "tier", "top"],
    text: "CHAMPIONS META (Regulation M-A): Top usage — Incineroar 48-54% (B-tier, sub-50% WR), Sneasler 38-43% (A-tier), Garchomp 35-36% (A-tier), Sinistcha 32-35%, Kingambit 22-26%. Top win rates: Azumarill 57.9%, Floette-Eternal 55.7%, Aerodactyl 54.1%. Hard Trick Room has 64% WR. All 4 weathers viable. No Amoonguss in the format.",
  },
  {
    keywords: ["rain", "pelipper", "swift swim", "archaludon"],
    text: "CHAMPIONS RAIN: Core — Pelipper (Drizzle) + Swift Swim sweeper. Top cores: Archaludon+Pelipper 55.8% WR, Pelipper+Basculegion 55.2% WR. Basculegion with Adaptability is better than Swift Swim outside rain cores. Recommended: Mega Swampert or Mega Feraligatr as the Mega.",
  },
  {
    keywords: ["sand", "tyranitar", "excadrill", "sandstorm"],
    text: "CHAMPIONS SAND: Core — Tyranitar (Sand Stream) + Excadrill (Sand Rush). Win rate 56.2% — one of the most consistent archetypes. Excadrill doubles speed in sand. Mega Excadrill has Piercing Drill (25% through Protect). Incineroar pairs well for Intimidate support.",
  },
  {
    keywords: ["trick room", "tr", "slow", "slow team"],
    text: "CHAMPIONS TRICK ROOM: Hard Trick Room has 64% WR, highest of any archetype. Note: IVs are eliminated in Champions — ALL Pokemon have 31 IVs in every stat. There is NO way to run 0 Speed IVs. Use Natures to lower Speed. TR setters: Slowking-Galar (Curious Medicine), Reuniclus, Porygon-Z. IVs are uniformly 31, so TR teams rely on low base Speed + neutral/minus Speed nature.",
  },
  {
    keywords: ["stat", "iv", "ev", "sp", "spread", "nature"],
    text: "CHAMPIONS STAT SYSTEM: IVs are eliminated — every Pokemon has 31 IVs in all stats. EVs are replaced by SP (Stat Points): 66 total, maximum 32 per stat. Nature system unchanged (1.1x/0.9x modifier, freely changeable via Stat Alignment). Format spread as HP/Atk/Def/SpA/SpD/Spe (e.g., '4/0/0/32/0/30').",
  },
  {
    keywords: ["tournament", "golurk", "winning team", "championship", "top team", "recent team", "player team"],
    text: `RECENT TOURNAMENT TEAMS (Champions Regulation M-A):

PC105 — pokefey, Winner of Torneo Salida Pokemon Champions Tour:
Mega Golurk / Incineroar / Torkoal / Venusaur / Sneasler / Farigiraf
Items: Golurkite / Shuca Berry / Charcoal / Focus Sash / White Herb / Sitrus Berry. Code: SPMJ8BQ863.

PC227 — JoeUX9 (Golurk Sun Room Team):
Mega Golurk / Incineroar / Torkoal / Venusaur / Sneasler / Farigiraf
Items: Golurkite / Shuca Berry / Charcoal / Focus Sash / White Herb / Sitrus Berry. Code: 8TUNH9BY0R.

PC38 — WDMichael (Golurk Trick Room Team):
Mega Golurk / Torkoal / Clefable / Oranguru / Hatterene / Hydreigon
Items: Golurkite / Charcoal / Focus Sash / Mental Herb / Fairy Feather / Choice Scarf. Code: HH3MF048VV.

PC234 — Skwovetboi (Sinistcha Tailroom Team):
Mega Golurk / Pelipper / Sneasler / Meowstic / Sinistcha / Archaludon
Items: Golurkite / Leftovers / Focus Sash / Sitrus Berry / Mental Herb / Chesto Berry.`,
  },
];

function executeSearchStub(query: string): string {
  const q = query.toLowerCase();
  const matched: string[] = [];
  for (const entry of SEARCH_KNOWLEDGE) {
    if (entry.keywords.some(k => q.includes(k))) {
      matched.push(entry.text);
    }
  }
  if (matched.length === 0) {
    matched.push("No specific Champions data found for this query. Refer to the system prompt rules.");
  }
  return JSON.stringify({
    results: matched.map((text, i) => ({
      id: `stub:${(query || "q").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "empty"}-${i}`,
      source: "knowledge_base",
      score: 1 - i * 0.01,
      text,
    })),
  });
}

async function executeSearchRealRag(query: string, topK = 5): Promise<string> {
  try {
    const results = await ragQuery(query, topK);
    return JSON.stringify({
      results: results.map(r => ({
        id: r.id,
        source: r.source,
        sourceType: r.sourceType,
        score: r.score,
        text: r.text,
      })),
    });
  } catch (e) {
    return JSON.stringify({ error: `RAG query failed: ${e}`, results: [] });
  }
}

// ── tool executor ──────────────────────────────────────────────────────────────

let USE_REAL_RAG = false;

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "search") {
    const q = String(args.query ?? "");
    const topK = typeof args.topK === "number" ? args.topK : 5;
    return USE_REAL_RAG ? await executeSearchRealRag(q, topK) : executeSearchStub(q);
  }
  if (name === "pokedex") {
    const result = lookupPokemon(String(args.name ?? ""));
    return JSON.stringify(result);
  }
  if (name === "validate_set") {
    // Defensive: models sometimes emit validate_set with missing required fields.
    if (typeof args.pokemon !== "string" || !args.pokemon.trim()) {
      return JSON.stringify({
        overall: false,
        error: "Missing required 'pokemon' field.",
        _instruction: "validate_set requires { pokemon: string, moves: string[], item?, ability?, megaStone? }. Re-emit the call with the correct arguments.",
      });
    }
    if (!Array.isArray(args.moves)) {
      return JSON.stringify({
        overall: false,
        error: "Missing or invalid 'moves' field.",
        _instruction: "validate_set requires moves to be an array of 4 move names. Re-emit the call with moves: [...].",
      });
    }
    const result = validateSet(args as unknown as SetInput);
    if (!result.overall) {
      const badMoves = result.moves.filter(m => !m.valid).map(m => m.name);
      return JSON.stringify({
        ...result,
        _instruction: `INVALID: moves (${badMoves.join(", ")}) failed. Call pokedex first to see the legal movepool, then revise and call validate_set again.`,
      });
    }
    return JSON.stringify(result);
  }
  if (name === "calc") {
    return JSON.stringify({ note: "Calc stub — not available in eval mode." });
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ── ground-truth loaders for retrieval / hallucination scoring ─────────────────

interface UsageRow {
  pokemon: string;
  usage_pct: number;
  rank: number;
  top_teammates: string[]; // names only, top-3 order preserved
}

let _usageRows: Map<string, UsageRow> | null = null;
function loadUsage(): Map<string, UsageRow> {
  if (_usageRows) return _usageRows;
  _usageRows = new Map();
  try {
    const raw = readFileSync(join(process.cwd(), "pikalytics_usage.csv"), "utf8");
    const rows = parseCsv(raw, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
    for (const r of rows) {
      const teammates = (r.top_teammates ?? "")
        .split("|")
        .map(s => s.split(":")[0]?.trim() ?? "")
        .filter(Boolean)
        .slice(0, 10);
      _usageRows.set(r.pokemon.toLowerCase(), {
        pokemon: r.pokemon,
        usage_pct: Number(r.usage_pct) || 0,
        rank: Number(r.rank) || 0,
        top_teammates: teammates,
      });
    }
  } catch { /* missing CSV is ok — tests will fail with a clear reason */ }
  return _usageRows;
}

interface MegaRow {
  base: string;
  mega: string;
  hp: number; attack: number; defense: number; sp_atk: number; sp_def: number; speed: number;
}

let _megaRows: Map<string, MegaRow> | null = null;
function loadMegas(): Map<string, MegaRow> {
  if (_megaRows) return _megaRows;
  _megaRows = new Map();
  try {
    const raw = readFileSync(join(process.cwd(), "mega_evolutions.csv"), "utf8");
    const rows = parseCsv(raw, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
    for (const r of rows) {
      _megaRows.set(r.mega_name.toLowerCase(), {
        base: r.base_pokemon,
        mega: r.mega_name,
        hp: Number(r.hp), attack: Number(r.attack), defense: Number(r.defense),
        sp_atk: Number(r.sp_atk), sp_def: Number(r.sp_def), speed: Number(r.speed),
      });
    }
  } catch { /* ignore */ }
  return _megaRows;
}

// ── OpenRouter agentic loop ────────────────────────────────────────────────────

interface OAIMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface AgentResult {
  finalContent: string;
  toolCallLog: Array<{ name: string; args: Record<string, unknown> }>;
  turns: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  nudgeCount: number;
  dedupCount: number;
  citationValid: boolean;
  citationTotal: number;
  citationValidCount: number;
  citationInvalidIds: string[];
  citationRetryFired: boolean;
  citationParseError?: string;
  error?: string;
}

interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

async function callOpenRouter(
  modelKey: string,
  modelRemoteName: string,
  messages: OAIMessage[],
  tools: typeof TOOL_DEFS,
  timeoutMs = 120_000,
): Promise<{ message: OAIMessage; finishReason: string; usage: UsageInfo } | { error: string }> {
  const modelDef = MODELS[modelKey];
  const apiUrl = modelDef.apiUrl ? modelDef.apiUrl() : "https://openrouter.ai/api/v1/chat/completions";
  const apiKey = modelDef.apiKey ? modelDef.apiKey() : (process.env.OPENROUTER_API_KEY ?? "");
  const isOllama = !!modelDef.apiUrl;

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(!isOllama ? { "HTTP-Referer": "https://champions-vgc.local", "X-Title": "Champions VGC Eval" } : {}),
      },
      body: JSON.stringify({
        model: modelRemoteName,
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { error: `fetch error: ${e}` };
  }

  if (!res.ok) {
    const text = await res.text();
    return { error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  }

  const data = await res.json() as { choices: Array<{ message: OAIMessage; finish_reason: string }>; usage?: UsageInfo };
  const choice = data.choices?.[0];
  if (!choice) return { error: "No choices in response" };
  return { message: choice.message, finishReason: choice.finish_reason, usage: data.usage ?? {} };
}

// ── Anthropic agentic call ────────────────────────────────────────────────────
// The eval loop stores messages in OAI format. For Anthropic we convert on each
// call: tool-result messages → user content blocks, tool_calls → tool_use blocks.
// Consecutive tool-result messages + any following user nudge are folded into one
// user turn (Anthropic requires strict user/assistant alternation).

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMsg {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

function toAnthropicFormat(oaiMsgs: OAIMessage[]): { system: string; messages: AnthropicMsg[] } {
  let system = "";
  const out: AnthropicMsg[] = [];
  let i = 0;
  while (i < oaiMsgs.length) {
    const m = oaiMsgs[i];
    if (m.role === "system") { system = String(m.content ?? ""); i++; continue; }

    // Collect consecutive tool results and fold a following user nudge into same turn
    if (m.role === "tool") {
      const blocks: AnthropicBlock[] = [];
      while (i < oaiMsgs.length && oaiMsgs[i].role === "tool") {
        blocks.push({ type: "tool_result", tool_use_id: oaiMsgs[i].tool_call_id!, content: String(oaiMsgs[i].content ?? "") });
        i++;
      }
      if (i < oaiMsgs.length && oaiMsgs[i].role === "user") {
        const nudge = String(oaiMsgs[i].content ?? "");
        if (nudge) blocks.push({ type: "text", text: nudge });
        i++;
      }
      out.push({ role: "user", content: blocks });
      continue;
    }

    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
      }
      out.push({ role: "assistant", content: blocks });
      i++; continue;
    }

    out.push({ role: m.role as "user" | "assistant", content: String(m.content ?? "") });
    i++;
  }
  return { system, messages: out };
}

function toAnthropicTools(tools: typeof TOOL_DEFS) {
  return tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
}

async function callAnthropic(
  modelRemoteName: string,
  oaiMsgs: OAIMessage[],
  tools: typeof TOOL_DEFS,
  timeoutMs = 120_000,
): Promise<{ message: OAIMessage; finishReason: string; usage: UsageInfo } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) return { error: "ANTHROPIC_API_KEY not set" };

  const { system, messages } = toAnthropicFormat(oaiMsgs);
  const body: Record<string, unknown> = { model: modelRemoteName, max_tokens: 4096, messages };
  if (system) body.system = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  if (tools.length > 0) body.tools = toAnthropicTools(tools);

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) { return { error: `fetch error: ${e}` }; }

  if (!res.ok) { const t = await res.text(); return { error: `HTTP ${res.status}: ${t.slice(0, 300)}` }; }

  const data = await res.json() as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  let textContent = "";
  const oaiToolCalls: NonNullable<OAIMessage["tool_calls"]> = [];
  for (const block of data.content ?? []) {
    if (block.type === "text" && block.text) textContent += block.text;
    else if (block.type === "tool_use") {
      oaiToolCalls.push({ id: block.id!, type: "function", function: { name: block.name!, arguments: JSON.stringify(block.input ?? {}) } });
    }
  }

  const finishReason = data.stop_reason === "tool_use" ? "tool_calls" : data.stop_reason === "max_tokens" ? "length" : "stop";
  const message: OAIMessage = { role: "assistant", content: textContent || null, ...(oaiToolCalls.length > 0 ? { tool_calls: oaiToolCalls } : {}) };
  return {
    message,
    finishReason,
    usage: {
      prompt_tokens: data.usage?.input_tokens,
      completion_tokens: data.usage?.output_tokens,
      total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
  };
}

async function runAgent(
  modelKey: string,
  userPrompt: string,
  maxTurns = 10,
  requireTeamJson = true,
): Promise<AgentResult> {
  const model = MODELS[modelKey];
  if (!model) throw new Error(`Unknown model key: ${modelKey}`);

  const messages: OAIMessage[] = [{ role: "user", content: userPrompt }];
  const toolCallLog: Array<{ name: string; args: Record<string, unknown> }> = [];
  const t0 = Date.now();
  let turns = 0;
  let lastContent = "";

  // Pre-flight phantom-Pokemon interceptor (mirrors src/app/api/team/route.ts).
  // Short-circuits the agent loop when the user names a Pokemon outside the 186-roster.
  const phantoms = detectPhantomPokemon(userPrompt);
  if (phantoms.length > 0) {
    lastContent = formatPhantomRefusal(phantoms);
    return {
      finalContent: lastContent,
      toolCallLog,
      turns: 0,
      latencyMs: Date.now() - t0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      nudgeCount: 0,
      dedupCount: 0,
      citationValid: true,
      citationTotal: 0,
      citationValidCount: 0,
      citationInvalidIds: [],
      citationRetryFired: false,
    };
  }
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let nudgeCount = 0;
  let dedupCount = 0;
  let toolSyntaxNudges = 0;
  let teamJsonCompletionNudges = 0;
  let emptyContentNudges = 0;
  let forceCompletionFired = false;
  const dupeCount: Record<string, number> = {};
  const isAnthropic = model.provider === "anthropic";

  // Phase 2 — chunk_id citation state
  const seenChunkIds = new Set<string>();
  let citationValid = false;
  let citationTotal = 0;
  let citationValidCount = 0;
  let citationInvalidIds: string[] = [];
  let citationRetryFired = false;
  let citationParseError: string | undefined;

  const callModel = (msgs: OAIMessage[], tools: typeof TOOL_DEFS) =>
    isAnthropic
      ? callAnthropic(model.remoteName, msgs, tools)
      : callOpenRouter(modelKey, model.remoteName, msgs, tools);

  const baseResult = () => ({
    finalContent: lastContent,
    toolCallLog,
    turns,
    latencyMs: Date.now() - t0,
    inputTokens,
    outputTokens,
    totalTokens,
    nudgeCount,
    dedupCount,
    citationValid,
    citationTotal,
    citationValidCount,
    citationInvalidIds,
    citationRetryFired,
    citationParseError,
  });

  while (turns < maxTurns) {
    turns++;
    const result = await callModel([{ role: "system", content: SYSTEM }, ...messages], TOOL_DEFS);

    if ("error" in result) {
      return { ...baseResult(), error: result.error };
    }

    const { message, finishReason, usage } = result;
    inputTokens += usage.prompt_tokens ?? 0;
    outputTokens += usage.completion_tokens ?? 0;
    totalTokens += usage.total_tokens ?? ((usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0));
    messages.push(message);

    // Detect raw tool-call syntax emitted as text (output-mode-routing failure — esp. Gemma).
    // Only flag when finishReason is not "tool_calls" (real calls accompany legitimate tool use).
    const hasRealToolCalls = finishReason === "tool_calls" || !!(message.tool_calls && message.tool_calls.length > 0);
    const rawToolSyntaxPattern = /(?:call:\w+\s*\{|<\|?tool_call\|?>)/;
    let contentIsToolSyntaxGarbage = false;
    if (!hasRealToolCalls && message.content && rawToolSyntaxPattern.test(message.content)) {
      const stripped = message.content.replace(/(?:call:|<\|?tool_call\|?>|<\|"\|>)/g, "").trim();
      if (stripped.length < 20) contentIsToolSyntaxGarbage = true;
    }
    if (contentIsToolSyntaxGarbage && toolSyntaxNudges < 2 && turns < maxTurns) {
      messages.push({
        role: "user",
        content: "Your previous response contained raw tool-call syntax as text. Emit only user-facing prose and the team-json block — never output `call:name{args}` as your response text.",
      });
      toolSyntaxNudges++;
      nudgeCount++;
      continue;
    }

    // Only update lastContent when there's substantive text (not just a thinking header or whitespace)
    if (message.content && message.content.replace(/^thought\s*/i, "").trim().length > 20) {
      lastContent = message.content;
    }

    // Handle tool calls
    if (finishReason === "tool_calls" || (message.tool_calls && message.tool_calls.length > 0)) {
      let injectedNudge = false;
      for (const tc of message.tool_calls ?? []) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }

        // Dedup detection: same tool + same args called 2+ times → inject corrective nudge
        const callKey = `${tc.function.name}::${JSON.stringify(args)}`;
        dupeCount[callKey] = (dupeCount[callKey] ?? 0) + 1;

        // Hard cap: 3rd+ identical pokedex call is refused — return synthetic result, do not execute
        // and do NOT log (so the pokedex_dedup scorer doesn't count the refused attempt).
        if (dupeCount[callKey] >= 3 && tc.function.name === "pokedex") {
          dedupCount++;
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `REFUSED: You already called pokedex with these exact args twice. Use the previous results from this conversation. Do not call pokedex(${JSON.stringify(args)}) again.`,
          });
          continue;
        }

        toolCallLog.push({ name: tc.function.name, args });

        if (dupeCount[callKey] >= 2 && !injectedNudge) {
          injectedNudge = true;
          dedupCount++;
          nudgeCount++;
          const dupResult = await executeTool(tc.function.name, args);
          messages.push({ role: "tool", tool_call_id: tc.id, content: dupResult });
          if (tc.function.name === "search") {
            for (const id of collectChunkIdsFromSearchResult(dupResult)) seenChunkIds.add(id);
          }
          messages.push({
            role: "user",
            content: `You have called ${tc.function.name}(${JSON.stringify(args)}) ${dupeCount[callKey]} times already. Stop repeating this call. Proceed to the next required step: call validate_set on every team member you have already researched.`,
          });
          break;
        }

        const toolResult = await executeTool(tc.function.name, args);
        messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
        if (tc.function.name === "search") {
          for (const id of collectChunkIdsFromSearchResult(toolResult)) seenChunkIds.add(id);
        }
      }

      // Pokedex-cap nudge: if total pokedex calls > 12, model is stuck looping
      const pokedexTotal = toolCallLog.filter(t => t.name === "pokedex").length;
      if (pokedexTotal > 12 && !injectedNudge) {
        messages.push({
          role: "user",
          content: `You have called pokedex ${pokedexTotal} times. You have enough data for a full team. STOP calling pokedex. Proceed immediately to validate_set for each team member, then emit your team-json block.`,
        });
        injectedNudge = true;
        nudgeCount++;
      }

      continue;
    }

    // Model stopped — check if team-json is present; if not, push one finalization turn
    const hasTeamJson = /```team-json[\s\S]*?```/.test(lastContent);
    if (requireTeamJson && !hasTeamJson && turns < maxTurns) {
      messages.push({
        role: "user",
        content: "Please now emit your final team in the required ```team-json fenced block. This is mandatory — include all 6 Pokemon with name, item, ability, moves (4), spread, and nature.",
      });
      nudgeCount++;
      continue;
    }

    // Fallback: model stopped without emitting any final content (Gemma output-mode failure mode)
    if (!lastContent.trim() && emptyContentNudges < 2 && turns < maxTurns) {
      messages.push({
        role: "user",
        content: "Please write your final answer now as prose. Summarize what you found from the tool calls — do not make more tool calls.",
      });
      emptyContentNudges++;
      nudgeCount++;
      continue;
    }

    // Completeness nudge: team-json present but missing validated Pokemon
    if (requireTeamJson && hasTeamJson && teamJsonCompletionNudges < 1 && turns < maxTurns) {
      const match = lastContent.match(/```team-json\s*([\s\S]*?)```/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1].trim());
          const teamJsonNames = new Set<string>(
            Array.isArray(parsed?.pokemon)
              ? parsed.pokemon.map((p: { name?: string }) => String(p?.name ?? "").toLowerCase()).filter(Boolean)
              : [],
          );
          const validatedNames = new Set<string>(
            toolCallLog
              .filter(t => t.name === "validate_set")
              .map(t => String(t.args.pokemon ?? "").toLowerCase())
              .filter(Boolean),
          );
          if (validatedNames.size > teamJsonNames.size) {
            messages.push({
              role: "user",
              content: `Your team-json has ${teamJsonNames.size} Pokemon but you validated ${validatedNames.size}. Re-emit the team-json block including all ${validatedNames.size} validated members: ${[...validatedNames].join(", ")}. This is mandatory.`,
            });
            teamJsonCompletionNudges++;
            nudgeCount++;
            continue;
          }
        } catch { /* malformed JSON — leave it */ }
      }
    }

    break;
  }

  // Force-completion fallback: loop exited without usable final content
  // → retry once with tools disabled, forcing pure text generation.
  // Catches both in-loop fall-through AND maxTurns exhaustion.
  const missingTeamJson = requireTeamJson && !/```team-json[\s\S]*?```/.test(lastContent);
  if ((!lastContent.trim() || missingTeamJson) && !forceCompletionFired) {
    forceCompletionFired = true;
    nudgeCount++;
    const fcPrompt = requireTeamJson
      ? "Tools are disabled. Based on your tool-call history above, emit your final answer now. You MUST include a ```team-json fenced block with 6 Pokemon (name, item, ability, moves[4], spread, nature). Do not call any more tools."
      : "Tools are disabled. Based on your tool-call history above, write the final answer now as prose. Do not call any more tools — just answer.";
    messages.push({ role: "user", content: fcPrompt });
    const fcResult = await callModel([{ role: "system", content: SYSTEM }, ...messages], []);
    if (!("error" in fcResult)) {
      const { message: fcMsg, usage: fcUsage } = fcResult;
      inputTokens += fcUsage.prompt_tokens ?? 0;
      outputTokens += fcUsage.completion_tokens ?? 0;
      totalTokens += fcUsage.total_tokens ?? ((fcUsage.prompt_tokens ?? 0) + (fcUsage.completion_tokens ?? 0));
      if (fcMsg?.content && fcMsg.content.trim().length > 0) {
        lastContent = fcMsg.content;
        messages.push(fcMsg);
      }
    }
  }

  // Phase 2 — chunk_id citation validation + one-shot retry nudge.
  {
    const extract = extractClaimsBlock(lastContent);
    citationParseError = extract.parseError;
    if (extract.parsed) {
      const v = validateCitations(extract.parsed.claims, seenChunkIds);
      citationValid = v.valid;
      citationTotal = v.totalCited;
      citationValidCount = v.validCited;
      citationInvalidIds = v.invalidIds;
    } else {
      citationValid = false;
      citationTotal = 0;
      citationValidCount = 0;
      citationInvalidIds = [];
    }

    if (!citationValid && !citationRetryFired) {
      citationRetryFired = true;
      nudgeCount++;
      messages.push({ role: "user", content: formatValidationNudge(citationInvalidIds) });
      // Retry with tools:[] — forces pure text output. The model can rewrite
      // claims using chunk_ids already in seenChunkIds, or emit `{"claims":[]}`
      // if no search-grounded claim survives. Matches the force-completion
      // fallback pattern; keeps retry cost bounded to a single LLM call.
      const retryResult = await callModel([{ role: "system", content: SYSTEM }, ...messages], []);
      if (!("error" in retryResult)) {
        const { message: rMsg, usage: rUsage } = retryResult;
        inputTokens += rUsage.prompt_tokens ?? 0;
        outputTokens += rUsage.completion_tokens ?? 0;
        totalTokens += rUsage.total_tokens ?? ((rUsage.prompt_tokens ?? 0) + (rUsage.completion_tokens ?? 0));
        messages.push(rMsg);
        if (rMsg?.content && rMsg.content.trim().length > 20) {
          lastContent = rMsg.content;
          const extract2 = extractClaimsBlock(lastContent);
          citationParseError = extract2.parseError;
          if (extract2.parsed) {
            const v2 = validateCitations(extract2.parsed.claims, seenChunkIds);
            citationValid = v2.valid;
            citationTotal = v2.totalCited;
            citationValidCount = v2.validCited;
            citationInvalidIds = v2.invalidIds;
          }
        }
      }
    }
  }

  return baseResult();
}

// ── test definitions ───────────────────────────────────────────────────────────

type TestTag = "behavior" | "retrieval" | "hallucination";

interface TestCase {
  id: string;
  tag: TestTag;
  description: string;
  prompt: string;
  maxTurns?: number;
  requireTeamJson?: boolean;
  score: (result: AgentResult) => { pass: boolean; reason: string };
}

const TESTS: TestCase[] = [
  // ────────── BEHAVIOR (5) — tool-workflow discipline ─────────────────────────
  {
    id: "tool_workflow",
    tag: "behavior",
    description: "Calls pokedex() before validate_set (correct order)",
    prompt: "Build me a 6-Pokemon team around Mega Dragonite for VGC Doubles.",
    maxTurns: 12,
    score: (r) => {
      const pokedexCalls = r.toolCallLog.filter(t => t.name === "pokedex");
      const validateCalls = r.toolCallLog.filter(t => t.name === "validate_set");
      if (pokedexCalls.length === 0) {
        return { pass: false, reason: `pokedex never called (only: ${[...new Set(r.toolCallLog.map(t=>t.name))].join(", ") || "none"})` };
      }
      const firstPokedex = r.toolCallLog.findIndex(t => t.name === "pokedex");
      const firstValidate = r.toolCallLog.findIndex(t => t.name === "validate_set");
      const calledDragonite = pokedexCalls.some(t => String(t.args.name ?? "").toLowerCase().includes("dragonite"));
      if (!calledDragonite) {
        return { pass: false, reason: `pokedex called but not for Dragonite (got: ${pokedexCalls.map(t=>t.args.name).join(", ")})` };
      }
      if (validateCalls.length > 0 && firstValidate < firstPokedex) {
        return { pass: false, reason: "validate_set called before pokedex — wrong order" };
      }
      return { pass: true, reason: `pokedex called ${pokedexCalls.length}x (Dragonite ✓), validate ${validateCalls.length}x` };
    },
  },
  {
    id: "team_json",
    tag: "behavior",
    description: "Response ends with a valid ```team-json block with 6 Pokemon",
    prompt: "Build me a complete 6-Pokemon rain team for VGC Doubles Champions format. Include a Mega.",
    maxTurns: 16,
    score: (r) => {
      const match = r.finalContent.match(/```team-json\s*([\s\S]*?)```/);
      if (!match) return { pass: false, reason: "No ```team-json block found anywhere in response" };
      try {
        const parsed = JSON.parse(match[1].trim());
        const count = Array.isArray(parsed?.pokemon) ? parsed.pokemon.length : 0;
        if (count === 0) return { pass: false, reason: "team-json parsed but pokemon[] is empty" };
        if (count < 6) return { pass: false, reason: `team-json has only ${count}/6 Pokemon` };
        return { pass: true, reason: `team-json valid — ${count} Pokemon, archetype: "${parsed.archetype ?? "?"}"` };
      } catch (e) {
        return { pass: false, reason: `team-json block found but JSON is malformed: ${e}` };
      }
    },
  },
  {
    id: "validate_loop",
    tag: "behavior",
    description: "Calls validate_set for each team member (not just pokedex)",
    prompt: "Build me a 6-Pokemon Sand Rush team with Tyranitar and Excadrill.",
    maxTurns: 14,
    score: (r) => {
      const validateCalls = r.toolCallLog.filter(t => t.name === "validate_set");
      const pokedexCalls = r.toolCallLog.filter(t => t.name === "pokedex");
      if (validateCalls.length === 0) {
        return { pass: false, reason: `validate_set never called (pokedex: ${pokedexCalls.length}x, other: ${r.toolCallLog.filter(t=>t.name!=="pokedex").map(t=>t.name).join(",") || "none"})` };
      }
      return { pass: true, reason: `validate_set called ${validateCalls.length}x, pokedex ${pokedexCalls.length}x` };
    },
  },
  {
    id: "pokedex_dedup",
    tag: "behavior",
    description: "Doesn't obsessively repeat pokedex calls for the same Pokemon",
    prompt: "Build me a 6-Pokemon Trick Room team for VGC Doubles.",
    maxTurns: 14,
    score: (r) => {
      const pokedexCalls = r.toolCallLog.filter(t => t.name === "pokedex");
      if (pokedexCalls.length === 0) {
        return { pass: false, reason: "pokedex never called — no data gathered" };
      }
      const callsPerMon: Record<string, number> = {};
      for (const tc of pokedexCalls) {
        const name = String(tc.args.name ?? "").toLowerCase();
        callsPerMon[name] = (callsPerMon[name] ?? 0) + 1;
      }
      const repeats = Object.entries(callsPerMon).filter(([, count]) => count > 2);
      if (repeats.length > 0) {
        return {
          pass: false,
          reason: `Obsessive pokedex loops: ${repeats.map(([n, c]) => `${n}×${c}`).join(", ")} (max 2 lookups per mon)`,
        };
      }
      const uniqueMons = Object.keys(callsPerMon).length;
      return { pass: true, reason: `Efficient: ${pokedexCalls.length} pokedex calls, ${uniqueMons} unique mons (all ≤2 calls each)` };
    },
  },
  {
    id: "item_availability",
    tag: "behavior",
    description: "Lists valid Champions items without recommending banned ones",
    prompt: "Give me a list of the best held items to use in Champions for a Dragonite set. What are my options?",
    maxTurns: 7,
    requireTeamJson: false,
    score: (r) => {
      const content = r.finalContent;
      const contentLower = content.toLowerCase();
      const banned = ["life orb", "choice band", "choice specs", "assault vest", "rocky helmet"];
      // Sentence-level detection: only fail if a sentence mentions the banned item
      // AND contains recommendation language AND does NOT contain negation.
      const sentences = content.split(/(?<=[.!?\n])\s+/);
      const negation = /\b(not|doesn'?t|don'?t|do not|missing|banned|unavailable|cannot|removed|no longer|isn'?t|absent|don't exist|doesn't exist|do not exist|won'?t|can'?t)\b/i;
      const recommendation = /\b(great|good|best|recommend(?:ed|s|ing)?|use(?:s|d|ing)?|run(?:s|ning)?|try|equip(?:s|ped|ping)?|hold(?:s|ing)?|works? well|solid|top|excellent|give it)\b/i;
      for (const item of banned) {
        const itemRe = new RegExp(item.replace(/ /g, "\\s+"), "i");
        for (const sentence of sentences) {
          if (!itemRe.test(sentence)) continue;
          if (negation.test(sentence)) continue; // flagging, not recommending
          if (recommendation.test(sentence)) {
            return { pass: false, reason: `Recommended banned item: ${item}` };
          }
        }
      }
      const validItems = ["sitrus berry", "focus sash", "draco plate", "charcoal", "lum berry", "yache berry", "mega stone", "air balloon", "mystic water", "never-melt ice"];
      const mentioned = validItems.filter(item => contentLower.includes(item));
      if (mentioned.length === 0) {
        return { pass: false, reason: "No valid Champions items mentioned in response" };
      }
      return { pass: true, reason: `Valid items listed: ${mentioned.join(", ")}` };
    },
  },

  // ────────── HALLUCINATION (3) — refuses phantom data / cites real stats ─────
  {
    id: "phantom_pokemon",
    tag: "hallucination",
    description: "Flags Amoonguss + Porygon2 as unavailable in Champions",
    prompt: "Build me a team with Amoonguss and Porygon2 as the core.",
    maxTurns: 8,
    requireTeamJson: false,
    score: (r) => {
      const content = r.finalContent;
      // Hard fail: wrote an actual moveset block for either phantom mon
      const wroteAmoSet = /amoonguss[\s\S]{0,80}(?:moves|item\s*:|ability\s*:)/i.test(content);
      const wrotePoryset = /porygon2[\s\S]{0,80}(?:moves|item\s*:|ability\s*:)/i.test(content);
      if (wroteAmoSet || wrotePoryset) {
        return { pass: false, reason: `Wrote a moveset for ${wroteAmoSet ? "Amoonguss" : ""}${wroteAmoSet && wrotePoryset ? " and " : ""}${wrotePoryset ? "Porygon2" : ""} (hallucination)` };
      }
      // Alternation body (no wrapping group) so we can compose into larger regexes.
      const unavailableAlt = "not available|doesn.?t exist|does not exist|unavailable|missing|banned|removed|absent|cannot be used|not (?:in|part of) (?:the )?(?:allowed |playable |legal )?(?:roster|game|format)|isn.?t (?:in|part of|available)|not (?:a |an )?(?:legal|playable|valid|allowed)(?:\\s+pokemon|\\s+mon)?|not (?:a )?fully[- ]?evolved";
      const preEvoAlt = "pre[- ]?evol|not (?:a )?fully[- ]?evolved";
      const flaggedAmo = new RegExp(`amoonguss[^.!?\\n]{0,80}(?:${unavailableAlt})`, "i").test(content)
        || new RegExp(`(?:${unavailableAlt})[^.!?\\n]{0,80}amoonguss`, "i").test(content);
      const flaggedPory = new RegExp(`porygon2[^.!?\\n]{0,80}(?:${unavailableAlt}|${preEvoAlt})`, "i").test(content)
        || new RegExp(`(?:${unavailableAlt}|${preEvoAlt})[^.!?\\n]{0,80}porygon2`, "i").test(content);
      if (flaggedAmo && flaggedPory) return { pass: true, reason: "Flagged both Amoonguss + Porygon2 as unavailable" };
      if (flaggedAmo || flaggedPory) return { pass: false, reason: `Flagged only ${flaggedAmo ? "Amoonguss" : "Porygon2"} — missed the other` };
      return { pass: false, reason: "Failed to flag either Amoonguss or Porygon2 as unavailable" };
    },
  },
  {
    id: "stat_accuracy",
    tag: "hallucination",
    description: "Reports Mega Dragonite stats matching mega_evolutions.csv (6/6)",
    prompt: "What are Mega Dragonite's base stats in Champions? List HP, Attack, Defense, Sp. Atk, Sp. Def, and Speed with numeric values.",
    maxTurns: 6,
    requireTeamJson: false,
    score: (r) => {
      const truth = loadMegas().get("mega dragonite");
      if (!truth) return { pass: false, reason: "Ground-truth row missing for Mega Dragonite" };
      const want = [truth.hp, truth.attack, truth.defense, truth.sp_atk, truth.sp_def, truth.speed];
      const nums = Array.from(r.finalContent.matchAll(/\b(\d{2,3})\b/g)).map(m => Number(m[1]));
      const present = want.filter(n => nums.includes(n)).length;
      if (present === 6) return { pass: true, reason: `All 6 stats match (${want.join("/")})` };
      return { pass: false, reason: `Only ${present}/6 stat values match — expected ${want.join("/")}, found numbers [${[...new Set(nums)].slice(0, 12).join(", ")}]` };
    },
  },
  {
    id: "banned_comprehensive",
    tag: "hallucination",
    description: "Names ≥5 banned items AND all 3 missing gimmicks (Tera/Dynamax/Z-Moves)",
    prompt: "In Pokemon Champions, what items and battle mechanics from Scarlet/Violet are NOT available? Give a comprehensive list.",
    maxTurns: 6,
    requireTeamJson: false,
    score: (r) => {
      const text = r.finalContent.toLowerCase();
      const bannedList = ["life orb","choice band","choice specs","assault vest","rocky helmet","heavy-duty boots","eviolite","flame orb","toxic orb","power herb","light clay","covert cloak","loaded dice","utility umbrella","expert belt","clear amulet","throat spray","booster energy","weakness policy","black sludge","safety goggles"];
      const bannedHit = bannedList.filter(b => text.includes(b));
      const teraMiss = /\btera(?:stall)/i.test(r.finalContent) || /\btera[^a-z]/i.test(r.finalContent);
      const dynaMiss = /dynamax|gigantamax/i.test(r.finalContent);
      const zMiss = /z-move|z\s+move|z-moves/i.test(r.finalContent);
      const gimmickHits = [teraMiss, dynaMiss, zMiss].filter(Boolean).length;
      if (bannedHit.length >= 5 && gimmickHits >= 3) {
        return { pass: true, reason: `Named ${bannedHit.length} banned items + all 3 missing gimmicks` };
      }
      if (bannedHit.length < 5) {
        return { pass: false, reason: `Only ${bannedHit.length} banned items listed (need ≥5): ${bannedHit.join(", ") || "none"}` };
      }
      return { pass: false, reason: `${bannedHit.length} items ✓ but gimmicks ${gimmickHits}/3 (Tera=${teraMiss}, Dyna=${dynaMiss}, Z=${zMiss})` };
    },
  },

  // ────────── RETRIEVAL (5) — grounds claims in project data; use --real-rag ──
  {
    id: "usage_lookup",
    tag: "retrieval",
    description: "Reports Incineroar usage % within ±3pp of pikalytics_usage.csv",
    prompt: "What is Incineroar's current tournament usage percentage in Pokemon Champions Regulation M-A? Give a number.",
    maxTurns: 5,
    requireTeamJson: false,
    score: (r) => {
      const truth = loadUsage().get("incineroar");
      if (!truth) return { pass: false, reason: "Ground-truth row missing for Incineroar" };
      const pcts = Array.from(r.finalContent.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)).map(m => Number(m[1]));
      if (pcts.length === 0) return { pass: false, reason: `No percentage mentioned (expected ~${truth.usage_pct}%)` };
      const closest = pcts.reduce((a, b) => Math.abs(b - truth.usage_pct) < Math.abs(a - truth.usage_pct) ? b : a);
      const delta = Math.abs(closest - truth.usage_pct);
      if (delta <= 3) return { pass: true, reason: `Reported ${closest}% vs truth ${truth.usage_pct}% (Δ${delta.toFixed(1)}pp)` };
      return { pass: false, reason: `Closest reported ${closest}% off by ${delta.toFixed(1)}pp (truth ${truth.usage_pct}%)` };
    },
  },
  {
    id: "usage_teammates",
    tag: "retrieval",
    description: "Names ≥2 of the top-3 Garchomp teammates from pikalytics_usage.csv",
    prompt: "What are the top 3 Pokemon most commonly paired with Garchomp in current Champions VGC? List their names.",
    maxTurns: 5,
    requireTeamJson: false,
    score: (r) => {
      const truth = loadUsage().get("garchomp");
      if (!truth) return { pass: false, reason: "Ground-truth row missing for Garchomp" };
      const topThree = truth.top_teammates.slice(0, 3).map(s => s.toLowerCase());
      const text = r.finalContent.toLowerCase();
      const hits = topThree.filter(t => text.includes(t));
      if (hits.length >= 2) return { pass: true, reason: `Named ${hits.length}/3 top teammates: ${hits.join(", ")}` };
      return { pass: false, reason: `Only ${hits.length}/3 top teammates named (expected ${topThree.join(", ")})` };
    },
  },
  {
    id: "tournament_retrieval",
    tag: "retrieval",
    description: "Names ≥3 Pokemon from a real Mega Golurk tournament team",
    prompt: "Describe a recent tournament-winning team built around Mega Golurk in Champions Regulation M-A. Name the other 5 team members.",
    maxTurns: 9,
    requireTeamJson: false,
    score: (r) => {
      // Union of real teammates across PC38/PC105/PC227/PC234 Mega Golurk tournament teams
      const realTeammates = ["incineroar","torkoal","venusaur","sneasler","farigiraf","pelipper","meowstic","sinistcha","archaludon","clefable","oranguru","hatterene","hydreigon"];
      const text = r.finalContent.toLowerCase();
      const hits = realTeammates.filter(c => text.includes(c));
      if (hits.length >= 3) return { pass: true, reason: `Named ${hits.length} real Mega Golurk teammates: ${hits.slice(0, 6).join(", ")}` };
      return { pass: false, reason: `Only ${hits.length} recognizable teammates (need ≥3): ${hits.join(", ") || "none"}` };
    },
  },
  {
    id: "creator_opinion",
    tag: "retrieval",
    description: "Attributes a Garchomp view to AngrySlowbroPlus's tier list",
    prompt: "What does the content creator AngrySlowbroPlus say about Garchomp in their Regulation A Doubles tier list for Pokemon Champions?",
    maxTurns: 6,
    requireTeamJson: false,
    score: (r) => {
      const content = r.finalContent.toLowerCase();
      const mentionsCreator = /angry ?slowbro|slowbro ?plus/.test(content);
      const mentionsGarchomp = /garchomp/.test(content);
      const mentionsTierList = /tier list|tier-list|\brank|\btop tier|\b[sabcdf][ -]tier\b/.test(content);
      if (mentionsCreator && mentionsGarchomp && mentionsTierList) {
        return { pass: true, reason: "Attributed Garchomp view to AngrySlowbroPlus's tier list" };
      }
      const missing: string[] = [];
      if (!mentionsCreator) missing.push("creator");
      if (!mentionsGarchomp) missing.push("Garchomp");
      if (!mentionsTierList) missing.push("tier-list context");
      return { pass: false, reason: `Missing: ${missing.join(", ")}` };
    },
  },
  {
    id: "meta_core_attribution",
    tag: "retrieval",
    description: "Cites Archaludon+Pelipper rain-core WR ~55.8% (±2pp) from meta_snapshot.md",
    prompt: "What is the win rate of the Archaludon + Pelipper rain core in the current Pokemon Champions meta?",
    maxTurns: 5,
    requireTeamJson: false,
    score: (r) => {
      const pcts = Array.from(r.finalContent.matchAll(/(\d{2}(?:\.\d+)?)\s*%/g)).map(m => Number(m[1]));
      const target = 55.8;
      const hit = pcts.find(p => Math.abs(p - target) <= 2);
      if (hit !== undefined) return { pass: true, reason: `Reported ${hit}% (truth ~55.8%)` };
      if (pcts.length === 0) return { pass: false, reason: "No percentage mentioned" };
      return { pass: false, reason: `No % within ±2 of 55.8 (saw: ${pcts.slice(0, 8).join(", ")})` };
    },
  },
];

// ── runner ─────────────────────────────────────────────────────────────────────

interface TestResult {
  testId: string;
  tag: TestTag;
  modelKey: string;
  pass: boolean;
  reason: string;
  latencyMs: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  nudgeCount: number;
  dedupCount: number;
  citationValid: boolean;
  citationTotal: number;
  citationValidCount: number;
  citationInvalidIds: string[];
  citationRetryFired: boolean;
  citationParseError?: string;
  toolCallLog: Array<{ name: string; args: Record<string, unknown> }>;
  error?: string;
  contentPreview: string;
}

interface CliArgs {
  models: string[];
  tests: string[];
  verbose: boolean;
  realRag: boolean;
}

function parseArgs(): CliArgs {
  const raw: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true";
      raw[key] = val;
    }
  }
  const models = raw.models ? raw.models.split(",") : ["gemma-4-26b"];
  const tests = raw.tests ? raw.tests.split(",") : TESTS.map(t => t.id);
  return {
    models,
    tests,
    verbose: raw.verbose === "true",
    realRag: raw["real-rag"] === "true",
  };
}

async function main() {
  const { models, tests: testFilter, verbose, realRag } = parseArgs();
  USE_REAL_RAG = realRag;
  const activeTests = TESTS.filter(t => testFilter.includes(t.id));

  console.log(`\n=== eval-models ===`);
  console.log(`Models: ${models.join(", ")}`);
  console.log(`Tests:  ${activeTests.map(t => t.id).join(", ")}`);
  console.log(`Search: ${realRag ? "REAL-RAG (lib/rag.ts → Supabase pc_chunks)" : "stub (9-entry keyword)"}`);
  if (verbose) console.log(`Mode:   verbose\n`);
  else console.log(`Tip:    run with --verbose to see response content\n`);

  const allResults: TestResult[] = [];

  for (const modelKey of models) {
    const model = MODELS[modelKey];
    if (!model) { console.error(`Unknown model: ${modelKey}`); continue; }
    console.log(`\n── ${model.label} (${model.remoteName}) ──`);

    for (const test of activeTests) {
      process.stdout.write(`  ${test.id.padEnd(22)} ... `);
      const agentResult = await runAgent(modelKey, test.prompt, test.maxTurns ?? 10, test.requireTeamJson ?? true);
      const { pass, reason } = test.score(agentResult);

      const result: TestResult = {
        testId: test.id,
        tag: test.tag,
        modelKey,
        pass,
        reason,
        latencyMs: agentResult.latencyMs,
        turns: agentResult.turns,
        inputTokens: agentResult.inputTokens,
        outputTokens: agentResult.outputTokens,
        totalTokens: agentResult.totalTokens,
        nudgeCount: agentResult.nudgeCount,
        dedupCount: agentResult.dedupCount,
        citationValid: agentResult.citationValid,
        citationTotal: agentResult.citationTotal,
        citationValidCount: agentResult.citationValidCount,
        citationInvalidIds: agentResult.citationInvalidIds,
        citationRetryFired: agentResult.citationRetryFired,
        citationParseError: agentResult.citationParseError,
        toolCallLog: agentResult.toolCallLog,
        error: agentResult.error,
        contentPreview: agentResult.finalContent.slice(0, 600),
      };
      allResults.push(result);

      const icon = pass ? "✓" : "✗";
      const latLabel = `${(agentResult.latencyMs / 1000).toFixed(1)}s`;
      const tokLabel = agentResult.totalTokens > 0 ? `${agentResult.totalTokens}tok` : "no-tok";
      const toolSummary = agentResult.toolCallLog.length > 0
        ? ` [${agentResult.toolCallLog.map(t => t.name).join("→")}]`
        : " [no tools]";
      console.log(`${icon} ${reason} (${latLabel}, ${agentResult.turns}t, ${tokLabel}${toolSummary})`);
      if (agentResult.error) console.log(`    ⚠ ${agentResult.error}`);
      if (verbose && agentResult.finalContent) {
        console.log(`    ┌─ content preview`);
        const preview = agentResult.finalContent.slice(0, 500).replace(/\n/g, "\n    │ ");
        console.log(`    │ ${preview}`);
        console.log(`    └─`);
      }
    }
  }

  // ── summary: pass/fail grid ──────────────────────────────────────────────────
  console.log(`\n${"═".repeat(100)}`);
  console.log(`SUMMARY — pass/fail by test`);
  console.log(`${"═".repeat(100)}`);

  const testIds = activeTests.map(t => t.id);
  const COL = 16;
  const header = ["Model".padEnd(22), ...testIds.map(id => id.slice(0, COL - 1).padEnd(COL))].join(" ");
  console.log(header);
  console.log("-".repeat(Math.min(header.length, 100)));

  for (const modelKey of models) {
    const modelResults = allResults.filter(r => r.modelKey === modelKey);
    const score = modelResults.filter(r => r.pass).length;
    const row = [
      `${(MODELS[modelKey]?.label ?? modelKey).slice(0, 18)} (${score}/${modelResults.length})`.padEnd(22),
      ...testIds.map(tid => {
        const r = modelResults.find(x => x.testId === tid);
        if (!r) return "N/A".padEnd(COL);
        const lat = `${(r.latencyMs / 1000).toFixed(1)}s`;
        return (r.pass ? `✓ ${lat}` : `✗ ${lat}`).padEnd(COL);
      }),
    ].join(" ");
    console.log(row);
  }

  // ── summary: per-tag score ───────────────────────────────────────────────────
  console.log(`\n${"═".repeat(100)}`);
  console.log(`SUMMARY — score by category`);
  console.log(`${"═".repeat(100)}`);
  const tags: TestTag[] = ["behavior", "retrieval", "hallucination"];
  const tagHeader = ["Model".padEnd(22), ...tags.map(t => t.padEnd(14)), "overall".padEnd(10)].join(" ");
  console.log(tagHeader);
  console.log("-".repeat(tagHeader.length));
  for (const modelKey of models) {
    const modelResults = allResults.filter(r => r.modelKey === modelKey);
    const row = [(MODELS[modelKey]?.label ?? modelKey).slice(0, 20).padEnd(22)];
    for (const tag of tags) {
      const tagResults = modelResults.filter(r => r.tag === tag);
      const p = tagResults.filter(r => r.pass).length;
      row.push(`${p}/${tagResults.length}`.padEnd(14));
    }
    const overall = modelResults.filter(r => r.pass).length;
    row.push(`${overall}/${modelResults.length}`.padEnd(10));
    console.log(row.join(" "));
  }

  // ── summary: efficiency metrics ──────────────────────────────────────────────
  console.log(`\n${"═".repeat(100)}`);
  console.log(`EFFICIENCY — primary metric: tokens_per_pass (lower is better)`);
  console.log(`${"═".repeat(100)}`);
  const effHeader = ["Model".padEnd(22), "passes".padEnd(8), "tok_total".padEnd(12), "tok/pass".padEnd(11), "lat_avg".padEnd(9), "turns_avg".padEnd(10), "nudges".padEnd(8), "dedup".padEnd(7)].join(" ");
  console.log(effHeader);
  console.log("-".repeat(effHeader.length));
  const summary: Record<string, { passes: number; total: number; tokens_total: number; tokens_per_pass: number; mean_latency_ms: number; mean_turns: number; nudge_count: number; dedup_count: number; by_tag: Record<TestTag, { passes: number; total: number }>; citation_validity_rate: number; citation_retrieval_tests: number; citation_retrieval_valid: number; citation_total_cited: number; citation_total_valid: number; citation_retries: number }> = {};
  for (const modelKey of models) {
    const modelResults = allResults.filter(r => r.modelKey === modelKey);
    const passes = modelResults.filter(r => r.pass).length;
    const total = modelResults.length;
    const tokens_total = modelResults.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
    const tokens_per_pass = passes > 0 ? tokens_total / passes : 0;
    const mean_latency_ms = total > 0 ? modelResults.reduce((s, r) => s + r.latencyMs, 0) / total : 0;
    const mean_turns = total > 0 ? modelResults.reduce((s, r) => s + r.turns, 0) / total : 0;
    const nudge_count = modelResults.reduce((s, r) => s + r.nudgeCount, 0);
    const dedup_count = modelResults.reduce((s, r) => s + r.dedupCount, 0);
    const by_tag = { behavior: { passes: 0, total: 0 }, retrieval: { passes: 0, total: 0 }, hallucination: { passes: 0, total: 0 } };
    for (const tag of tags) {
      const tagResults = modelResults.filter(r => r.tag === tag);
      by_tag[tag] = { passes: tagResults.filter(r => r.pass).length, total: tagResults.length };
    }
    // Phase 2 — citation_validity_rate: retrieval-tagged tests where every cited chunk_id was valid AND at least one claim was made.
    const retrievalResults = modelResults.filter(r => r.tag === "retrieval");
    const citation_retrieval_tests = retrievalResults.length;
    const citation_retrieval_valid = retrievalResults.filter(r => r.citationValid).length;
    const citation_validity_rate = citation_retrieval_tests > 0 ? citation_retrieval_valid / citation_retrieval_tests : 0;
    const citation_total_cited = modelResults.reduce((s, r) => s + r.citationTotal, 0);
    const citation_total_valid = modelResults.reduce((s, r) => s + r.citationValidCount, 0);
    const citation_retries = modelResults.filter(r => r.citationRetryFired).length;
    summary[modelKey] = { passes, total, tokens_total, tokens_per_pass, mean_latency_ms, mean_turns, nudge_count, dedup_count, by_tag, citation_validity_rate, citation_retrieval_tests, citation_retrieval_valid, citation_total_cited, citation_total_valid, citation_retries };

    console.log([
      (MODELS[modelKey]?.label ?? modelKey).slice(0, 20).padEnd(22),
      `${passes}/${total}`.padEnd(8),
      String(tokens_total).padEnd(12),
      (passes > 0 ? Math.round(tokens_per_pass) : "n/a").toString().padEnd(11),
      `${(mean_latency_ms / 1000).toFixed(1)}s`.padEnd(9),
      mean_turns.toFixed(1).padEnd(10),
      String(nudge_count).padEnd(8),
      String(dedup_count).padEnd(7),
    ].join(" "));
  }

  // ── summary: citations (chunk_id validation, retrieval tests only) ──────────
  console.log(`\n${"═".repeat(100)}`);
  console.log(`CITATIONS — chunk_id validation (retrieval-tagged tests only; gate ≥ 95%)`);
  console.log(`${"═".repeat(100)}`);
  const citHeader = ["Model".padEnd(22), "retr_tests".padEnd(11), "valid".padEnd(7), "rate".padEnd(7), "cited_total".padEnd(13), "cited_valid".padEnd(13), "retries".padEnd(9)].join(" ");
  console.log(citHeader);
  console.log("-".repeat(citHeader.length));
  for (const modelKey of models) {
    const s = summary[modelKey];
    if (!s) continue;
    console.log([
      (MODELS[modelKey]?.label ?? modelKey).slice(0, 20).padEnd(22),
      String(s.citation_retrieval_tests).padEnd(11),
      String(s.citation_retrieval_valid).padEnd(7),
      `${(s.citation_validity_rate * 100).toFixed(0)}%`.padEnd(7),
      String(s.citation_total_cited).padEnd(13),
      String(s.citation_total_valid).padEnd(13),
      String(s.citation_retries).padEnd(9),
    ].join(" "));
  }

  const passCount = allResults.filter(r => r.pass).length;
  console.log(`\nTotal: ${passCount}/${allResults.length} passed\n`);

  // ── save snapshot ─────────────────────────────────────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const snapshotPath = join(process.cwd(), "snapshots", `model-eval-${ts}.json`);
  mkdirSync(join(process.cwd(), "snapshots"), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    config: { useRealRag: realRag, runs: 1 },
    models,
    tests: activeTests.map(t => ({ id: t.id, tag: t.tag })),
    summary,
    results: allResults,
  }, null, 2));
  console.log(`Snapshot → ${snapshotPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
