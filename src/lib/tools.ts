import { query, type ProgressStage } from "@core/rag";
import {
  calculateDamage,
  findPokemon,
  findMega,
  findMove,
} from "@core/calc";
import { lookupPokemon, validateSet, type SetInput } from "@core/team-validator";
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
  {
    name: "pokedex",
    description:
      "Authoritative structured lookup of a Pokemon. Returns types, abilities, base stats, and the FULL legal movepool as an array of strings. Accepts base form ('Froslass') or Mega ('Mega Froslass'). If a Mega exists, includes mega form details and its stone. Use this BEFORE proposing any set — the moves[] field is the single source of truth for move legality.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Pokemon name. Use 'Mega X' to get mega details inline.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "validate_set",
    description:
      "Verifies that a proposed set is legal in Pokemon Champions. Checks each move against the Pokemon's movepool, the item against the Champions item list + banned list (Life Orb, Choice Band, etc.), the ability against native + mega abilities, and the mega stone against the mega evolution chart. Call this on every team member before emitting the final team. If overall is false, revise.",
    parameters: {
      type: "object",
      properties: {
        pokemon: { type: "string", description: "Pokemon name." },
        moves: { type: "array", items: { type: "string" }, description: "Proposed move list (4 moves)." },
        item: { type: "string", description: "Held item name." },
        ability: { type: "string", description: "Ability name." },
        megaStone: { type: "string", description: "If using a Mega, the stone name (e.g. 'Froslassite')." },
      },
      required: ["pokemon", "moves"],
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

export type ToolProgressStage =
  | ProgressStage
  | "resolve_start"
  | "resolve_end"
  | "calc_start"
  | "calc_end";

export type ToolProgressCallback = (
  stage: ToolProgressStage,
  detail?: Record<string, unknown>,
) => void;

async function executeSearch(
  args: { query: string; topK?: number },
  onProgress?: ToolProgressCallback,
) {
  const topK = Math.max(1, Math.min(15, args.topK ?? 5));
  const results = await query(args.query, topK, (stage, detail) => onProgress?.(stage, detail));
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

async function executeCalc(args: CalcArgs, onProgress?: ToolProgressCallback) {
  const resolveT0 = Date.now();
  onProgress?.("resolve_start");
  const attacker = resolveSet(args.attacker, args.attackerSp, args.attackerItem);
  const defender = resolveSet(args.defender, args.defenderSp, args.defenderItem);
  onProgress?.("resolve_end", {
    ms: Date.now() - resolveT0,
    attacker: attacker ? (attacker.mega?.megaName ?? attacker.pokemon.name) : null,
    defender: defender ? (defender.mega?.megaName ?? defender.pokemon.name) : null,
    attackerResolved: !!attacker,
    defenderResolved: !!defender,
  });
  if (!attacker) return { error: `Attacker not found: "${args.attacker}"` };
  if (!defender) return { error: `Defender not found: "${args.defender}"` };

  const field = buildFieldFromArgs(args);

  const calcT0 = Date.now();
  onProgress?.("calc_start", { move: args.move ?? null });

  if (!args.move) {
    const results = attacker.pokemon.moves
      .map((m) => calculateDamage(attacker, defender, m, field))
      .filter((r) => r.maxDmg > 0)
      .sort((a, b) => b.maxDmg - a.maxDmg);
    onProgress?.("calc_end", {
      ms: Date.now() - calcT0,
      movesConsidered: attacker.pokemon.moves.length,
      moves: results.length,
      topMove: results[0]?.moveName ?? null,
      topMaxPct: results[0]?.maxPct ?? null,
    });
    return {
      attacker: attacker.mega?.megaName ?? attacker.pokemon.name,
      defender: defender.mega?.megaName ?? defender.pokemon.name,
      results,
    };
  }

  const move = findMove(args.move);
  if (!move) {
    onProgress?.("calc_end", { ms: Date.now() - calcT0, error: "move_not_found" });
    return { error: `Move not found: "${args.move}"` };
  }
  const result = calculateDamage(attacker, defender, args.move, field);
  onProgress?.("calc_end", {
    ms: Date.now() - calcT0,
    move: result.moveName,
    minPct: result.minPct,
    maxPct: result.maxPct,
  });
  return {
    attacker: attacker.mega?.megaName ?? attacker.pokemon.name,
    defender: defender.mega?.megaName ?? defender.pokemon.name,
    result,
  };
}

export async function executeTool(
  call: ToolCall,
  onProgress?: ToolProgressCallback,
): Promise<string> {
  try {
    if (call.name === "search") {
      const out = await executeSearch(
        call.arguments as { query: string; topK?: number },
        onProgress,
      );
      return JSON.stringify(out);
    }
    if (call.name === "calc") {
      const out = await executeCalc(call.arguments as unknown as CalcArgs, onProgress);
      return JSON.stringify(out);
    }
    if (call.name === "pokedex") {
      const { name } = call.arguments as { name: string };
      return JSON.stringify(lookupPokemon(name));
    }
    if (call.name === "validate_set") {
      const out = validateSet(call.arguments as unknown as SetInput);
      if (!out.overall) {
        const badMoves = out.moves.filter((m) => !m.valid).map((m) => m.name);
        const badItem = out.item && !out.item.valid ? true : false;
        const badAbility = out.ability && !out.ability.valid ? true : false;
        const badMega = out.megaStone && !out.megaStone.valid ? true : false;
        const fields = [
          badMoves.length ? `moves (${badMoves.join(", ")})` : null,
          badItem ? "item" : null,
          badAbility ? "ability" : null,
          badMega ? "megaStone" : null,
        ].filter(Boolean);
        return JSON.stringify({
          ...out,
          _instruction: `This set is INVALID in Pokemon Champions — ${fields.join(", ")} failed. Do NOT include this set in the final team-json. Revise by calling pokedex(${JSON.stringify((call.arguments as unknown as SetInput).pokemon)}) to see the authoritative movepool, swap the invalid field(s) for legal alternatives, then call validate_set again. Do not emit the final team until validate_set returns overall:true for every member.`,
        });
      }
      return JSON.stringify(out);
    }
    return JSON.stringify({ error: `Unknown tool: ${call.name}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}
