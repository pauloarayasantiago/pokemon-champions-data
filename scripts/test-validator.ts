/**
 * Unit tests for lib/team-validator.ts.
 * Run with: npx tsx scripts/test-validator.ts
 */
import { lookupPokemon, validateSet, findItem, getStoneToMega } from "../lib/team-validator.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ── Pokedex lookup ──
section("pokedex lookup");

const froslass = lookupPokemon("Froslass");
assert(!froslass.notFound, "Froslass found");
assert(froslass.types.includes("Ice") && froslass.types.includes("Ghost"), "Froslass is Ice/Ghost");
assert(froslass.abilities.includes("Snow Cloak"), "Froslass has Snow Cloak");
assert(froslass.moves.includes("Aurora Veil"), "Froslass has Aurora Veil");
assert(froslass.moves.includes("Blizzard"), "Froslass has Blizzard");
assert(!froslass.moves.includes("Pollen Puff"), "Froslass does NOT have Pollen Puff");

const megaFroslass = lookupPokemon("Mega Froslass");
assert(!megaFroslass.notFound, "Mega Froslass found");
assert(megaFroslass.mega !== undefined, "Mega Froslass has mega block");
assert(megaFroslass.mega?.ability === "Snow Warning", "Mega Froslass ability = Snow Warning");
assert(megaFroslass.mega?.stats.spa === 140, "Mega Froslass SpA = 140");

const sinistcha = lookupPokemon("Sinistcha");
assert(sinistcha.moves.includes("Matcha Gotcha"), "Sinistcha has Matcha Gotcha");
assert(!sinistcha.moves.includes("Pollen Puff"), "Sinistcha does NOT have Pollen Puff");
assert(sinistcha.moves.includes("Trick Room"), "Sinistcha has Trick Room");

const garchomp = lookupPokemon("Garchomp");
assert(!garchomp.moves.includes("Rapid Spin"), "Garchomp does NOT have Rapid Spin");

const rotomF = lookupPokemon("Rotom-Frost");
assert(!rotomF.moves.includes("Hydro Pump"), "Rotom-Frost does NOT have Hydro Pump");
assert(rotomF.moves.includes("Blizzard"), "Rotom-Frost has Blizzard");

const notFound = lookupPokemon("Amoonguss");
assert(notFound.notFound === true, "Amoonguss not in roster");
assert((notFound.suggestions?.length ?? 0) > 0, "Suggestions provided for typo");

// ── validateSet ──
section("validateSet");

const goodFroslassSet = validateSet({
  pokemon: "Froslass",
  moves: ["Aurora Veil", "Blizzard", "Shadow Ball", "Protect"],
  item: "Froslassite",
  ability: "Snow Warning",
  megaStone: "Froslassite",
});
assert(goodFroslassSet.overall, "Good Mega Froslass set is legal");

const badSinistchaSet = validateSet({
  pokemon: "Sinistcha",
  moves: ["Matcha Gotcha", "Strength Sap", "Pollen Puff", "Protect"],
  item: "Leftovers",
  ability: "Hospitality",
});
assert(!badSinistchaSet.overall, "Sinistcha+Pollen Puff flagged as invalid");
assert(badSinistchaSet.moves[2].valid === false, "Pollen Puff marked invalid");

const illegalItemSet = validateSet({
  pokemon: "Dragonite",
  moves: ["Dragon Dance", "Outrage", "Earthquake", "Protect"],
  item: "Life Orb",
});
assert(!illegalItemSet.overall, "Life Orb flagged as banned");
assert(illegalItemSet.item?.valid === false, "Life Orb → item invalid");

const incineroarKnockOff = validateSet({
  pokemon: "Incineroar",
  moves: ["Fake Out", "Knock Off", "Flare Blitz", "Parting Shot"],
});
assert(!incineroarKnockOff.overall, "Incineroar Knock Off banned in Champions");

const wrongMegaStone = validateSet({
  pokemon: "Dragonite",
  moves: ["Dragon Claw", "Earthquake", "Extreme Speed", "Protect"],
  megaStone: "Froslassite",
});
assert(wrongMegaStone.megaStone?.valid === false, "Froslassite on Dragonite flagged");

const goodAbility = validateSet({
  pokemon: "Incineroar",
  moves: ["Fake Out", "Flare Blitz", "Parting Shot", "Protect"],
  ability: "Intimidate",
});
assert(goodAbility.ability?.valid === true, "Incineroar Intimidate valid");

const badAbility = validateSet({
  pokemon: "Incineroar",
  moves: ["Fake Out", "Flare Blitz", "Parting Shot", "Protect"],
  ability: "Drought",
});
assert(badAbility.ability?.valid === false, "Incineroar Drought invalid");

// ── Items + stones ──
section("items & mega stones");

assert(findItem("Froslassite") !== undefined, "Froslassite in items.csv");
assert(findItem("Life Orb") === undefined, "Life Orb absent from items.csv");
const stones = getStoneToMega();
assert(stones.has("froslassite"), "Froslassite maps to a mega");
assert(stones.has("charizardite x"), "Charizardite X maps to a mega");
assert(stones.has("charizardite y"), "Charizardite Y maps to a mega");
const charY = stones.get("charizardite y");
assert(charY?.megaName === "Mega Charizard Y", "Charizardite Y → Mega Charizard Y");
const froStone = stones.get("froslassite");
assert(froStone?.basePokemon === "Froslass", "Froslassite → base Froslass");

// ── summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
