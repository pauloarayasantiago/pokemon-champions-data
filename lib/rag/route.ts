// Stage 6.1 — Self-RAG-lite routing gate
// Rules-based pre-retrieval router. Detects theory-shaped (archetype-counter,
// vs-pair, phantom pre-evo) queries and emits hints that drive downstream
// candidate-pool sizing, force-include, and boost logic. No paid-API call.

import { getPokemonNames, type QueryIntent } from "./classify.js";

export interface QueryRoute {
  /** "theory"  — strategic/matchup question best answered by knowledge docs;
   *  "data"    — entity lookup best answered by CSV rows;
   *  "both"    — mixed (default). */
  route: "theory" | "data" | "both";
  /** Named archetype detected (sun/rain/sand/snow/trick room/tailwind). */
  archetype: string | null;
  /** Two-Pokemon comparison query ("A vs B"). Both names lowercased. */
  vsPair: [string, string] | null;
  /** Phantom pre-evolution name present in query → force-include rules doc. */
  phantomName: string | null;
  /** Evolved-form slug for the detected phantom name (e.g. "litwick" →
   *  "chandelure"). Used to force-include the evolved Pokemon chunk so
   *  adversarial phantom queries return both the rules doc AND the
   *  correct evolved-form card. */
  phantomEvolved: string | null;
}

const ARCHETYPE_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  { re: /\b(sunny|drought|chlorophyll)\b|\bsun\b/i, tag: "sun" },
  { re: /\b(rain|drizzle|swift ?swim)\b/i, tag: "rain" },
  { re: /\b(sand(?: ?storm)?|sand ?rush|sand ?stream)\b/i, tag: "sand" },
  { re: /\b(snow|hail|slush ?rush)\b/i, tag: "snow" },
  { re: /\btrick ?room\b|\btr (?:team|setter|mode|squad)\b/i, tag: "trick room" },
  { re: /\btailwind\b/i, tag: "tailwind" },
];

// Phantom pre-evolutions → evolved-form slug. Keep in sync with PRE_EVOS in
// lib/chunker.ts — matching tokens here force-include both champions_rules.md's
// "Phantom Pre-Evolutions" body section AND the evolved-form Pokemon chunk
// so adversarial queries surface the correct fully-evolved card.
export const PHANTOM_TO_EVOLVED: Record<string, string> = {
  ralts: "gardevoir", kirlia: "gardevoir",
  scyther: "scizor",
  sneasel: "weavile",
  litwick: "chandelure", lampent: "chandelure",
  gligar: "gliscor",
  togepi: "togekiss", togetic: "togekiss",
  porygon: "porygon-z", porygon2: "porygon-z",
  cleffa: "clefable", clefairy: "clefable",
  happiny: "blissey", chansey: "blissey",
  rhyhorn: "rhyperior", rhydon: "rhyperior",
  duskull: "dusknoir", dusclops: "dusknoir",
  elekid: "electivire", electabuzz: "electivire",
  magby: "magmortar", magmar: "magmortar",
  dratini: "dragonite", dragonair: "dragonite",
  zubat: "crobat", golbat: "crobat",
  honedge: "aegislash", doublade: "aegislash",
  budew: "roserade", roselia: "roserade",
  swinub: "mamoswine", piloswine: "mamoswine",
  murkrow: "honchkrow",
  misdreavus: "mismagius",
  yanma: "yanmega",
  lickitung: "lickilicky",
  tangela: "tangrowth",
};
const PHANTOM_PRE_EVOS = new Set(Object.keys(PHANTOM_TO_EVOLVED));

export function routeQuery(question: string, intent: QueryIntent): QueryRoute {
  const q = question.toLowerCase();

  let archetype: string | null = null;
  for (const p of ARCHETYPE_PATTERNS) {
    if (p.re.test(q)) { archetype = p.tag; break; }
  }

  // Two-Pokemon "A vs B" / "A handles B" / "A into B" comparison. Split on
  // the comparison verb/preposition and take the longest Pokemon-name
  // substring on each side. Directional verbs (handle/beat/wall/check) are
  // included so "how does Charizard handle Rotom-Wash" surfaces both
  // Pokemon chunks. "into" covers lead-matchup phrasing.
  let vsPair: [string, string] | null = null;
  const vsMatch = q.match(/^(.*?)\b(?:vs\.?|versus|against|handles?|beats?|walls?|checks?|into)\b(.*?)$/);
  if (vsMatch) {
    const names = getPokemonNames();
    const findName = (seg: string): string | null => {
      const s = seg.toLowerCase();
      let best: string | null = null;
      for (const n of names) {
        if (s.includes(n) && (best === null || n.length > best.length)) best = n;
      }
      return best;
    };
    const left = findName(vsMatch[1]);
    const right = findName(vsMatch[2]);
    if (left && right && left !== right) vsPair = [left, right];
  }

  let phantomName: string | null = null;
  let phantomEvolved: string | null = null;
  for (const token of q.split(/\W+/)) {
    if (PHANTOM_PRE_EVOS.has(token)) {
      phantomName = token;
      phantomEvolved = PHANTOM_TO_EVOLVED[token];
      break;
    }
  }

  // Route selection
  let route: "theory" | "data" | "both" = "both";
  const isStrategic = intent.isCounterQuery || intent.isMatchupQuery;
  const hasEntity = !!(intent.pokemonName || intent.moveName || intent.itemName);
  if (archetype && (isStrategic || intent.hasTeamKeyword)) route = "theory";
  else if (isStrategic && !hasEntity) route = "theory";
  else if (vsPair) route = "theory";          // comparisons want type_chart + theory support
  else if (hasEntity && !isStrategic && !intent.hasTeamKeyword) route = "data";

  return { route, archetype, vsPair, phantomName, phantomEvolved };
}
