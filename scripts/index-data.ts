import { resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";
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
  chunkMatchupMatrixCsv,
  chunkPlainTextFile,
  chunkMarkdownFile,
  type Chunk,
} from "../lib/chunker.js";
import { embed } from "../lib/embed.js";
import { supabaseServer } from "../lib/supabase.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const EMBED_BATCH = 64;
const UPSERT_BATCH = 200;

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
    | "matchup-matrix-csv"
    | "plain-text"
    | "markdown";
}

// Hardcoded CSV and text files (each has a specific chunker function)
const STATIC_FILES: FileEntry[] = [
  { path: "pokemon_champions.csv", type: "pokemon-csv" },
  { path: "mega_evolutions.csv", type: "mega-evolutions-csv" },
  { path: "moves.csv", type: "moves-csv" },
  { path: "items.csv", type: "items-csv" },
  { path: "updated_attacks.csv", type: "updated-attacks-csv" },
  { path: "new_abilities.csv", type: "new-abilities-csv" },
  { path: "mega_abilities.csv", type: "mega-abilities-csv" },
  { path: "tournament_teams.csv", type: "tournament-teams-csv" },
  { path: "pikalytics_usage.csv", type: "pikalytics-usage-csv" },
  { path: "matchup_matrix.csv", type: "matchup-matrix-csv" },
  { path: "status_conditions.txt", type: "plain-text" },
  { path: "training_mechanics.txt", type: "plain-text" },
];

// Glob patterns for auto-discovered markdown/text files
const GLOB_DIRS: Array<{ dir: string; ext: string; type: FileEntry["type"] }> = [
  { dir: "memory-bank", ext: ".md", type: "markdown" },
  { dir: "data/knowledge", ext: ".md", type: "markdown" },
  { dir: "data/transcripts", ext: ".md", type: "markdown" },
];

function discoverFiles(): FileEntry[] {
  const files = [...STATIC_FILES];
  for (const { dir, ext, type } of GLOB_DIRS) {
    try {
      const absDir = resolve(PROJECT_ROOT, dir);
      const entries = readdirSync(absDir)
        .filter((f) => f.endsWith(ext) && !f.startsWith("."))
        .map((f): FileEntry => ({ path: `${dir}/${f}`, type }));
      files.push(...entries);
    } catch {
      // Directory may not exist yet — skip
    }
  }
  return files;
}

const FILES = discoverFiles();

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
    case "matchup-matrix-csv": return "matchup";
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
    case "matchup-matrix-csv":
      return chunkMatchupMatrixCsv(absPath, entry.path);
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

  // 2. Connect to Supabase
  const supabase = supabaseServer();

  // 3. Force mode: delete all rows (per-source would be safer but full wipe preserves prior semantics)
  if (force) {
    console.log("--force: deleting all rows from pc_chunks...");
    const { error } = await supabase.from("pc_chunks").delete().neq("id", "__sentinel__");
    if (error) throw new Error(`Force delete failed: ${error.message}`);
  }

  // 4. Determine which chunks are new (incremental mode)
  let chunksToInsert = allChunks;
  if (!force) {
    const existingIds = new Set<string>();
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("pc_chunks")
        .select("id")
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Existing-ID fetch failed: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data) existingIds.add(r.id as string);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    chunksToInsert = allChunks.filter((c) => !existingIds.has(c.id));
    console.log(
      `Existing: ${existingIds.size}, new: ${chunksToInsert.length}, skipped: ${allChunks.length - chunksToInsert.length}`
    );
  }

  if (chunksToInsert.length === 0) {
    console.log("Nothing to index. Done.");
    return;
  }

  // 5. Embed in batches
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

  // 6. Build records (top-level stat columns for structured queries)
  const records = chunksToInsert.map((c, i) => {
    const meta = c.metadata as Record<string, unknown>;
    const isPokemon = c.data_category === "pokemon" || c.data_category === "mega";
    return {
      id: c.id,
      text: c.text,
      source: c.source,
      source_type: c.sourceType,
      data_category: c.data_category,
      metadata: c.metadata,
      embedding: vectors[i],
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

  // 7. Upsert to Supabase in batches
  console.log(`\nUpserting ${records.length} chunks to pc_chunks...`);
  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    const batch = records.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase.from("pc_chunks").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`Upsert batch ${i}-${i + batch.length} failed: ${error.message}`);
    console.log(`  Upserted ${Math.min(i + UPSERT_BATCH, records.length)}/${records.length}`);
  }

  // 8. Write index metadata to pc_index_meta
  const fileMtimes: Record<string, string> = {};
  for (const entry of FILES) {
    try {
      const absPath = resolve(PROJECT_ROOT, entry.path);
      fileMtimes[entry.path] = statSync(absPath).mtime.toISOString();
    } catch {
      // File may have been skipped
    }
  }

  const { count: totalAfter, error: countErr } = await supabase
    .from("pc_chunks")
    .select("*", { count: "exact", head: true });
  if (countErr) throw new Error(`Count failed: ${countErr.message}`);

  const metaRows = [
    { key: "indexed_at", value: new Date().toISOString() },
    { key: "embedding_model", value: "Xenova/all-MiniLM-L6-v2" },
    { key: "chunk_count", value: totalAfter ?? 0 },
    { key: "file_count", value: FILES.length },
    { key: "file_mtimes", value: fileMtimes },
  ];
  const { error: metaErr } = await supabase
    .from("pc_index_meta")
    .upsert(metaRows, { onConflict: "key" });
  if (metaErr) throw new Error(`pc_index_meta upsert failed: ${metaErr.message}`);
  console.log(`Index metadata written to pc_index_meta (${metaRows.length} keys).`);

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
