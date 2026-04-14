import type {
  CalcResult,
  CompetitiveSet,
  FieldConditions,
  MoveData,
  BaseStats,
} from "./types.js";
import { DEFAULT_FIELD } from "./types.js";
import { calcAllStats } from "./stats.js";
import {
  getTypeEffectiveness,
  findMove,
  CONTACT_MOVES,
  SOUND_MOVES,
  PULSE_MOVES,
  SLICING_MOVES,
  PUNCH_MOVES,
  BITE_MOVES,
  TYPE_BOOST_ITEMS,
  RESIST_BERRIES,
} from "./data.js";

/**
 * Calculate damage for a move used by attacker against defender.
 *
 * Follows the Champions (Gen 9) damage formula with all modifiers:
 *   BaseDmg = floor(floor(22 * Power * A / D) / 50 + 2)
 *   FinalDmg = BaseDmg * Modifier chain (with floor after each multiplier)
 *
 * Returns 16 damage rolls (random factor 85-100 / 100).
 */
export function calculateDamage(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  moveName: string,
  field: Partial<FieldConditions> = {}
): CalcResult {
  const f: FieldConditions = { ...DEFAULT_FIELD, ...field };

  // Resolve move
  const move = findMove(moveName);
  if (!move || move.category === "Status") {
    return zeroResult(moveName, move?.type ?? "Normal", defender, 0);
  }

  // Resolve attacker/defender effective types and ability
  const atkAbility = attacker.mega?.ability ?? attacker.ability;
  const defAbility = defender.mega?.ability ?? defender.ability;
  const atkType1 = attacker.mega?.type1 ?? attacker.pokemon.type1;
  const atkType2 = attacker.mega?.type2 ?? attacker.pokemon.type2;
  const defType1 = defender.mega?.type1 ?? defender.pokemon.type1;
  const defType2 = defender.mega?.type2 ?? defender.pokemon.type2;

  // Resolve move type (Dragonize converts Normal → Dragon)
  let moveType = move.type;
  let dragonizeBoost = 1;
  if (atkAbility === "Dragonize" && moveType === "Normal") {
    moveType = "Dragon";
    dragonizeBoost = 1.2;
  }

  // Mega Sol: treat weather as Sun for this attacker
  const effectiveWeather =
    atkAbility === "Mega Sol" ? "sun" : f.weather;

  // Calculate stats
  const atkBaseStats = attacker.mega?.baseStats ?? attacker.pokemon.baseStats;
  const defBaseStats = defender.mega?.baseStats ?? defender.pokemon.baseStats;
  const atkStats = calcAllStats(atkBaseStats, attacker.sp, attacker.nature);
  const defStats = calcAllStats(defBaseStats, defender.sp, defender.nature);

  const isPhysical = move.category === "Physical";
  let A = isPhysical ? atkStats.attack : atkStats.spAtk;
  let D = isPhysical ? defStats.defense : defStats.spDef;
  const defenderHP = defStats.hp;

  // ── Stat stage boosts ──
  const atkBoostKey = isPhysical ? "atk" : "spAtk";
  const defBoostKey = isPhysical ? "def" : "spDef";
  let atkStage = f.statBoosts[atkBoostKey];
  let defStage = f.statBoosts[defBoostKey];

  // Crit ignores negative atk boosts and positive def boosts
  if (f.isCriticalHit) {
    if (atkStage < 0) atkStage = 0;
    if (defStage > 0) defStage = 0;
  }

  A = applyStatStage(A, atkStage);
  D = applyStatStage(D, defStage);

  // ── Ability-based stat modifiers (before damage calc) ──

  // Huge Power / Pure Power: double Attack
  if ((atkAbility === "Huge Power" || atkAbility === "Pure Power") && isPhysical) {
    A = Math.floor(A * 2);
  }

  // Hustle: 1.5x Attack (accuracy penalty not modeled here)
  if (atkAbility === "Hustle" && isPhysical) {
    A = Math.floor(A * 1.5);
  }

  // Overgrow/Blaze/Torrent/Swarm: 1.5x below 1/3 HP (we assume full HP for matrix calcs)
  // Not applied automatically — would need HP tracking

  // Sandstorm: +50% SpDef for Rock types
  if (effectiveWeather === "sand" && !isPhysical) {
    if (defType1 === "Rock" || defType2 === "Rock") {
      D = Math.floor(D * 1.5);
    }
  }

  // Snow: +50% Def for Ice types
  if (effectiveWeather === "snow" && isPhysical) {
    if (defType1 === "Ice" || defType2 === "Ice") {
      D = Math.floor(D * 1.5);
    }
  }

  // Foul Play uses defender's Attack stat
  if (move.name === "Foul Play") {
    A = applyStatStage(isPhysical ? defStats.attack : defStats.spAtk, atkStage);
  }

  // Body Press uses Defense as Attack
  if (move.name === "Body Press") {
    A = applyStatStage(atkStats.defense, atkStage);
  }

  // ── Move power adjustments ──
  let power = move.power;
  if (power === 0) {
    return zeroResult(moveName, moveType, defender, 0);
  }

  // ── Type effectiveness ──
  let effectiveness = getTypeEffectiveness(moveType, defType1, defType2);

  // Ability-based immunities
  if (defAbility === "Levitate" && moveType === "Ground") effectiveness = 0;
  if (defAbility === "Flash Fire" && moveType === "Fire") effectiveness = 0;
  if (defAbility === "Water Absorb" && moveType === "Water") effectiveness = 0;
  if (defAbility === "Volt Absorb" && moveType === "Electric") effectiveness = 0;
  if (defAbility === "Lightning Rod" && moveType === "Electric") effectiveness = 0;
  if (defAbility === "Storm Drain" && moveType === "Water") effectiveness = 0;
  if (defAbility === "Motor Drive" && moveType === "Electric") effectiveness = 0;
  if (defAbility === "Sap Sipper" && moveType === "Grass") effectiveness = 0;
  if (defAbility === "Dry Skin" && moveType === "Water") effectiveness = 0;

  if (effectiveness === 0) {
    return zeroResult(moveName, moveType, defender, 0);
  }

  // ── Base damage ──
  // floor(floor(22 * Power * A / D) / 50 + 2)
  let baseDmg = Math.floor(Math.floor(22 * power * A / D) / 50 + 2);

  // ── Modifier chain (order matters — floor after each) ──

  // 1. Spread move
  const spreadMod = f.isSpread ? 0.75 : 1;

  // 2. Weather
  let weatherMod = 1;
  if (effectiveWeather === "sun") {
    if (moveType === "Fire") weatherMod = 1.5;
    else if (moveType === "Water") weatherMod = 0.5;
  } else if (effectiveWeather === "rain") {
    if (moveType === "Water") weatherMod = 1.5;
    else if (moveType === "Fire") weatherMod = 0.5;
  }

  // 3. Critical hit
  const critMod = f.isCriticalHit ? 1.5 : 1;

  // 4. Random factor — applied per roll (85-100)

  // 5. STAB
  let stabMod = 1;
  const hasSTAB =
    moveType === atkType1 || moveType === atkType2;
  if (hasSTAB) {
    stabMod = atkAbility === "Adaptability" ? 2.0 : 1.5;
  }

  // 6. Type effectiveness (already calculated)

  // 7. Burn
  let burnMod = 1;
  if (f.attackerBurned && isPhysical) {
    burnMod = atkAbility === "Guts" ? 1.5 : 0.5;
  }

  // 8. Screen
  let screenMod = 1;
  if (!f.isCriticalHit) {
    if (isPhysical && (f.defenderSide.isReflect || f.defenderSide.isAuroraVeil)) {
      screenMod = f.isDoubles ? 2 / 3 : 0.5; // Champions: 33% reduction in Doubles
    }
    if (!isPhysical && (f.defenderSide.isLightScreen || f.defenderSide.isAuroraVeil)) {
      screenMod = f.isDoubles ? 2 / 3 : 0.5;
    }
  }

  // 9. Item modifiers
  let itemMod = 1;
  const atkItem = attacker.item.toLowerCase();
  const defItem = defender.item.toLowerCase();

  // Attacker items
  const boostType = TYPE_BOOST_ITEMS[atkItem];
  if (boostType && moveType === boostType) itemMod = 1.2;
  // Note: Expert Belt and Gems are NOT in Champions (verified via Serebii + items.csv)

  // Defender resist berry
  const resistType = RESIST_BERRIES[defItem];
  if (resistType && moveType === resistType && effectiveness > 1) {
    itemMod *= 0.5;
  }

  // 10. Ability modifiers
  let abilityMod = 1;

  // Attacker abilities
  if (atkAbility === "Tough Claws" && CONTACT_MOVES.has(move.name.toLowerCase())) {
    abilityMod *= 1.3;
  }
  if (atkAbility === "Sheer Force" && move.effect && move.effect.length > 0) {
    // Sheer Force boosts moves with secondary effects
    abilityMod *= 1.3;
  }
  if (atkAbility === "Iron Fist" && PUNCH_MOVES.has(move.name.toLowerCase())) {
    abilityMod *= 1.2;
  }
  if (atkAbility === "Mega Launcher" && PULSE_MOVES.has(move.name.toLowerCase())) {
    abilityMod *= 1.5;
  }
  if (atkAbility === "Sharpness" && SLICING_MOVES.has(move.name.toLowerCase())) {
    abilityMod *= 1.5;
  }
  if (atkAbility === "Strong Jaw" && BITE_MOVES.has(move.name.toLowerCase())) {
    abilityMod *= 1.5;
  }
  if (atkAbility === "Reckless" && isRecoilMove(move.name)) {
    abilityMod *= 1.2;
  }
  if (atkAbility === "Sand Force" && effectiveWeather === "sand") {
    if (moveType === "Rock" || moveType === "Ground" || moveType === "Steel") {
      abilityMod *= 1.3;
    }
  }
  if (atkAbility === "Technician" && power <= 60) {
    abilityMod *= 1.5;
  }
  if (atkAbility === "Aerilate" && move.type === "Normal") {
    // Aerilate converts Normal → Flying + 1.2x (moveType already adjusted for Dragonize, not Aerilate)
    // Note: we don't change moveType here since Dragonize already handles the conversion pattern
  }
  if (atkAbility === "Tinted Lens" && effectiveness < 1) {
    abilityMod *= 2; // doubles "not very effective" damage
  }

  // Fairy Aura: field-wide Fairy boost
  if (
    (atkAbility === "Fairy Aura" || defAbility === "Fairy Aura") &&
    moveType === "Fairy"
  ) {
    abilityMod *= 4 / 3; // ~1.33x
  }

  // Dragonize boost (applied after type conversion)
  abilityMod *= dragonizeBoost;

  // Defender abilities
  let defAbilityMod = 1;
  if (defAbility === "Multiscale") {
    // Full HP = halves damage. We assume full HP for consistency.
    defAbilityMod *= 0.5;
  }
  if (defAbility === "Filter" || defAbility === "Solid Rock" || defAbility === "Prism Armor") {
    if (effectiveness > 1) defAbilityMod *= 0.75;
  }
  if (defAbility === "Thick Fat") {
    if (moveType === "Fire" || moveType === "Ice") defAbilityMod *= 0.5;
  }
  if (defAbility === "Fluffy") {
    if (CONTACT_MOVES.has(move.name.toLowerCase())) defAbilityMod *= 0.5;
    if (moveType === "Fire") defAbilityMod *= 2;
  }
  if (defAbility === "Ice Scales" && !isPhysical) {
    defAbilityMod *= 0.5;
  }
  if (defAbility === "Fur Coat" && isPhysical) {
    defAbilityMod *= 0.5;
  }
  if (defAbility === "Heatproof" && moveType === "Fire") {
    defAbilityMod *= 0.5;
  }

  // 11. Friend Guard (ally ability reduces damage by 25%)
  const friendGuardMod = f.defenderSide.isFriendGuard ? 0.75 : 1;

  // 12. Helping Hand
  const helpingHandMod = f.attackerSide.isHelpingHand ? 1.5 : 1;

  // Protect interaction
  let protectMod = 1;
  if (f.defenderSide.isProtect) {
    if (atkAbility === "Piercing Drill" || atkAbility === "Unseen Fist") {
      protectMod = 0.25;
    } else {
      return zeroResult(moveName, moveType, defender, effectiveness);
    }
  }

  // ── Apply modifier chain with floor after each ──
  // Compute 16 damage rolls
  const rolls: number[] = [];
  for (let r = 85; r <= 100; r++) {
    let dmg = baseDmg;
    dmg = applyMod(dmg, spreadMod);
    dmg = applyMod(dmg, weatherMod);
    dmg = applyMod(dmg, critMod);
    dmg = Math.floor(dmg * r / 100); // random factor
    dmg = applyMod(dmg, stabMod);
    dmg = applyMod(dmg, effectiveness);
    dmg = applyMod(dmg, burnMod);
    dmg = applyMod(dmg, screenMod);
    dmg = applyMod(dmg, itemMod);
    dmg = applyMod(dmg, abilityMod);
    dmg = applyMod(dmg, defAbilityMod);
    dmg = applyMod(dmg, friendGuardMod);
    dmg = applyMod(dmg, helpingHandMod);
    dmg = applyMod(dmg, protectMod);
    dmg = Math.max(1, dmg); // minimum 1 damage
    rolls.push(dmg);
  }

  const minDmg = rolls[0];
  const maxDmg = rolls[rolls.length - 1];
  const minPct = Math.round((minDmg / defenderHP) * 1000) / 10;
  const maxPct = Math.round((maxDmg / defenderHP) * 1000) / 10;

  return {
    rolls,
    minDmg,
    maxDmg,
    defenderHP,
    minPct,
    maxPct,
    isOHKO: minDmg >= defenderHP,
    effectiveness,
    moveName: move.name,
    moveType,
    description: formatDescription(attacker, defender, move, moveType, minDmg, maxDmg, defenderHP, minPct, maxPct, effectiveness),
  };
}

// ── Helpers ──

function applyMod(dmg: number, mod: number): number {
  return Math.floor(dmg * mod);
}

function applyStatStage(stat: number, stage: number): number {
  if (stage === 0) return stat;
  if (stage > 0) return Math.floor(stat * (2 + stage) / 2);
  return Math.floor(stat * 2 / (2 - stage));
}

function isRecoilMove(name: string): boolean {
  const recoil = new Set([
    "brave bird", "double-edge", "flare blitz", "head charge", "head smash",
    "high jump kick", "light of ruin", "submission", "take down",
    "volt tackle", "wave crash", "wild charge", "wood hammer",
  ]);
  return recoil.has(name.toLowerCase());
}

function zeroResult(moveName: string, moveType: string, defender: CompetitiveSet, effectiveness: number): CalcResult {
  const defBaseStats = defender.mega?.baseStats ?? defender.pokemon.baseStats;
  const defStats = calcAllStats(defBaseStats, defender.sp, defender.nature);
  return {
    rolls: [0],
    minDmg: 0,
    maxDmg: 0,
    defenderHP: defStats.hp,
    minPct: 0,
    maxPct: 0,
    isOHKO: false,
    effectiveness,
    moveName,
    moveType,
    description: effectiveness === 0
      ? `${moveName} has no effect.`
      : `${moveName} does no damage (Status move or 0 BP).`,
  };
}

function formatDescription(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  move: MoveData,
  moveType: string,
  minDmg: number,
  maxDmg: number,
  defHP: number,
  minPct: number,
  maxPct: number,
  effectiveness: number
): string {
  const atkName = attacker.mega?.megaName ?? attacker.pokemon.name;
  const defName = defender.mega?.megaName ?? defender.pokemon.name;
  const effLabel =
    effectiveness >= 4 ? " (4x SE)" :
    effectiveness >= 2 ? " (SE)" :
    effectiveness <= 0.25 ? " (4x NVE)" :
    effectiveness < 1 ? " (NVE)" : "";
  const ohko = minDmg >= defHP ? " — OHKO guaranteed" : "";
  const twoHKO = !ohko && minDmg * 2 >= defHP ? " — 2HKO guaranteed" : "";

  return `${atkName} ${move.name} vs ${defName}: ${minDmg}-${maxDmg} (${minPct}%-${maxPct}%)${effLabel}${ohko}${twoHKO}`;
}

/**
 * Find the best damaging move from attacker's moveset against defender.
 */
export function bestMove(
  attacker: CompetitiveSet,
  defender: CompetitiveSet,
  field: Partial<FieldConditions> = {}
): CalcResult {
  let best: CalcResult | null = null;
  for (const moveName of attacker.moves) {
    const result = calculateDamage(attacker, defender, moveName, field);
    if (!best || result.maxDmg > best.maxDmg) {
      best = result;
    }
  }
  return best ?? zeroResult("Struggle", "Normal", defender, 1);
}
