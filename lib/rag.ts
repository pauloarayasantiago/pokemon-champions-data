import { resolve, dirname } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { embed } from "./embed.js";
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
  "ohko", "one-shot", "damage calc", "vs",
];

export function classifyQuery(question: string): QueryIntent {
  const q = question.toLowerCase();
  const names = getPokemonNames();
  const moves = getMoveNames();

  // Extract Pokemon name from query (longest match first)
  let pokemonName: string | null = null;
  const sortedNames = [...names].sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (q.includes(name)) {
      pokemonName = name;
      break;
    }
  }

  // Extract move name from query (longest match first, skip if it's a Pokemon name)
  let moveName: string | null = null;
  const sortedMoves = [...moves].sort((a, b) => b.length - a.length);
  for (const name of sortedMoves) {
    if (name === pokemonName) continue; // Avoid collision
    if (q.includes(name)) {
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
    if (q.includes(name)) {
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
    if (q.includes(name)) pokemonMentionCount++;
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

export async function query(question: string, topK = 5): Promise<Result[]> {
  await checkStaleness();
  const [vector] = await embed([question], "query");
  const intent = classifyQuery(question);
  const supabase = supabaseServer();

  // Always fetch a healthy candidate pool so rerank boosts can surface the
  // right chunk even when topK is small (e.g. Protect in moves.csv can sit
  // outside the raw RRF top-20 but #1 after move-name boost).
  const fetchK = Math.max(topK * 8, 80);

  const { data: hybridRaw, error: hybridErr } = await supabase.rpc("pc_hybrid_search", {
    p_embedding: vector,
    p_query: question,
    p_categories: intent.categories.length > 0 ? intent.categories : null,
    p_fetch_k: fetchK,
    p_rrf_k: 60,
  });
  if (hybridErr) {
    throw new Error(`pc_hybrid_search RPC failed: ${hybridErr.message}`);
  }
  const raw = (hybridRaw ?? []) as Record<string, unknown>[];

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

  const structuredIds = new Set(structuredResults.map((r) => r.id as string));
  const allRaw = [...structuredResults, ...rulesResults, ...raw];

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

    return { ...r, score: r.score + boost };
  });

  boosted.sort((a, b) => b.score - a.score);
  return boosted.slice(0, topK);
}
