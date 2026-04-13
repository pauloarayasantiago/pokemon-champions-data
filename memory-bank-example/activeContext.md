# Active Context (2026-04-11)

## Current Phase: Workspace Restructured — Ready for Next Phase

The preliminary computational phase is complete (RQ1–RQ4 analyzed, chapter synthesis written, retweet audit done). The workspace has been restructured to remove completed-phase artifacts and reduce context contamination. Conclusions from all phases are preserved in `src/docs/`.

### What's in the workspace now

- **`src/data/`** — Master datasets (`master_image_level.csv`, `master_tweet_level.csv`), the single source of truth for all analysis.
- **`src/docs/`** — 11 reference documents: research proposal, preliminary report, 4 RQ conclusions, 2 synthesis reports, API reference, detection guide, dataset report.
- **`src/eda/`** — `find_missing_retweets.py` (retweet gap closure script).
- **`scripts/`** — Vector search (`search.ts`, `index-data.ts`) and review spreadsheet generator (`make_review_xlsx.py`).

### Key Analytical Findings (from completed phases)

**RQ1 (Prevalence):** 15.5% IGA (114/737); parties 2x candidate rate (OR=2.3, p=0.002); IGA rate decreases over time.

**RQ2 (Engagement):** NO significant engagement difference (all 6 metrics p > 0.35). Null confirmed by 25 additional tests.

**RQ3 (Disclosure):** ZERO genuine disclosures across 5 channels. Wilson CI < 3.3%.

**RQ4 (Accounts):** IGA selectivity significant (OR=2.82, p=0.0013). 7 creators vs 5 amplifiers. 41 external sources, highly dispersed.

**Synthesis Clustering (v5):** 5 GMM clusters on ProGAN + SD14 + impressions (originals only, N=671). ProGAN anomaly in liberalcr/elifeinzaig. Prior "silent cluster" was 100% retweet artifact.

### Active Decisions
- **Retweet filter:** Always filter `is_retweet == False` for engagement metrics and any feature using `impression_count`.
- **Master datasets** at `src/data/` — shared across all analysis.
- **Reference docs** in `src/docs/` are read-only.

### Communicational Phenomena (from v5 clustering)
1. Synthetic normalization: AI content functionally invisible to audiences.
2. Reach driven by event quality, not production method.
3. AI as invisible production infrastructure.
4. Pipeline fingerprinting via detector ensembles.

### Hypotheses for Manual Revision
- H1 (Format): C2 AI content performs well because of format, not medium.
- H2 (Unconscious Enhancement): C3 accounts don't consider themselves "AI users."
- H3 (Shared Pipeline): liberalcr and elifeinzaig share a production source.
- H4 (Event Ceiling): C0 vs C1 gap explained by event newsworthiness.

### Retweet Data — Fully Complete (2026-04-11)
All 51 master dataset retweets now have matching original engagement metrics in `archive/data-backup-2026-03-31/retweets/`. The 9 previously missing retweets (Jul–Sep 2025) were recovered via targeted `get_tweets()` ID lookup ($0.14 vs $5.16 full backfill).

### Pending (Priority Order)
1. **HIVE Detection:** Run HIVE on all 737 images.
2. **Manual Revision:** 304 images, 5 tiers, 3-level coding (IGA/IAE/ORG), 2 coders.
3. **SPAI Integration:** Await `spai.pth` for secondary validation.
