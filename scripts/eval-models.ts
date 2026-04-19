/**
 * eval-models.ts
 *
 * Compares OpenRouter free models on the 5 dimensions that matter for this app:
 *   1. tool_workflow   — calls pokedex() before proposing moves
 *   2. banned_item     — refuses Life Orb (doesn't exist in Champions)
 *   3. banned_mech     — refuses Terastallization
 *   4. team_json       — response ends with a valid ```team-json block
 *   5. validate_loop   — calls validate_set at least once during a build
 *
 * Usage:
 *   npx tsx scripts/eval-models.ts
 *   npx tsx scripts/eval-models.ts --models nemotron-super,gemma-4-26b
 *   npx tsx scripts/eval-models.ts --tests tool_workflow,team_json
 *   npx tsx scripts/eval-models.ts --verbose
 *
 * Requires OPENROUTER_API_KEY in .env or environment.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { lookupPokemon, validateSet, type SetInput } from "../lib/team-validator.js";

// ── env loading ────────────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env — rely on environment */ }
}
loadEnv();

// ── model registry ─────────────────────────────────────────────────────────────

const OPENROUTER_KEY = () => process.env.OPENROUTER_API_KEY ?? "";
const OLLAMA_LOCAL   = () => `${process.env.OLLAMA_BASE_URL   ?? "http://localhost:11434"}/v1/chat/completions`;
const OLLAMA_REMOTE  = () => `${process.env.OLLAMA_REMOTE_URL ?? "http://localhost:11434"}/v1/chat/completions`;

const MODELS: Record<string, { remoteName: string; label: string; apiUrl?: () => string; apiKey?: () => string }> = {
  // OpenRouter hosted
  "nemotron-super": { remoteName: "openai/gpt-oss-120b:free",   label: "GPT-OSS 120B (OpenRouter)" },
  "gemma-4-31b":    { remoteName: "google/gemma-4-31b-it:free", label: "Gemma 4 31B IT (OpenRouter)" },
  "gemma-4-26b":    { remoteName: "google/gemma-4-26b-a4b-it",  label: "Gemma 4 26B A4B (OpenRouter)" },
  // Ollama local (RTX 2070 SUPER — 8GB → 7-9B Q4 only)
  "qwen2.5-7b":   { remoteName: "qwen2.5:7b-instruct-q4_K_M",      label: "Qwen 2.5 7B (Local Ollama)",   apiUrl: OLLAMA_LOCAL,  apiKey: () => "ollama" },
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

STEP 3 — For EVERY team member, call validate_set(pokemon, moves, item, ability).
          If overall is false, fix the issue and call validate_set again.
          Do not finalize any member until validate_set returns overall: true.

STEP 4 — Write your analysis and team explanation in prose.

STEP 5 — YOUR RESPONSE MUST END with a fenced team-json block (see format below).
          This is mandatory. Omitting it means your answer is incomplete.

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

Every pokemon entry must have passed validate_set with overall: true before you include it.`;

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
];

function executeSearch(query: string): string {
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
  return JSON.stringify({ results: matched.map((text, i) => ({ source: "knowledge_base", score: 1 - i * 0.01, text })) });
}

// ── tool executor ──────────────────────────────────────────────────────────────

function executeTool(name: string, args: Record<string, unknown>): string {
  if (name === "search") {
    return executeSearch(String(args.query ?? ""));
  }
  if (name === "pokedex") {
    const result = lookupPokemon(String(args.name ?? ""));
    return JSON.stringify(result);
  }
  if (name === "validate_set") {
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
  error?: string;
}

async function callOpenRouter(
  modelKey: string,
  modelRemoteName: string,
  messages: OAIMessage[],
  tools: typeof TOOL_DEFS,
  timeoutMs = 120_000,
): Promise<{ message: OAIMessage; finishReason: string } | { error: string }> {
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

  const data = await res.json() as { choices: Array<{ message: OAIMessage; finish_reason: string }> };
  const choice = data.choices?.[0];
  if (!choice) return { error: "No choices in response" };
  return { message: choice.message, finishReason: choice.finish_reason };
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
  const dupeCount: Record<string, number> = {};

  while (turns < maxTurns) {
    turns++;
    const result = await callOpenRouter(modelKey, model.remoteName, [
      { role: "system", content: SYSTEM },
      ...messages,
    ], TOOL_DEFS);

    if ("error" in result) {
      return { finalContent: lastContent, toolCallLog, turns, latencyMs: Date.now() - t0, error: result.error };
    }

    const { message, finishReason } = result;
    messages.push(message);

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
        toolCallLog.push({ name: tc.function.name, args });

        // Dedup detection: same tool + same args called 2+ times → inject corrective nudge
        const callKey = `${tc.function.name}::${JSON.stringify(args)}`;
        dupeCount[callKey] = (dupeCount[callKey] ?? 0) + 1;
        if (dupeCount[callKey] >= 2 && !injectedNudge) {
          injectedNudge = true;
          messages.push({ role: "tool", tool_call_id: tc.id, content: executeTool(tc.function.name, args) });
          messages.push({
            role: "user",
            content: `You have called ${tc.function.name}(${JSON.stringify(args)}) ${dupeCount[callKey]} times already. Stop repeating this call. Proceed to the next required step: call validate_set on every team member you have already researched.`,
          });
          break;
        }

        const toolResult = executeTool(tc.function.name, args);
        messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
      }

      // Pokedex-cap nudge: if total pokedex calls > 12, model is stuck looping
      const pokedexTotal = toolCallLog.filter(t => t.name === "pokedex").length;
      if (pokedexTotal > 12 && !injectedNudge) {
        messages.push({
          role: "user",
          content: `You have called pokedex ${pokedexTotal} times. You have enough data for a full team. STOP calling pokedex. Proceed immediately to validate_set for each team member, then emit your team-json block.`,
        });
        injectedNudge = true;
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
      continue;
    }

    break;
  }

  return {
    finalContent: lastContent,
    toolCallLog,
    turns,
    latencyMs: Date.now() - t0,
  };
}

// ── test definitions ───────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  description: string;
  prompt: string;
  maxTurns?: number;
  requireTeamJson?: boolean;
  score: (result: AgentResult) => { pass: boolean; reason: string };
}

const TESTS: TestCase[] = [
  {
    id: "tool_workflow",
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
    id: "banned_item",
    description: "Refuses Life Orb as not available in Champions",
    prompt: "What item should I give Dragonite in Champions? Is Life Orb good on it?",
    maxTurns: 5,
    requireTeamJson: false,
    score: (r) => {
      const content = r.finalContent;
      // Hard fail: recommends Life Orb positively or treats it as available
      const recommends = /life orb.*(?:great|good|best|excellent|recommend|use|go with|run|is available|can hold)/i.test(content)
        || /(?:give|equip|hold|use|try|run).*life orb/i.test(content)
        || /life orb.*\+30%|life orb.*damage boost/i.test(content);
      if (recommends) return { pass: false, reason: "Positively recommended Life Orb as available" };
      // Soft fail: hallucinated that NO items exist at all
      const noItemsAtAll = /(?:no|cannot|can't|don't have).*(?:items|held items) in champions/i.test(content)
        || /champions.*(?:no|removes|strips).*items/i.test(content);
      if (noItemsAtAll) return { pass: false, reason: "Hallucinated that items don't exist in Champions at all (wrong)" };
      // Pass: correctly flagged Life Orb as unavailable
      const flaggedUnavailable = /life orb.*(?:not available|doesn.t exist|not in|missing|removed|banned|unavailable)/i.test(content)
        || /(?:not available|doesn.t exist|missing|banned).*life orb/i.test(content);
      return {
        pass: true,
        reason: flaggedUnavailable
          ? "Correctly identified Life Orb as unavailable in Champions"
          : "Did not recommend Life Orb (check content — may be soft pass)",
      };
    },
  },
  {
    id: "banned_mech",
    description: "Does not suggest Terastallization (doesn't exist in Champions)",
    prompt: "Should I Terastallize Dragonite to Normal type to boost Extreme Speed in Champions?",
    maxTurns: 5,
    requireTeamJson: false,
    score: (r) => {
      const content = r.finalContent;
      const recommends = /(?:yes|absolutely|definitely|great idea|strong strategy|common strategy|works well).*tera/i.test(content)
        || /tera.*(?:yes|works|boost|great|recommend)/i.test(content)
        || /you (?:can|should|could) terastallize/i.test(content);
      if (recommends) return { pass: false, reason: "Recommended or endorsed Terastallization" };
      const rejects = /(?:no|not available|doesn.t exist|not in|removed|only.*mega|mega.*only|no tera)/i.test(content);
      return {
        pass: true,
        reason: rejects
          ? "Correctly stated Tera doesn't exist in Champions"
          : "Did not endorse Tera (check content — may be soft pass)",
      };
    },
  },
  {
    id: "team_json",
    description: "Response ends with a valid ```team-json block with 6 Pokemon",
    prompt: "Build me a complete 6-Pokemon rain team for VGC Doubles Champions format. Include a Mega.",
    maxTurns: 12,
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
    description: "Doesn't obsessively repeat pokedex calls for the same Pokemon",
    prompt: "Build me a 6-Pokemon Trick Room team for VGC Doubles.",
    maxTurns: 14,
    score: (r) => {
      const pokedexCalls = r.toolCallLog.filter(t => t.name === "pokedex");
      if (pokedexCalls.length === 0) {
        return { pass: false, reason: "pokedex never called — no data gathered" };
      }
      // Count how many times each Pokemon was looked up
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
    description: "Lists valid Champions items without recommending banned ones",
    prompt: "Give me a list of the best held items to use in Champions for a Dragonite set. What are my options?",
    maxTurns: 7,
    requireTeamJson: false,
    score: (r) => {
      const content = r.finalContent.toLowerCase();
      // Hard fail: recommends a banned item as viable
      const banned = ["life orb", "choice band", "choice specs", "assault vest", "rocky helmet"];
      for (const item of banned) {
        const recommends = new RegExp(`${item.replace(/ /g, "\\s+")}.*(?:great|good|best|recommend|use|run|available|can hold|works well)`, "i").test(r.finalContent)
          || new RegExp(`(?:use|try|run|give|equip|hold).*${item.replace(/ /g, "\\s+")}`, "i").test(r.finalContent);
        if (recommends) return { pass: false, reason: `Recommended banned item: ${item}` };
      }
      // Pass: mentions at least one valid item
      const validItems = ["sitrus berry", "focus sash", "draco plate", "charcoal", "lum berry", "yache berry", "mega stone", "air balloon", "mystic water", "never-melt ice"];
      const mentioned = validItems.filter(item => content.includes(item));
      if (mentioned.length === 0) {
        return { pass: false, reason: "No valid Champions items mentioned in response" };
      }
      return { pass: true, reason: `Valid items listed: ${mentioned.join(", ")}` };
    },
  },
];

// ── runner ─────────────────────────────────────────────────────────────────────

interface TestResult {
  testId: string;
  modelKey: string;
  pass: boolean;
  reason: string;
  latencyMs: number;
  turns: number;
  toolCallLog: Array<{ name: string; args: Record<string, unknown> }>;
  error?: string;
  contentPreview: string;
}

function parseArgs(): { models: string[]; tests: string[]; verbose: boolean } {
  const raw: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true";
      raw[key] = val;
    }
  }
  const models = raw.models ? raw.models.split(",") : Object.keys(MODELS);
  const tests = raw.tests ? raw.tests.split(",") : TESTS.map(t => t.id);
  return { models, tests, verbose: raw.verbose === "true" };
}

async function main() {
  const { models, tests: testFilter, verbose } = parseArgs();
  const activeTests = TESTS.filter(t => testFilter.includes(t.id));

  console.log(`\n=== eval-models ===`);
  console.log(`Models: ${models.join(", ")}`);
  console.log(`Tests:  ${activeTests.map(t => t.id).join(", ")}`);
  if (verbose) console.log(`Mode:   verbose\n`);
  else console.log(`Tip:    run with --verbose to see response content\n`);

  const allResults: TestResult[] = [];

  for (const modelKey of models) {
    const model = MODELS[modelKey];
    if (!model) { console.error(`Unknown model: ${modelKey}`); continue; }
    console.log(`\n── ${model.label} (${model.remoteName}) ──`);

    for (const test of activeTests) {
      process.stdout.write(`  ${test.id.padEnd(16)} ... `);
      const agentResult = await runAgent(modelKey, test.prompt, test.maxTurns ?? 10, test.requireTeamJson ?? true);
      const { pass, reason } = test.score(agentResult);

      const result: TestResult = {
        testId: test.id,
        modelKey,
        pass,
        reason,
        latencyMs: agentResult.latencyMs,
        turns: agentResult.turns,
        toolCallLog: agentResult.toolCallLog,
        error: agentResult.error,
        contentPreview: agentResult.finalContent.slice(0, 600),
      };
      allResults.push(result);

      const icon = pass ? "✓" : "✗";
      const latLabel = `${(agentResult.latencyMs / 1000).toFixed(1)}s`;
      const toolSummary = agentResult.toolCallLog.length > 0
        ? ` [${agentResult.toolCallLog.map(t => t.name).join("→")}]`
        : " [no tools]";
      console.log(`${icon} ${reason} (${latLabel}, ${agentResult.turns}t${toolSummary})`);
      if (agentResult.error) console.log(`    ⚠ ${agentResult.error}`);
      if (verbose && agentResult.finalContent) {
        console.log(`    ┌─ content preview`);
        const preview = agentResult.finalContent.slice(0, 500).replace(/\n/g, "\n    │ ");
        console.log(`    │ ${preview}`);
        console.log(`    └─`);
      }
    }
  }

  // ── summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(80)}`);
  console.log(`SUMMARY`);
  console.log(`${"═".repeat(80)}`);

  const testIds = activeTests.map(t => t.id);
  const COL = 15;
  const header = ["Model".padEnd(20), ...testIds.map(id => id.slice(0, COL - 1).padEnd(COL))].join(" ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const modelKey of models) {
    const modelResults = allResults.filter(r => r.modelKey === modelKey);
    const score = modelResults.filter(r => r.pass).length;
    const row = [
      `${MODELS[modelKey]?.label ?? modelKey} (${score}/${modelResults.length})`.padEnd(20),
      ...testIds.map(tid => {
        const r = modelResults.find(x => x.testId === tid);
        if (!r) return "N/A".padEnd(COL);
        const lat = `${(r.latencyMs / 1000).toFixed(1)}s`;
        return (r.pass ? `✓ ${lat}` : `✗ ${lat}`).padEnd(COL);
      }),
    ].join(" ");
    console.log(row);
  }

  const passCount = allResults.filter(r => r.pass).length;
  console.log(`\nTotal: ${passCount}/${allResults.length} passed\n`);

  // ── save snapshot ─────────────────────────────────────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const snapshotPath = join(process.cwd(), "snapshots", `model-eval-${ts}.json`);
  mkdirSync(join(process.cwd(), "snapshots"), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    models,
    tests: activeTests.map(t => t.id),
    results: allResults,
  }, null, 2));
  console.log(`Snapshot → ${snapshotPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
