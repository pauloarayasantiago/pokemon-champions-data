import {
  ALL_TYPES,
  isPokemonType,
  type PokemonType,
} from "@/components/ui/type-badge";

export interface RosterStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
  bst: number;
}

export interface RosterUsage {
  pct: number;
  rank: number;
}

export interface RosterEntry {
  name: string;
  types: PokemonType[];
  stats?: RosterStats;
  usage?: RosterUsage | null;
}

export interface TeamJsonPokemon {
  name: string;
  item?: string;
  ability?: string;
  moves?: string[];
  spread?: string;
  nature?: string;
}

export interface TeamJsonData {
  archetype?: string;
  megaStone?: string;
  pokemon: TeamJsonPokemon[];
}

export type TeamSlot = {
  name: string;
  types: PokemonType[];
  stats?: RosterStats;
  usage?: RosterUsage | null;
  /** Set when team-json was parsed for this slot. */
  build?: TeamJsonPokemon;
} | null;

export type FilledTeamSlot = NonNullable<TeamSlot>;

const MEGA_PREFIX_RE = /^Mega\s+/i;
const NON_LETTER_RE = /[^a-zA-Z]/g;

function normalize(s: string): string {
  return s.toLowerCase().replace(NON_LETTER_RE, "");
}

export function buildRosterIndex(roster: RosterEntry[]): {
  byNormalized: Map<string, RosterEntry>;
  sortedNames: string[];
} {
  const byNormalized = new Map<string, RosterEntry>();
  for (const entry of roster) {
    byNormalized.set(normalize(entry.name), entry);
    const stripped = entry.name.replace(MEGA_PREFIX_RE, "");
    if (stripped !== entry.name) {
      byNormalized.set(normalize(stripped), entry);
    }
  }
  const sortedNames = roster
    .map((r) => r.name)
    .slice()
    .sort((a, b) => b.length - a.length);
  return { byNormalized, sortedNames };
}

export function lookupPokemon(
  query: string,
  index: Map<string, RosterEntry>,
): RosterEntry | null {
  if (!query) return null;
  const cleaned = query
    .replace(/\([^)]*\)/g, "")
    .replace(MEGA_PREFIX_RE, "")
    .trim();
  const norm = normalize(cleaned);
  if (!norm) return null;
  return index.get(norm) ?? null;
}

const TEAM_JSON_RE = /```team-json\s*\n([\s\S]*?)\n```/;

/** Parse the most recent ```team-json fence from the latest assistant message. */
export function parseTeamJsonFromMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): TeamJsonData | null {
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content.trim());
  if (!lastAssistant) return null;
  const m = lastAssistant.content.match(TEAM_JSON_RE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.pokemon) &&
      parsed.pokemon.length > 0
    ) {
      return parsed as TeamJsonData;
    }
  } catch {
    /* malformed */
  }
  return null;
}

/** Combine team-json (preferred) with name-based extraction (fallback). */
export function parseTeamFromMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  roster: RosterEntry[],
): TeamSlot[] {
  const empty = (): TeamSlot[] => Array.from({ length: 6 }, () => null);
  if (roster.length === 0) return empty();

  const { byNormalized, sortedNames } = buildRosterIndex(roster);

  // Preferred: parse team-json — gives us name + build (item, ability, moves, spread, nature).
  const teamJson = parseTeamJsonFromMessages(messages);
  if (teamJson) {
    const slots: TeamSlot[] = [];
    for (const p of teamJson.pokemon.slice(0, 6)) {
      const entry = lookupPokemon(p.name, byNormalized);
      slots.push(
        entry
          ? {
              name: entry.name,
              types: filterPokemonTypes(entry.types),
              stats: entry.stats,
              usage: entry.usage ?? null,
              build: p,
            }
          : {
              name: p.name,
              types: [],
              build: p,
            },
      );
    }
    while (slots.length < 6) slots.push(null);
    return slots;
  }

  // Fallback: regex Pokemon names from the latest assistant message.
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content.trim());
  if (!lastAssistant) return empty();

  const escaped = sortedNames.map((n) =>
    n.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
  );
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "g");
  const seen = new Set<string>();
  const order: RosterEntry[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(lastAssistant.content)) !== null) {
    const entry = byNormalized.get(normalize(match[1]));
    if (!entry || seen.has(entry.name)) continue;
    seen.add(entry.name);
    order.push(entry);
    if (order.length >= 6) break;
  }
  const slots: TeamSlot[] = [];
  for (let i = 0; i < 6; i++) {
    const e = order[i];
    if (e) {
      slots.push({
        name: e.name,
        types: filterPokemonTypes(e.types),
        stats: e.stats,
        usage: e.usage ?? null,
      });
    } else {
      slots.push(null);
    }
  }
  return slots;
}

function filterPokemonTypes(types: string[]): PokemonType[] {
  const out: PokemonType[] = [];
  for (const raw of types) {
    const trimmed = raw.trim();
    if (isPokemonType(trimmed)) out.push(trimmed);
  }
  return out;
}

// ─── Type chart and coverage ─────────────────────────────────────────────

const TYPE_CHART: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

function effectiveness(attacker: PokemonType, target: PokemonType): number {
  return TYPE_CHART[attacker]?.[target] ?? 1;
}

/** Multiplier from `attackingType` against a Pokemon with given defending types. */
export function multiplierAgainst(
  attackingType: PokemonType,
  defenderTypes: PokemonType[],
): number {
  return defenderTypes.reduce(
    (acc, t) => acc * effectiveness(attackingType, t),
    1,
  );
}

export function computeOffensiveCoverage(team: TeamSlot[]): Set<PokemonType> {
  const covered = new Set<PokemonType>();
  for (const slot of team) {
    if (!slot) continue;
    for (const myType of slot.types) {
      for (const targetType of ALL_TYPES) {
        if (effectiveness(myType, targetType) > 1) covered.add(targetType);
      }
    }
  }
  return covered;
}

/**
 * For each attacking type, compute the team's worst (highest) multiplier —
 * i.e., how badly the team can be hit by a same-type move from the opponent.
 * Returns map: attackingType → worst multiplier across team members.
 */
export function computeDefensiveWeakness(
  team: TeamSlot[],
): Map<PokemonType, number> {
  const out = new Map<PokemonType, number>();
  const filled = team.filter((s): s is FilledTeamSlot => !!s && s.types.length > 0);
  if (filled.length === 0) return out;
  for (const attackingType of ALL_TYPES) {
    let worst = 0;
    for (const slot of filled) {
      const mult = multiplierAgainst(attackingType, slot.types);
      if (mult > worst) worst = mult;
    }
    out.set(attackingType, worst);
  }
  return out;
}

/** Detect citation tokens like (PC215), pikalytics, serebii in chat content. */
export function extractCitations(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(/\b(PC\d{2,4})\b/g)) out.add(m[1]);
  for (const m of content.matchAll(
    /\b(pikalytics|serebii|tournament_teams|youtube|transcripts?)\b/gi,
  )) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out).slice(0, 12);
}

// ─── Speed effective calculation ─────────────────────────────────────────

const SAND_RUSH = new Set(["Sand Rush", "Sand Force"]);
const SWIFT_SWIM = new Set(["Swift Swim"]);
const CHLOROPHYLL = new Set(["Chlorophyll"]);
const SLUSH_RUSH = new Set(["Slush Rush", "Snow Cloak"]);

const POSITIVE_NATURES = new Set([
  "Timid", "Hasty", "Jolly", "Naive",
]);
const NEGATIVE_NATURES = new Set([
  "Modest", "Bold", "Calm", "Adamant", "Careful", "Quiet", "Brave", "Sassy", "Relaxed",
]);

/** Compute a Pokemon's effective speed at level 50 with given build. */
export function effectiveSpeed(slot: FilledTeamSlot): number | null {
  const base = slot.stats?.spe;
  if (typeof base !== "number") return null;
  // Champions: 31 IVs assumed; SP allocated per slot.spread (HP/Atk/Def/SpA/SpD/Spe).
  let speSp = 0;
  if (slot.build?.spread) {
    const parts = slot.build.spread.split(/[\/,\s]+/).filter(Boolean).map(Number);
    if (parts.length === 6 && !Number.isNaN(parts[5])) speSp = parts[5];
  }
  const nature = slot.build?.nature?.trim() ?? "";
  const natureMult = POSITIVE_NATURES.has(nature)
    ? 1.1
    : NEGATIVE_NATURES.has(nature)
      ? 0.9
      : 1.0;
  // Lv50 stat formula approximation: floor(((2*B + 31 + sp/4)*50)/100 + 5) * nature
  // SP is treated as EV-equivalent for the speed stat (max 32 SP per stat).
  const raw = Math.floor(((2 * base + 31 + Math.floor(speSp / 4)) * 50) / 100 + 5);
  return Math.floor(raw * natureMult);
}

/**
 * Compute weather/ability speed boost. Returns multiplier (1, 2, or null).
 * Caller decides whether to apply based on team's active weather/conditions.
 */
export function abilitySpeedBoost(ability: string | undefined): {
  type: "sand" | "rain" | "sun" | "snow" | null;
  mult: number;
} {
  if (!ability) return { type: null, mult: 1 };
  if (SAND_RUSH.has(ability)) return { type: "sand", mult: 2 };
  if (SWIFT_SWIM.has(ability)) return { type: "rain", mult: 2 };
  if (CHLOROPHYLL.has(ability)) return { type: "sun", mult: 2 };
  if (SLUSH_RUSH.has(ability)) return { type: "snow", mult: 2 };
  return { type: null, mult: 1 };
}

// ─── Item Clause check ───────────────────────────────────────────────────

export interface ItemClauseResult {
  items: Array<{ holder: string; item: string; duplicate: boolean }>;
  hasViolation: boolean;
}

export function checkItemClause(team: TeamSlot[]): ItemClauseResult {
  const counts = new Map<string, number>();
  for (const s of team) {
    if (s?.build?.item) {
      const key = s.build.item.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const items: ItemClauseResult["items"] = [];
  let hasViolation = false;
  for (const s of team) {
    const item = s?.build?.item?.trim();
    if (!item) continue;
    const dup = (counts.get(item.toLowerCase()) ?? 0) > 1;
    if (dup) hasViolation = true;
    items.push({ holder: s!.name, item, duplicate: dup });
  }
  return { items, hasViolation };
}
