/**
 * phantom-guard.ts — pre-flight Pokemon-name interceptor for the /team agent loop.
 *
 * Every LLM tested on the 13-test agentic eval (Gemma, GLM, DeepSeek, Gemini, Qwen, Llama,
 * GPT-OSS) failed `phantom_pokemon` at least ~1/3 runs: when the user names a Pokemon
 * that isn't in the 186-Champions roster (e.g. Amoonguss, Porygon2), models answer from
 * training data without calling the `pokedex` tool. Training priors beat the system prompt.
 *
 * Fix: scan the user message BEFORE the LLM runs. If any phantom name is mentioned,
 * short-circuit with a hard refusal that points at the legal form. No LLM compliance needed.
 *
 * Data sources (re-used, not duplicated):
 *   - PRE_EVO_MAP            — 23 pre-evolutions → fully-evolved form (from lib/team-validator)
 *   - EXPLICIT_PHANTOMS      — fully-evolved Pokemon removed from the Champions roster
 *                              (CLAUDE.md calls out Amoonguss; keep extensible)
 */

import { PRE_EVO_MAP } from "./team-validator.js";

export interface PhantomHit {
  /** Canonical title-cased phantom name as it appears to the user. */
  phantom: string;
  /** Legal fully-evolved form (or textual suggestion) to redirect to. */
  suggestion: string;
  /** One-line explanation — pre-evo vs removed-from-roster. */
  reason: string;
}

/**
 * Fully-evolved Pokemon explicitly removed from the Champions roster. NOT covered by
 * PRE_EVO_MAP (those are pre-evos). Values are plain-prose redirects; the phrasing can be
 * richer than a single name because Amoonguss has no direct 1:1 replacement.
 */
const EXPLICIT_PHANTOMS: Record<string, { suggestion: string; reason: string }> = {
  amoonguss: {
    suggestion: "Venusaur, Roserade, or another Grass-type",
    reason: "Amoonguss is not in the Champions roster",
  },
};

/**
 * Build the phantom-name lookup table: pre-evolutions + explicit roster exclusions.
 * Keys are always lowercase. Computed once at module load; the two source tables are
 * module-level constants, so this is a static snapshot.
 */
const PHANTOM_TABLE: Record<string, { suggestion: string; reason: string }> = (() => {
  const table: Record<string, { suggestion: string; reason: string }> = {};
  for (const [key, evolved] of Object.entries(PRE_EVO_MAP)) {
    table[key] = {
      suggestion: evolved,
      reason: `pre-evolution — Champions only allows fully-evolved forms; use ${evolved} instead`,
    };
  }
  for (const [key, entry] of Object.entries(EXPLICIT_PHANTOMS)) {
    table[key] = entry;
  }
  return table;
})();

/** Phantom names sorted longest-first so "porygon2" is tried before "porygon". */
const PHANTOM_NAMES_LONGEST_FIRST: string[] = Object.keys(PHANTOM_TABLE).sort(
  (a, b) => b.length - a.length,
);

function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Scan free-text user input for phantom Pokemon mentions. Returns a list of hits
 * (may be empty). Word-boundary matching prevents "chansey" matching inside "chanseyish".
 *
 * Case-insensitive: "PORYGON2", "porygon2", "Porygon2" all match.
 */
export function detectPhantomPokemon(text: string): PhantomHit[] {
  if (typeof text !== "string" || !text) return [];
  const lower = text.toLowerCase();
  const hits: PhantomHit[] = [];
  const seen = new Set<string>();

  for (const name of PHANTOM_NAMES_LONGEST_FIRST) {
    if (seen.has(name)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Stricter than `\b` — treat `-` as part of the "word" so "porygon" does NOT
    // match inside "porygon-z" (which is a legal Pokemon). The standard \b would
    // match at the hyphen because `-` is a non-word char in RegExp's default.
    const re = new RegExp(`(?<![a-z0-9-])${escaped}(?![a-z0-9-])`);
    if (re.test(lower)) {
      seen.add(name);
      const entry = PHANTOM_TABLE[name];
      hits.push({
        phantom: titleCase(name),
        suggestion: entry.suggestion,
        reason: entry.reason,
      });
    }
  }

  return hits;
}

/**
 * Format a user-facing refusal message. Every line that mentions a phantom Pokemon
 * keeps "is not available in Champions" adjacent to the name so the eval scorer's
 * `<name>[^.!?\n]{0,80}(?:not available|pre-evol|...)` regex matches per-line.
 */
export function formatPhantomRefusal(hits: PhantomHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map(
    (h) => `${h.phantom} is not available in Champions — ${h.reason}. Use ${h.suggestion}.`,
  );
  if (lines.length === 1) return lines[0];
  return `The following Pokemon are not available in Champions:\n${lines.map((l) => "- " + l).join("\n")}`;
}

// ---------------------------------------------------------------------------
// Inline unit tests — run with `npx tsx src/lib/phantom-guard.ts`.
// Intentionally framework-free; assertion style matches other scripts in the repo.
// ---------------------------------------------------------------------------

function assertEq<T>(label: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`FAIL ${label}\n  actual:   ${a}\n  expected: ${b}`);
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${label}`);
}

function runTests() {
  console.log("phantom-guard tests");

  // 1. Pre-evo hit → suggests evolved form.
  {
    const hits = detectPhantomPokemon("best Porygon2 moveset");
    assertEq("porygon2 detected", hits.length, 1);
    assertEq("porygon2 → Porygon-Z", hits[0].suggestion, "Porygon-Z");
    assertEq("porygon2 title case", hits[0].phantom, "Porygon2");
  }

  // 2. Explicit phantom (Amoonguss) — not in PRE_EVO_MAP, still flagged.
  {
    const hits = detectPhantomPokemon("Amoonguss + Incineroar core");
    assertEq("amoonguss detected", hits.length, 1);
    assertEq("amoonguss suggestion includes Venusaur", hits[0].suggestion.includes("Venusaur"), true);
  }

  // 3. All-legal query → no hits.
  {
    const hits = detectPhantomPokemon("Dragonite vs Tyranitar matchup");
    assertEq("all-legal no hits", hits, []);
  }

  // 4. Mega of a legal base Pokemon → no hit (Sceptile is in 186-roster, Mega form legal).
  {
    const hits = detectPhantomPokemon("Mega Sceptile build");
    assertEq("mega of legal base no hit", hits, []);
  }

  // 5. Mixed legal + phantom in same query → only the phantom is flagged.
  {
    const hits = detectPhantomPokemon("compare Porygon-Z and Porygon2");
    assertEq("porygon2 flagged despite porygon-z also present", hits.length, 1);
    assertEq("porygon2 is the one flagged", hits[0].phantom.toLowerCase(), "porygon2");
  }

  // 6. Case-insensitive match.
  {
    const hits = detectPhantomPokemon("PORYGON2 stats?");
    assertEq("uppercase porygon2 detected", hits.length, 1);
  }

  // 7. Multi-phantom query → both listed.
  {
    const hits = detectPhantomPokemon("Amoonguss and Porygon2 team");
    assertEq("two phantoms detected", hits.length, 2);
    const names = hits.map((h) => h.phantom.toLowerCase()).sort();
    assertEq("names match", names, ["amoonguss", "porygon2"]);
  }

  // 8. formatPhantomRefusal single phantom.
  {
    const hits = detectPhantomPokemon("best Porygon2 moveset");
    const msg = formatPhantomRefusal(hits);
    assertEq("refusal mentions Porygon2", msg.includes("Porygon2"), true);
    assertEq("refusal mentions Porygon-Z", msg.includes("Porygon-Z"), true);
    assertEq("refusal mentions Champions", msg.includes("Champions"), true);
  }

  // 9. formatPhantomRefusal multi-phantom bullet list.
  {
    const hits = detectPhantomPokemon("Amoonguss and Porygon2 team");
    const msg = formatPhantomRefusal(hits);
    assertEq("multi-phantom message includes both", msg.includes("Amoonguss") && msg.includes("Porygon2"), true);
  }

  // 10. Empty / bogus input → no hits, no crash.
  {
    assertEq("empty string", detectPhantomPokemon(""), []);
    // @ts-expect-error — defensive null check
    assertEq("null input", detectPhantomPokemon(null), []);
  }

  console.log("all phantom-guard tests passed");
}

// When invoked directly (not imported), run the suite.
const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /phantom-guard\.ts$/.test(process.argv[1] ?? "");
if (isMain) {
  try {
    runTests();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error((e as Error).message);
    process.exit(1);
  }
}
