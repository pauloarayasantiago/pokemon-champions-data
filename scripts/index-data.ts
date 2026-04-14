import { connect, Index } from "@lancedb/lancedb";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";
import {
  chunkPokemonCsv,
  chunkMegaEvolutionsCsv,
  chunkMovesCsv,
  chunkItemsCsv,
  chunkUpdatedAttacksCsv,
  chunkNewAbilitiesCsv,
  chunkMegaAbilitiesCsv,
  chunkTournamentTeamsCsv,
  chunkPikalyticsUsageCsv,
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
    | "tournament-teams-csv"
    | "pikalytics-usage-csv"
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
  { path: "tournament_teams.csv", type: "tournament-teams-csv" },
  { path: "pikalytics_usage.csv", type: "pikalytics-usage-csv" },

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

  // Research documents
  { path: "research/claude-research.md", type: "markdown" },
  { path: "research/Gemini.txt", type: "plain-text" },
  { path: "research/Pokémon Champions (2026) — Competitive Knowledge Base.md", type: "markdown" },

  // Knowledge documents
  { path: "data/knowledge/type_chart.md", type: "markdown" },
  { path: "data/knowledge/damage_calc.md", type: "markdown" },
  { path: "data/knowledge/team_archetypes.md", type: "markdown" },
  { path: "data/knowledge/team_building_theory.md", type: "markdown" },
  { path: "data/knowledge/meta_snapshot.md", type: "markdown" },
  { path: "data/knowledge/speed_tiers.md", type: "markdown" },
  { path: "data/knowledge/champions_rules.md", type: "markdown" },
];

// Dynamically add all YouTube transcript markdown files
try {
  const transcriptDir = resolve(PROJECT_ROOT, "data", "transcripts");
  const transcriptFiles = readdirSync(transcriptDir)
    .filter((f) => f.endsWith(".md"))
    .map((f): FileEntry => ({ path: `data/transcripts/${f}`, type: "markdown" }));
  FILES.push(...transcriptFiles);
} catch {
  // data/transcripts/ may not exist yet — skip silently
}

// Map file types to searchable data categories
function getDataCategory(entry: FileEntry): string {
  switch (entry.type) {
    case "pokemon-csv": return "pokemon";
    case "mega-evolutions-csv": return "mega";
    case "moves-csv": return "move";
    case "items-csv": return "item";
    case "updated-attacks-csv": return "move";
    case "new-abilities-csv": return "ability";
    case "mega-abilities-csv": return "mega";
    case "tournament-teams-csv": return "team";
    case "pikalytics-usage-csv": return "usage";
    case "plain-text": return "knowledge";
    case "markdown": {
      if (entry.path.startsWith("memory-bank/")) return "project";
      if (entry.path.startsWith("data/transcripts/")) return "transcript";
      return "knowledge";
    }
  }
}

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
    case "tournament-teams-csv":
      return chunkTournamentTeamsCsv(absPath, entry.path);
    case "pikalytics-usage-csv":
      return chunkPikalyticsUsageCsv(absPath, entry.path);
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
  const allChunks: Array<Chunk & { data_category: string }> = [];

  for (const entry of FILES) {
    const absPath = resolve(PROJECT_ROOT, entry.path);
    try {
      const chunks = await chunkFile(entry, absPath);
      const category = getDataCategory(entry);
      console.log(`  ${entry.path}: ${chunks.length} chunks [${category}]`);
      allChunks.push(...chunks.map((c) => ({ ...c, data_category: category })));
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

  // 5. Build records for LanceDB (with top-level stat columns for structured queries)
  const records = chunksToInsert.map((c, i) => {
    const meta = c.metadata as Record<string, unknown>;
    const isPokemon = c.data_category === "pokemon" || c.data_category === "mega";
    return {
      id: c.id,
      text: c.text,
      source: c.source,
      source_type: c.sourceType,
      data_category: c.data_category,
      metadata: JSON.stringify(c.metadata),
      vector: vectors[i],
      // Top-level stat columns for SQL filtering (null for non-Pokemon chunks)
      pokemon_name: isPokemon ? (meta.name ?? meta.mega_name ?? null) as string | null : null,
      col_type1: isPokemon ? (meta.type1 ?? null) as string | null : null,
      col_type2: isPokemon ? (meta.type2 ?? null) as string | null : null,
      stat_hp: isPokemon ? (meta.hp ?? null) as number | null : null,
      stat_attack: isPokemon ? (meta.attack ?? null) as number | null : null,
      stat_defense: isPokemon ? (meta.defense ?? null) as number | null : null,
      stat_sp_atk: isPokemon ? (meta.sp_atk ?? null) as number | null : null,
      stat_sp_def: isPokemon ? (meta.sp_def ?? null) as number | null : null,
      stat_speed: isPokemon ? (meta.speed ?? null) as number | null : null,
      stat_bst: isPokemon ? (meta.bst ?? null) as number | null : null,
    };
  });

  // 6. Insert into LanceDB
  if (!force && tableExists) {
    const table = await db.openTable(TABLE_NAME);
    await table.add(records);
    console.log(`\nAdded ${records.length} new chunks to existing table.`);
  } else {
    await db.createTable(TABLE_NAME, records);
    console.log(`\nCreated table "${TABLE_NAME}" with ${records.length} chunks.`);
  }

  // 7. Create indexes (FTS for hybrid search + scalar for category filtering)
  const idxTable = await db.openTable(TABLE_NAME);
  console.log("\nCreating FTS index on text column...");
  await idxTable.createIndex("text", {
    config: Index.fts({
      withPosition: true,
      lowercase: true,
      stem: true,
      language: "English",
    }),
    replace: true,
  });
  console.log("FTS index created.");

  console.log("Creating scalar index on data_category...");
  await idxTable.createIndex("data_category", { replace: true });
  console.log("Scalar index created.");

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
