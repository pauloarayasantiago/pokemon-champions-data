import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { join, resolve } from "path";
import { findPokemon, findMega, findMove, getPokemon, getMegas } from "./calc/data.js";
import type { PokemonData, MegaData } from "./calc/types.js";

const ROOT = process.env.POKEMON_DATA_ROOT ? resolve(process.env.POKEMON_DATA_ROOT) : process.cwd();

export const BANNED_ITEMS: ReadonlySet<string> = new Set(
  [
    "Life Orb", "Choice Band", "Choice Specs", "Assault Vest", "Rocky Helmet",
    "Heavy-Duty Boots", "Eviolite", "Flame Orb", "Toxic Orb", "Power Herb",
    "Light Clay", "Covert Cloak", "Loaded Dice", "Utility Umbrella", "Expert Belt",
    "Clear Amulet", "Throat Spray", "Booster Energy", "Normal Gem",
    "Weakness Policy", "Black Sludge", "Safety Goggles",
  ].map((s) => s.toLowerCase()),
);

const BANNED_GEM_SUFFIXES = ["gem"];

export const BANNED_MOVES_BY_POKEMON: Record<string, ReadonlySet<string>> = {
  incineroar: new Set(["knock off", "u-turn"]),
};

let _items: Map<string, { name: string; effect: string }> | null = null;
let _stoneToMega: Map<string, MegaData> | null = null;

function readCSV(filename: string): Record<string, string>[] {
  const raw = readFileSync(join(ROOT, filename), "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true });
}

export function getItems(): Map<string, { name: string; effect: string }> {
  if (_items) return _items;
  _items = new Map();
  for (const row of readCSV("items.csv")) {
    const name = row.name.trim();
    _items.set(name.toLowerCase(), { name, effect: row.effect?.trim() ?? "" });
  }
  return _items;
}

export function findItem(name: string): { name: string; effect: string } | undefined {
  return getItems().get(name.trim().toLowerCase());
}

export function getStoneToMega(): Map<string, MegaData> {
  if (_stoneToMega) return _stoneToMega;
  _stoneToMega = new Map();
  const megas = Array.from(getMegas().values());
  for (const [key, item] of getItems().entries()) {
    if (!/(ite|ite x|ite y)$/.test(key)) continue;
    if (key === "hard stone" || key === "shiny stone" || key === "sun stone" || key === "dawn stone" || key === "dusk stone" || key === "water stone" || key === "moon stone" || key === "fire stone" || key === "leaf stone" || key === "ice stone" || key === "thunder stone" || key === "everstone" || key === "iron ball" || key === "absorb bulb" || key === "white herb") continue;
    const stripped = key.replace(/\s*(ite x|ite y|ite|nite)$/, "");
    let match: MegaData | undefined;
    for (const m of megas) {
      const base = m.basePokemon.toLowerCase();
      const megaName = m.megaName.toLowerCase();
      if (base.startsWith(stripped) || stripped.startsWith(base.slice(0, 5))) {
        if (/\s(x|y)$/.test(key)) {
          const suffix = key.endsWith(" x") ? "x" : "y";
          if (megaName.endsWith(suffix)) {
            match = m;
            break;
          }
        } else {
          match = m;
          break;
        }
      }
    }
    if (match) _stoneToMega!.set(key, match);
    // unmatched are silently skipped (non-mega "ite" items like Static/Dynamic)
    void item;
  }
  return _stoneToMega;
}

// ── Lookup (pokedex tool) ──

export interface PokedexEntry {
  name: string;
  types: string[];
  abilities: string[];
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number; bst: number };
  moves: string[];
  mega?: {
    megaName: string;
    basePokemon: string;
    types: string[];
    ability: string;
    stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number; bst: number };
    stone: string | null;
  };
  notFound?: true;
  suggestions?: string[];
}

function statsOf(p: PokemonData | MegaData) {
  const s = p.baseStats;
  return {
    hp: s.hp, atk: s.attack, def: s.defense, spa: s.spAtk, spd: s.spDef, spe: s.speed,
    bst: s.hp + s.attack + s.defense + s.spAtk + s.spDef + s.speed,
  };
}

function typesOf(t1: string, t2: string | null): string[] {
  return t2 ? [t1, t2] : [t1];
}

function stoneForMega(mega: MegaData): string | null {
  for (const [stone, m] of getStoneToMega().entries()) {
    if (m.megaName === mega.megaName) return getItems().get(stone)!.name;
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function closestNames(query: string, n = 3): string[] {
  const q = query.toLowerCase();
  const names = Array.from(getPokemon().values()).map((p) => p.name);
  return names
    .map((name) => ({ name, d: levenshtein(q, name.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.name);
}

export function lookupPokemon(name: string): PokedexEntry {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const isMegaQuery = lower.startsWith("mega ");
  const baseQuery = isMegaQuery ? trimmed.slice(5).trim() : trimmed;

  const mon = findPokemon(baseQuery);
  const mega = findMega(isMegaQuery ? trimmed : baseQuery);

  if (!mon && !mega) {
    return { name: trimmed, types: [], abilities: [], stats: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, bst: 0 }, moves: [], notFound: true, suggestions: closestNames(baseQuery) };
  }

  const basePokemon = mon ?? (mega ? findPokemon(mega.basePokemon) : undefined);
  if (!basePokemon) {
    return { name: trimmed, types: [], abilities: [], stats: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, bst: 0 }, moves: [], notFound: true, suggestions: closestNames(baseQuery) };
  }

  const entry: PokedexEntry = {
    name: basePokemon.name,
    types: typesOf(basePokemon.type1, basePokemon.type2),
    abilities: basePokemon.abilities,
    stats: statsOf(basePokemon),
    moves: basePokemon.moves,
  };

  if (mega) {
    entry.mega = {
      megaName: mega.megaName,
      basePokemon: mega.basePokemon,
      types: typesOf(mega.type1, mega.type2),
      ability: mega.ability,
      stats: statsOf(mega),
      stone: stoneForMega(mega),
    };
  }
  return entry;
}

// ── Validator ──

export interface ValidationDetail {
  valid: boolean;
  reason?: string;
}

export interface MoveValidation extends ValidationDetail {
  name: string;
}

export interface SetInput {
  pokemon: string;
  moves: string[];
  item?: string;
  ability?: string;
  megaStone?: string;
}

export interface SetValidation {
  pokemon: ValidationDetail & { resolvedName?: string };
  moves: MoveValidation[];
  item: ValidationDetail | null;
  ability: ValidationDetail | null;
  megaStone: ValidationDetail | null;
  overall: boolean;
}

function isBannedItem(itemName: string): boolean {
  const lower = itemName.toLowerCase();
  if (BANNED_ITEMS.has(lower)) return true;
  for (const suffix of BANNED_GEM_SUFFIXES) {
    if (lower.endsWith(" " + suffix) && lower !== "normal gem" && /^[a-z]+ gem$/.test(lower)) {
      return true;
    }
  }
  return false;
}

export function validateSet(input: SetInput): SetValidation {
  const out: SetValidation = {
    pokemon: { valid: false },
    moves: [],
    item: null,
    ability: null,
    megaStone: null,
    overall: false,
  };

  const lookup = lookupPokemon(input.pokemon);
  if (lookup.notFound) {
    out.pokemon = { valid: false, reason: `Not in roster. Suggestions: ${lookup.suggestions?.join(", ")}` };
    return out;
  }
  out.pokemon = { valid: true, resolvedName: lookup.name };

  const movepool = new Set(lookup.moves.map((m) => m.toLowerCase()));
  const banned = BANNED_MOVES_BY_POKEMON[lookup.name.toLowerCase()] ?? new Set<string>();

  for (const mv of input.moves) {
    const mvLower = mv.trim().toLowerCase();
    if (!findMove(mv)) {
      out.moves.push({ name: mv, valid: false, reason: "move does not exist in Champions" });
      continue;
    }
    if (banned.has(mvLower)) {
      out.moves.push({ name: mv, valid: false, reason: `banned on ${lookup.name} in Champions` });
      continue;
    }
    if (!movepool.has(mvLower)) {
      out.moves.push({ name: mv, valid: false, reason: `not in ${lookup.name}'s movepool` });
      continue;
    }
    out.moves.push({ name: mv, valid: true });
  }

  if (input.item) {
    const itm = input.item.trim();
    if (isBannedItem(itm)) {
      out.item = { valid: false, reason: "banned in Champions (missing item)" };
    } else if (!findItem(itm)) {
      out.item = { valid: false, reason: "not in items.csv" };
    } else {
      out.item = { valid: true };
    }
  }

  if (input.ability) {
    const ab = input.ability.trim().toLowerCase();
    const nativeAbilities = lookup.abilities.map((a) => a.toLowerCase());
    const megaAbilities = new Set<string>();
    if (lookup.mega?.ability) megaAbilities.add(lookup.mega.ability.toLowerCase());
    if (input.megaStone) {
      const stoneMega = getStoneToMega().get(input.megaStone.trim().toLowerCase());
      if (stoneMega?.ability) megaAbilities.add(stoneMega.ability.toLowerCase());
    }
    // Also include every known mega ability whose basePokemon matches (covers X/Y splits).
    for (const m of getStoneToMega().values()) {
      if (m.basePokemon.toLowerCase() === lookup.name.toLowerCase() && m.ability) {
        megaAbilities.add(m.ability.toLowerCase());
      }
    }
    if (nativeAbilities.includes(ab) || megaAbilities.has(ab)) {
      out.ability = { valid: true };
    } else {
      out.ability = { valid: false, reason: `not a native or mega ability for ${lookup.name}` };
    }
  }

  if (input.megaStone) {
    const stone = input.megaStone.trim();
    const stoneEntry = getStoneToMega().get(stone.toLowerCase());
    if (!stoneEntry) {
      out.megaStone = { valid: false, reason: "not a known Mega Stone" };
    } else if (stoneEntry.basePokemon.toLowerCase() !== lookup.name.toLowerCase()) {
      out.megaStone = { valid: false, reason: `${stone} is for ${stoneEntry.basePokemon}, not ${lookup.name}` };
    } else {
      out.megaStone = { valid: true };
    }
  }

  out.overall =
    out.pokemon.valid &&
    out.moves.every((m) => m.valid) &&
    (out.item?.valid ?? true) &&
    (out.ability?.valid ?? true) &&
    (out.megaStone?.valid ?? true);

  return out;
}
