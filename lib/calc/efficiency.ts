/**
 * Efficiency coefficient matrix for Pokemon Champions.
 *
 * Computes a composite coefficient E(A,B) on [-1, +1] from 6 weighted sub-scores:
 *   E = 0.30*offense + 0.25*defense + 0.20*speed + 0.10*typing + 0.10*movepool + 0.05*mega
 *
 * Each sub-score is itself on [-1, +1] where positive favors the attacker.
 */

import type {
  CompetitiveSet,
  CalcResult,
  MatchupEntry,
  EfficiencySubScores,
  EfficiencyEntry,
  FieldConditions,
  BaseStats,
} from "./types.js";
import { getTypeEffectiveness, findMove } from "./data.js";
import { calcAllStats, calcStat } from "./stats.js";
import { bestMove } from "./damage.js";
import { generateAllSets, calcMatchupScore, matrixToCSV } from "./matchup.js";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// ── Constant move sets ──

const PRIORITY_MOVES = new Set([
  "fake out", "quick attack", "mach punch", "bullet punch",
  "aqua jet", "shadow sneak", "ice shard", "accelerock",
  "extreme speed", "grassy glide", "sucker punch", "upper hand",
  "jet punch", "first impression",
]);

const SPEED_CONTROL_MOVES = new Set([
  "tailwind", "trick room", "icy wind", "electroweb",
  "thunder wave", "bulldoze", "nuzzle", "scary face",
]);

const MAJOR_SPEED_CONTROL = new Set(["tailwind", "trick room"]);
const MINOR_SPEED_CONTROL = new Set(["icy wind", "electroweb"]);

const BURN_MOVES = new Set(["will-o-wisp"]);
const PARA_MOVES = new Set(["thunder wave", "nuzzle", "glare", "stun spore"]);
const SLEEP_MOVES = new Set(["sleep powder", "spore", "hypnosis", "yawn", "lovely kiss", "sing"]);
const DISRUPT_MOVES = new Set(["encore", "taunt"]);

const SETUP_MOVES = new Set([
  "swords dance", "dragon dance", "nasty plot", "calm mind",
  "shell smash", "belly drum", "iron defense", "amnesia",
  "quiver dance", "shift gear", "coil", "growth", "bulk up",
  "agility", "rock polish", "curse", "work up",
]);

const BELLY_DRUM = "belly drum";

// ── Weights ──

const W_OFFENSE = 0.30;
const W_DEFENSE = 0.25;
const W_SPEED = 0.20;
const W_TYPING = 0.10;
const W_MOVEPOOL = 0.10;
const W_MEGA = 0.05;

// ── Helpers ──

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getEffectiveTypes(set: CompetitiveSet): { type1: string; type2: string | null } {
  return {
    type1: set.mega?.type1 ?? set.pokemon.type1,
    type2: set.mega?.type2 ?? set.pokemon.type2,
  };
}

function getEffectiveStats(set: CompetitiveSet): BaseStats {
  return calcAllStats(
    set.mega?.baseStats ?? set.pokemon.baseStats,
    set.sp,
    set.nature,
  );
}

function getEffectiveSpeed(set: CompetitiveSet): number {
  const base = set.mega?.baseStats ?? set.pokemon.baseStats;
  return calcStat(base.speed, set.sp.speed, set.nature.plus === "speed" ? 1.1 : set.nature.minus === "speed" ? 0.9 : 1.0, false);
}

function getEffectiveAbility(set: CompetitiveSet): string {
  return set.mega?.ability ?? set.ability;
}

/** Full movepool from PokemonData (all learnable moves, not just selected 4). */
function getFullMovepool(set: CompetitiveSet): string[] {
  return set.pokemon.moves;
}

// ── Pikalytics loader ──

interface PikalyticsUsage {
  usagePct: number;
}

function loadPikalyticsUsage(): Map<string, PikalyticsUsage> {
  const raw = readFileSync(join(ROOT, "pikalytics_usage.csv"), "utf-8");
  const rows: Record<string, string>[] = parse(raw, { columns: true, skip_empty_lines: true });
  const map = new Map<string, PikalyticsUsage>();
  for (const row of rows) {
    const name = row.pokemon.trim().toLowerCase();
    map.set(name, { usagePct: parseFloat(row.usage_pct) || 0 });
  }
  return map;
}

// ── Median bulk pre-computation ──

export interface MedianBulk {
  physical: number; // median HP * Def
  special: number;  // median HP * SpDef
}

export function computeMedianBulk(sets: CompetitiveSet[]): MedianBulk {
  const physBulk: number[] = [];
  const specBulk: number[] = [];
  for (const set of sets) {
    const stats = getEffectiveStats(set);
    physBulk.push(stats.hp * stats.defense);
    specBulk.push(stats.hp * stats.spDef);
  }
  physBulk.sort((a, b) => a - b);
  specBulk.sort((a, b) => a - b);
  const mid = Math.floor(physBulk.length / 2);
  return {
    physical: physBulk[mid],
    special: specBulk[mid],
  };
}

// ── Sub-score: Offensive Threat ──

function calcOffenseScore(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  atkResult: CalcResult,
): number {
  // 1. Damage percent normalized (150% cap)
  const damagePctNorm = clamp(atkResult.maxPct / 150, 0, 1);

  // 2. OHKO flag (guaranteed at min roll)
  const ohko = atkResult.minPct >= 100 ? 1 : 0;

  // 3. 2HKO flag (guaranteed at min roll)
  const twoHKO = atkResult.minPct >= 50 ? 1 : 0;

  // 4. Coverage depth: fraction of attacker's 4 moves that are SE vs defender
  const defTypes = getEffectiveTypes(defender);
  let seCount = 0;
  for (const moveName of attacker.moves) {
    const move = findMove(moveName);
    if (!move || move.category === "Status" || move.power === 0) continue;
    const eff = getTypeEffectiveness(move.type, defTypes.type1, defTypes.type2);
    if (eff >= 2) seCount++;
  }
  const coverageDepth = clamp(seCount / 4, 0, 1);

  // Combine and map [0,1] -> [-1,+1]
  const raw = 0.50 * damagePctNorm + 0.20 * ohko + 0.15 * twoHKO + 0.15 * coverageDepth;
  return 2 * raw - 1;
}

// ── Sub-score: Defensive Resilience ──

function calcDefenseScore(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  defResult: CalcResult, // defender's best move vs attacker (reverse)
  medianBulk: MedianBulk,
): number {
  // 1. Survival margin: positive = survives, negative = gets KO'd
  const survivalMargin = clamp((100 - defResult.maxPct) / 100, -1, 1);

  // 2. Bulk ratio vs median
  const atkStats = getEffectiveStats(attacker);
  const bestMoveData = findMove(defResult.moveName);
  const isPhysical = bestMoveData?.category === "Physical";
  const relevantBulk = isPhysical
    ? atkStats.hp * atkStats.defense
    : atkStats.hp * atkStats.spDef;
  const medianRef = isPhysical ? medianBulk.physical : medianBulk.special;
  const bulkRatio = clamp(relevantBulk / medianRef, 0.5, 2.0);
  const bulkNorm = (bulkRatio - 0.5) / 1.5; // map [0.5, 2.0] -> [0, 1]

  // 3. Type resistance count against defender's STAB types
  const atkTypes = getEffectiveTypes(attacker);
  const defTypes = getEffectiveTypes(defender);
  let resistCount = 0;
  for (const stabType of [defTypes.type1, defTypes.type2]) {
    if (!stabType) continue;
    const eff = getTypeEffectiveness(stabType, atkTypes.type1, atkTypes.type2);
    if (eff === 0) resistCount += 2;      // immunity counts double
    else if (eff <= 0.5) resistCount += 1; // resist
  }
  const typeResistNorm = clamp(resistCount / 4, 0, 1);

  // Combine: map survival margin from [-1,1]->[0,1] for internal weighting
  const survNorm = (survivalMargin + 1) / 2;
  const raw = 0.60 * survNorm + 0.25 * bulkNorm + 0.15 * typeResistNorm;
  return 2 * raw - 1;
}

// ── Sub-score: Speed Dynamics ──

function calcSpeedScore(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
): { score: number; trickRoomFavor: number; priorityNet: number } {
  const atkSpeed = getEffectiveSpeed(attacker);
  const defSpeed = getEffectiveSpeed(defender);

  // 1. Raw speed difference (continuous, 50pt gap maxes out)
  const rawSpeedDiff = clamp((atkSpeed - defSpeed) / 50, -1, 1);

  // 2. Trick Room favorability
  let trickRoomFavor = 0;
  if (atkSpeed < defSpeed && atkSpeed <= 65) {
    // Slow attacker vs faster defender: TR favors attacker
    trickRoomFavor = clamp((defSpeed - atkSpeed) / 50, 0, 1);
  } else if (atkSpeed >= 100 && defSpeed < atkSpeed) {
    // Fast attacker is vulnerable to TR
    trickRoomFavor = -0.3;
  }

  // 3. Priority move access (net: attacker - defender)
  const atkTypes = getEffectiveTypes(attacker);
  const defTypes = getEffectiveTypes(defender);

  let atkPriority = 0;
  for (const moveName of attacker.moves) {
    if (PRIORITY_MOVES.has(moveName.toLowerCase())) {
      const move = findMove(moveName);
      if (move && move.power > 0) {
        const eff = getTypeEffectiveness(move.type, defTypes.type1, defTypes.type2);
        if (eff > 0) {
          atkPriority = moveName.toLowerCase() === "extreme speed" ? 0.8 : Math.max(atkPriority, 0.5);
        }
      }
    }
  }
  let defPriority = 0;
  for (const moveName of defender.moves) {
    if (PRIORITY_MOVES.has(moveName.toLowerCase())) {
      const move = findMove(moveName);
      if (move && move.power > 0) {
        const eff = getTypeEffectiveness(move.type, atkTypes.type1, atkTypes.type2);
        if (eff > 0) {
          defPriority = moveName.toLowerCase() === "extreme speed" ? 0.8 : Math.max(defPriority, 0.5);
        }
      }
    }
  }
  const priorityNet = clamp(atkPriority - defPriority, -1, 1);

  // 4. Speed control access (scan full movepool, not just selected 4)
  function speedControlValue(set: CompetitiveSet): number {
    let val = 0;
    for (const m of getFullMovepool(set)) {
      const ml = m.toLowerCase();
      if (MAJOR_SPEED_CONTROL.has(ml)) val += 0.3;
      else if (MINOR_SPEED_CONTROL.has(ml)) val += 0.15;
      else if (ml === "thunder wave" || ml === "nuzzle") val += 0.1;
    }
    return Math.min(val, 0.5);
  }
  const speedControlNet = clamp(speedControlValue(attacker) - speedControlValue(defender), -1, 1);

  // Combined
  const score = clamp(
    0.40 * rawSpeedDiff + 0.25 * trickRoomFavor + 0.20 * priorityNet + 0.15 * speedControlNet,
    -1, 1,
  );

  return { score, trickRoomFavor, priorityNet };
}

// ── Sub-score: Type Advantage Profile ──

function calcTypingScore(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
): number {
  const atkTypes = getEffectiveTypes(attacker);
  const defTypes = getEffectiveTypes(defender);

  // 1. Net STAB effectiveness (log2 scale)
  function bestSTABEff(atkT: { type1: string; type2: string | null }, defT: { type1: string; type2: string | null }): number {
    let best = getTypeEffectiveness(atkT.type1, defT.type1, defT.type2);
    if (atkT.type2) {
      best = Math.max(best, getTypeEffectiveness(atkT.type2, defT.type1, defT.type2));
    }
    return best;
  }

  const effA = bestSTABEff(atkTypes, defTypes);
  const effB = bestSTABEff(defTypes, atkTypes);

  function safeLog2(eff: number): number {
    if (eff === 0) return -3; // immunity
    return Math.log2(eff);
  }

  const netLog = safeLog2(effA) - safeLog2(effB);
  const netSTABNorm = clamp(netLog / 3, -1, 1);

  // 2. Resistance balance
  function countResists(defT: { type1: string; type2: string | null }, atkT: { type1: string; type2: string | null }): number {
    let count = 0;
    for (const stabType of [atkT.type1, atkT.type2]) {
      if (!stabType) continue;
      const eff = getTypeEffectiveness(stabType, defT.type1, defT.type2);
      if (eff === 0) count += 2;
      else if (eff <= 0.5) count += 1;
    }
    return count;
  }

  const atkResists = countResists(atkTypes, defTypes); // A resists B's STABs
  const defResists = countResists(defTypes, atkTypes); // B resists A's STABs
  const resistBalance = clamp((atkResists - defResists) / 4, -1, 1);

  return clamp(0.70 * netSTABNorm + 0.30 * resistBalance, -1, 1);
}

// ── Sub-score: Move Pool Flexibility ──

function calcMovepoolScore(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  reverseResult: CalcResult, // defender's best move vs attacker
): { score: number; coverageTypes: number; statusThreatNet: number; setupPotentialNet: number } {
  const atkTypes = getEffectiveTypes(attacker);
  const defTypes = getEffectiveTypes(defender);
  const defStats = (defender.mega?.baseStats ?? defender.pokemon.baseStats);
  const atkStats = (attacker.mega?.baseStats ?? attacker.pokemon.baseStats);

  // 1. Coverage type diversity among selected 4 moves
  const moveTypesA = new Set<string>();
  for (const moveName of attacker.moves) {
    const move = findMove(moveName);
    if (move && move.category !== "Status" && move.power > 0) {
      moveTypesA.add(move.type);
    }
  }
  const moveTypesB = new Set<string>();
  for (const moveName of defender.moves) {
    const move = findMove(moveName);
    if (move && move.category !== "Status" && move.power > 0) {
      moveTypesB.add(move.type);
    }
  }
  const coverageTypesA = Math.min(moveTypesA.size / 5, 1.0);
  const coverageTypesB = Math.min(moveTypesB.size / 5, 1.0);

  // 2. Status threat (scan full movepool, context-dependent)
  function statusThreat(
    atkSet: CompetitiveSet,
    defSet: CompetitiveSet,
    dStats: BaseStats,
    dSpeed: number,
  ): number {
    let threat = 0;
    const pool = getFullMovepool(atkSet);
    for (const m of pool) {
      const ml = m.toLowerCase();
      // Burn vs physical defender
      if (BURN_MOVES.has(ml) && dStats.attack >= dStats.spAtk) threat += 0.4;
      // Paralysis vs fast defender
      if (PARA_MOVES.has(ml) && dSpeed >= 90) threat += 0.3;
      // Sleep is universally threatening
      if (SLEEP_MOVES.has(ml)) threat += 0.3;
      // Disruption
      if (DISRUPT_MOVES.has(ml)) threat += 0.2;
    }
    return Math.min(threat, 1.0);
  }

  const atkStatusThreat = statusThreat(attacker, defender, defStats, getEffectiveSpeed(defender));
  const defStatusThreat = statusThreat(defender, attacker, atkStats, getEffectiveSpeed(attacker));
  const statusThreatNet = clamp(atkStatusThreat - defStatusThreat, -1, 1);

  // 3. Setup potential: can A set up against B?
  function setupPotential(
    atkSet: CompetitiveSet,
    reversePct: number, // opponent's best move % vs this Pokemon
  ): number {
    if (reversePct >= 100) return 0; // can't set up if OHKO'd
    const pool = getFullMovepool(atkSet);
    let hasSetup = false;
    let hasBellyDrum = false;
    for (const m of pool) {
      const ml = m.toLowerCase();
      if (SETUP_MOVES.has(ml)) hasSetup = true;
      if (ml === BELLY_DRUM) hasBellyDrum = true;
    }
    if (!hasSetup) return 0;
    if (reversePct < 50) {
      return hasBellyDrum ? 0.8 : 0.5;
    }
    // Can survive one hit but it's close — reduced value
    return 0.2;
  }

  // For setup potential we need the reverse: what does defender do to attacker?
  // reverseResult.maxPct = defender's best move damage % vs attacker
  const atkSetup = setupPotential(attacker, reverseResult.maxPct);
  // For defender's setup potential, we need attacker's best move damage % vs defender.
  // We use the forward CalcResult info embedded in the MatchupEntry later,
  // but here we need to call bestMove for the forward direction too.
  // Instead, we approximate: if attacker's coverage depth is high, defender can't easily set up.
  // Actually, the caller will pass both forward and reverse results. Let's use the matchup data.
  // For now, we compute the forward result inline to get attacker's dmg% vs defender.
  const fwdResult = bestMove(attacker, defender);
  const defSetup = setupPotential(defender, fwdResult.maxPct);
  const setupPotentialNet = clamp(atkSetup - defSetup, -1, 1);

  const score = clamp(
    0.35 * (coverageTypesA - coverageTypesB) + 0.40 * statusThreatNet + 0.25 * setupPotentialNet,
    -1, 1,
  );

  return { score, coverageTypes: coverageTypesA, statusThreatNet, setupPotentialNet };
}

// ── Sub-score: Mega Context ──

function calcMegaScore(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  reverseResult: CalcResult,
): number {
  const atkIsMega = attacker.mega !== undefined;
  const defIsMega = defender.mega !== undefined;

  let base = 0;
  if (atkIsMega && !defIsMega) base = -0.3;  // opportunity cost
  else if (!atkIsMega && defIsMega) base = 0.3; // efficient

  // Ability-specific modifiers
  if (atkIsMega) {
    const ability = attacker.mega!.ability;
    const defTypes = getEffectiveTypes(defender);

    // Shadow Tag trapping (Mega Gengar) vs non-Ghost
    if (ability === "Shadow Tag" && defTypes.type1 !== "Ghost" && defTypes.type2 !== "Ghost") {
      base += 0.15;
    }

    // Magic Bounce vs status-heavy defender
    if (ability === "Magic Bounce") {
      const defPool = getFullMovepool(defender);
      let hasStatus = false;
      for (const m of defPool) {
        const ml = m.toLowerCase();
        if (BURN_MOVES.has(ml) || PARA_MOVES.has(ml) || SLEEP_MOVES.has(ml) || DISRUPT_MOVES.has(ml)) {
          hasStatus = true;
          break;
        }
      }
      if (hasStatus) base += 0.10;
    }

    // Multiscale (Mega Dragonite) when defender can't break it
    if (ability === "Multiscale" && reverseResult.maxPct < 50) {
      base += 0.10;
    }
  }

  return clamp(base, -1, 1);
}

// ── Composite efficiency calculation ──

export function calcEfficiency(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  matchup: MatchupEntry,
  atkResult: CalcResult,
  defResult: CalcResult, // defender's best move vs attacker (reverse)
  medianBulk: MedianBulk,
  defUsagePct: number,
  maxUsage: number,
): EfficiencyEntry {
  const offenseScore = calcOffenseScore(attacker, defender, atkResult);
  const defenseScore = calcDefenseScore(attacker, defender, defResult, medianBulk);
  const { score: speedScore, trickRoomFavor, priorityNet } = calcSpeedScore(attacker, defender);
  const typingScore = calcTypingScore(attacker, defender);
  const { score: movepoolScore, coverageTypes, statusThreatNet, setupPotentialNet } = calcMovepoolScore(attacker, defender, defResult);
  const megaScore = calcMegaScore(attacker, defender, defResult);

  const efficiency =
    W_OFFENSE * offenseScore +
    W_DEFENSE * defenseScore +
    W_SPEED * speedScore +
    W_TYPING * typingScore +
    W_MOVEPOOL * movepoolScore +
    W_MEGA * megaScore;

  const metaWeight = maxUsage > 0 ? (defUsagePct > 0 ? defUsagePct / maxUsage : 0.05) : 0.05;

  // Coverage depth for diagnostics
  const defTypes = getEffectiveTypes(defender);
  let seCount = 0;
  for (const moveName of attacker.moves) {
    const move = findMove(moveName);
    if (!move || move.category === "Status" || move.power === 0) continue;
    if (getTypeEffectiveness(move.type, defTypes.type1, defTypes.type2) >= 2) seCount++;
  }

  const subScores: EfficiencySubScores = {
    offenseScore,
    defenseScore,
    speedScore,
    typingScore,
    movepoolScore,
    megaScore,
    isOHKO: atkResult.minPct >= 100,
    is2HKO: atkResult.minPct >= 50,
    coverageDepth: clamp(seCount / 4, 0, 1),
    survivalMargin: clamp((100 - defResult.maxPct) / 100, -1, 1),
    trickRoomFavor,
    priorityNet,
    coverageTypes,
    statusThreatNet,
    setupPotentialNet,
  };

  return {
    ...matchup,
    subScores,
    efficiency: Math.round(efficiency * 1000) / 1000,
    metaWeight: Math.round(metaWeight * 1000) / 1000,
    isMeta: defUsagePct > 0,
  };
}

// ── Full matrix builder ──

export function buildEfficiencyMatrix(
  sets?: CompetitiveSet[],
  field?: Partial<FieldConditions>,
): EfficiencyEntry[] {
  const allSets = sets ?? generateAllSets();
  const medianBulk = computeMedianBulk(allSets);
  const pikalytics = loadPikalyticsUsage();

  // Find max usage for normalization
  let maxUsage = 0;
  for (const entry of pikalytics.values()) {
    if (entry.usagePct > maxUsage) maxUsage = entry.usagePct;
  }

  const entries: EfficiencyEntry[] = [];
  const total = allSets.length;

  console.log(`Building ${total}x${total} efficiency matrix (${total * (total - 1)} pairs)...`);
  console.log(`  Median bulk: physical=${medianBulk.physical}, special=${medianBulk.special}`);

  let count = 0;
  for (let i = 0; i < total; i++) {
    for (let j = 0; j < total; j++) {
      if (i === j) continue;

      const attacker = allSets[i];
      const defender = allSets[j];

      // Compute base matchup
      const matchup = calcMatchupScore(attacker, defender, field);

      // Get the CalcResult objects for sub-score calculations
      const atkResult = bestMove(attacker, defender, field);
      const defResult = bestMove(defender, attacker, field);

      // Defender usage
      const defName = (defender.mega?.basePokemon ?? defender.pokemon.name).toLowerCase();
      const defUsage = pikalytics.get(defName)?.usagePct ?? 0;

      entries.push(calcEfficiency(
        attacker, defender, matchup, atkResult, defResult,
        medianBulk, defUsage, maxUsage,
      ));

      count++;
      if (count % 10000 === 0) {
        process.stdout.write(`\r  ${count}/${total * (total - 1)} pairs calculated...`);
      }
    }
  }
  console.log(`\r  Done! ${count} efficiency entries calculated.`);

  return entries;
}

// ── CSV export ──

export function efficiencyToCSV(entries: EfficiencyEntry[]): string {
  const header = [
    "attacker", "defender", "best_move", "damage_pct", "reverse_move", "reverse_pct",
    "speed_advantage", "old_score",
    "offense_score", "defense_score", "speed_score", "typing_score", "movepool_score", "mega_score",
    "efficiency", "meta_weight", "is_meta",
    "is_ohko", "is_2hko", "coverage_depth", "survival_margin",
    "trick_room_favor", "priority_net", "coverage_types", "status_threat_net", "setup_potential_net",
  ].join(",");

  const rows = entries.map((e) => [
    e.attacker,
    e.defender,
    e.bestMove,
    e.damagePct,
    e.reverseMove,
    e.reversePct,
    e.speedAdvantage,
    e.score,
    e.subScores.offenseScore.toFixed(3),
    e.subScores.defenseScore.toFixed(3),
    e.subScores.speedScore.toFixed(3),
    e.subScores.typingScore.toFixed(3),
    e.subScores.movepoolScore.toFixed(3),
    e.subScores.megaScore.toFixed(3),
    e.efficiency,
    e.metaWeight,
    e.isMeta ? 1 : 0,
    e.subScores.isOHKO ? 1 : 0,
    e.subScores.is2HKO ? 1 : 0,
    e.subScores.coverageDepth.toFixed(3),
    e.subScores.survivalMargin.toFixed(3),
    e.subScores.trickRoomFavor.toFixed(3),
    e.subScores.priorityNet.toFixed(3),
    e.subScores.coverageTypes.toFixed(3),
    e.subScores.statusThreatNet.toFixed(3),
    e.subScores.setupPotentialNet.toFixed(3),
  ].join(","));

  return [header, ...rows].join("\n");
}
