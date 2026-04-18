Rebuild the Supabase pgvector search index for the project.

## What to do

1. Run the index script with `--force` to drop and rebuild the full table:
   ```bash
   npx tsx scripts/index-data.ts --force
   ```

2. After the script completes, report to the user:
   - Total number of files processed
   - Total chunks indexed
   - Whether the run succeeded or failed
   - If any files were skipped (SKIP lines in output)

3. If the indexing script is missing new files that were created during the
   session (new markdown reports, new CSVs), **add them to the `FILES` array
   in `scripts/index-data.ts`** before running the index.

## When to use

Run this at the end of any session where:
- Documentation or context files were updated
- New reports or analysis outputs were created
- Any file that the RAG system indexes was changed

## Technical details

- Index script: `scripts/index-data.ts`
- Database: Supabase `pc_chunks` (pgvector HNSW + Postgres FTS) + `pc_index_meta`
- Embedding model: `Xenova/all-MiniLM-L6-v2` (384-dim, ~80MB first download)
- `--force` wipes `pc_chunks` and rebuilds from scratch
- Without `--force`, only new chunks are added (incremental)
