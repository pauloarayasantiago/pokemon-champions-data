import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { PokemonData, MegaData, MoveData, BaseStats } from "./types.js";

const ROOT = process.env.POKEMON_DATA_ROOT
  ? resolve(process.env.POKEMON_DATA_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ── Lazy-loaded singletons ──

let _pokemon: Map<string, PokemonData> | null = null;
let _megas: Map<string, MegaData> | null = null;
let _moves: Map<string, MoveData> | null = null;

function readCSV(filename: string): Record<string, string>[] {
  const raw = readFileSync(join(ROOT, filename), "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true });
}

function parseStats(row: Record<string, string>): BaseStats {
  return {
    hp: Number(row.hp),
    attack: Number(row.attack),
    defense: Number(row.defense),
    spAtk: Number(row.sp_atk),
    spDef: Number(row.sp_def),
    speed: Number(row.speed),
  };
}

// ── Pokemon data ──

export function getPokemon(): Map<string, PokemonData> {
  if (_pokemon) return _pokemon;
  _pokemon = new Map();
  for (const row of readCSV("pokemon_champions.csv")) {
    const name = row.name.trim();
    _pokemon.set(name.toLowerCase(), {
      name,
      type1: row.type1.trim(),
      type2: row.type2?.trim() || null,
      abilities: row.abilities.split("|").map((a) => a.trim()),
      moves: row.moves.split("|").map((m) => m.trim()),
      baseStats: parseStats(row),
    });
  }
  return _pokemon;
}

// ── Mega evolution data ──

export function getMegas(): Map<string, MegaData> {
  if (_megas) return _megas;
  _megas = new Map();

  // mega_abilities.csv has type overrides for some megas
  const abilityOverrides = new Map<string, { type1: string; type2: string | null; ability: string }>();
  for (const row of readCSV("mega_abilities.csv")) {
    const name = row.pokemon.trim();
    abilityOverrides.set(name.toLowerCase(), {
      type1: row.type1.trim(),
      type2: row.type2?.trim() || null,
      ability: row.ability.trim(),
    });
  }

  for (const row of readCSV("mega_evolutions.csv")) {
    const megaName = row.mega_name.trim();
    const key = megaName.toLowerCase();
    const override = abilityOverrides.get(key);
    _megas.set(key, {
      basePokemon: row.base_pokemon.trim(),
      megaName,
      type1: override?.type1 ?? row.type1.trim(),
      type2: override?.type2 ?? (row.type2?.trim() || null),
      ability: override?.ability ?? row.ability.trim(),
      baseStats: parseStats(row),
    });
  }
  return _megas;
}

// ── Move data (with Champions overrides merged) ──

export function getMoves(): Map<string, MoveData> {
  if (_moves) return _moves;
  _moves = new Map();

  // Base moves
  for (const row of readCSV("moves.csv")) {
    const name = row.name.trim();
    _moves.set(name.toLowerCase(), {
      name,
      type: row.type.trim(),
      category: row.category.trim() as MoveData["category"],
      pp: Number(row.pp) || 0,
      power: row.power === "--" ? 0 : Number(row.power) || 0,
      accuracy: Number(row.accuracy) || 0,
      effect: row.effect?.trim() || "",
    });
  }

  // Champions overrides (updated_attacks.csv)
  for (const row of readCSV("updated_attacks.csv")) {
    const name = row.name.trim();
    const key = name.toLowerCase();
    const existing = _moves.get(key);
    if (existing) {
      existing.type = row.champions_type.trim() || existing.type;
      existing.category = (row.champions_category.trim() as MoveData["category"]) || existing.category;
      existing.pp = Number(row.champions_pp) || existing.pp;
      existing.power = row.champions_power === "--" ? 0 : Number(row.champions_power) || existing.power;
      existing.accuracy = Number(row.champions_accuracy) || existing.accuracy;
      existing.effect = row.champions_effect?.trim() || existing.effect;
    }
  }

  return _moves;
}

// ── 18x18 Type effectiveness chart ──

const TYPES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
  "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
  "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
] as const;

// Rows = attacking type, Cols = defending type
// 1 = neutral, 2 = super effective, 0.5 = resisted, 0 = immune
const CHART: number[][] = [
  //       Nor  Fir  Wat  Ele  Gra  Ice  Fig  Poi  Gro  Fly  Psy  Bug  Roc  Gho  Dra  Dar  Ste  Fai
  /* Nor */ [1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,  .5,   0,   1,   1,  .5,   1],
  /* Fir */ [1,  .5,  .5,   1,   2,   2,   1,   1,   1,   1,   1,   2,  .5,   1,  .5,   1,   2,   1],
  /* Wat */ [1,   2,  .5,   1,  .5,   1,   1,   1,   2,   1,   1,   1,   2,   1,  .5,   1,   1,   1],
  /* Ele */ [1,   1,   2,  .5,  .5,   1,   1,   1,   0,   2,   1,   1,   1,   1,  .5,   1,   1,   1],
  /* Gra */ [1,  .5,   2,   1,  .5,   1,   1,  .5,   2,  .5,   1,  .5,   2,   1,  .5,   1,  .5,   1],
  /* Ice */ [1,  .5,  .5,   1,   2,  .5,   1,   1,   2,   2,   1,   1,   1,   1,   2,   1,  .5,   1],
  /* Fig */ [2,   1,   1,   1,   1,   2,   1,  .5,   1,  .5,  .5,  .5,   2,   0,   1,   2,   2,  .5],
  /* Poi */ [1,   1,   1,   1,   2,   1,   1,  .5,  .5,   1,   1,   1,  .5,  .5,   1,   1,   0,   2],
  /* Gro */ [1,   2,   1,   2,  .5,   1,   1,   2,   1,   0,   1,  .5,   2,   1,   1,   1,   2,   1],
  /* Fly */ [1,   1,   1,  .5,   2,   1,   2,   1,   1,   1,   1,   2,  .5,   1,   1,   1,  .5,   1],
  /* Psy */ [1,   1,   1,   1,   1,   1,   2,   2,   1,   1,  .5,   1,   1,   1,   1,   0,  .5,   1],
  /* Bug */ [1,  .5,   1,   1,   2,   1,  .5,  .5,   1,  .5,   2,   1,   1,  .5,   1,   2,  .5,  .5],
  /* Roc */ [1,   2,   1,   1,   1,   2,  .5,   1,  .5,   2,   1,   2,   1,   1,   1,   1,  .5,   1],
  /* Gho */ [0,   1,   1,   1,   1,   1,   1,   1,   1,   1,   2,   1,   1,   2,   1,  .5,   1,   1],
  /* Dra */ [1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   2,   1,  .5,   0],
  /* Dar */ [1,   1,   1,   1,   1,   1,  .5,   1,   1,   1,   2,   1,   1,   2,   1,  .5,  .5,  .5],
  /* Ste */ [1,  .5,  .5,  .5,   1,   2,   1,   1,   1,   1,   1,   1,   2,   1,   1,   1,  .5,   2],
  /* Fai */ [1,  .5,   1,   1,   1,   1,   2,  .5,   1,   1,   1,   1,   1,   1,   2,   2,  .5,   1],
];

const typeIndex = new Map(TYPES.map((t, i) => [t.toLowerCase(), i]));

export function getTypeEffectiveness(atkType: string, defType1: string, defType2: string | null): number {
  const ai = typeIndex.get(atkType.toLowerCase());
  const d1 = typeIndex.get(defType1.toLowerCase());
  if (ai === undefined || d1 === undefined) return 1;
  let eff = CHART[ai][d1];
  if (defType2) {
    const d2 = typeIndex.get(defType2.toLowerCase());
    if (d2 !== undefined) eff *= CHART[ai][d2];
  }
  return eff;
}

// ── Move flag sets (for ability/item interactions) ──

export const CONTACT_MOVES = new Set([
  "accelerock", "acrobatics", "aerial ace", "aqua jet", "aqua step", "aqua tail",
  "assurance", "avalanche", "beat up", "behemoth bash", "behemoth blade", "bite",
  "blaze kick", "body press", "body slam", "bolt strike", "bounce", "brave bird",
  "breaking swipe", "brick break", "brutal swing", "bug bite", "bullet punch",
  "close combat", "collision course", "combat torque", "comet punch", "counter",
  "crabhammer", "cross chop", "cross poison", "crunch", "crush claw",
  "dire claw", "double-edge", "double iron bash", "drain punch", "dragon claw",
  "dragon rush", "dragon tail", "dual wingbeat", "earthquake", "electro drift",
  "facade", "fake out", "fell stinger", "fire fang", "fire punch", "first impression",
  "flare blitz", "flip turn", "fly", "focus punch", "foul play", "giga impact",
  "grassy glide", "hammer arm", "head smash", "headbutt", "headlong rush",
  "heat crash", "high horsepower", "high jump kick", "horn leech", "ice fang",
  "ice hammer", "ice punch", "ice spinner", "iron head", "iron tail",
  "jaw lock", "jet punch", "knock off", "lash out", "last respects", "leaf blade",
  "leech life", "liquidation", "low kick", "low sweep", "lunge",
  "mach punch", "mega kick", "mega punch", "metal claw", "meteor mash",
  "nuzzle", "outrage", "payback", "phantom force", "play rough", "poison fang",
  "poison jab", "pounce", "power whip", "psychic fangs", "pursuit",
  "quick attack", "rage fist", "rapid spin", "retaliate", "return", "revenge",
  "rock blast", "rock slide", "rock smash", "rock tomb", "rolling kick",
  "sacred sword", "scale shot", "seed bomb", "shadow claw", "shadow sneak",
  "sky uppercut", "slam", "slash", "smart strike", "snap trap", "spirit break",
  "spirit shackle", "stomping tantrum", "stone edge", "strength", "struggle",
  "sucker punch", "supercell slam", "superpower", "surging strikes", "tackle",
  "take down", "temper flare", "throat chop", "thunder fang", "thunder punch",
  "trailblaze", "triple axel", "trop kick", "u-turn", "uppercut",
  "volt tackle", "waterfall", "wave crash", "wicked blow", "wild charge",
  "wood hammer", "x-scissor", "zen headbutt", "zing zap",
]);

export const SOUND_MOVES = new Set([
  "boomburst", "bug buzz", "chatter", "clanging scales", "clangorous soulblaze",
  "disarming voice", "echoed voice", "eerie spell", "grass whistle",
  "growl", "heal bell", "howl", "hyper voice", "metal sound", "noble roar",
  "overdrive", "parting shot", "perish song", "relic song", "roar",
  "round", "screech", "shadow panic", "sing", "snarl", "snore",
  "sparkling aria", "supersonic", "torch song", "uproar",
]);

export const PULSE_MOVES = new Set([
  "aura sphere", "dark pulse", "dragon pulse", "heal pulse",
  "origin pulse", "terrain pulse", "water pulse",
]);

export const SLICING_MOVES = new Set([
  "aerial ace", "air cutter", "air slash", "behemoth blade",
  "cross poison", "cut", "dire claw", "dragon claw", "fury cutter",
  "kowtow cleave", "leaf blade", "night slash", "population bomb",
  "psycho cut", "razor leaf", "razor shell", "sacred sword",
  "shadow claw", "slash", "solar blade", "stone axe", "x-scissor",
]);

export const BITE_MOVES = new Set([
  "bite", "crunch", "fire fang", "hyper fang", "ice fang",
  "jaw lock", "poison fang", "psychic fangs", "thunder fang",
]);

export const PUNCH_MOVES = new Set([
  "bullet punch", "close combat", "comet punch", "drain punch",
  "dynamic punch", "fire punch", "focus punch", "hammer arm",
  "ice hammer", "ice punch", "jet punch", "mach punch",
  "mega punch", "meteor mash", "power-up punch", "shadow punch",
  "sky uppercut", "thunder punch",
]);

// ── Type-boost items → type mapping ──

export const TYPE_BOOST_ITEMS: Record<string, string> = {
  "black belt": "Fighting",
  "black glasses": "Dark",
  "charcoal": "Fire",
  "dragon fang": "Dragon",
  "fairy feather": "Fairy",
  "hard stone": "Rock",
  "magnet": "Electric",
  "metal coat": "Steel",
  "miracle seed": "Grass",
  "mystic water": "Water",
  "never-melt ice": "Ice",
  "poison barb": "Poison",
  "sharp beak": "Flying",
  "silk scarf": "Normal",
  "silver powder": "Bug",
  "soft sand": "Ground",
  "spell tag": "Ghost",
  "twisted spoon": "Psychic",
};

// ── Resist berries → type they halve ──

export const RESIST_BERRIES: Record<string, string> = {
  "babiri berry": "Steel",
  "charti berry": "Rock",
  "chople berry": "Fighting",
  "coba berry": "Flying",
  "colbur berry": "Dark",
  "haban berry": "Dragon",
  "kasib berry": "Ghost",
  "kebia berry": "Poison",
  "occa berry": "Fire",
  "passho berry": "Water",
  "payapa berry": "Psychic",
  "rindo berry": "Grass",
  "roseli berry": "Fairy",
  "shuca berry": "Ground",
  "tanga berry": "Bug",
  "wacan berry": "Electric",
  "yache berry": "Ice",
  "chilan berry": "Normal",
};

// ── Lookup helpers ──

export function findPokemon(name: string): PokemonData | undefined {
  return getPokemon().get(name.toLowerCase());
}

export function findMega(name: string): MegaData | undefined {
  const megas = getMegas();
  const lower = name.toLowerCase();
  // Try exact match first
  let mega = megas.get(lower);
  if (mega) return mega;
  // Try "Mega X" format
  mega = megas.get(`mega ${lower}`);
  if (mega) return mega;
  // Try prefix match (e.g. "Mega Charizard" matches "Mega Charizard X")
  for (const [key, m] of megas.entries()) {
    if (key.startsWith(lower) && key !== lower) return m;
  }
  // Search by base pokemon name
  for (const m of megas.values()) {
    if (m.basePokemon.toLowerCase() === lower) return m;
  }
  return undefined;
}

export function findMove(name: string): MoveData | undefined {
  return getMoves().get(name.toLowerCase());
}
