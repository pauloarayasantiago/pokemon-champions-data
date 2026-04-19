import { query } from "@core/rag";
import {
  calculateDamage,
  findPokemon,
  findMega,
  findMove,
} from "@core/calc";
import type {
  CompetitiveSet,
  StatSpread,
  Nature,
  FieldConditions,
  Weather,
  PokemonData,
  MegaData,
} from "@core/calc";
import type { Tool, ToolCall } from "./llm/types.js";

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "search",
    description:
      "Semantic search over the Pokemon Champions RAG database. Covers 186 Pokemon, 59 Megas, 494 moves, 138 items, 136 tournament teams, Pikalytics usage, and competitive analysis transcripts. Use for any lookup about Champions mechanics, meta, sets, movepools, or competitive context.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language search query. Be specific — e.g., 'Incineroar sets and items' beats 'Incineroar'.",
        },
        topK: {
          type: "integer",
          description: "Number of results to return (default 5, max 15).",
          default: 5,
          minimum: 1,
          maximum: 15,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "calc",
    description:
      "16-roll Champions-accurate damage calculator. Returns min/max/avg damage, %HP range, and KO probability. Champions uses SP (Stat Points, 66 total, max 32 per stat, all IVs=31) — do not pass EV spreads.",
    parameters: {
      type: "object",
      properties: {
        attacker: { type: "string", description: "Attacker name. Prefix with 'Mega ' for Mega form (e.g. 'Mega Dragonite')." },
        defender: { type: "string", description: "Defender name. Prefix with 'Mega ' for Mega form." },
        move: {
          type: "string",
          description: "Move name. Omit to get all damaging moves sorted by max damage.",
        },
        attackerSp: {
          type: "string",
          description: "Attacker SP spread as HP/Atk/Def/SpA/SpD/Spe (e.g. '0/32/0/0/0/32'). Defaults to max offensive.",
        },
        defenderSp: {
          type: "string",
          description: "Defender SP spread. Defaults to neutral.",
        },
        attackerItem: { type: "string", description: "Attacker's held item (Champions items only)." },
        defenderItem: { type: "string", description: "Defender's held item." },
        weather: {
          type: "string",
          enum: ["sun", "rain", "sand", "snow"],
          description: "Active weather.",
        },
        spread: { type: "boolean", description: "Is this a spread move (Doubles, hits multiple targets)?" },
        crit: { type: "boolean", description: "Critical hit?" },
        burned: { type: "boolean", description: "Is the attacker burned?" },
        reflect: { type: "boolean", description: "Is Reflect up on defender side?" },
        screen: { type: "boolean", description: "Is Light Screen up on defender side?" },
        helpingHand: { type: "boolean", description: "Is attacker receiving Helping Hand?" },
      },
      required: ["attacker", "defender"],
    },
  },
];

function parseSP(spStr: string | undefined): StatSpread {
  if (!spStr) {
    return { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 };
  }
  const parts = spStr.split("/").map(Number);
  return {
    hp: parts[0] ?? 0,
    attack: parts[1] ?? 0,
    defense: parts[2] ?? 0,
    spAtk: parts[3] ?? 0,
    spDef: parts[4] ?? 0,
    speed: parts[5] ?? 0,
  };
}

function inferNature(
  sp: StatSpread,
  baseStats: { attack: number; spAtk: number },
): Nature {
  if (
    sp.attack > sp.spAtk ||
    (sp.attack === sp.spAtk && baseStats.attack >= baseStats.spAtk)
  ) {
    return { plus: "attack", minus: "spAtk" };
  }
  return { plus: "spAtk", minus: "attack" };
}

function buildSet(
  pokemon: PokemonData,
  mega: MegaData | undefined,
  spStr: string | undefined,
  item: string | undefined,
): CompetitiveSet {
  const sp = parseSP(spStr);
  const ability = mega?.ability ?? pokemon.abilities[0];
  const nature = inferNature(sp, pokemon.baseStats);
  return {
    pokemon,
    mega,
    ability,
    item: item ?? "",
    nature,
    sp,
    moves: pokemon.moves,
  };
}

function resolveSet(
  name: string,
  spStr: string | undefined,
  item: string | undefined,
): CompetitiveSet | null {
  const nameLower = name.toLowerCase();
  if (nameLower.startsWith("mega ")) {
    const mega = findMega(name);
    if (mega) {
      const pokemon = findPokemon(mega.basePokemon);
      if (pokemon) return buildSet(pokemon, mega, spStr, item);
    }
    const stripped = name.replace(/^mega\s+/i, "");
    const mon = findPokemon(stripped);
    const megaData = findMega(stripped);
    if (mon && megaData) return buildSet(mon, megaData, spStr, item);
    if (mon) return buildSet(mon, undefined, spStr, item);
    return null;
  }
  const pokemon = findPokemon(name);
  if (!pokemon) return null;
  return buildSet(pokemon, undefined, spStr, item);
}

interface CalcArgs {
  attacker: string;
  defender: string;
  move?: string;
  attackerSp?: string;
  defenderSp?: string;
  attackerItem?: string;
  defenderItem?: string;
  weather?: string;
  spread?: boolean;
  crit?: boolean;
  burned?: boolean;
  reflect?: boolean;
  screen?: boolean;
  helpingHand?: boolean;
}

function buildFieldFromArgs(args: CalcArgs): Partial<FieldConditions> {
  return {
    weather: args.weather ? (args.weather as Weather) : null,
    isSpread: args.spread ?? false,
    isCriticalHit: args.crit ?? false,
    attackerBurned: args.burned ?? false,
    defenderSide: {
      isReflect: args.reflect ?? false,
      isLightScreen: args.screen ?? false,
      isAuroraVeil: false,
      isProtect: false,
      isFriendGuard: false,
    },
    attackerSide: {
      isHelpingHand: args.helpingHand ?? false,
      isReflect: false,
      isLightScreen: false,
      isAuroraVeil: false,
      isFriendGuard: false,
      isBattery: false,
    },
  };
}

async function executeSearch(args: { query: string; topK?: number }) {
  const topK = Math.max(1, Math.min(15, args.topK ?? 5));
  const results = await query(args.query, topK);
  return {
    query: args.query,
    topK,
    results: results.map((r) => ({
      source: r.source,
      sourceType: r.sourceType,
      score: r.score,
      text: r.text,
    })),
  };
}

async function executeCalc(args: CalcArgs) {
  const attacker = resolveSet(args.attacker, args.attackerSp, args.attackerItem);
  const defender = resolveSet(args.defender, args.defenderSp, args.defenderItem);
  if (!attacker) return { error: `Attacker not found: "${args.attacker}"` };
  if (!defender) return { error: `Defender not found: "${args.defender}"` };

  const field = buildFieldFromArgs(args);

  if (!args.move) {
    const results = attacker.pokemon.moves
      .map((m) => calculateDamage(attacker, defender, m, field))
      .filter((r) => r.maxDmg > 0)
      .sort((a, b) => b.maxDmg - a.maxDmg);
    return {
      attacker: attacker.mega?.megaName ?? attacker.pokemon.name,
      defender: defender.mega?.megaName ?? defender.pokemon.name,
      results,
    };
  }

  const move = findMove(args.move);
  if (!move) return { error: `Move not found: "${args.move}"` };
  const result = calculateDamage(attacker, defender, args.move, field);
  return {
    attacker: attacker.mega?.megaName ?? attacker.pokemon.name,
    defender: defender.mega?.megaName ?? defender.pokemon.name,
    result,
  };
}

export async function executeTool(call: ToolCall): Promise<string> {
  try {
    if (call.name === "search") {
      const out = await executeSearch(call.arguments as { query: string; topK?: number });
      return JSON.stringify(out);
    }
    if (call.name === "calc") {
      const out = await executeCalc(call.arguments as unknown as CalcArgs);
      return JSON.stringify(out);
    }
    return JSON.stringify({ error: `Unknown tool: ${call.name}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}
