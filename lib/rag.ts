import { connect, rerankers } from "@lancedb/lancedb";
import { resolve } from "node:path";
import { readFileSync, statSync, existsSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { embed } from "./embed.js";
import { buildStatFilter } from "./structured-query.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = resolve(PROJECT_ROOT, ".lancedb");
const TABLE_NAME = "chunks";
const INDEX_META_PATH = resolve(DB_PATH, "index-meta.json");

// ---------------------------------------------------------------------------
// Staleness detection
// ---------------------------------------------------------------------------

let _stalenessChecked = false;

function checkStaleness(): void {
  if (_stalenessChecked) return;
  _stalenessChecked = true;

  if (!existsSync(INDEX_META_PATH)) return;
  try {
    const meta = JSON.parse(readFileSync(INDEX_META_PATH, "utf-8"));
    const mtimes: Record<string, string> = meta.file_mtimes ?? {};
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
    // Malformed meta — ignore
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
  /** Whether user is asking about competitive usage data */
  isUsageQuery: boolean;
  /** Whether user is asking about countering/beating something */
  isCounterQuery: boolean;
}

const USAGE_KEYWORDS = [
  "usage", "competitive stats", "statistics", "ranked",
  "most used", "tournament usage", "top moves", "top items",
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

  // Word-boundary matching to avoid "attackers" matching "attack"
  const words = new Set(q.split(/\s+/));
  const matchKeyword = (kw: string) => {
    // Multi-word keywords use substring match
    if (kw.includes(" ")) return q.includes(kw);
    // Single-word keywords use word boundary
    return words.has(kw);
  };

  const isUsageQuery = USAGE_KEYWORDS.some((kw) => q.includes(kw));
  const isCounterQuery = COUNTER_KEYWORDS.some(matchKeyword);
  const hasMoveKeyword = MOVE_KEYWORDS.some(matchKeyword);
  const hasItemKeyword = ITEM_KEYWORDS.some(matchKeyword);
  const hasTeamKeyword = TEAM_KEYWORDS.some(matchKeyword);
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
  // 3. Counter query — exclude move chunks to avoid "Counter" the move
  else if (isCounterQuery) {
    categories.push("pokemon", "knowledge", "transcript", "usage");
  }
  // 4. Item query
  else if (hasItemKeyword) {
    categories.push("item", "knowledge");
  }
  // 5. Move query
  else if (hasMoveKeyword) {
    categories.push("move", "pokemon", "knowledge");
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
    isUsageQuery,
    isCounterQuery,
  };
}

// ---------------------------------------------------------------------------
// Score extraction: hybrid search returns _relevance_score, vector returns _distance
// ---------------------------------------------------------------------------

function extractScore(row: Record<string, unknown>): number {
  if (typeof row._relevance_score === "number") return row._relevance_score;
  if (typeof row._distance === "number") return 1 - row._distance;
  return 0;
}

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

export async function query(question: string, topK = 5): Promise<Result[]> {
  checkStaleness();
  const [vector] = await embed([question], "query");
  const intent = classifyQuery(question);

  const db = await connect(DB_PATH);
  const table = await db.openTable(TABLE_NAME);

  const fetchK = topK * 4; // wider net for filtering

  // Build category filter SQL
  const categoryFilter = intent.categories.length > 0
    ? intent.categories.map((c) => `data_category = '${c}'`).join(" OR ")
    : null;

  // Hybrid search: vector + FTS with RRF reranking
  let raw: Record<string, unknown>[];
  try {
    const reranker = await rerankers.RRFReranker.create(60);
    let q = table
      .vectorSearch(vector)
      .distanceType("cosine")
      .fullTextSearch(question)
      .rerank(reranker);

    if (categoryFilter) {
      q = q.where(categoryFilter);
    }

    raw = await q.limit(fetchK).toArray();
  } catch {
    // Fallback to vector-only if FTS index doesn't exist
    let q = table.vectorSearch(vector).distanceType("cosine");
    if (categoryFilter) q = q.where(categoryFilter);
    raw = await q.limit(fetchK).toArray();
  }

  // If structured query, also run SQL-based filtering
  let structuredResults: Record<string, unknown>[] = [];
  if (intent.isStructured) {
    const statFilter = buildStatFilter(question);
    if (statFilter) {
      try {
        structuredResults = await table
          .query()
          .where(statFilter)
          .limit(topK)
          .toArray();
        if (process.env.RAG_DEBUG) {
          console.error(`[DEBUG] Structured filter: ${statFilter}`);
          console.error(`[DEBUG] Structured results: ${structuredResults.length}`);
          for (const r of structuredResults) {
            console.error(`[DEBUG]   ${r.pokemon_name} Spe:${r.stat_speed} SpA:${r.stat_sp_atk}`);
          }
        }
      } catch (err) {
        console.error("Structured query failed:", (err as Error).message);
      }
    } else if (process.env.RAG_DEBUG) {
      console.error("[DEBUG] buildStatFilter returned null");
    }
  } else if (process.env.RAG_DEBUG) {
    console.error("[DEBUG] Not structured query");
  }

  // Merge structured results with hybrid results
  const allRaw = [...structuredResults, ...raw];

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = allRaw.filter((r) => {
    const id = r.id as string;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const parsed = deduped.map((r: Record<string, unknown>) => ({
    text: r.text as string,
    source: r.source as string,
    score: extractScore(r),
    sourceType: r.source_type as string,
    dataCategory: r.data_category as string,
    metadata: JSON.parse(r.metadata as string),
    isStructuredResult: structuredResults.includes(r),
  }));

  // Apply domain-specific boosts (calibrated to RRF score scale ~0.02-0.035)
  const boosted = parsed.map((r) => {
    let boost = 0;
    const isUsageChunk = r.dataCategory === "usage";
    const isKnowledgeChunk = r.dataCategory === "knowledge";
    const isTeamChunk = r.dataCategory === "team";

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
    }

    // Exact move name match — boost the specific move chunk
    if (intent.moveName && r.dataCategory === "move") {
      const chunkName = (r.metadata.name as string)?.toLowerCase();
      if (chunkName === intent.moveName) {
        boost += 0.04;
      }
    }

    // Knowledge docs boost for counter/strategy queries only
    // (not item/move lookups where the actual data chunk should rank first)
    if (isKnowledgeChunk && intent.isCounterQuery) {
      boost += 0.015;
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
