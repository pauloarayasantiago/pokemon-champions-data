/**
 * CLI Damage Calculator for Pokemon Champions
 *
 * Usage:
 *   npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"
 *   npx tsx scripts/calc.ts "Garchomp" "Earthquake" "Incineroar"
 *   npx tsx scripts/calc.ts "Mega Charizard Heat Wave vs Venusaur" --weather sun --spread
 *   npx tsx scripts/calc.ts "Dragonite" "Extreme Speed" "Garchomp" --mega --sp 32/0/0/0/0/32
 *
 * Flags:
 *   --weather sun|rain|sand|snow
 *   --spread           Spread move (0.75x in Doubles)
 *   --crit             Critical hit
 *   --mega             Attacker is Mega-evolved
 *   --mega-def         Defender is Mega-evolved
 *   --item <item>      Attacker item
 *   --item-def <item>  Defender item
 *   --sp <spread>      Attacker SP: hp/atk/def/spa/spd/spe (e.g., 0/32/0/0/0/32)
 *   --sp-def <spread>  Defender SP
 *   --burned           Attacker is burned
 *   --reflect|--screen Defender has Reflect/Light Screen
 *   --helping-hand     Attacker has Helping Hand support
 *   --all              Show all attacker's moves vs defender
 */

import { findPokemon, findMega, findMove } from "../lib/calc/data.js";
import { calculateDamage, bestMove } from "../lib/calc/damage.js";
import type { CompetitiveSet, StatSpread, Nature, FieldConditions } from "../lib/calc/types.js";
import { DEFAULT_FIELD } from "../lib/calc/types.js";

// ── Parse CLI args ──

const args = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    // Flags that take a value
    if (["weather", "item", "item-def", "sp", "sp-def"].includes(key)) {
      flags.set(key, args[++i] ?? "");
    } else {
      flags.set(key, "true");
    }
  } else {
    positional.push(arg);
  }
}

// Parse "Attacker Move vs Defender" from positional args
let atkName: string;
let moveName: string;
let defName: string;
let showAll = flags.has("all");

if (positional.length === 1) {
  // Single string: "Garchomp Earthquake vs Incineroar"
  const parts = positional[0].split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) {
    console.error('Usage: npx tsx scripts/calc.ts "Attacker Move vs Defender"');
    console.error('   or: npx tsx scripts/calc.ts Attacker Move Defender');
    process.exit(1);
  }
  const atkParts = parts[0].trim();
  defName = parts[1].trim();

  // Try to find the Pokemon name by progressively taking more words
  const words = atkParts.split(/\s+/);
  let found = false;
  for (let split = words.length - 1; split >= 1; split--) {
    const candidateMon = words.slice(0, split).join(" ");
    const candidateMove = words.slice(split).join(" ");
    if (findPokemon(candidateMon) || findMega(candidateMon)) {
      atkName = candidateMon;
      moveName = candidateMove;
      found = true;
      break;
    }
  }
  if (!found) {
    // If entire left side is just a Pokemon name, show all moves
    if (findPokemon(atkParts) || findMega(atkParts)) {
      atkName = atkParts;
      moveName = "";
      showAll = true;
    } else {
      // Fallback: first word = pokemon, rest = move
      atkName = words[0];
      moveName = words.slice(1).join(" ");
    }
  }
} else if (positional.length >= 3) {
  atkName = positional[0];
  moveName = positional[1];
  defName = positional.slice(2).join(" ");
} else if (positional.length === 2) {
  // "Attacker vs Defender" — show all moves
  const vsMatch = positional.join(" ").split(/\s+vs\.?\s+/i);
  if (vsMatch.length === 2) {
    atkName = vsMatch[0].trim();
    defName = vsMatch[1].trim();
    moveName = "";
    showAll = true;
  } else {
    atkName = positional[0];
    defName = positional[1];
    moveName = "";
    showAll = true;
  }
} else {
  console.error('Usage: npx tsx scripts/calc.ts "Attacker Move vs Defender"');
  process.exit(1);
}

// ── Resolve Pokemon ──

function resolveSet(name: string, isMega: boolean, spStr?: string, item?: string): CompetitiveSet | null {
  const nameLower = name.toLowerCase();
  const nameStartsWithMega = nameLower.startsWith("mega ");

  // If name explicitly starts with "Mega", always resolve as mega
  if (nameStartsWithMega) {
    const mega = findMega(name);
    if (mega) {
      const pokemon = findPokemon(mega.basePokemon);
      if (pokemon) return buildSet(pokemon, mega, spStr, item);
    }
    // Try stripping "Mega " and looking up base form + mega
    const stripped = name.replace(/^mega\s+/i, "");
    const mon = findPokemon(stripped);
    const megaData = findMega(stripped);
    if (mon && megaData) return buildSet(mon, megaData, spStr, item);
    if (mon) return buildSet(mon, undefined, spStr, item);
    return null;
  }

  // Normal name — only use mega if --mega flag
  const pokemon = findPokemon(name);
  if (!pokemon) return null;
  const megaData = isMega ? findMega(name) : undefined;
  return buildSet(pokemon, megaData, spStr, item);
}

function buildSet(
  pokemon: NonNullable<ReturnType<typeof findPokemon>>,
  mega: ReturnType<typeof findMega>,
  spStr?: string,
  item?: string
): CompetitiveSet {
  const sp = parseSP(spStr);
  const ability = mega?.ability ?? pokemon.abilities[0];

  // Infer nature from SP spread
  const nature = inferNature(sp, pokemon.baseStats);

  return {
    pokemon,
    mega: mega ?? undefined,
    ability,
    item: item ?? "",
    nature,
    sp,
    moves: pokemon.moves,
  };
}

function parseSP(spStr?: string): StatSpread {
  if (!spStr) {
    // Default: 32/0/0/0/0/32 (offensive, speed)
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

function inferNature(sp: StatSpread, baseStats: { attack: number; spAtk: number }): Nature {
  // If attack SP > spAtk SP, assume +Atk -SpA, and vice versa
  if (sp.attack > sp.spAtk || (sp.attack === sp.spAtk && baseStats.attack >= baseStats.spAtk)) {
    return { plus: "attack", minus: "spAtk" };
  }
  return { plus: "spAtk", minus: "attack" };
}

// ── Resolve field conditions ──

const field: Partial<FieldConditions> = {
  weather: (flags.get("weather") as FieldConditions["weather"]) ?? null,
  isSpread: flags.has("spread"),
  isCriticalHit: flags.has("crit"),
  attackerBurned: flags.has("burned"),
  defenderSide: {
    ...DEFAULT_FIELD.defenderSide,
    isReflect: flags.has("reflect"),
    isLightScreen: flags.has("screen"),
  },
  attackerSide: {
    ...DEFAULT_FIELD.attackerSide,
    isHelpingHand: flags.has("helping-hand"),
  },
};

// ── Run calc ──

const attacker = resolveSet(atkName!, flags.has("mega"), flags.get("sp"), flags.get("item"));
const defender = resolveSet(defName!, flags.has("mega-def"), flags.get("sp-def"), flags.get("item-def"));

if (!attacker) {
  console.error(`Pokemon not found: "${atkName}"`);
  process.exit(1);
}
if (!defender) {
  console.error(`Pokemon not found: "${defName}"`);
  process.exit(1);
}

if (showAll) {
  // Show all damaging moves
  console.log(`\n${attacker.mega?.megaName ?? attacker.pokemon.name} vs ${defender.mega?.megaName ?? defender.pokemon.name}\n`);

  const results = attacker.pokemon.moves
    .map((m) => calculateDamage(attacker, defender, m, field))
    .filter((r) => r.maxDmg > 0)
    .sort((a, b) => b.maxDmg - a.maxDmg);

  if (results.length === 0) {
    console.log("No damaging moves available.");
  } else {
    for (const r of results.slice(0, 15)) {
      const eff = r.effectiveness >= 2 ? " SE" : r.effectiveness < 1 ? " NVE" : "";
      const ohko = r.isOHKO ? " OHKO!" : "";
      console.log(
        `  ${r.moveName.padEnd(20)} ${r.moveType.padEnd(9)} ${String(r.minDmg).padStart(4)}-${String(r.maxDmg).padEnd(4)} (${String(r.minPct).padStart(5)}%-${String(r.maxPct).padEnd(5)}%)${eff}${ohko}`
      );
    }
  }
} else {
  // Single move calc
  const move = findMove(moveName!);
  if (!move) {
    console.error(`Move not found: "${moveName}"`);
    // Suggest closest match
    const allMoves = [...(await import("../lib/calc/data.js")).getMoves().values()];
    const suggestions = allMoves
      .filter((m) => m.name.toLowerCase().includes(moveName!.toLowerCase()))
      .slice(0, 5);
    if (suggestions.length > 0) {
      console.error(`Did you mean: ${suggestions.map((m) => m.name).join(", ")}?`);
    }
    process.exit(1);
  }

  const result = calculateDamage(attacker, defender, moveName!, field);
  console.log(`\n${result.description}`);
  console.log(`Rolls: [${result.rolls.join(", ")}]`);

  if (result.maxDmg > 0) {
    const twoHKOmin = Math.round((result.minDmg * 2 / result.defenderHP) * 1000) / 10;
    const twoHKOmax = Math.round((result.maxDmg * 2 / result.defenderHP) * 1000) / 10;
    console.log(`2HKO: ${twoHKOmin}%-${twoHKOmax}%`);
  }
}
