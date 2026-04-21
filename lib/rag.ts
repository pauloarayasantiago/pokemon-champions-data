import { resolve, dirname } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { embed } from "./embed.js";
import { rerankCandidates } from "./rerank.js";
import { extractTypes, extractStatConditions } from "./structured-query.js";
import { supabaseServer } from "./supabase.js";

const PROJECT_ROOT = process.env.POKEMON_DATA_ROOT
  ? resolve(process.env.POKEMON_DATA_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Staleness detection (reads pc_index_meta.file_mtimes)
// ---------------------------------------------------------------------------

let _stalenessChecked = false;

async function checkStaleness(): Promise<void> {
  if (_stalenessChecked) return;
  _stalenessChecked = true;

  // Skip on Vercel: Lambda filesystem mtimes come from the build image and
  // never match the mtimes captured at reindex time, so every file looks
  // "stale" on every cold start. Staleness is a local-dev signal only.
  if (process.env.VERCEL) return;

  try {
    const { data, error } = await supabaseServer()
      .from("pc_index_meta")
      .select("value")
      .eq("key", "file_mtimes")
      .maybeSingle();
    if (error || !data) return;

    const mtimes = (data.value ?? {}) as Record<string, string>;
    const staleFiles: string[] = [];

    for (const [relPath, indexedMtime] of Object.entries(mtimes)) {
      const absPath = resolve(PROJECT_ROOT, relPath);
      try {
        const currentMtime = statSync(absPath).mtime.toISOString();
        if (currentMtime > indexedMtime) staleFiles.push(relPath);
      } catch {
        // File removed — stale
        staleFiles.push(relPath);
      }
    }

    if (staleFiles.length > 0) {
      console.error(
        `[WARN] Index is stale: ${staleFiles.length} file(s) modified since last reindex (${staleFiles.slice(0, 3).join(", ")}${staleFiles.length > 3 ? "..." : ""}). Run /reindex to update.`
      );
    }
  } catch {
    // Network / table missing — ignore
  }
}

export interface Result {
  text: string;
  source: string;
  score: number;
  sourceType: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pokemon name dictionary (loaded once)
// ---------------------------------------------------------------------------

let _pokemonNames: Set<string> | null = null;

function getPokemonNames(): Set<string> {
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

// ---------------------------------------------------------------------------
// Move name dictionary (loaded once)
// ---------------------------------------------------------------------------

let _moveNames: Set<string> | null = null;

function getMoveNames(): Set<string> {
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

function getItemNames(): Set<string> {
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

// ---------------------------------------------------------------------------
// Stage 6.1 — Self-RAG-lite routing gate
// Rules-based pre-retrieval router. Detects theory-shaped (archetype-counter,
// vs-pair, phantom pre-evo) queries and emits hints that drive downstream
// candidate-pool sizing, force-include, and boost logic. No paid-API call.
// ---------------------------------------------------------------------------

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
}

const ARCHETYPE_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  { re: /\b(sunny|drought|chlorophyll)\b|\bsun\b/i, tag: "sun" },
  { re: /\b(rain|drizzle|swift ?swim)\b/i, tag: "rain" },
  { re: /\b(sand(?: ?storm)?|sand ?rush|sand ?stream)\b/i, tag: "sand" },
  { re: /\b(snow|hail|slush ?rush)\b/i, tag: "snow" },
  { re: /\btrick ?room\b|\btr (?:team|setter|mode|squad)\b/i, tag: "trick room" },
  { re: /\btailwind\b/i, tag: "tailwind" },
];

// Phantom pre-evolutions (lowercase). Keep in sync with PRE_EVOS in
// lib/chunker.ts — matching tokens here force-include champions_rules.md's
// "Phantom Pre-Evolutions" body section so adversarial queries route there.
const PHANTOM_PRE_EVOS = new Set([
  "ralts", "kirlia", "scyther", "sneasel", "litwick", "lampent", "gligar",
  "togepi", "togetic", "porygon", "porygon2", "cleffa", "clefairy", "happiny",
  "chansey", "rhyhorn", "rhydon", "duskull", "dusclops", "elekid", "electabuzz",
  "magby", "magmar", "dratini", "dragonair", "zubat", "golbat", "honedge",
  "doublade", "budew", "roselia", "swinub", "piloswine", "murkrow", "misdreavus",
  "yanma", "lickitung", "tangela",
]);

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
  for (const token of q.split(/\W+/)) {
    if (PHANTOM_PRE_EVOS.has(token)) { phantomName = token; break; }
  }

  // Route selection
  let route: "theory" | "data" | "both" = "both";
  const isStrategic = intent.isCounterQuery || intent.isMatchupQuery;
  const hasEntity = !!(intent.pokemonName || intent.moveName || intent.itemName);
  if (archetype && (isStrategic || intent.hasTeamKeyword)) route = "theory";
  else if (isStrategic && !hasEntity) route = "theory";
  else if (vsPair) route = "theory";          // comparisons want type_chart + theory support
  else if (hasEntity && !isStrategic && !intent.hasTeamKeyword) route = "data";

  return { route, archetype, vsPair, phantomName };
}

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

async function runStructuredFilter(question: string, limit: number): Promise<Record<string, unknown>[]> {
  const types = extractTypes(question);
  const stats = extractStatConditions(question);
  if (types.length === 0 && stats.length === 0) return [];

  let q = supabaseServer().from("pc_chunks").select("*");

  if (types.length > 0) {
    // Each type expands to "(col_type1=X OR col_type2=X)". Multiple types → AND of those.
    // supabase-js .or() only unions within one call, so chain per type via .or().
    for (const t of types) {
      q = q.or(`col_type1.eq.${t},col_type2.eq.${t}`);
    }
  }
  for (const c of stats) {
    if (c.operator === ">=") q = q.gte(c.column, c.value);
    else q = q.lte(c.column, c.value);
  }
  q = q.not("pokemon_name", "is", null).limit(limit);

  const { data, error } = await q;
  if (error) {
    console.error("Structured query failed:", error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}

export type ProgressStage =
  | "embed_start"
  | "embed_end"
  | "rpc_start"
  | "rpc_end"
  | "structured_end"
  | "rules_end"
  | "rerank_end";

export type ProgressCallback = (stage: ProgressStage, detail?: Record<string, unknown>) => void;

export async function query(
  question: string,
  topK = 5,
  onProgress?: ProgressCallback,
): Promise<Result[]> {
  await checkStaleness();

  const embedT0 = Date.now();
  onProgress?.("embed_start", { chars: question.length });
  const [vector] = await embed([question], "query");
  onProgress?.("embed_end", { ms: Date.now() - embedT0, dim: vector?.length ?? 0 });

  const intent = classifyQuery(question);
  const route = routeQuery(question, intent);
  const supabase = supabaseServer();

  // Always fetch a healthy candidate pool so rerank boosts can surface the
  // right chunk even when topK is small (e.g. Protect in moves.csv can sit
  // outside the raw RRF top-20 but #1 after move-name boost). Strategic /
  // theory-routed queries get a larger floor because Pokemon chunks can
  // rank past 80 when FTS match is weak on strategic vocabulary (e.g.
  // "pivots into Tyranitar" — Pokemon chunk has no "pivot/defensive" terms).
  const baseFloor = route.route === "theory" || intent.isCounterQuery || intent.isMatchupQuery ? 160 : 80;
  const fetchK = Math.max(topK * 8, baseFloor);

  const rpcT0 = Date.now();
  onProgress?.("rpc_start", {
    fetchK,
    categories: intent.categories,
    pokemonName: intent.pokemonName,
    moveName: intent.moveName,
    itemName: intent.itemName,
  });
  const { data: hybridRaw, error: hybridErr } = await supabase.rpc("pc_hybrid_search", {
    p_embedding: vector,
    p_query: question,
    p_categories: intent.categories.length > 0 ? intent.categories : null,
    p_fetch_k: fetchK,
    p_rrf_k: 60,
  });
  onProgress?.("rpc_end", { ms: Date.now() - rpcT0, rows: (hybridRaw ?? []).length });
  if (hybridErr) {
    throw new Error(`pc_hybrid_search RPC failed: ${hybridErr.message}`);
  }
  const raw = (hybridRaw ?? []) as Record<string, unknown>[];

  // Jina Reranker v2: score the top-40 RPC candidates. When active, Jina
  // scores live in [0, 1] — boostMul=20 keeps existing additive boosts
  // (calibrated to RRF's ~0.02-0.035 scale) meaningful on top of that.
  const jinaT0 = Date.now();
  const jinaScores = await rerankCandidates(
    question,
    raw.map((r) => ({ id: r.id as string, text: r.text as string })),
  );
  const jinaActive = jinaScores !== null && jinaScores.size > 0;
  const boostMul = jinaActive ? 20 : 1;
  if (jinaActive) {
    for (const r of raw) {
      const s = jinaScores!.get(r.id as string);
      // Items outside the reranked pool keep a small baseline so the boost
      // layer can still promote them (exact-name, structured, rules).
      r.rrf_score = typeof s === "number" ? s : 0.05;
    }
    if (process.env.RAG_DEBUG) {
      console.error(`[DEBUG] Jina reranked ${jinaScores!.size}/${raw.length} in ${Date.now() - jinaT0}ms`);
    }
  }

  let structuredResults: Record<string, unknown>[] = [];
  if (intent.isStructured) {
    structuredResults = await runStructuredFilter(question, topK);
    if (process.env.RAG_DEBUG) {
      console.error(`[DEBUG] Structured results: ${structuredResults.length}`);
      for (const r of structuredResults) {
        console.error(`[DEBUG]   ${r.pokemon_name} Spe:${r.stat_speed} SpA:${r.stat_sp_atk}`);
      }
    }
  } else if (process.env.RAG_DEBUG) {
    console.error("[DEBUG] Not structured query");
  }

  // Force-include champions_rules.md chunks when the query asks about
  // mechanic changes / bans. The rules doc is an authoritative delta list
  // from S/V, but its chunks tend to dense-match many transcripts in FTS
  // and fall outside the RRF fetch pool. We inject them directly so the
  // rerank boost can place them.
  let rulesResults: Record<string, unknown>[] = [];
  if (/\b(change|changed|differ|different|differently|banned|unavailable|missing|nerf|nerfed|how does)\b/i.test(question)) {
    // Extract content words (drop stopwords & short tokens) and OR-join them
    // for a loose FTS match against the rules doc. websearch parsing of the
    // raw question too often yields zero hits because every token must match.
    const stop = new Set(["how","does","what","when","where","which","who","work","works","the","and","for","with","from","are","was","were","been","this","that","these","those","but","not","you","your","their","our","champions","champion","in","on","of","to","is","it","a","an","do","did"]);
    const terms = question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stop.has(w));
    if (terms.length > 0) {
      const { data: rulesRows } = await supabase
        .from("pc_chunks")
        .select("*")
        .eq("source", "data/knowledge/champions_rules.md")
        .textSearch("text_tsv", terms.join(" | "), { config: "english" })
        .limit(5);
      rulesResults = (rulesRows ?? []) as Record<string, unknown>[];
    }
  }

  // Stage 6.1: phantom pre-evolution force-include. Adversarial queries
  // that name a pre-evolution not in Champions (e.g. "Scyther EV spread")
  // should always surface the rules doc's "Phantom Pre-Evolutions" section.
  // FTS on the phantom name against that single file is a guaranteed hit.
  let phantomResults: Record<string, unknown>[] = [];
  if (route.phantomName) {
    const { data: phantomRows } = await supabase
      .from("pc_chunks")
      .select("*")
      .eq("source", "data/knowledge/champions_rules.md")
      .textSearch("text_tsv", route.phantomName, { config: "english" })
      .limit(3);
    phantomResults = (phantomRows ?? []) as Record<string, unknown>[];
  }

  // Stage 6.1: vs-pair force-include. For A-vs-B queries, the weaker side
  // can fall outside the RPC candidate pool (embedding signal collapses to
  // one Pokemon). Guarantee both primary chunks are present by fetching
  // the pokemon_champions.csv row for each name directly. pokemon_name is
  // stored CamelCase ("Rotom-Wash"), so match case-insensitively via ilike.
  let vsResults: Record<string, unknown>[] = [];
  if (route.vsPair) {
    const [aName, bName] = route.vsPair;
    const { data: vsRows } = await supabase
      .from("pc_chunks")
      .select("*")
      .eq("source", "pokemon_champions.csv")
      .or(`pokemon_name.ilike.${aName},pokemon_name.ilike.${bName}`)
      .limit(4);
    vsResults = (vsRows ?? []) as Record<string, unknown>[];
  }

  // Stage 6.1: exact-entity force-include. When the query names a specific
  // move / item / strategic Pokemon, the RPC can still rank that chunk
  // outside top-10 if FTS matches noisier long-form chunks (e.g.
  // "Fake Out restriction Champions" → transcripts hit all 4 terms while
  // move:fake-out hits only 2). Force-include by id.
  let entityResults: Record<string, unknown>[] = [];
  const entityIds: string[] = [];
  if (intent.moveName) entityIds.push(`move:${intent.moveName.replace(/\s+/g, "-")}`);
  if (intent.itemName) entityIds.push(`item:${intent.itemName.replace(/\s+/g, "-")}`);
  // Strategic Pokemon queries (counter / matchup / "pivots into") — fetch
  // the Pokemon row so it can co-surface with theory docs.
  if (intent.pokemonName && (intent.isCounterQuery || intent.isMatchupQuery)) {
    entityIds.push(`pokemon:${intent.pokemonName.replace(/\s+/g, "-")}`);
  }
  if (entityIds.length > 0) {
    const { data: entityRows } = await supabase
      .from("pc_chunks")
      .select("*")
      .in("id", entityIds);
    entityResults = (entityRows ?? []) as Record<string, unknown>[];
  }

  // Synthetic rrf_score for force-included rows. Force-included rows come
  // from plain table selects (no rrf_score column). If the RPC already has
  // the same row, we use max(rpcScore, baseScore) so a high RPC score isn't
  // clipped to the floor. If the RPC doesn't have it, we set baseScore so
  // boosts can lift it into top-10 instead of leaving it at 0.
  const rpcScoreById = new Map<string, number>();
  for (const r of raw) {
    const s = typeof r.rrf_score === "number" ? r.rrf_score : Number(r.rrf_score ?? 0);
    rpcScoreById.set(r.id as string, s);
  }
  const rpcIds = new Set(raw.map((r) => r.id as string));
  const augmentForced = (rows: Record<string, unknown>[], baseScore: number) =>
    rows.map((r) => {
      const rpcScore = rpcScoreById.get(r.id as string);
      const finalScore = rpcScore !== undefined ? Math.max(rpcScore, baseScore) : baseScore;
      return { ...r, rrf_score: finalScore };
    });

  const structuredIds = new Set(structuredResults.map((r) => r.id as string));
  const allRaw = [
    ...structuredResults,
    ...augmentForced(rulesResults, 0.08),
    ...augmentForced(phantomResults, 0.10),
    ...augmentForced(vsResults, 0.08),
    ...augmentForced(entityResults, 0.08),
    ...raw,
  ];

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = allRaw.filter((r) => {
    const id = r.id as string;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const parsed = deduped.map((r: Record<string, unknown>) => {
    const rawMeta = r.metadata;
    const metadata: Record<string, unknown> =
      typeof rawMeta === "string"
        ? JSON.parse(rawMeta)
        : (rawMeta as Record<string, unknown>) ?? {};
    const id = r.id as string;
    return {
      text: r.text as string,
      source: r.source as string,
      score: typeof r.rrf_score === "number" ? r.rrf_score : Number(r.rrf_score ?? 0),
      sourceType: r.source_type as string,
      dataCategory: r.data_category as string,
      metadata,
      isStructuredResult: structuredIds.has(id),
    };
  });

  // Apply domain-specific boosts (calibrated to RRF score scale ~0.02-0.035).
  //
  // Tiered data hierarchy (small baseline nudges, applied on top of
  // intent-specific boosts below):
  //   1. Tournament teams   (+0.020)  — ground truth competitive pastes
  //   2. Pikalytics usage   (+0.015)  — aggregate ladder statistics
  //   3. YouTube transcripts (+0.010) — creator analysis / commentary
  //   4. Matchup matrix     (-0.005)  — derived from above, treat as support
  //   5. Older references   (-0.020)  — validation notes / unsorted md
  const boosted = parsed.map((r) => {
    let boost = 0;
    const isUsageChunk = r.dataCategory === "usage";
    const isKnowledgeChunk = r.dataCategory === "knowledge";
    const isTeamChunk = r.dataCategory === "team";
    const isTranscriptChunk = r.dataCategory === "transcript";
    const isMatchupChunk = r.dataCategory === "matchup";
    const isOlderReference = r.source === "data/knowledge/validation_notes.md";

    // Tier baselines. Knowledge docs (curated strategy) ride above the data
    // tiers when relevant — but only when the query isn't a pure entity
    // lookup (e.g. "Mega Dragonite"), otherwise generic knowledge docs
    // displace the specific Pokemon/mega chunk.
    const isStrategicIntent =
      intent.isCounterQuery || intent.isMatchupQuery || intent.hasTeamKeyword;
    const isEntityLookup =
      (intent.pokemonName || intent.moveName || intent.itemName) && !isStrategicIntent;

    // Small tier nudges — meant to break ties between equally-relevant
    // chunks, not override quality. Intent-specific boosts (below) do the
    // heavy lifting.
    if (isKnowledgeChunk && !isEntityLookup) boost += 0.020;
    else if (isTeamChunk && intent.hasTeamKeyword) boost += 0.010;
    else if (isUsageChunk && (intent.hasTeamKeyword || intent.isUsageQuery)) boost += 0.007;
    else if (isTranscriptChunk) boost += 0.003;
    else if (isMatchupChunk && !(intent.isCounterQuery || intent.isMatchupQuery)) boost -= 0.003;
    if (isOlderReference) boost -= 0.02;

    // Demote team chunks on non-team queries so tournament pastes don't
    // crowd entity/mechanic/strategic lookups.
    if (isTeamChunk && !intent.hasTeamKeyword) boost -= 0.015;

    // Structured results get priority (they matched SQL stat filters exactly)
    if (r.isStructuredResult) {
      boost += 0.1;
    }

    // Usage intent + matching Pokemon
    if (isUsageChunk && intent.isUsageQuery && intent.pokemonName) {
      const chunkPokemon = (r.metadata.pokemon as string)?.toLowerCase();
      if (chunkPokemon === intent.pokemonName) boost += 0.1;
    }

    // General usage intent
    if (isUsageChunk && intent.isUsageQuery && !intent.pokemonName) {
      boost += 0.05;
    }

    // Exact Pokemon name match
    if (intent.pokemonName) {
      const chunkName = (r.metadata.name as string)?.toLowerCase();
      const chunkPokemon = (typeof r.metadata.pokemon === "string")
        ? r.metadata.pokemon.toLowerCase()
        : undefined;
      if (chunkName === intent.pokemonName || chunkPokemon === intent.pokemonName) {
        boost += 0.04;
      }
      // Mega chunks carry metadata like `base_pokemon: "Meganium"` and
      // `mega_name: "Mega Meganium"`. Match those so "Mega Meganium ability"
      // surfaces the mega row.
      else if (r.dataCategory === "mega") {
        const basePokemon = (r.metadata.base_pokemon as string)?.toLowerCase();
        const megaName = (r.metadata.mega_name as string)?.toLowerCase();
        if (basePokemon === intent.pokemonName || megaName?.includes(intent.pokemonName) ||
            chunkPokemon?.includes(intent.pokemonName)) {
          boost += 0.04;
        }
      }
    }

    // Exact move name match — boost the specific move chunk
    if (intent.moveName && r.dataCategory === "move") {
      const chunkName = (r.metadata.name as string)?.toLowerCase();
      if (chunkName === intent.moveName) {
        boost += 0.04;
      }
    }

    // Exact item name match — boost the specific item chunk
    if (intent.itemName && r.dataCategory === "item") {
      const chunkName = (r.metadata.name as string)?.toLowerCase();
      if (chunkName === intent.itemName) {
        boost += 0.04;
      }
    }

    // Matchup data boost for counter/matchup queries. Keep modest so
    // matchup_matrix.csv rows don't monopolize all 10 slots on counter
    // queries where a curated knowledge doc is the better answer.
    if (r.dataCategory === "matchup" && (intent.isCounterQuery || intent.isMatchupQuery)) {
      boost += 0.03;
      // Extra boost if matching Pokemon name
      if (intent.pokemonName) {
        const chunkPokemon = (r.metadata.pokemon as string)?.toLowerCase();
        if (chunkPokemon === intent.pokemonName) boost += 0.06;
      }
    }

    // Knowledge docs boost for strategic query types.
    //  - Counter/matchup: curated knowledge usually beats a matchup-matrix slice.
    //  - Team queries without a Pokemon name: strategic doc beats team rows.
    //  - Team queries *with* a Pokemon name (e.g. "partners for Gengar"):
    //    the user wants concrete team/usage data, so don't crowd those out.
    if (isKnowledgeChunk) {
      if (intent.isCounterQuery || intent.isMatchupQuery) boost += 0.04;
      else if (intent.hasTeamKeyword && !intent.pokemonName) boost += 0.04;
      else if (intent.hasTeamKeyword) boost += 0.025;
    }

    // Rules/format docs: boost champions_rules.md when the query is about
    // mechanic *changes* (the rules doc summarizes every S/V delta).
    const isRulesDoc = r.source === "data/knowledge/champions_rules.md";
    if (isRulesDoc && /\b(change|changed|differ|different|differently|banned|unavailable|missing|nerf|nerfed|how does)\b/i.test(question)) {
      boost += 0.035;
    }

    // Stage 6.1 routing boosts. When routeQuery() classifies the question
    // as "theory", lift the three curated strategy docs (team_building_theory,
    // team_archetypes, type_chart). When an archetype token is detected,
    // give team_archetypes.md an extra bump and lift tournament-team chunks
    // whose text mentions that archetype. For A-vs-B comparisons, boost
    // both Pokemon chunks and the type chart.
    if (route.route === "theory") {
      const theorySources = new Set([
        "data/knowledge/team_building_theory.md",
        "data/knowledge/team_archetypes.md",
        "data/knowledge/type_chart.md",
      ]);
      if (theorySources.has(r.source)) boost += 0.025;
    }
    if (route.archetype) {
      const archLower = route.archetype;
      const textLower = r.text.toLowerCase();
      if (r.source === "data/knowledge/team_archetypes.md" && textLower.includes(archLower)) {
        boost += 0.025;
      }
      if (isTeamChunk && textLower.includes(archLower)) {
        boost += 0.02;
      }
    }
    if (route.vsPair) {
      const [aName, bName] = route.vsPair;
      // metadata.pokemon may be a string (Pokemon/mega chunks) or an array
      // (tournament-team chunks); guard against the array shape.
      const pickStr = (v: unknown): string | undefined =>
        typeof v === "string" ? v.toLowerCase() : undefined;
      const chunkPokemon = pickStr(r.metadata.pokemon)
        ?? pickStr(r.metadata.name)
        ?? pickStr(r.metadata.base_pokemon);
      // +0.12 for the primary Pokemon rows: force-included rows enter with
      // rrf_score=0 so the bump must clear the RPC top-tier band (~0.10) to
      // guarantee both chunks land in top-10. Dragonite-side rows already
      // high in the pool won't over-rank because type_chart+theory boosts
      // still sum higher.
      if (chunkPokemon === aName || chunkPokemon === bName) boost += 0.12;
      // Team chunks listing both names are valuable supporting evidence.
      if (Array.isArray(r.metadata.pokemon)) {
        const arr = (r.metadata.pokemon as unknown[]).map((x) =>
          typeof x === "string" ? x.toLowerCase() : "",
        );
        const hasA = arr.includes(aName);
        const hasB = arr.includes(bName);
        if (hasA && hasB) boost += 0.04;
      }
      if (r.source === "data/knowledge/type_chart.md") boost += 0.02;
    }
    if (route.phantomName && isRulesDoc && r.text.toLowerCase().includes(route.phantomName)) {
      // +0.12 same reasoning — phantom section chunk is force-included and
      // needs enough lift to clear the RPC top band.
      boost += 0.12;
    }

    // Speed tiers doc: boost on any speed-benchmark question
    const isSpeedTiers = r.source === "data/knowledge/speed_tiers.md";
    if (isSpeedTiers && /\b(speed tier|speed tiers|outspeed|outspeeds|faster than|slower than)\b/i.test(question)) {
      boost += 0.035;
    }

    // Item chunk boost when query has item intent
    if (r.dataCategory === "item" && intent.hasItemKeyword) {
      boost += 0.03;
    }

    // Team query: boost usage + tournament-team chunks so "partners / pairs with X"
    // surfaces Pikalytics teammates and tournament team rows.
    if (intent.hasTeamKeyword) {
      if (isUsageChunk) boost += 0.03;
      if (isTeamChunk) boost += 0.03;
    }

    // Penalize memory-bank/project docs (rarely what users want)
    if (r.dataCategory === "project") {
      boost -= 0.08;
    }

    return { ...r, score: r.score + boost * boostMul };
  });

  boosted.sort((a, b) => b.score - a.score);
  const kept = boosted.slice(0, topK);
  onProgress?.("rerank_end", {
    candidatePool: boosted.length,
    kept: kept.length,
    topSource: kept[0]?.source ?? null,
    topScore: kept[0]?.score ?? null,
    topCategory: (kept[0] as { dataCategory?: string } | undefined)?.dataCategory ?? null,
    structuredCount: structuredResults.length,
    rulesCount: rulesResults.length,
  });
  return kept;
}
