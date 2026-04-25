/**
 * A15 — Team-level structural validation (item clause + species clause + SP caps).
 *
 * Parses the trailing ```team-json fenced block from the agent's final
 * response and enforces team-wide constraints that per-Pokemon `validate_set`
 * cannot see:
 *  - Item Clause: each held item ≤ 1× across the 6-mon team.
 *  - Species Clause: each Pokemon ≤ 1× across the team.
 *  - SP Per-Stat Cap: each stat slot ≤ 32 SP.
 *  - SP Total Cap: sum across all 6 stat slots ≤ 66 SP.
 *
 * Mirrors the validate-citations.ts shape so the route loop can reuse the
 * same retry pattern: extract → validate → nudge with specific repairs.
 *
 * Pure module: no DB, no LLM, no Node APIs beyond stdlib.
 */

export interface TeamMember {
  name: string;
  item?: string;
  ability?: string;
  moves?: string[];
  spread?: string;
  nature?: string;
}

export interface TeamEnvelope {
  archetype?: string;
  megaStone?: string;
  pokemon: TeamMember[];
}

export interface TeamExtractResult {
  raw: string;
  parsed: TeamEnvelope | null;
  parseError?: string;
}

export interface SpreadIssue {
  pokemon: string;
  spread: string;
  perStatExceeds: number[]; // stat indexes (0-5: HP/Atk/Def/SpA/SpD/Spe) that exceed 32
  total: number;
  totalExceeds: boolean;
}

export interface TeamValidateResult {
  /** True iff every team-level constraint passes AND a parsable team-json block was found. */
  valid: boolean;
  /** Items that appear more than once: { item: ["Pokemon A", "Pokemon B"], ... }. */
  duplicateItems: Record<string, string[]>;
  /** Pokemon names that appear more than once. */
  duplicateSpecies: string[];
  /** Per-mon spread violations. */
  spreadIssues: SpreadIssue[];
}

const TEAM_BLOCK_PATTERNS = [
  /```team-json\s*([\s\S]*?)```/gi,
  /```team_json\s*([\s\S]*?)```/gi,
  /```team\s*([\s\S]*?)```/gi,
];

const STAT_LABELS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as const;
const SP_PER_STAT_CAP = 32;
const SP_TOTAL_CAP = 66;

function lastMatch(text: string, re: RegExp): string | null {
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) last = m;
  return last ? last[1] : null;
}

function repairJson(s: string): string {
  let out = s.trim();
  out = out.replace(/^(?:thought\s*:?\s*)/i, "").trim();
  if (out.startsWith("{{") && out.endsWith("}}")) out = out.slice(1, -1);
  out = out.replace(/,(\s*[}\]])/g, "$1");
  return out;
}

function isTeamEnvelope(v: unknown): v is TeamEnvelope {
  if (!v || typeof v !== "object") return false;
  const obj = v as { pokemon?: unknown };
  if (!Array.isArray(obj.pokemon)) return false;
  return obj.pokemon.every(
    (m) => m && typeof m === "object" && typeof (m as TeamMember).name === "string",
  );
}

export function extractTeamBlock(text: string): TeamExtractResult {
  let raw = "";
  for (const pat of TEAM_BLOCK_PATTERNS) {
    const m = lastMatch(text, pat);
    if (m !== null) {
      raw = m;
      break;
    }
  }
  if (!raw) return { raw: "", parsed: null, parseError: "no-block" };

  const repaired = repairJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch (e) {
    return { raw, parsed: null, parseError: `json-parse: ${(e as Error).message}` };
  }
  if (!isTeamEnvelope(parsed)) {
    return { raw, parsed: null, parseError: "schema" };
  }
  return { raw, parsed };
}

function parseSpread(s: string | undefined): number[] | null {
  if (!s || typeof s !== "string") return null;
  const parts = s.split("/").map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 6 || parts.some((n) => Number.isNaN(n) || n < 0)) return null;
  return parts;
}

export function validateTeam(envelope: TeamEnvelope): TeamValidateResult {
  // ── Item Clause ─────────────────────────────────────────────────────────
  // Build "lowercase normalized item → list of Pokemon names" map.
  const itemToOwners = new Map<string, string[]>();
  for (const m of envelope.pokemon) {
    if (!m.item) continue;
    const key = m.item.trim().toLowerCase();
    if (!key) continue;
    const owners = itemToOwners.get(key) ?? [];
    owners.push(m.name);
    itemToOwners.set(key, owners);
  }
  const duplicateItems: Record<string, string[]> = {};
  for (const [key, owners] of itemToOwners) {
    if (owners.length > 1) {
      // Restore the original casing from the first owner's set for display.
      const original = envelope.pokemon.find(
        (p) => p.item && p.item.trim().toLowerCase() === key,
      )?.item ?? key;
      duplicateItems[original] = owners;
    }
  }

  // ── Species Clause ──────────────────────────────────────────────────────
  // "Mega Froslass" and "Froslass" share the base species — but the spec
  // says one Mega per battle anyway, so we treat the visible name as the
  // dedup key. A future iteration can normalize Mega-prefix variants.
  const seen = new Map<string, number>();
  for (const m of envelope.pokemon) {
    const key = m.name.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicateSpecies: string[] = [];
  for (const [key, count] of seen) {
    if (count > 1) {
      const display =
        envelope.pokemon.find((p) => p.name.trim().toLowerCase() === key)?.name ?? key;
      duplicateSpecies.push(display);
    }
  }

  // ── SP Caps ─────────────────────────────────────────────────────────────
  const spreadIssues: SpreadIssue[] = [];
  for (const m of envelope.pokemon) {
    const parts = parseSpread(m.spread);
    if (!parts) continue; // unparseable spreads are ignored — schema-level skip
    const perStatExceeds: number[] = [];
    parts.forEach((n, i) => {
      if (n > SP_PER_STAT_CAP) perStatExceeds.push(i);
    });
    const total = parts.reduce((a, b) => a + b, 0);
    const totalExceeds = total > SP_TOTAL_CAP;
    if (perStatExceeds.length > 0 || totalExceeds) {
      spreadIssues.push({
        pokemon: m.name,
        spread: m.spread ?? "",
        perStatExceeds,
        total,
        totalExceeds,
      });
    }
  }

  const valid =
    Object.keys(duplicateItems).length === 0 &&
    duplicateSpecies.length === 0 &&
    spreadIssues.length === 0;

  return { valid, duplicateItems, duplicateSpecies, spreadIssues };
}

export function formatTeamValidationNudge(v: TeamValidateResult): string {
  const lines: string[] = [];
  lines.push(
    "Your `team-json` block has team-level violations that `validate_set` does NOT catch (it only checks per-Pokemon legality). Champions enforces these rules across the whole team:",
  );

  if (Object.keys(v.duplicateItems).length > 0) {
    lines.push("");
    lines.push("**Item Clause violations** (each held item must appear at most once across the 6-mon team):");
    for (const [item, owners] of Object.entries(v.duplicateItems)) {
      lines.push(`- \`${item}\` is held by: ${owners.join(", ")}. Pick a different Champions-legal item for all but one of them.`);
    }
  }

  if (v.duplicateSpecies.length > 0) {
    lines.push("");
    lines.push("**Species Clause violations** (each Pokemon may appear at most once on the team):");
    for (const sp of v.duplicateSpecies) {
      lines.push(`- \`${sp}\` appears more than once. Replace duplicates with a different Pokemon.`);
    }
  }

  if (v.spreadIssues.length > 0) {
    lines.push("");
    lines.push(
      "**SP Spread violations** (Champions caps each stat at 32 SP and the total across all 6 stats at 66 SP):",
    );
    for (const issue of v.spreadIssues) {
      const parts: string[] = [];
      if (issue.perStatExceeds.length > 0) {
        const stats = issue.perStatExceeds.map((i) => STAT_LABELS[i]).join(", ");
        parts.push(`stats over 32 SP: ${stats}`);
      }
      if (issue.totalExceeds) {
        parts.push(`total = ${issue.total} (cap is 66)`);
      }
      lines.push(`- \`${issue.pokemon}\` spread \`${issue.spread}\` — ${parts.join("; ")}. Redistribute the points so every stat ≤ 32 and the total ≤ 66.`);
    }
  }

  lines.push("");
  lines.push(
    "Re-emit your full response with a corrected `team-json` block (and the `claims-json` block after it). Keep all other content as-is unless the fix forces a moveset/item rationale change.",
  );

  return lines.join("\n");
}
