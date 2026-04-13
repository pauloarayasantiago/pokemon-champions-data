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

export async function query(question: string, topK = 5): Promise<Result[]> {
  const [vector] = await embed([question]);

  const db = await connect(DB_PATH);
  const table = await db.openTable(TABLE_NAME);

  const raw = await table
    .vectorSearch(vector)
    .distanceType("cosine")
    .limit(topK)
    .toArray();

  return raw.map((r: Record<string, unknown>) => ({
    text: r.text as string,
    source: r.source as string,
    score: 1 - (r._distance as number),
    sourceType: r.source_type as string,
    metadata: JSON.parse(r.metadata as string),
  }));
}
