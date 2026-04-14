import type { BaseStats, Nature, StatSpread } from "./types.js";

const LEVEL = 50;
const IV = 31; // All IVs are 31 in Champions

/**
 * Calculate a single stat at Level 50 using Champions Stat Points system.
 * SP replaces EVs: each SP is equivalent to ~8 EVs (SP*2 in the formula).
 * All IVs are locked at 31.
 *
 * HP:    floor((2 * Base + IV + SP*2) * Lv / 100) + Lv + 10
 * Other: floor((floor((2 * Base + IV + SP*2) * Lv / 100) + 5) * NatureMod)
 */
export function calcStat(
  base: number,
  sp: number,
  natureMod: number, // 1.1, 1.0, or 0.9
  isHp: boolean
): number {
  const core = Math.floor((2 * base + IV + sp * 2) * LEVEL / 100);
  if (isHp) {
    return core + LEVEL + 10; // +50 +10 = +60
  }
  return Math.floor((core + 5) * natureMod);
}

/**
 * Calculate all 6 stats for a Pokemon at Level 50.
 */
export function calcAllStats(
  baseStats: BaseStats,
  sp: StatSpread,
  nature: Nature
): BaseStats {
  const getNatureMod = (stat: keyof BaseStats): number => {
    if (nature.plus === stat) return 1.1;
    if (nature.minus === stat) return 0.9;
    return 1.0;
  };

  return {
    hp: calcStat(baseStats.hp, sp.hp, 1.0, true),
    attack: calcStat(baseStats.attack, sp.attack, getNatureMod("attack"), false),
    defense: calcStat(baseStats.defense, sp.defense, getNatureMod("defense"), false),
    spAtk: calcStat(baseStats.spAtk, sp.spAtk, getNatureMod("spAtk"), false),
    spDef: calcStat(baseStats.spDef, sp.spDef, getNatureMod("spDef"), false),
    speed: calcStat(baseStats.speed, sp.speed, getNatureMod("speed"), false),
  };
}

// ── Common spreads ──

/** 32/32/2 offensive spread */
export function offensiveSpread(physOrSpec: "physical" | "special"): { sp: StatSpread; nature: Nature } {
  if (physOrSpec === "physical") {
    return {
      sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 },
      nature: { plus: "attack", minus: "spAtk" },
    };
  }
  return {
    sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 32 },
    nature: { plus: "spAtk", minus: "attack" },
  };
}

/** 32 HP / 32 Def or SpDef / 2 leftover — bulky spread */
export function bulkySpread(physOrSpec: "physical" | "special"): { sp: StatSpread; nature: Nature } {
  if (physOrSpec === "physical") {
    return {
      sp: { hp: 32, attack: 0, defense: 32, spAtk: 0, spDef: 2, speed: 0 },
      nature: { plus: "defense", minus: "speed" },
    };
  }
  return {
    sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 32, speed: 2 },
    nature: { plus: "spDef", minus: "attack" },
  };
}
