/**
 * Validation test suite for the Champions damage calculator.
 *
 * Tests stat calculations and damage outputs against expected values.
 * Run: npx tsx scripts/test-calc.ts
 */

import { calcAllStats, calcStat } from "../lib/calc/stats.js";
import { findPokemon, findMega, findMove, getTypeEffectiveness } from "../lib/calc/data.js";
import { calculateDamage } from "../lib/calc/damage.js";
import type { CompetitiveSet, StatSpread, Nature } from "../lib/calc/types.js";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertRange(label: string, actual: number, min: number, max: number) {
  const pass = actual >= min && actual <= max;
  if (pass) {
    passed++;
    console.log(`  ✓ ${label}: ${actual} (in range ${min}-${max})`);
  } else {
    failed++;
    console.log(`  ✗ ${label}: ${actual} NOT in range ${min}-${max}`);
  }
}

function makeSet(name: string, opts: {
  mega?: boolean;
  sp?: StatSpread;
  nature?: Nature;
  ability?: string;
  item?: string;
  moves?: string[];
}): CompetitiveSet {
  const mon = findPokemon(name)!;
  const mega = opts.mega ? findMega(name) : undefined;
  const sp = opts.sp ?? { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 };
  const nature = opts.nature ?? { plus: "attack", minus: "spAtk" };
  return {
    pokemon: mon,
    mega,
    ability: opts.ability ?? mega?.ability ?? mon.abilities[0],
    item: opts.item ?? "",
    nature,
    sp,
    moves: opts.moves ?? mon.moves,
  };
}

// ── Test 1: Stat calculations ──

console.log("\n=== Stat Calculation Tests ===");

// Garchomp base: HP 108, Atk 130, Def 95, SpA 80, SpD 85, Spe 102
const garchomp = findPokemon("Garchomp")!;
const garchompStats = calcAllStats(
  garchomp.baseStats,
  { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  { plus: "attack", minus: "spAtk" }
);

// HP: floor((2*108 + 31 + 0) * 50/100) + 60 = floor(247*50/100) + 60 = 123 + 60 = 183
assert("Garchomp HP (0 SP)", garchompStats.hp, 183);

// Atk: floor((floor((2*130 + 31 + 64) * 50/100) + 5) * 1.1) = floor((floor(355*50/100)+5)*1.1)
// = floor((177+5)*1.1) = floor(182*1.1) = floor(200.2) = 200
assert("Garchomp Atk (32 SP, +Atk)", garchompStats.attack, 200);

// Spe: floor((floor((2*102 + 31 + 64) * 50/100) + 5) * 1.0) = floor((149+5)*1.0) = 154
assert("Garchomp Spe (32 SP, neutral)", garchompStats.speed, 154);

// SpA: floor((floor((2*80 + 31 + 0) * 50/100) + 5) * 0.9) = floor((95+5)*0.9) = floor(90) = 90
assert("Garchomp SpA (0 SP, -SpA)", garchompStats.spAtk, 90);

// Incineroar base: HP 95, Atk 115, Def 90, SpA 80, SpD 90, Spe 60
const incineroar = findPokemon("Incineroar")!;
const inciStats = calcAllStats(
  incineroar.baseStats,
  { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
  { plus: null, minus: null }
);

// HP: floor((2*95 + 31 + 64) * 50/100) + 60 = floor(285*50/100) + 60 = 142 + 60 = 202
assert("Incineroar HP (32 SP)", inciStats.hp, 202);

// Def: floor((floor((2*90 + 31 + 0) * 50/100) + 5) * 1.0) = floor(105+5) = 110
assert("Incineroar Def (0 SP, neutral)", inciStats.defense, 110);

// ── Test 2: Type effectiveness ──

console.log("\n=== Type Effectiveness Tests ===");
assert("Ground vs Fire", getTypeEffectiveness("Ground", "Fire", null), 2);
assert("Ground vs Fire/Dark", getTypeEffectiveness("Ground", "Fire", "Dark"), 2);
assert("Ice vs Dragon/Ground", getTypeEffectiveness("Ice", "Dragon", "Ground"), 4);
assert("Normal vs Ghost", getTypeEffectiveness("Normal", "Ghost", null), 0);
assert("Fire vs Water/Dragon", getTypeEffectiveness("Fire", "Water", "Dragon"), 0.25);
assert("Fairy vs Dragon", getTypeEffectiveness("Fairy", "Dragon", null), 2);
assert("Dragon vs Fairy", getTypeEffectiveness("Dragon", "Fairy", null), 0);

// ── Test 3: Damage calculations ──

console.log("\n=== Damage Calculation Tests ===");

// Test: Garchomp Earthquake vs Incineroar (physical, SE)
const atkGarchomp = makeSet("Garchomp", {
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: "attack", minus: "spAtk" },
});
const defIncineroar = makeSet("Incineroar", {
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 2, speed: 0 },
  nature: { plus: null, minus: null },
});

const result1 = calculateDamage(atkGarchomp, defIncineroar, "Earthquake");
console.log(`  ${result1.description}`);
assert("EQ is SE", result1.effectiveness, 2);
assert("EQ is OHKO", result1.isOHKO, true);

// Test: Ground move vs Levitate (immune)
const defRotom = makeSet("Rotom", {
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: null, minus: null },
  ability: "Levitate",
});
const result2 = calculateDamage(atkGarchomp, defRotom, "Earthquake");
assert("EQ vs Levitate = immune", result2.effectiveness, 0);
assert("EQ vs Levitate = 0 damage", result2.maxDmg, 0);

// Test: Ice move vs Dragon/Ground (4x SE)
const atkMilotic = makeSet("Milotic", {
  sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 32 },
  nature: { plus: "spAtk", minus: "attack" },
});
const result3 = calculateDamage(atkMilotic, atkGarchomp, "Ice Beam");
console.log(`  ${result3.description}`);
assert("Ice Beam vs Garchomp = 4x SE", result3.effectiveness, 4);

// Test: Spread move penalty
const result4 = calculateDamage(atkGarchomp, defIncineroar, "Earthquake", { isSpread: true });
console.log(`  Spread EQ: ${result4.minDmg}-${result4.maxDmg} (${result4.minPct}%-${result4.maxPct}%)`);
assert("Spread EQ < non-spread EQ", result4.maxDmg < result1.maxDmg, true);

// Test: Weather boost (Sun + Fire)
const atkCharizard = makeSet("Charizard", {
  mega: true,
  sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 32 },
  nature: { plus: "spAtk", minus: "attack" },
});
const defVenusaur = makeSet("Venusaur", {
  sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 32 },
  nature: { plus: null, minus: null },
});
const resultSun = calculateDamage(atkCharizard, defVenusaur, "Heat Wave", { weather: "sun" });
const resultNoWeather = calculateDamage(atkCharizard, defVenusaur, "Heat Wave");
console.log(`  Mega Charizard Heat Wave in Sun: ${resultSun.description}`);
assert("Sun boosts Fire", resultSun.maxDmg > resultNoWeather.maxDmg, true);

// Test: Burned attacker physical move
const resultBurned = calculateDamage(atkGarchomp, defIncineroar, "Earthquake", { attackerBurned: true });
console.log(`  Burned EQ: ${resultBurned.minDmg}-${resultBurned.maxDmg} (${resultBurned.minPct}%-${resultBurned.maxPct}%)`);
assert("Burned physical halved", resultBurned.maxDmg < result1.maxDmg * 0.6, true);

// Test: Screen (Reflect) reduction
const resultScreen = calculateDamage(atkGarchomp, defIncineroar, "Earthquake", {
  defenderSide: {
    isReflect: true, isLightScreen: false, isAuroraVeil: false, isProtect: false, isFriendGuard: false,
  },
});
console.log(`  EQ through Reflect: ${resultScreen.minDmg}-${resultScreen.maxDmg}`);
assert("Reflect reduces damage", resultScreen.maxDmg < result1.maxDmg, true);

// Test: Protect blocks damage (unless Piercing Drill / Unseen Fist)
const resultProtect = calculateDamage(atkGarchomp, defIncineroar, "Earthquake", {
  defenderSide: {
    isReflect: false, isLightScreen: false, isAuroraVeil: false, isProtect: true, isFriendGuard: false,
  },
});
assert("Protect blocks all damage", resultProtect.maxDmg, 0);

// Test: Status move = 0 damage
const resultStatus = calculateDamage(atkGarchomp, defIncineroar, "Swords Dance");
assert("Status move = 0", resultStatus.maxDmg, 0);

// ── Test 4: Ability modifier tests ──

console.log("\n=== Ability Modifier Tests ===");

// Helpers for ability tests
const baseGarchomp = makeSet("Garchomp", {
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: "attack", minus: "spAtk" },
});
const baseIncineroar = makeSet("Incineroar", {
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 2, speed: 0 },
  nature: { plus: null, minus: null },
});

// Baseline: Garchomp EQ vs Incineroar (no abilities, neutral)
const baselineEQ = calculateDamage(baseGarchomp, baseIncineroar, "Earthquake");

// Helping Hand: 1.5x damage
const helpingHandEQ = calculateDamage(baseGarchomp, baseIncineroar, "Earthquake", {
  attackerSide: { isHelpingHand: true, isReflect: false, isLightScreen: false, isAuroraVeil: false, isFriendGuard: false, isBattery: false },
});
assert("Helping Hand boosts damage", helpingHandEQ.maxDmg > baselineEQ.maxDmg, true);
assertRange("Helping Hand ~1.5x", helpingHandEQ.maxDmg, Math.floor(baselineEQ.maxDmg * 1.45), Math.ceil(baselineEQ.maxDmg * 1.55));

// Friend Guard: 0.75x damage on defender's side
const friendGuardEQ = calculateDamage(baseGarchomp, baseIncineroar, "Earthquake", {
  defenderSide: { isFriendGuard: true, isReflect: false, isLightScreen: false, isAuroraVeil: false, isProtect: false },
});
assert("Friend Guard reduces damage", friendGuardEQ.maxDmg < baselineEQ.maxDmg, true);

// Multiscale (Mega Dragonite): halves damage at full HP
// Note: calculateDamage reads ability from mega?.ability ?? set.ability
// Mega Dragonite's ability IS Multiscale, so we test it directly
const defDragoniteMega = makeSet("Dragonite", {
  mega: true,
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
  nature: { plus: null, minus: null },
});
const defDragoniteBase = makeSet("Dragonite", {
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
  nature: { plus: null, minus: null },
  ability: "Inner Focus",
});
const dcVsMegaDnite = calculateDamage(baseGarchomp, defDragoniteMega, "Dragon Claw");
const dcVsBaseDnite = calculateDamage(baseGarchomp, defDragoniteBase, "Dragon Claw");
// Mega has Multiscale (0.5x) but also different defense stats — just verify Mega takes less
assert("Multiscale (Mega Dragonite) reduces damage", dcVsMegaDnite.maxDmg < dcVsBaseDnite.maxDmg, true);

// Thick Fat (Mega Venusaur): halves Fire and Ice damage
// Mega Venusaur's ability IS Thick Fat
const defVenuMega = makeSet("Venusaur", {
  mega: true,
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
  nature: { plus: null, minus: null },
});
const defVenuBase = makeSet("Venusaur", {
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
  nature: { plus: null, minus: null },
  ability: "Overgrow",
});
const atkMilotic2 = makeSet("Milotic", {
  sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 0 },
  nature: { plus: "spAtk", minus: "attack" },
});
const ibVsMegaVenu = calculateDamage(atkMilotic2, defVenuMega, "Ice Beam");
const ibVsBaseVenu = calculateDamage(atkMilotic2, defVenuBase, "Ice Beam");
// Mega Venusaur with Thick Fat should take much less Ice damage (0.5x ability + higher defenses)
assert("Thick Fat (Mega Venusaur) reduces Ice", ibVsMegaVenu.maxDmg < ibVsBaseVenu.maxDmg, true);

// Tough Claws (Mega Charizard X): 1.3x for contact moves
// Mega Charizard X's ability IS Tough Claws — compare with non-mega Charizard
const atkZardXMega = makeSet("Charizard", {
  mega: true,
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: "attack", minus: "spAtk" },
});
const atkZardBase = makeSet("Charizard", {
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: "attack", minus: "spAtk" },
  ability: "Blaze",
});
// Flare Blitz is a contact move, STAB Fire for both
const fbMegaX = calculateDamage(atkZardXMega, baseIncineroar, "Flare Blitz");
const fbBase = calculateDamage(atkZardBase, baseIncineroar, "Flare Blitz");
// Mega X has Tough Claws (1.3x contact) + higher Atk — should do more
assert("Tough Claws (Mega Charizard X) boosts contact", fbMegaX.maxDmg > fbBase.maxDmg, true);

// Mega Launcher (Mega Blastoise): 1.5x for pulse moves
// Mega Blastoise's ability IS Mega Launcher
const atkBlastMega = makeSet("Blastoise", {
  mega: true,
  sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 0 },
  nature: { plus: "spAtk", minus: "attack" },
});
const atkBlastBase = makeSet("Blastoise", {
  sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 0 },
  nature: { plus: "spAtk", minus: "attack" },
  ability: "Torrent",
});
// Water Pulse is a pulse move — compare Mega Launcher vs Torrent
const wpMega = calculateDamage(atkBlastMega, baseGarchomp, "Water Pulse");
const wpBase = calculateDamage(atkBlastBase, baseGarchomp, "Water Pulse");
assert("Mega Launcher boosts pulse moves", wpMega.maxDmg > wpBase.maxDmg, true);

// Adaptability (Mega Beedrill): 2x STAB instead of 1.5x
const atkBeedrillMega = makeSet("Beedrill", {
  mega: true,
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: "attack", minus: "spAtk" },
});
const atkBeedrillBase = makeSet("Beedrill", {
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: "attack", minus: "spAtk" },
  ability: "Swarm",
});
const pjMega = calculateDamage(atkBeedrillMega, baseIncineroar, "Poison Jab");
const pjBase = calculateDamage(atkBeedrillBase, baseIncineroar, "Poison Jab");
// Mega has Adaptability (2x STAB) + higher Atk
assert("Adaptability (Mega Beedrill) 2x STAB", pjMega.maxDmg > pjBase.maxDmg, true);

// Guts: burned attacker gets 1.5x instead of 0.5x penalty (non-mega, can test directly)
const gutsAtk = makeSet("Machamp", {
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
  nature: { plus: "attack", minus: "spAtk" },
  ability: "Guts",
});
const ccGuts = calculateDamage(gutsAtk, baseIncineroar, "Close Combat", { attackerBurned: true });
const ccNoGuts = calculateDamage({ ...gutsAtk, ability: "No Guard" }, baseIncineroar, "Close Combat", { attackerBurned: true });
assert("Guts reverses burn penalty", ccGuts.maxDmg > ccNoGuts.maxDmg * 2, true);

// Tinted Lens: doubles NVE damage (use Vivillon — Bug/Flying with Tinted Lens)
const atkVivillon = makeSet("Vivillon", {
  sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 32 },
  nature: { plus: "spAtk", minus: "attack" },
  ability: "Tinted Lens",
});
// Bug Buzz vs Torkoal (pure Fire) — Bug is NVE on Fire (0.5x), Tinted Lens doubles it
const defTorkoal = makeSet("Torkoal", {
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 32, speed: 0 },
  nature: { plus: null, minus: null },
});
const bbTinted = calculateDamage(atkVivillon, defTorkoal, "Bug Buzz");
const bbNoTinted = calculateDamage({ ...atkVivillon, ability: "Compound Eyes" }, defTorkoal, "Bug Buzz");
assert("Tinted Lens doubles NVE", bbTinted.maxDmg > bbNoTinted.maxDmg * 1.5, true);

// Filter/Solid Rock: 0.75x on SE moves (non-mega, can test directly)
const defAggron = makeSet("Aggron", {
  sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
  nature: { plus: null, minus: null },
  ability: "Filter",
});
const eqFilter = calculateDamage(baseGarchomp, defAggron, "Earthquake");
const eqNoFilter = calculateDamage(baseGarchomp, { ...defAggron, ability: "Rock Head" }, "Earthquake");
assert("Filter reduces SE damage", eqFilter.maxDmg < eqNoFilter.maxDmg, true);

// Technician: 1.5x for moves with ≤60 BP (non-mega, can test directly)
const techAtk = makeSet("Scizor", {
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
  nature: { plus: "attack", minus: "spAtk" },
  ability: "Technician",
});
const bpTech = calculateDamage(techAtk, baseIncineroar, "Bullet Punch");
const bpNoTech = calculateDamage({ ...techAtk, ability: "Swarm" }, baseIncineroar, "Bullet Punch");
assert("Technician boosts ≤60 BP", bpTech.maxDmg > bpNoTech.maxDmg, true);

// Sharpness: 1.5x for slicing moves (non-mega Garchomp, can override ability)
const sharpAtk = makeSet("Garchomp", {
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: "attack", minus: "spAtk" },
  ability: "Sharpness",
});
const dcSharp = calculateDamage(sharpAtk, baseIncineroar, "Dragon Claw");
const dcNoSharp = calculateDamage({ ...sharpAtk, ability: "Rough Skin" }, baseIncineroar, "Dragon Claw");
assert("Sharpness boosts slicing", dcSharp.maxDmg > dcNoSharp.maxDmg, true);

// Aurora Veil: reduces both physical and special
const physAV = calculateDamage(baseGarchomp, baseIncineroar, "Earthquake", {
  defenderSide: { isAuroraVeil: true, isReflect: false, isLightScreen: false, isProtect: false, isFriendGuard: false },
});
assert("Aurora Veil reduces physical", physAV.maxDmg < baselineEQ.maxDmg, true);

const specAV = calculateDamage(atkMilotic2, baseIncineroar, "Scald", {
  defenderSide: { isAuroraVeil: true, isReflect: false, isLightScreen: false, isProtect: false, isFriendGuard: false },
});
const specNoAV = calculateDamage(atkMilotic2, baseIncineroar, "Scald");
assert("Aurora Veil reduces special", specAV.maxDmg < specNoAV.maxDmg, true);

// Piercing Drill / Unseen Fist: 25% through Protect
const piercingAtk = makeSet("Excadrill", {
  mega: true,
  sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
  nature: { plus: "attack", minus: "spAtk" },
  ability: "Piercing Drill",
});
const eqPiercing = calculateDamage(piercingAtk, baseIncineroar, "Earthquake", {
  defenderSide: { isProtect: true, isReflect: false, isLightScreen: false, isAuroraVeil: false, isFriendGuard: false },
});
assert("Piercing Drill does damage through Protect", eqPiercing.maxDmg > 0, true);
// Should be ~25% of normal damage
const eqNoPiercing = calculateDamage(piercingAtk, baseIncineroar, "Earthquake");
assert("Piercing Drill is ~25% through Protect", eqPiercing.maxDmg < eqNoPiercing.maxDmg * 0.35, true);

// ── Summary ──
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
