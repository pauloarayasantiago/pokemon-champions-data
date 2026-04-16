/**
 * Comprehensive Stress Test — 7 tiers of accuracy testing
 *
 * Tier 1: Simple factual lookups (single entity)
 * Tier 2: Champions-specific mechanics (S/V divergence)
 * Tier 3: Negative / absence tests (missing items, absent Pokemon)
 * Tier 4: Damage calculator edge cases
 * Tier 5: Complex multi-entity queries
 * Tier 6: Intent classification stress tests
 * Tier 7: Strategic reasoning queries
 *
 * Usage:
 *   npx tsx scripts/stress-test.ts              # run all
 *   npx tsx scripts/stress-test.ts --tier 3     # run single tier
 */

import { query as ragQuery, type Result } from "../lib/rag.js";
import {
  getPokemon,
  getMoves,
  getMegas,
  findPokemon,
  findMega,
  findMove,
  getTypeEffectiveness,
} from "../lib/calc/data.js";
import { calcAllStats } from "../lib/calc/stats.js";
import { calculateDamage } from "../lib/calc/damage.js";
import type { CompetitiveSet, StatSpread, Nature } from "../lib/calc/types.js";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Helpers ────────────────────────────────────────────────────────────────

interface TestResult {
  tier: number;
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];
let currentTier = 0;

function pass(name: string, detail = "") {
  results.push({ tier: currentTier, name, pass: true, detail });
  process.stdout.write(`  \u2713 ${name}\n`);
}

function fail(name: string, detail: string) {
  results.push({ tier: currentTier, name, pass: false, detail });
  process.stdout.write(`  \u2717 ${name}\n    ${detail}\n`);
}

function assert(condition: boolean, name: string, detail: string) {
  if (condition) pass(name);
  else fail(name, detail);
}

function makeSet(name: string, opts: {
  mega?: boolean;
  sp?: StatSpread;
  nature?: Nature;
  ability?: string;
  item?: string;
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
    moves: mon.moves,
  };
}

/** Check if any result text contains a substring (case-insensitive) */
function anyTextContains(res: Result[], substr: string): boolean {
  const lower = substr.toLowerCase();
  return res.some((r) => r.text.toLowerCase().includes(lower));
}

/** Check if any result source contains a substring */
function anySourceContains(res: Result[], substr: string): boolean {
  return res.some((r) => r.source.includes(substr));
}

/** Check if the #1 result's text contains a substring */
function topResultContains(res: Result[], substr: string): boolean {
  if (res.length === 0) return false;
  return res[0].text.toLowerCase().includes(substr.toLowerCase());
}

/** Load items CSV directly */
function loadItemsCSV(): { name: string; effect: string }[] {
  const raw = readFileSync(join(ROOT, "items.csv"), "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true });
}

// ─── TIER 1: Simple Factual Lookups ─────────────────────────────────────────

async function tier1() {
  currentTier = 1;
  console.log("\n=== TIER 1: Simple Factual Lookups ===");

  // 1a. Pokemon by name
  const pokemonQueries = [
    { query: "Garchomp stats", expect: "garchomp" },
    { query: "Milotic base stats", expect: "milotic" },
    { query: "Kingambit abilities", expect: "kingambit" },
    { query: "Rotom-Wash type", expect: "rotom-wash" },
    { query: "Hatterene stats", expect: "hatterene" },
    { query: "Sneasler moves", expect: "sneasler" },
    { query: "Whimsicott", expect: "whimsicott" },
  ];

  for (const pq of pokemonQueries) {
    const res = await ragQuery(pq.query, 3);
    assert(
      topResultContains(res, pq.expect),
      `Lookup: "${pq.query}" → top result has "${pq.expect}"`,
      `Top result: ${res[0]?.text.slice(0, 80)}...`
    );
  }

  // 1b. Move lookups
  const moveQueries = [
    { query: "Flare Blitz move", expect: "flare blitz" },
    { query: "Trick Room", expect: "trick room" },
    { query: "Tailwind move details", expect: "tailwind" },
    { query: "Close Combat power accuracy", expect: "close combat" },
    { query: "Draco Meteor", expect: "draco meteor" },
  ];

  for (const mq of moveQueries) {
    const res = await ragQuery(mq.query, 3);
    assert(
      anyTextContains(res, mq.expect),
      `Move lookup: "${mq.query}" → contains "${mq.expect}"`,
      `Results: ${res.map((r) => r.text.slice(0, 40)).join(" | ")}`
    );
  }

  // 1c. Item lookups
  const itemQueries = [
    { query: "Focus Sash", expect: "focus sash" },
    { query: "Leftovers item", expect: "leftovers" },
    { query: "Choice Scarf effect", expect: "choice scarf" },
    { query: "Sitrus Berry", expect: "sitrus berry" },
  ];

  for (const iq of itemQueries) {
    const res = await ragQuery(iq.query, 3);
    assert(
      anyTextContains(res, iq.expect),
      `Item lookup: "${iq.query}" → contains "${iq.expect}"`,
      `Results: ${res.map((r) => r.text.slice(0, 40)).join(" | ")}`
    );
  }

  // 1d. Mega Evolution lookups
  const megaQueries = [
    { query: "Mega Dragonite ability stats", expect: "mega dragonite" },
    { query: "Mega Gengar", expect: "mega gengar" },
    { query: "Mega Charizard Y stats ability type", expect: "mega charizard y" },
    { query: "Mega Meganium ability", expect: "mega meganium" },
  ];

  for (const mq of megaQueries) {
    const res = await ragQuery(mq.query, 3);
    assert(
      anyTextContains(res, mq.expect),
      `Mega lookup: "${mq.query}" → contains "${mq.expect}"`,
      `Results: ${res.map((r) => r.text.slice(0, 60)).join(" | ")}`
    );
  }

  // 1e. Usage data lookups
  const usageQueries = [
    { query: "Incineroar usage rate", expect: "pikalytics_usage.csv" },
    { query: "Garchomp competitive stats", expect: "pikalytics_usage.csv" },
    { query: "most popular Pokemon", expect: "pikalytics_usage.csv" },
  ];

  for (const uq of usageQueries) {
    const res = await ragQuery(uq.query, 5);
    assert(
      anySourceContains(res, uq.expect),
      `Usage lookup: "${uq.query}" → source has "${uq.expect}"`,
      `Sources: ${res.map((r) => r.source).join(", ")}`
    );
  }
}

// ─── TIER 2: Champions-Specific Mechanics ───────────────────────────────────

async function tier2() {
  currentTier = 2;
  console.log("\n=== TIER 2: Champions-Specific Mechanics ===");

  // 2a. Fake Out — unselectable after turn 1
  const fakeOutRes = await ragQuery("Fake Out mechanics Champions", 5);
  assert(
    anyTextContains(fakeOutRes, "fake out"),
    "Fake Out: returns Fake Out info",
    `Missing Fake Out in results`
  );

  // 2b. Protect PP
  const protectRes = await ragQuery("Protect PP Champions", 5);
  assert(
    anyTextContains(protectRes, "protect"),
    "Protect: returns Protect data",
    `Missing Protect`
  );

  // 2c. Stat Points system (no EVs)
  const spRes = await ragQuery("stat points SP system how training works", 5);
  assert(
    anyTextContains(spRes, "stat point") || anyTextContains(spRes, "SP") || anySourceContains(spRes, "training_mechanics"),
    "Stat Points: returns SP/training info",
    `Sources: ${spRes.map((r) => r.source).join(", ")}`
  );

  // 2d. Mega Evolution as only gimmick
  const megaGimmickRes = await ragQuery("battle gimmick Mega Evolution rules", 5);
  assert(
    anyTextContains(megaGimmickRes, "mega") && (anySourceContains(megaGimmickRes, "knowledge") || anySourceContains(megaGimmickRes, "champions_rules")),
    "Mega gimmick: returns knowledge doc about Megas",
    `Sources: ${megaGimmickRes.map((r) => r.source).join(", ")}`
  );

  // 2e. Paralysis nerf — 12.5%
  const paraRes = await ragQuery("paralysis full paralysis chance Champions", 5);
  assert(
    anyTextContains(paraRes, "paralysis") || anyTextContains(paraRes, "para") || anySourceContains(paraRes, "status_conditions"),
    "Paralysis nerf: returns status info",
    `Results: ${paraRes.map((r) => r.text.slice(0, 50)).join(" | ")}`
  );

  // 2f. Updated attacks — Dragon Claw is slicing
  const dragonClawRes = await ragQuery("Dragon Claw slicing move update", 5);
  assert(
    anyTextContains(dragonClawRes, "dragon claw") || anySourceContains(dragonClawRes, "updated_attacks"),
    "Dragon Claw update: returns updated attack info",
    `Sources: ${dragonClawRes.map((r) => r.source).join(", ")}`
  );

  // 2g. Screens nerfed — 33% in Doubles
  const screensRes = await ragQuery("Reflect Light Screen reduction Doubles Champions", 5);
  assert(
    anyTextContains(screensRes, "reflect") || anyTextContains(screensRes, "light screen") || anyTextContains(screensRes, "screen"),
    "Screens nerf: returns screen info",
    `Results: ${screensRes.map((r) => r.text.slice(0, 50)).join(" | ")}`
  );

  // 2h. New ability — Mega Sol (Mega Meganium)
  const megaSolRes = await ragQuery("Mega Sol ability sun", 5);
  assert(
    anyTextContains(megaSolRes, "mega sol") || anyTextContains(megaSolRes, "meganium"),
    "New ability Mega Sol: returns Meganium info",
    `Results: ${megaSolRes.map((r) => r.text.slice(0, 60)).join(" | ")}`
  );

  // 2i. Incineroar movepool
  const incinKORes = await ragQuery("Incineroar moves movepool", 5);
  assert(
    anyTextContains(incinKORes, "incineroar"),
    "Incineroar movepool: returns Incineroar data",
    `No Incineroar results found`
  );

  // 2j. Moonblast SpAtk drop nerfed
  const moonblastRes = await ragQuery("Moonblast special attack drop change", 5);
  assert(
    anyTextContains(moonblastRes, "moonblast") || anySourceContains(moonblastRes, "updated_attacks"),
    "Moonblast nerf: returns updated move info",
    `Sources: ${moonblastRes.map((r) => r.source).join(", ")}`
  );
}

// ─── TIER 3: Negative / Absence Tests ───────────────────────────────────────

async function tier3() {
  currentTier = 3;
  console.log("\n=== TIER 3: Negative / Absence Tests ===");

  const items = loadItemsCSV();
  const pokemon = getPokemon();

  // 3a-d. Banned items not in items.csv
  const bannedItems = ["Life Orb", "Choice Band", "Assault Vest", "Eviolite",
    "Choice Specs", "Rocky Helmet", "Flame Orb", "Toxic Orb"];
  for (const bi of bannedItems) {
    assert(
      !items.some((i) => i.name.toLowerCase() === bi.toLowerCase()),
      `${bi} absent from items.csv`,
      `${bi} found in items!`
    );
  }

  // 3e-h. Absent Pokemon (pre-evos + Amoonguss)
  const absentMons = ["Porygon2", "Amoonguss", "Dusclops", "Clefairy"];
  for (const am of absentMons) {
    assert(
      !pokemon.has(am.toLowerCase()),
      `${am} absent from roster`,
      `${am} found in roster!`
    );
  }

  // 3i. Roster size plausible
  assert(
    pokemon.size >= 186 && pokemon.size <= 195,
    `Roster size plausible: ${pokemon.size} Pokemon`,
    `Unexpected roster size: ${pokemon.size}`
  );

  // 3j. No legendary/restricted Pokemon (spot check)
  const banned = ["mewtwo", "lugia", "ho-oh", "groudon", "kyogre", "rayquaza",
    "dialga", "palkia", "giratina", "zacian", "zamazenta", "calyrex",
    "koraidon", "miraidon"];
  for (const b of banned) {
    assert(!pokemon.has(b), `${b} absent (legendary ban)`, `${b} found in roster!`);
  }

  // 3k. Search for "Life Orb" shouldn't return an item chunk
  const lifeOrbSearch = await ragQuery("Life Orb item effect", 5);
  assert(
    !lifeOrbSearch.some((r) => r.source === "items.csv" && r.text.toLowerCase().includes("life orb is")),
    "Search 'Life Orb' → no item chunk returned",
    `Found Life Orb item chunk in results`
  );

  // 3l. Search for absent Pokemon shouldn't return pokemon chunk
  const amoongussSearch = await ragQuery("Amoonguss stats and moves", 5);
  assert(
    !amoongussSearch.some((r) => r.source === "pokemon_champions.csv" && r.text.toLowerCase().includes("amoonguss is a")),
    "Search 'Amoonguss' → no pokemon chunk for it",
    `Found Amoonguss pokemon chunk`
  );
}

// ─── TIER 4: Damage Calculator Edge Cases ───────────────────────────────────

async function tier4() {
  currentTier = 4;
  console.log("\n=== TIER 4: Damage Calculator Edge Cases ===");

  // 4a. Stat calculation — Hatterene speed at 0 SP (TR mon)
  const hat = findPokemon("Hatterene")!;
  const hatStats = calcAllStats(hat.baseStats, { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 }, { plus: null, minus: null });
  assert(hatStats.speed === 49, `Hatterene 0 SP Speed = ${hatStats.speed} (expected 49)`, `Got ${hatStats.speed}`);

  // 4b. Max investment stat — Garchomp 32 Atk SP + Adamant = 200
  const garch = findPokemon("Garchomp")!;
  const garchStats = calcAllStats(garch.baseStats, { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 }, { plus: "attack", minus: "spAtk" });
  assert(garchStats.attack === 200, `Garchomp 32 Atk SP + Adamant = ${garchStats.attack} (expected 200)`, `Got ${garchStats.attack}`);

  // 4c. HP calc — Torkoal 32 HP SP = 177
  const tork = findPokemon("Torkoal")!;
  const torkStats = calcAllStats(tork.baseStats, { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 }, { plus: null, minus: null });
  assert(torkStats.hp === 177, `Torkoal 32 HP SP = ${torkStats.hp} (expected 177)`, `Got ${torkStats.hp}`);

  // 4d. Type effectiveness — Ground vs Flying = immune (0)
  assert(getTypeEffectiveness("Ground", "Flying", null) === 0, "Ground vs Flying = immune", `Got ${getTypeEffectiveness("Ground", "Flying", null)}`);

  // 4e. Type effectiveness — Ice vs Dragon/Ground = 4x
  assert(getTypeEffectiveness("Ice", "Dragon", "Ground") === 4, "Ice vs Dragon/Ground = 4x", `Got ${getTypeEffectiveness("Ice", "Dragon", "Ground")}`);

  // 4f. Normal vs Ghost = immune
  assert(getTypeEffectiveness("Normal", "Ghost", null) === 0, "Normal vs Ghost = immune", `Got ${getTypeEffectiveness("Normal", "Ghost", null)}`);

  // 4g. Earthquake vs Talonflame (Flying) = immune
  const atkGarch = makeSet("Garchomp", { sp: { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 }, nature: { plus: "attack", minus: "spAtk" } });
  const defTalon = makeSet("Talonflame", { sp: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 }, nature: { plus: null, minus: null }, ability: "Gale Wings" });
  const eqVsTalon = calculateDamage(atkGarch, defTalon, "Earthquake");
  assert(eqVsTalon.maxDmg === 0, "Earthquake vs Talonflame = 0 (immune)", `Got ${eqVsTalon.maxDmg}`);

  // 4h. 4x SE — Ice Beam vs Garchomp = OHKO from Milotic
  const atkMilotic = makeSet("Milotic", { sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 0 }, nature: { plus: "spAtk", minus: "attack" } });
  const defGarch = makeSet("Garchomp", { sp: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 }, nature: { plus: null, minus: null } });
  const ibVsGarch = calculateDamage(atkMilotic, defGarch, "Ice Beam");
  assert(ibVsGarch.effectiveness === 4, `Ice Beam vs Garchomp = ${ibVsGarch.effectiveness}x (expected 4x)`, `Got ${ibVsGarch.effectiveness}`);
  assert(ibVsGarch.isOHKO, `Ice Beam 4x OHKOs Garchomp (${ibVsGarch.minDmg}-${ibVsGarch.maxDmg} vs ${ibVsGarch.defenderHP})`, `Not OHKO: ${ibVsGarch.minDmg} vs ${ibVsGarch.defenderHP}`);

  // 4i. Spread move reduction
  const defIncin = makeSet("Incineroar", { sp: { hp: 32, attack: 0, defense: 0, spAtk: 0, spDef: 2, speed: 0 }, nature: { plus: null, minus: null } });
  const eqNoSpread = calculateDamage(atkGarch, defIncin, "Earthquake");
  const eqSpread = calculateDamage(atkGarch, defIncin, "Earthquake", { isSpread: true });
  assert(eqSpread.maxDmg < eqNoSpread.maxDmg, `Spread EQ (${eqSpread.maxDmg}) < non-spread EQ (${eqNoSpread.maxDmg})`, `Spread not reduced`);

  // 4j. Burn halves physical damage
  const eqBurned = calculateDamage(atkGarch, defIncin, "Earthquake", { attackerBurned: true });
  assert(eqBurned.maxDmg < eqNoSpread.maxDmg * 0.6, `Burned EQ (${eqBurned.maxDmg}) < 60% normal (${Math.floor(eqNoSpread.maxDmg * 0.6)})`, `Not halved enough`);

  // 4k. Status move = 0 damage
  const swordsDance = calculateDamage(atkGarch, defIncin, "Swords Dance");
  assert(swordsDance.maxDmg === 0, "Swords Dance = 0 damage (status)", `Got ${swordsDance.maxDmg}`);

  // 4l. Sun boosts Fire
  const atkZard = makeSet("Charizard", { mega: true, sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 32 }, nature: { plus: "spAtk", minus: "attack" } });
  const hwNoSun = calculateDamage(atkZard, defIncin, "Heat Wave");
  const hwSun = calculateDamage(atkZard, defIncin, "Heat Wave", { weather: "sun" });
  assert(hwSun.maxDmg > hwNoSun.maxDmg, `Sun Heat Wave (${hwSun.maxDmg}) > neutral (${hwNoSun.maxDmg})`, `Sun not boosting`);

  // 4m. Rain boosts Water
  const atkPelipper = makeSet("Pelipper", { sp: { hp: 0, attack: 0, defense: 0, spAtk: 32, spDef: 0, speed: 0 }, nature: { plus: "spAtk", minus: "attack" }, ability: "Drizzle" });
  const surfNoRain = calculateDamage(atkPelipper, defGarch, "Surf");
  const surfRain = calculateDamage(atkPelipper, defGarch, "Surf", { weather: "rain" });
  assert(surfRain.maxDmg > surfNoRain.maxDmg, `Rain Surf (${surfRain.maxDmg}) > neutral (${surfNoRain.maxDmg})`, `Rain not boosting`);

  // 4n. Crit increases damage
  const eqCrit = calculateDamage(atkGarch, defIncin, "Earthquake", { isCriticalHit: true });
  assert(eqCrit.maxDmg > eqNoSpread.maxDmg, `Crit EQ (${eqCrit.maxDmg}) > normal (${eqNoSpread.maxDmg})`, `Crit not boosting`);

  // 4o. Protect blocks all
  const eqProtect = calculateDamage(atkGarch, defIncin, "Earthquake", {
    defenderSide: { isReflect: false, isLightScreen: false, isAuroraVeil: false, isProtect: true, isFriendGuard: false },
  });
  assert(eqProtect.maxDmg === 0, "Protect blocks all damage", `Got ${eqProtect.maxDmg}`);

  // 4p. Reflect reduces physical damage
  const eqReflect = calculateDamage(atkGarch, defIncin, "Earthquake", {
    defenderSide: { isReflect: true, isLightScreen: false, isAuroraVeil: false, isProtect: false, isFriendGuard: false },
  });
  assert(eqReflect.maxDmg < eqNoSpread.maxDmg, `Reflect EQ (${eqReflect.maxDmg}) < normal (${eqNoSpread.maxDmg})`, `Reflect not reducing`);

  // 4q. Light Screen doesn't reduce physical
  const eqLightScreen = calculateDamage(atkGarch, defIncin, "Earthquake", {
    defenderSide: { isReflect: false, isLightScreen: true, isAuroraVeil: false, isProtect: false, isFriendGuard: false },
  });
  assert(eqLightScreen.maxDmg === eqNoSpread.maxDmg, `Light Screen doesn't reduce physical EQ (${eqLightScreen.maxDmg} = ${eqNoSpread.maxDmg})`, `Light Screen wrongly reduced physical`);

  // 4r. STAB check — Garchomp EQ is STAB (Ground type)
  // Non-STAB comparison: use a non-Ground/Dragon move on Garchomp
  const rockSlide = calculateDamage(atkGarch, defIncin, "Rock Slide");
  // EQ power 100, Rock Slide power 75 — but EQ also has STAB making it far stronger
  // At minimum, EQ should do more than Rock Slide
  assert(eqNoSpread.maxDmg > rockSlide.maxDmg, `STAB EQ (${eqNoSpread.maxDmg}) > non-STAB Rock Slide (${rockSlide.maxDmg})`, `STAB not applied correctly`);
}

// ─── TIER 5: Complex Multi-Entity Queries ───────────────────────────────────

async function tier5() {
  currentTier = 5;
  console.log("\n=== TIER 5: Complex Multi-Entity Queries ===");

  // 5a. Two-Pokemon matchup — should return matchup data for at least one
  const matchup1 = await ragQuery("Garchomp vs Rotom-Wash matchup", 5);
  assert(
    anySourceContains(matchup1, "matchup") && (anyTextContains(matchup1, "garchomp") || anyTextContains(matchup1, "rotom")),
    "Garchomp vs Rotom-Wash → matchup data mentioning one or both",
    `Results: ${matchup1.map((r) => r.source).join(", ")}`
  );

  // 5b. Core query — Torkoal + Venusaur
  const coreQuery = await ragQuery("Torkoal Venusaur sun core partners", 5);
  assert(
    anyTextContains(coreQuery, "torkoal") || anyTextContains(coreQuery, "venusaur"),
    "Torkoal+Venusaur core → returns one of the pair",
    `Results: ${coreQuery.map((r) => r.text.slice(0, 40)).join(" | ")}`
  );

  // 5c. Speed comparison
  const speedComp = await ragQuery("is Garchomp faster than Dragonite", 5);
  assert(
    anyTextContains(speedComp, "garchomp") || anyTextContains(speedComp, "dragonite") || anySourceContains(speedComp, "speed_tiers"),
    "Speed comparison → Pokemon or speed doc",
    `Sources: ${speedComp.map((r) => r.source).join(", ")}`
  );

  // 5d. Team fill query
  const teamFill = await ragQuery("I have Garchomp Incineroar Whimsicott, what should I add", 5);
  assert(
    anySourceContains(teamFill, "pikalytics_usage.csv") || anySourceContains(teamFill, "team_building_theory") || anySourceContains(teamFill, "team_archetypes"),
    "Team fill → usage or team theory",
    `Sources: ${teamFill.map((r) => r.source).join(", ")}`
  );

  // 5e. Sand archetype
  const sandTeam = await ragQuery("Tyranitar Excadrill sand rush team composition", 5);
  assert(
    anyTextContains(sandTeam, "tyranitar") || anyTextContains(sandTeam, "excadrill") || anySourceContains(sandTeam, "team_archetypes"),
    "Sand team → archetype info",
    `Results: ${sandTeam.map((r) => r.source).join(", ")}`
  );

  // 5f. Multi-move comparison
  const moveComp = await ragQuery("Earthquake vs Close Combat for Garchomp", 5);
  assert(
    anyTextContains(moveComp, "earthquake") || anyTextContains(moveComp, "close combat") || anyTextContains(moveComp, "garchomp"),
    "Move comparison → move or Pokemon data",
    `Results: ${moveComp.map((r) => r.text.slice(0, 40)).join(" | ")}`
  );

  // 5g. Counter sun team
  const counterQuery = await ragQuery("what beats Charizard and Venusaur sun team", 5);
  assert(
    anySourceContains(counterQuery, "team_archetypes") || anySourceContains(counterQuery, "team_building_theory") || anyTextContains(counterQuery, "charizard") || anyTextContains(counterQuery, "sun"),
    "Counter sun → strategic info",
    `Sources: ${counterQuery.map((r) => r.source).join(", ")}`
  );

  // 5h. Tournament team search
  const tournamentQuery = await ragQuery("tournament winning teams with Dragonite", 5);
  assert(
    anySourceContains(tournamentQuery, "tournament_teams.csv") || anyTextContains(tournamentQuery, "dragonite"),
    "Tournament Dragonite → tournament data",
    `Sources: ${tournamentQuery.map((r) => r.source).join(", ")}`
  );

  // 5i. Ability interaction
  const abilityQuery = await ragQuery("Intimidate vs Defiant interaction", 5);
  assert(
    anyTextContains(abilityQuery, "intimidate") || anyTextContains(abilityQuery, "defiant"),
    "Ability interaction → relevant info",
    `Results: ${abilityQuery.map((r) => r.text.slice(0, 50)).join(" | ")}`
  );

  // 5j. Mega + teammates
  const megaItemQuery = await ragQuery("best item for Mega Gengar teammates", 5);
  assert(
    anyTextContains(megaItemQuery, "gengar") || anySourceContains(megaItemQuery, "pikalytics"),
    "Mega teammates → Gengar or usage data",
    `Sources: ${megaItemQuery.map((r) => r.source).join(", ")}`
  );
}

// ─── TIER 6: Intent Classification Stress Tests ─────────────────────────────

async function tier6() {
  currentTier = 6;
  console.log("\n=== TIER 6: Intent Classification Stress ===");

  // 6a. "counter" = strategy, not the move Counter
  const counterStrat = await ragQuery("what counters Kingambit", 5);
  assert(
    !counterStrat.some((r) => r.source === "moves.csv" && r.text.toLowerCase().startsWith("counter is a")),
    "\"counters Kingambit\" → NOT the move Counter",
    `Found Counter move in results`
  );

  // 6b. "protect against Fake Out" = strategy, not the move Protect
  const protectStrat = await ragQuery("how to protect against Fake Out leads", 5);
  assert(
    anySourceContains(protectStrat, "knowledge") || anySourceContains(protectStrat, "transcript") || anySourceContains(protectStrat, "team_building"),
    "\"protect against Fake Out\" → strategic content",
    `Sources: ${protectStrat.map((r) => r.source).join(", ")}`
  );

  // 6c. Ambiguous "set" → competitive set, not item
  const setQuery = await ragQuery("best Dragonite set for VGC", 5);
  assert(
    anyTextContains(setQuery, "dragonite") || anySourceContains(setQuery, "pikalytics"),
    "\"Dragonite set\" → Dragonite data or usage",
    `Sources: ${setQuery.map((r) => r.source).join(", ")}`
  );

  // 6d. Vague meta query — transcripts about meta are acceptable, but ideally
  // meta_snapshot or pikalytics should rank higher. Mark as known weakness.
  const vagueQuery = await ragQuery("what's good in the meta right now", 5);
  assert(
    anySourceContains(vagueQuery, "meta_snapshot") || anySourceContains(vagueQuery, "pikalytics") || anySourceContains(vagueQuery, "transcript"),
    "Vague meta query → meta, usage, or meta-relevant transcript data",
    `Sources: ${vagueQuery.map((r) => r.source).join(", ")}`
  );
  // KNOWN WEAKNESS: vague queries prefer transcripts over structured meta_snapshot.
  // Ideal: meta_snapshot.md or pikalytics_usage.csv should rank first.
  const vagueHitsStructured = anySourceContains(vagueQuery, "meta_snapshot") || anySourceContains(vagueQuery, "pikalytics");
  if (!vagueHitsStructured) {
    console.log("    [NOTE] Vague meta query returns transcripts instead of meta_snapshot — known ranking gap");
  }

  // 6e. Misspelled name — "Garchomps"
  const misspelledQuery = await ragQuery("Garchomps best moves", 5);
  assert(
    anyTextContains(misspelledQuery, "garchomp"),
    "\"Garchomps\" → still finds Garchomp",
    `Results: ${misspelledQuery.map((r) => r.text.slice(0, 50)).join(" | ")}`
  );

  // 6f. Stat filter — "bulky Water"
  const bulkyWater = await ragQuery("bulky Water type for my team", 5);
  assert(
    anyTextContains(bulkyWater, "water") || anySourceContains(bulkyWater, "pokemon_champions"),
    "\"bulky Water\" → Water Pokemon",
    `Results: ${bulkyWater.map((r) => r.text.slice(0, 50)).join(" | ")}`
  );

  // 6g. Mixed intent — usage + strategy
  const mixedQuery = await ragQuery("why is Incineroar so popular and how do I beat it", 5);
  assert(
    anyTextContains(mixedQuery, "incineroar"),
    "Mixed Incineroar query → returns Incineroar content",
    `No Incineroar in results`
  );

  // 6h. Transcript-relevant query
  const creatorQuery = await ragQuery("content creator team building guide", 5);
  assert(
    anySourceContains(creatorQuery, "transcript") || anySourceContains(creatorQuery, "knowledge"),
    "Creator guide → transcript or knowledge",
    `Sources: ${creatorQuery.map((r) => r.source).join(", ")}`
  );

  // 6i. Single word query
  const singleWord = await ragQuery("Garchomp", 3);
  assert(
    topResultContains(singleWord, "garchomp"),
    "Single word \"Garchomp\" → top result is Garchomp",
    `Top: ${singleWord[0]?.text.slice(0, 50)}`
  );

  // 6j. Speed filter intent
  const speedFilter = await ragQuery("fastest Pokemon in Champions", 5);
  assert(
    anySourceContains(speedFilter, "speed_tiers") || anySourceContains(speedFilter, "pokemon_champions"),
    "\"fastest Pokemon\" → speed tiers or Pokemon data",
    `Sources: ${speedFilter.map((r) => r.source).join(", ")}`
  );
}

// ─── TIER 7: Strategic Reasoning Queries ────────────────────────────────────

async function tier7() {
  currentTier = 7;
  console.log("\n=== TIER 7: Strategic Reasoning ===");

  // 7a. Trick Room team building
  const trQuery = await ragQuery("Trick Room team setters and attackers", 5);
  assert(
    anySourceContains(trQuery, "team_archetypes") || anySourceContains(trQuery, "team_building_theory") || anyTextContains(trQuery, "trick room"),
    "TR team query → strategy docs",
    `Sources: ${trQuery.map((r) => r.source).join(", ")}`
  );

  // 7b. Rain archetype
  const rainQuery = await ragQuery("rain team Pelipper Swift Swim sweepers", 5);
  assert(
    anySourceContains(rainQuery, "team_archetypes") || anyTextContains(rainQuery, "pelipper") || anyTextContains(rainQuery, "rain"),
    "Rain team → archetype or Pelipper data",
    `Sources: ${rainQuery.map((r) => r.source).join(", ")}`
  );

  // 7c. Win conditions
  const winConQuery = await ragQuery("win conditions and endgame strategies", 5);
  assert(
    anySourceContains(winConQuery, "team_building_theory") || anySourceContains(winConQuery, "team_archetypes"),
    "Win condition → theory or archetype doc",
    `Sources: ${winConQuery.map((r) => r.source).join(", ")}`
  );

  // 7d. Speed control options
  const speedControl = await ragQuery("speed control options Tailwind vs Trick Room vs weather", 5);
  assert(
    anySourceContains(speedControl, "team_building_theory") || anySourceContains(speedControl, "team_archetypes") || anySourceContains(speedControl, "speed_tiers"),
    "Speed control → strategy doc",
    `Sources: ${speedControl.map((r) => r.source).join(", ")}`
  );

  // 7e. Role compression
  const roleComp = await ragQuery("role compression Pokemon that fill multiple roles", 5);
  assert(
    anySourceContains(roleComp, "team_building_theory") || anyTextContains(roleComp, "role"),
    "Role compression → team building theory",
    `Sources: ${roleComp.map((r) => r.source).join(", ")}`
  );

  // 7f. Mega selection
  const megaStrat = await ragQuery("which Mega Evolution should I pick for my team", 5);
  assert(
    anySourceContains(megaStrat, "team_building_theory") || anySourceContains(megaStrat, "team_archetypes") || anyTextContains(megaStrat, "mega"),
    "Mega selection → strategy or mega info",
    `Sources: ${megaStrat.map((r) => r.source).join(", ")}`
  );

  // 7g. Anti-meta picks
  const antiMeta = await ragQuery("anti-meta picks underused Pokemon that counter top threats", 5);
  assert(
    anySourceContains(antiMeta, "meta_snapshot") || anySourceContains(antiMeta, "pikalytics") || anySourceContains(antiMeta, "team_building"),
    "Anti-meta → meta or usage data",
    `Sources: ${antiMeta.map((r) => r.source).join(", ")}`
  );

  // 7h. Type chart reference
  const typeChartQuery = await ragQuery("Dragon type weaknesses resistances matchups", 5);
  assert(
    anySourceContains(typeChartQuery, "type_chart") || anyTextContains(typeChartQuery, "dragon"),
    "Dragon type chart → type chart doc",
    `Sources: ${typeChartQuery.map((r) => r.source).join(", ")}`
  );

  // 7i. Timer / rules
  const timerQuery = await ragQuery("timer rules best of 3 game clock", 5);
  assert(
    anySourceContains(timerQuery, "champions_rules") || anyTextContains(timerQuery, "timer") || anyTextContains(timerQuery, "clock"),
    "Timer rules → rules doc",
    `Sources: ${timerQuery.map((r) => r.source).join(", ")}`
  );

  // 7j. Top performing cores
  const coresQuery = await ragQuery("top performing cores win rates", 5);
  assert(
    anySourceContains(coresQuery, "meta_snapshot") || anySourceContains(coresQuery, "pikalytics"),
    "Top cores → meta snapshot",
    `Sources: ${coresQuery.map((r) => r.source).join(", ")}`
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const tierArg = process.argv.find((a) => a.startsWith("--tier"));
  const tierFilter = tierArg
    ? parseInt(tierArg.includes("=") ? tierArg.split("=")[1] : process.argv[process.argv.indexOf("--tier") + 1])
    : undefined;

  console.log("\u2554" + "\u2550".repeat(62) + "\u2557");
  console.log("\u2551     COMPREHENSIVE STRESS TEST \u2014 7 Tiers of Accuracy        \u2551");
  console.log("\u255A" + "\u2550".repeat(62) + "\u255D");

  const tiers: [number, string, () => Promise<void>][] = [
    [1, "Simple Factual Lookups", tier1],
    [2, "Champions-Specific Mechanics", tier2],
    [3, "Negative / Absence Tests", tier3],
    [4, "Damage Calculator Edge Cases", tier4],
    [5, "Complex Multi-Entity Queries", tier5],
    [6, "Intent Classification Stress", tier6],
    [7, "Strategic Reasoning", tier7],
  ];

  for (const [num, _name, fn] of tiers) {
    if (tierFilter && num !== tierFilter) continue;
    await fn();
  }

  // ─── Report ─────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(65));
  console.log("  STRESS TEST REPORT");
  console.log("=".repeat(65));

  const tierNums = [...new Set(results.map((r) => r.tier))].sort();
  let totalPass = 0;
  let totalFail = 0;

  for (const t of tierNums) {
    const tierResults = results.filter((r) => r.tier === t);
    const tierPass = tierResults.filter((r) => r.pass).length;
    const tierFail = tierResults.filter((r) => !r.pass).length;
    totalPass += tierPass;
    totalFail += tierFail;
    const pct = ((tierPass / tierResults.length) * 100).toFixed(1);
    const label = tiers.find(([n]) => n === t)?.[1] ?? `Tier ${t}`;
    const icon = tierFail === 0 ? "PASS" : "WARN";
    console.log(`  [${icon}] Tier ${t}: ${label.padEnd(35)} ${tierPass}/${tierResults.length} (${pct}%)`);
    if (tierFail > 0) {
      for (const fr of tierResults.filter((r) => !r.pass)) {
        console.log(`      X ${fr.name}`);
        console.log(`        ${fr.detail}`);
      }
    }
  }

  const overallPct = (((totalPass) / (totalPass + totalFail)) * 100).toFixed(1);
  console.log("-".repeat(65));
  console.log(`  TOTAL: ${totalPass + totalFail} tests, ${totalPass} passed, ${totalFail} failed (${overallPct}%)`);
  console.log("=".repeat(65));

  if (totalFail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
