# System Patterns

## Repository Structure (April 2026 — restructured)

```
workspace/
├── src/
│   ├── data/               Master datasets (shared across all analysis)
│   │   ├── master_image_level.csv   (N=737)
│   │   └── master_tweet_level.csv   (N=424)
│   ├── docs/               Reference docs from completed phases (read-only)
│   │   ├── propuesta.md, informe_preliminar.md
│   │   ├── rq1_conclusion.md, rq2_conclusion.md, rq3_conclusion.md
│   │   ├── rq4_analysis_report.md
│   │   ├── synthesis_evolution_report.md, v5_synthesis_clustering_report.md
│   │   ├── api_fields_reference.md, detection_results_guide.md
│   │   └── master_dataset_report.md
│   └── eda/                Active analysis workspace (new scripts go here)
├── scripts/                index-data.ts, search.ts, make_review_xlsx.py
├── lib/                    RAG pipeline (chunker.ts, embed.ts, rag.ts)
├── memory-bank/            Research context and progress
└── tmp/                    Scratch space
```

**Removed directories:** `data/combined-batches/`, `data/images/`, `data/results/`, `docs/`, `src/analysis/eda/rq1–rq4/`, `src/analysis/eda/synthesis/`, `src/detection/`, `src/extraction/`, `data-backup-*`. Relevant conclusions preserved in `src/docs/`.

## Analysis Conventions

- **IGA threshold:** `aide_agreement_t0.30 >= 2` (at least 2 of 3 AIDE checkpoints agree).
- **Engagement analysis:** Always use `master_tweet_level.csv` and filter `is_retweet == False`.
- **Retweet filtering:** RQ1 report RTs separately. RQ2 exclude RTs. RQ3 include all. RQ4 include RTs (central to amplification).
- **Amplification ratio** (RQ4): `rt_iga / total_iga` per account. 0.00 = pure creator, 1.00 = pure amplifier.

## Analysis Script Pattern

New scripts in `src/eda/` should follow:
- `PROJECT_ROOT = Path(__file__).resolve().parents[N]` — adjust N for depth
- Load master CSVs from `PROJECT_ROOT / "src" / "data"`
- `matplotlib.use("Agg")` for headless rendering
- `report()` helper: accumulate lines, print, write `.txt` at end
- `save_fig()` helper: save to output dir, close figure, log path
- Colors: `C_IGA="#E07A5F"` (coral), `C_ORG="#4A90A4"` (steel), `C_CAND="#5B8C5A"` (green), `C_PARTY="#8B5CF6"` (purple), `C_RT="#9B7FB8"` (lavender)
- Boolean columns (`is_iga`, `is_retweet`) must be cast after CSV load
- `created_at` requires `pd.to_datetime(..., utc=True)`
- Account type: `CANDIDATES` list + `PARTIES` list → `ACCOUNT_TYPE` dict
- Run with: `PYTHONIOENCODING=utf-8 python src/eda/<script>.py`

## Detection Model Integration
- Detection phase complete. Models were AIDE (ICLR 2025) and UniversalFakeDetect (CVPR 2023).
- Detection scripts and model weights no longer in workspace.
- Results are baked into master CSVs (score columns, agreement columns).

## Manual Revision Protocol (defined in previous synthesis phase)
- **3-level coding:** IGA (generative), IAE (AI-enhanced), ORG (organic).
- **5-tier stratified review:** 304 images (41.2% of corpus).
- **HIVE integration:** Run on all 737 images before manual review.
- **Inter-rater reliability:** 2 coders for Tiers 1-2, Cohen kappa >= 0.70 target.
