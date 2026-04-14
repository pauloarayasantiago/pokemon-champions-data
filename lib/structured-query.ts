/**
 * Natural language → SQL filter parser for stat-based Pokemon queries.
 *
 * Converts queries like "fast Water type with high special attack" into
 * SQL WHERE predicates that LanceDB can execute directly.
 */

// ---------------------------------------------------------------------------
// Stat thresholds (informed by Champions speed tiers and competitive context)
// ---------------------------------------------------------------------------

const SPEED_THRESHOLDS = {
  fast: 95,
  fastest: 110,
  slow: 60,
  slowest: 45,
};

const STAT_THRESHOLDS = {
  high: 100,
  highest: 120,
  good: 85,
  low: 60,
  lowest: 40,
};

// ---------------------------------------------------------------------------
// Type parsing
// ---------------------------------------------------------------------------

const POKEMON_TYPES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
  "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
  "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
];

function extractTypes(query: string): string[] {
  const q = query.toLowerCase();
  return POKEMON_TYPES.filter((t) => q.includes(t.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Stat extraction
// ---------------------------------------------------------------------------

interface StatCondition {
  column: string;
  operator: ">=" | "<=";
  value: number;
}

const STAT_NAMES: Record<string, string> = {
  "speed": "stat_speed",
  "spe": "stat_speed",
  "attack": "stat_attack",
  "atk": "stat_attack",
  "defense": "stat_defense",
  "def": "stat_defense",
  "special attack": "stat_sp_atk",
  "sp atk": "stat_sp_atk",
  "spa": "stat_sp_atk",
  "special defense": "stat_sp_def",
  "sp def": "stat_sp_def",
  "spd": "stat_sp_def",
  "hp": "stat_hp",
  "hit points": "stat_hp",
  "bst": "stat_bst",
  "base stat": "stat_bst",
};

function extractStatConditions(query: string): StatCondition[] {
  const q = query.toLowerCase();
  const conditions: StatCondition[] = [];

  // "fast" / "fastest" / "slow" / "slowest"
  if (q.includes("fastest")) {
    conditions.push({ column: "stat_speed", operator: ">=", value: SPEED_THRESHOLDS.fastest });
  } else if (q.includes("fast")) {
    conditions.push({ column: "stat_speed", operator: ">=", value: SPEED_THRESHOLDS.fast });
  }
  if (q.includes("slowest")) {
    conditions.push({ column: "stat_speed", operator: "<=", value: SPEED_THRESHOLDS.slowest });
  } else if (q.includes("slow")) {
    conditions.push({ column: "stat_speed", operator: "<=", value: SPEED_THRESHOLDS.slow });
  }

  // "bulky" / "bulkiest"
  if (q.includes("bulk")) {
    conditions.push({ column: "stat_hp", operator: ">=", value: 80 });
    conditions.push({ column: "stat_defense", operator: ">=", value: 80 });
  }

  // "high/good [stat]", "highest [stat]"
  // Sort by key length descending so "special attack" matches before "attack"
  const sortedNames = Object.entries(STAT_NAMES).sort(
    ([a], [b]) => b.length - a.length,
  );
  // Track matched positions in the query to prevent substring double-matches
  const matchedPositions: Array<[number, number]> = [];

  for (const [name, column] of sortedNames) {
    if (column === "stat_speed") continue; // handled by fast/slow above

    const idx = q.indexOf(name);
    if (idx === -1) continue;

    // Skip if this position is already inside a longer match
    const end = idx + name.length;
    const overlaps = matchedPositions.some(
      ([s, e]) => idx >= s && end <= e,
    );
    if (overlaps) continue;

    // Check for preceding qualifier
    const before = q.slice(Math.max(0, idx - 20), idx);

    if (before.includes("highest") || before.includes("best")) {
      conditions.push({ column, operator: ">=", value: STAT_THRESHOLDS.highest });
      matchedPositions.push([idx, end]);
    } else if (before.includes("high") || before.includes("good") || before.includes("strong")) {
      conditions.push({ column, operator: ">=", value: STAT_THRESHOLDS.high });
      matchedPositions.push([idx, end]);
    } else if (before.includes("low") || before.includes("weak")) {
      conditions.push({ column, operator: "<=", value: STAT_THRESHOLDS.low });
      matchedPositions.push([idx, end]);
    }
  }

  return conditions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a natural language stat query into a LanceDB SQL WHERE predicate.
 * Returns null if the query doesn't contain stat-based conditions.
 */
export function buildStatFilter(question: string): string | null {
  const types = extractTypes(question);
  const stats = extractStatConditions(question);

  if (types.length === 0 && stats.length === 0) return null;

  const parts: string[] = [];

  // NOTE: We intentionally skip the data_category filter here.
  // LanceDB has a bug where combining the scalar-indexed data_category column
  // with non-indexed columns (col_type1, stat_*) in a single WHERE clause
  // returns incomplete results. Since only Pokemon/Mega rows have non-null
  // stat columns, the stat filters naturally exclude other categories.

  // Type filter
  for (const type of types) {
    parts.push(`(col_type1 = '${type}' OR col_type2 = '${type}')`);
  }

  // Stat filters
  for (const cond of stats) {
    parts.push(`${cond.column} ${cond.operator} ${cond.value}`);
  }

  return parts.join(" AND ");
}

/**
 * Build a sort clause to order results by a relevant stat.
 * Returns the stat column to sort by, or null.
 */
export function inferSortStat(question: string): { column: string; desc: boolean } | null {
  const q = question.toLowerCase();

  if (q.includes("fastest") || q.includes("fast")) return { column: "stat_speed", desc: true };
  if (q.includes("slowest") || q.includes("slow")) return { column: "stat_speed", desc: false };
  if (q.includes("highest attack") || q.includes("best attack")) return { column: "stat_attack", desc: true };
  if (q.includes("highest special attack") || q.includes("best sp atk")) return { column: "stat_sp_atk", desc: true };
  if (q.includes("bulkiest") || q.includes("bulk")) return { column: "stat_hp", desc: true };

  return null;
}
