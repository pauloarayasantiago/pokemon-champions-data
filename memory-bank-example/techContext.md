# Tech Context

## Environments

| Env | Python | PyTorch | Purpose |
|---|---|---|---|
| system | 3.13 | — | Analysis scripts, extraction |
| `detection` | 3.10 | 2.0.1+cu118 | AIDE, UFD (numpy pinned to 1.24.3) |
| `spai` | 3.11 | 2.3.1+cu118 | SPAI inference only |

**Conda:** Miniconda 26.1.1 at `C:\Users\paulo\miniconda3`

## Two Machines

**Desktop (primary):** RTX 2070 SUPER 8GB. Conda in PATH. `conda run -n detection python ...`
**Laptop:** RTX 3050 6GB. Conda NOT in PATH: `C:\Users\paulo\miniconda3\condabin\conda.bat run -n detection python ...`

## Key Constraints
- SPAI requires CUDA, no CPU fallback. RTX 3050 may OOM — prefer desktop.
- AIDE auto-enables `--fp16` on GPUs with <8GB VRAM.
- Pin `numpy <2.0` in detection env (PyTorch 2.0.1 compat).
- Set `PYTHONIOENCODING=utf-8` on Windows for unicode output.

## Node.js Stack (Vector Search)
- LanceDB for semantic index (`.lancedb/` dir, gitignored)
- HuggingFace transformers for embeddings
- Scripts: `scripts/search.ts`, `scripts/index-data.ts`
- Libs: `lib/chunker.ts`, `lib/embed.ts`, `lib/rag.ts`
- Run with `npx tsx`
