import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const PROJECT_ROOT = process.env.POKEMON_DATA_ROOT
  ? resolve(process.env.POKEMON_DATA_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Pokemon / move / item / type dictionaries (loaded once from CSVs)
// ---------------------------------------------------------------------------

let _pokemonNames: Set<string> | null = null;

export function getPokemonNames(): Set<string> {
  if (_pokemonNames) return _pokemonNames;
  try {
    const csv = readFileSync(resolve(PROJECT_ROOT, "pokemon_champions.csv"), "utf-8");
    const rows: Array<{ name: string }> = parse(csv, { columns: true, skip_empty_lines: true });
    _pokemonNames = new Set(rows.map((r) => r.name.toLowerCase()));
  } catch {
    _pokemonNames = new Set();
  }
  return _pokemonNames;
}

// Pokemon → [type1, type2?] map from pokemon_champions.csv. Used by the
// vsPair type_chart force-include path (Stage 4.6 P3) to translate Pokemon
// names to the type-chart headings that cover their matchups.
let _pokemonTypes: Map<string, string[]> | null = null;

export function getPokemonTypes(name: string): string[] {
  if (!_pokemonTypes) {
    _pokemonTypes = new Map();
    try {
      const csv = readFileSync(resolve(PROJECT_ROOT, "pokemon_champions.csv"), "utf-8");
      const rows: Array<{ name: string; type1: string; type2?: string }> = parse(csv, {
        columns: true,
        skip_empty_lines: true,
      });
      for (const r of rows) {
        const types = [r.type1, r.type2].filter((t): t is string => !!t && t.length > 0);
        _pokemonTypes.set(r.name.toLowerCase(), types);
      }
    } catch {
      // empty map — force-include skips when no types resolved
    }
  }
  return _pokemonTypes.get(name.toLowerCase()) ?? [];
}

let _moveNames: Set<string> | null = null;

export function getMoveNames(): Set<string> {
  if (_moveNames) return _moveNames;
  try {
    const csv = readFileSync(resolve(PROJECT_ROOT, "moves.csv"), "utf-8");
    const rows: Array<{ name: string }> = parse(csv, { columns: true, skip_empty_lines: true });
    _moveNames = new Set(rows.map((r) => r.name.toLowerCase()));
  } catch {
    _moveNames = new Set();
  }
  return _moveNames;
}

let _itemNames: Set<string> | null = null;

export function getItemNames(): Set<string> {
  if (_itemNames) return _itemNames;
  try {
    const csv = readFileSync(resolve(PROJECT_ROOT, "items.csv"), "utf-8");
    const rows: Array<{ name: string }> = parse(csv, { columns: true, skip_empty_lines: true });
    _itemNames = new Set(rows.map((r) => r.name.toLowerCase()));
  } catch {
    _itemNames = new Set();
  }
  return _itemNames;
}

// ---------------------------------------------------------------------------
// Query intent classification
// ---------------------------------------------------------------------------

export interface QueryIntent {
  /** Data categories to filter on. Empty = search all. */
  categories: string[];
  /** Whether this query needs structured stat-based SQL filtering */
  isStructured: boolean;
  /** Extracted Pokemon name (lowercase) if any */
  pokemonName: string | null;
  /** Extracted move name (lowercase) if any */
  moveName: string | null;
  /** Extracted item name (lowercase) if any */
  itemName: string | null;
  /** Whether user is asking about competitive usage data */
  isUsageQuery: boolean;
  /** Whether user is asking about countering/beating something */
  isCounterQuery: boolean;
  /** Whether user is asking about matchups/damage calcs */
  isMatchupQuery: boolean;
  /** Whether query mentions item-related keywords */
  hasItemKeyword: boolean;
  /** Whether query mentions team-related keywords */
  hasTeamKeyword: boolean;
}

const USAGE_KEYWORDS = [
  "usage", "competitive stats", "statistics", "ranked",
  "most used", "most popular", "tournament usage", "top moves", "top items",
  "top abilities", "teammates", "pikalytics", "usage rate",
  "pick rate", "usage stats",
];

const COUNTER_KEYWORDS = [
  "counter", "counters", "beat", "beats", "handle", "handles",
  "deal with", "weak to", "loses to", "check", "checks",
  "answer", "answers", "stop", "stops", "revenge",
];

const STAT_KEYWORDS = [
  "fast", "fastest", "slow", "slowest", "speed", "spe",
  "attack", "atk", "defense", "def", "special attack", "spa", "sp atk",
  "special defense", "spd", "sp def", "hp", "hit points",
  "bst", "base stat", "bulky", "bulkiest", "offensive", "high stat",
];

const STAT_QUALIFIERS = [
  "high", "highest", "low", "lowest", "good", "best", "worst",
  "above", "below", "greater", "over", "under", "at least",
  "fastest", "slowest", "bulkiest",
];

const MOVE_KEYWORDS = [
  "move", "moves", "learn", "learns", "moveset", "movepool",
  "attack move", "status move", "coverage move",
];

const ITEM_KEYWORDS = [
  "item", "items", "held item", "hold", "equip",
];

const TEAM_KEYWORDS = [
  "team", "teams", "core", "teammates", "partner", "partners",
  "pair", "pairs", "synergy",
];

const MATCHUP_KEYWORDS = [
  "matchup", "matchups", "beats", "walls", "checks", "counters",
  "what beats", "who beats", "loses to", "weak to", "strong against",
  "favored", "unfavored", "best matchup", "worst matchup",
  "ohko", "one-shot", "damage calc", "vs", "pivot", "pivots into",
  "defensive options",
];

export function classifyQuery(question: string): QueryIntent {
  const q = question.toLowerCase();
  const names = getPokemonNames();
  const moves = getMoveNames();

  // Word-boundary name match. Single-word names like "counter" or "protect"
  // collide with common English usage ("what counters Incineroar" would otherwise
  // extract move:counter). Names containing spaces/hyphens are unambiguous and
  // can fall back to substring matching. Escape regex metacharacters defensively.
  const hasName = (name: string): boolean => {
    if (name.includes(" ") || name.includes("-")) return q.includes(name);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(q);
  };

  // Extract Pokemon name from query (longest match first)
  let pokemonName: string | null = null;
  const sortedNames = [...names].sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (hasName(name)) {
      pokemonName = name;
      break;
    }
  }

  // Extract move name from query (longest match first, skip if it's a Pokemon name)
  let moveName: string | null = null;
  const sortedMoves = [...moves].sort((a, b) => b.length - a.length);
  for (const name of sortedMoves) {
    if (name === pokemonName) continue; // Avoid collision
    if (hasName(name)) {
      moveName = name;
      break;
    }
  }

  // Extract item name (longest match first, skip collisions with pokemon/move)
  const items = getItemNames();
  let itemName: string | null = null;
  const sortedItems = [...items].sort((a, b) => b.length - a.length);
  for (const name of sortedItems) {
    if (name === pokemonName || name === moveName) continue;
    if (hasName(name)) {
      itemName = name;
      break;
    }
  }

  // Word-boundary matching to avoid "attackers" matching "attack".
  // Split on non-word chars so trailing punctuation ("team?") doesn't break matching.
  const words = new Set(q.split(/\W+/).filter(Boolean));
  const matchKeyword = (kw: string) => {
    // Multi-word keywords use substring match
    if (kw.includes(" ")) return q.includes(kw);
    // Single-word keywords use word boundary
    return words.has(kw);
  };

  const isUsageQuery = USAGE_KEYWORDS.some((kw) => q.includes(kw));
  const isCounterQuery = COUNTER_KEYWORDS.some(matchKeyword);
  const isMatchupQuery = MATCHUP_KEYWORDS.some(matchKeyword);
  const hasMoveKeyword = MOVE_KEYWORDS.some(matchKeyword);
  const hasItemKeyword = ITEM_KEYWORDS.some(matchKeyword);
  // Count distinct Pokemon mentions — 2+ names in one query strongly
  // implies team-building context even without explicit "team" / "pair" words
  // (e.g. "I have Garchomp Incineroar Whimsicott, what should I add").
  let pokemonMentionCount = 0;
  for (const name of names) {
    if (hasName(name)) pokemonMentionCount++;
    if (pokemonMentionCount >= 2) break;
  }
  const hasTeamKeyword = TEAM_KEYWORDS.some(matchKeyword) || pokemonMentionCount >= 2;
  const hasStatKeyword = STAT_KEYWORDS.some(matchKeyword);
  const hasStatQualifier = STAT_QUALIFIERS.some(matchKeyword);

  // Priority-ordered classification
  const categories: string[] = [];
  let isStructured = false;

  // 1. Stats query: stat keyword + qualifier → structured search
  //    But not if item keywords are present (avoid "best items" triggering this)
  if (hasStatKeyword && hasStatQualifier && !pokemonName && !hasItemKeyword) {
    isStructured = true;
    categories.push("pokemon", "mega", "knowledge");
  }
  // 2. Usage query
  else if (isUsageQuery) {
    categories.push("usage");
    if (pokemonName) categories.push("pokemon");
  }
  // 3. Counter/matchup query — include matchup data for damage-backed answers
  else if (isCounterQuery || isMatchupQuery) {
    categories.push("matchup", "pokemon", "knowledge", "usage");
  }
  // 4. Item query — if asking about a specific Pokemon's item, also pull usage data
  else if (hasItemKeyword) {
    categories.push("item", "knowledge");
    if (pokemonName) categories.push("usage", "pokemon");
  }
  // 5. Move query — if asking about a specific Pokemon's moves, also pull usage data
  else if (hasMoveKeyword) {
    categories.push("move", "pokemon", "knowledge");
    if (pokemonName) categories.push("usage");
  }
  // 6. Team query
  else if (hasTeamKeyword) {
    categories.push("team", "usage", "knowledge");
  }
  // 7. Pokemon name detected, general question
  else if (pokemonName) {
    // Don't filter — user might want stats, moves, usage, anything about this Pokemon
    // But add knowledge to ensure strategy docs show up
  }
  // 8. General — no filter

  return {
    categories,
    isStructured,
    pokemonName,
    moveName,
    itemName,
    isUsageQuery,
    isCounterQuery,
    isMatchupQuery,
    hasItemKeyword,
    hasTeamKeyword,
  };
}
