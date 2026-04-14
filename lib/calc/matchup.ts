import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  CompetitiveSet,
  StatSpread,
  Nature,
  MatchupEntry,
  BaseStats,
  FieldConditions,
  PokemonData,
  MegaData,
} from "./types.js";
import { getPokemon, getMegas, findMove } from "./data.js";
import { calculateDamage, bestMove } from "./damage.js";
import { calcStat } from "./stats.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// ── Load translations (Italian → English) ──

interface Translations {
  moves: Record<string, string>;
  items: Record<string, string>;
  abilities: Record<string, string>;
}

let _translations: Translations | null = null;
function getTranslations(): Translations {
  if (_translations) return _translations;
  _translations = JSON.parse(readFileSync(join(ROOT, "lib", "translations.json"), "utf-8"));
  return _translations!;
}

function translateMove(name: string): string {
  return getTranslations().moves[name] ?? name;
}

function translateItem(name: string): string {
  return getTranslations().items[name] ?? name;
}

function translateAbility(name: string): string {
  return getTranslations().abilities[name] ?? name;
}

// ── Parse Pikalytics usage data into standard sets ──

interface PikalyticsEntry {
  pokemon: string;
  usagePct: number;
  topMoves: string[];
  topItem: string;
  topAbility: string;
}

function loadPikalytics(): Map<string, PikalyticsEntry> {
  const raw = readFileSync(join(ROOT, "pikalytics_usage.csv"), "utf-8");
  const rows: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  });

  const map = new Map<string, PikalyticsEntry>();

  for (const row of rows) {
    const name = row.pokemon.trim();

    // Parse top moves (format: "MoveName:percentage|...")
    const moveParts = (row.top_moves || "").split("|");
    const topMoves = moveParts
      .map((p) => translateMove(p.split(":")[0].trim()))
      .filter((m) => m.length > 0)
      .slice(0, 4);

    // Parse top item (first item)
    const itemParts = (row.top_items || "").split("|");
    const topItem = translateItem(itemParts[0]?.split(":")[0]?.trim() || "");

    // Parse top ability
    const abilityParts = (row.top_abilities || "").split("|");
    const topAbility = translateAbility(abilityParts[0]?.split(":")[0]?.trim() || "");

    map.set(name.toLowerCase(), {
      pokemon: name,
      usagePct: parseFloat(row.usage_pct) || 0,
      topMoves,
      topItem,
      topAbility,
    });
  }

  return map;
}

// ── Generate standard competitive sets for all Pokemon ──

export function generateAllSets(): CompetitiveSet[] {
  const pokemon = getPokemon();
  const megas = getMegas();
  const pikalytics = loadPikalytics();
  const sets: CompetitiveSet[] = [];

  // Base form sets
  for (const mon of pokemon.values()) {
    const pika = pikalytics.get(mon.name.toLowerCase());
    sets.push(buildStandardSet(mon, undefined, pika));
  }

  // Mega form sets
  for (const mega of megas.values()) {
    const baseMon = pokemon.get(mega.basePokemon.toLowerCase());
    if (!baseMon) continue;
    const pika = pikalytics.get(baseMon.name.toLowerCase());
    sets.push(buildStandardSet(baseMon, mega, pika));
  }

  return sets;
}

function buildStandardSet(
  pokemon: PokemonData,
  mega: MegaData | undefined,
  pika: PikalyticsEntry | undefined
): CompetitiveSet {
  const effectiveStats = mega?.baseStats ?? pokemon.baseStats;
  const effectiveAbility = mega?.ability ?? (pika?.topAbility || pokemon.abilities[0]);

  // Determine if physical or special attacker
  const isPhysical = effectiveStats.attack >= effectiveStats.spAtk;

  // SP spread
  const sp: StatSpread = isPhysical
    ? { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 2, speed: 32 }
    : { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 2, speed: 32 };

  // Nature
  const nature: Nature = isPhysical
    ? { plus: "attack", minus: "spAtk" }
    : { plus: "spAtk", minus: "attack" };

  // Moves: use Pikalytics top 4, or pick best STAB + coverage
  let moves: string[];
  if (pika && pika.topMoves.length >= 2) {
    // Use Pikalytics moves, filter to damaging ones that exist in movepool
    moves = pika.topMoves
      .filter((m) => {
        const move = findMove(m);
        return move && move.category !== "Status" && move.power > 0;
      })
      .slice(0, 4);

    // If less than 2 damaging moves from Pikalytics, fill with auto-pick
    if (moves.length < 2) {
      moves = pickBestMoves(pokemon, mega, isPhysical);
    }
  } else {
    moves = pickBestMoves(pokemon, mega, isPhysical);
  }

  const item = pika?.topItem || "";

  return {
    pokemon,
    mega,
    ability: effectiveAbility,
    item,
    nature,
    sp,
    moves,
  };
}

function pickBestMoves(
  pokemon: PokemonData,
  mega: MegaData | undefined,
  isPhysical: boolean
): string[] {
  const type1 = mega?.type1 ?? pokemon.type1;
  const type2 = mega?.type2 ?? pokemon.type2;
  const category = isPhysical ? "Physical" : "Special";

  const scored: { name: string; score: number }[] = [];

  for (const moveName of pokemon.moves) {
    const move = findMove(moveName);
    if (!move || move.category === "Status" || move.power === 0) continue;

    let score = move.power;

    // Prefer matching category
    if (move.category === category) score *= 1.3;

    // STAB bonus
    if (move.type === type1 || move.type === type2) score *= 1.5;

    // Slight accuracy penalty
    if (move.accuracy < 100 && move.accuracy !== 101) score *= move.accuracy / 100;

    scored.push({ name: move.name, score });
  }

  scored.sort((a, b) => b.score - a.score);

  // Pick top moves, ensuring type diversity
  const picked: string[] = [];
  const pickedTypes = new Set<string>();

  for (const { name } of scored) {
    const move = findMove(name)!;
    if (picked.length < 2 || !pickedTypes.has(move.type)) {
      picked.push(name);
      pickedTypes.add(move.type);
    }
    if (picked.length >= 4) break;
  }

  return picked;
}

// ── Calculate matchup score ──

export function calcMatchupScore(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  field?: Partial<FieldConditions>
): MatchupEntry {
  const atkBest = bestMove(attacker, defender, field);
  const defBest = bestMove(defender, attacker, field);

  const atkName = attacker.mega?.megaName ?? attacker.pokemon.name;
  const defName = defender.mega?.megaName ?? defender.pokemon.name;

  // Speed comparison with U-curve
  const atkBaseStats = attacker.mega?.baseStats ?? attacker.pokemon.baseStats;
  const defBaseStats = defender.mega?.baseStats ?? defender.pokemon.baseStats;
  const atkSpeed = calcStat(atkBaseStats.speed, attacker.sp.speed, 1.1, false);
  const defSpeed = calcStat(defBaseStats.speed, defender.sp.speed, 1.1, false);
  const speedAdvantage = speedUCurve(atkSpeed, defSpeed);

  // Combined score: offensive pressure - defensive pressure + speed
  // Higher = attacker favored
  const offensiveScore = atkBest.maxPct / 100; // 0-3+ range
  const defensiveScore = defBest.maxPct / 100;
  const score = Math.round((offensiveScore - defensiveScore + speedAdvantage * 0.3) * 100) / 100;

  return {
    attacker: atkName,
    defender: defName,
    bestMove: atkBest.moveName,
    damagePct: atkBest.maxPct,
    reverseMove: defBest.moveName,
    reversePct: defBest.maxPct,
    speedAdvantage,
    score,
  };
}

/**
 * Speed U-curve scoring:
 *   Fast (>110): +1.0 (strong advantage — outspeeds most)
 *   Medium-fast (90-110): +0.3
 *   Medium (60-89): 0 (worst — too slow to outspeed, too fast for TR)
 *   Slow (30-59): +0.5 (good for Trick Room)
 *   Very slow (<30): +0.7 (great for TR)
 *
 * Returns relative advantage: positive = attacker favored.
 */
function speedUCurve(atkSpeed: number, defSpeed: number): number {
  const atkTier = speedTier(atkSpeed);
  const defTier = speedTier(defSpeed);
  return atkTier - defTier;
}

function speedTier(speed: number): number {
  if (speed >= 130) return 1.0;
  if (speed >= 110) return 0.8;
  if (speed >= 90) return 0.3;
  if (speed >= 60) return 0.0;
  if (speed >= 30) return 0.5;
  return 0.7;
}

// ── Build full matchup matrix ──

export function buildMatchupMatrix(
  sets?: CompetitiveSet[],
  field?: Partial<FieldConditions>
): MatchupEntry[] {
  const allSets = sets ?? generateAllSets();
  const entries: MatchupEntry[] = [];
  const total = allSets.length;

  console.log(`Building ${total}x${total} matchup matrix (${total * total} pairs)...`);

  let count = 0;
  for (let i = 0; i < total; i++) {
    for (let j = 0; j < total; j++) {
      if (i === j) continue; // skip self-matchups
      entries.push(calcMatchupScore(allSets[i], allSets[j], field));
      count++;
      if (count % 10000 === 0) {
        process.stdout.write(`\r  ${count}/${total * (total - 1)} pairs calculated...`);
      }
    }
  }
  console.log(`\r  Done! ${count} matchup pairs calculated.`);

  return entries;
}

/**
 * Convert matchup matrix to CSV string.
 */
export function matrixToCSV(entries: MatchupEntry[]): string {
  const header = "attacker,defender,best_move,damage_pct,reverse_move,reverse_pct,speed_advantage,score";
  const rows = entries.map((e) =>
    [
      e.attacker,
      e.defender,
      e.bestMove,
      e.damagePct,
      e.reverseMove,
      e.reversePct,
      e.speedAdvantage,
      e.score,
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
