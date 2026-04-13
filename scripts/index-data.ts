import { connect } from "@lancedb/lancedb";
import { resolve } from "node:path";
import {
  chunkPokemonCsv,
  chunkMegaEvolutionsCsv,
  chunkMovesCsv,
  chunkItemsCsv,
  chunkUpdatedAttacksCsv,
  chunkNewAbilitiesCsv,
  chunkMegaAbilitiesCsv,
  chunkPlainTextFile,
  chunkMarkdownFile,
  type Chunk,
} from "../lib/chunker.js";
import { embed } from "../lib/embed.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = resolve(PROJECT_ROOT, ".lancedb");
const TABLE_NAME = "chunks";
const EMBED_BATCH = 64;

interface FileEntry {
  path: string;
  type:
    | "pokemon-csv"
    | "mega-evolutions-csv"
    | "moves-csv"
    | "items-csv"
    | "updated-attacks-csv"
    | "new-abilities-csv"
    | "mega-abilities-csv"
    | "plain-text"
    | "markdown";
}

const FILES: FileEntry[] = [
  // Game data CSVs
  { path: "pokemon_champions.csv", type: "pokemon-csv" },
  { path: "mega_evolutions.csv", type: "mega-evolutions-csv" },
  { path: "moves.csv", type: "moves-csv" },
  { path: "items.csv", type: "items-csv" },
  { path: "updated_attacks.csv", type: "updated-attacks-csv" },
  { path: "new_abilities.csv", type: "new-abilities-csv" },
  { path: "mega_abilities.csv", type: "mega-abilities-csv" },

  // Plain text mechanics files
  { path: "status_conditions.txt", type: "plain-text" },
  { path: "training_mechanics.txt", type: "plain-text" },

  // Memory-bank project context
  { path: "memory-bank/activeContext.md", type: "markdown" },
  { path: "memory-bank/errors.md", type: "markdown" },
  { path: "memory-bank/productContext.md", type: "markdown" },
  { path: "memory-bank/progress.md", type: "markdown" },
  { path: "memory-bank/projectbrief.md", type: "markdown" },
  { path: "memory-bank/systemPatterns.md", type: "markdown" },
  { path: "memory-bank/techContext.md", type: "markdown" },
];

async function chunkFile(entry: FileEntry, absPath: string): Promise<Chunk[]> {
  switch (entry.type) {
    case "pokemon-csv":
      return chunkPokemonCsv(absPath, entry.path);
    case "mega-evolutions-csv":
      return chunkMegaEvolutionsCsv(absPath, entry.path);
    case "moves-csv":
      return chunkMovesCsv(absPath, entry.path);
    case "items-csv":
      return chunkItemsCsv(absPath, entry.path);
    case "updated-attacks-csv":
      return chunkUpdatedAttacksCsv(absPath, entry.path);
    case "new-abilities-csv":
      return chunkNewAbilitiesCsv(absPath, entry.path);
    case "mega-abilities-csv":
      return chunkMegaAbilitiesCsv(absPath, entry.path);
    case "plain-text":
      return chunkPlainTextFile(absPath, entry.path);
    case "markdown":
      return chunkMarkdownFile(absPath, entry.path);
  }
}

async function main() {
  const force = process.argv.includes("--force");

  // 1. Chunk all files
  console.log(`\nChunking ${FILES.length} files...`);
  const allChunks: Chunk[] = [];

  for (const entry of FILES) {
    const absPath = resolve(PROJECT_ROOT, entry.path);
    try {
      const chunks = await chunkFile(entry, absPath);
      console.log(`  ${entry.path}: ${chunks.length} chunks`);
      allChunks.push(...chunks);
    } catch (err) {
      console.error(`  SKIP ${entry.path}: ${(err as Error).message}`);
    }
  }

  console.log(`Total chunks: ${allChunks.length}`);

  // 2. Connect to LanceDB
  const db = await connect(DB_PATH);
  const tableNames = await db.tableNames();
  const tableExists = tableNames.includes(TABLE_NAME);

  if (force && tableExists) {
    console.log("--force: dropping existing table...");
    await db.dropTable(TABLE_NAME);
  }

  // 3. Determine which chunks are new (incremental mode)
  let chunksToInsert = allChunks;
  if (!force && tableExists) {
    const table = await db.openTable(TABLE_NAME);
    const existing = await table.query().select(["id"]).toArray();
    const existingIds = new Set(existing.map((r: { id: string }) => r.id));
    chunksToInsert = allChunks.filter((c) => !existingIds.has(c.id));
    console.log(
      `Existing: ${existingIds.size}, new: ${chunksToInsert.length}, skipped: ${allChunks.length - chunksToInsert.length}`
    );
  }

  if (chunksToInsert.length === 0) {
    console.log("Nothing to index. Done.");
    return;
  }

  // 4. Embed in batches
  console.log(`\nEmbedding ${chunksToInsert.length} chunks...`);
  const vectors: number[][] = [];
  for (let i = 0; i < chunksToInsert.length; i += EMBED_BATCH) {
    const batch = chunksToInsert.slice(i, i + EMBED_BATCH);
    const batchVectors = await embed(batch.map((c) => c.text));
    vectors.push(...batchVectors);
    console.log(
      `  Embedded ${Math.min(i + EMBED_BATCH, chunksToInsert.length)}/${chunksToInsert.length}`
    );
  }

  // 5. Build records for LanceDB
  const records = chunksToInsert.map((c, i) => ({
    id: c.id,
    text: c.text,
    source: c.source,
    source_type: c.sourceType,
    metadata: JSON.stringify(c.metadata),
    vector: vectors[i],
  }));

  // 6. Insert into LanceDB
  if (!force && tableExists) {
    const table = await db.openTable(TABLE_NAME);
    await table.add(records);
    console.log(`\nAdded ${records.length} new chunks to existing table.`);
  } else {
    await db.createTable(TABLE_NAME, records);
    console.log(`\nCreated table "${TABLE_NAME}" with ${records.length} chunks.`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
