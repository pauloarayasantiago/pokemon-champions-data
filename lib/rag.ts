import { connect } from "@lancedb/lancedb";
import { resolve } from "node:path";
import { embed } from "./embed.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = resolve(PROJECT_ROOT, ".lancedb");
const TABLE_NAME = "chunks";

export interface Result {
  text: string;
  source: string;
  score: number;
  sourceType: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Re-ranking helpers: boost usage chunks when the query asks for usage data
// ---------------------------------------------------------------------------

const USAGE_KEYWORDS = [
  "usage", "competitive", "statistics", "ranked", "popular",
  "most used", "tournament", "top moves", "top items",
  "top abilities", "teammates", "pikalytics", "usage rate",
  "pick rate", "usage stats",
];

function detectUsageIntent(question: string): boolean {
  const q = question.toLowerCase();
  return USAGE_KEYWORDS.some((kw) => q.includes(kw));
}

function extractPokemonFromQuery(
  question: string,
  results: Array<{ metadata: Record<string, unknown> }>,
): string | null {
  const q = question.toLowerCase();
  for (const r of results) {
    const raw =
      r.metadata.pokemon ?? r.metadata.name ?? r.metadata.base_pokemon;
    if (typeof raw !== "string") continue;
    if (q.includes(raw.toLowerCase())) return raw;
  }
  return null;
}

// ---------------------------------------------------------------------------

export async function query(question: string, topK = 5): Promise<Result[]> {
  const [vector] = await embed([question]);

  const db = await connect(DB_PATH);
  const table = await db.openTable(TABLE_NAME);

  const fetchK = topK * 3;
  const raw = await table
    .vectorSearch(vector)
    .distanceType("cosine")
    .limit(fetchK)
    .toArray();

  const parsed = raw.map((r: Record<string, unknown>) => ({
    text: r.text as string,
    source: r.source as string,
    score: 1 - (r._distance as number),
    sourceType: r.source_type as string,
    metadata: JSON.parse(r.metadata as string),
  }));

  // Detect intent and apply boosts
  const wantsUsage = detectUsageIntent(question);
  const pokemonName = extractPokemonFromQuery(question, parsed);

  const boosted = parsed.map((r) => {
    let boost = 0;
    const isUsageChunk = r.source === "pikalytics_usage.csv";

    if (
      isUsageChunk &&
      wantsUsage &&
      pokemonName &&
      (r.metadata.pokemon as string)?.toLowerCase() ===
        pokemonName.toLowerCase()
    ) {
      boost += 0.1;
    }

    if (isUsageChunk && wantsUsage && !pokemonName) {
      boost += 0.05;
    }

    return { ...r, score: r.score + boost };
  });

  boosted.sort((a, b) => b.score - a.score);
  return boosted.slice(0, topK);
}
