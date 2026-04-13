# Progress

## Completed Phases

### Extraction (2026-03-24)
424 image-tweets, 737 images, 13 accounts. Scripts archived (no longer in workspace).

### Detection (2026-03-26)
AIDE (3 checkpoints) + UFD on all 737 images. Results baked into master CSVs. Detection scripts removed from workspace.

### Data Prep (2026-04-01)
Built `master_image_level.csv` (N=737) and `master_tweet_level.csv` (N=424) with derived columns. Agreement >= 2 as IGA threshold.

### EDA & Sanity (2026-03-31)
Profiled data health, identified account confounding and retweet engagement bias.

### RQ1 — Prevalence (closed 2026-04-01)
15.5% IGA (revised to 16.8% after Q3 calibration). Parties 2x candidate rate. Temporal decrease. AI-editing spectrum insight. Conclusion: `src/docs/rq1_conclusion.md`.

### RQ2 — Engagement (closed 2026-04-02)
NULL confirmed. No significant engagement difference (all 6 metrics p > 0.35, 0/25 SMART tests significant). Prior significance was retweet artifact. Conclusion: `src/docs/rq2_conclusion.md`.

### RQ3 — Disclosure (closed 2026-04-02)
ZERO genuine disclosures across 5 channels. Wilson CI < 3.3%. Even agreement=3 images: zero disclosed. Conclusion: `src/docs/rq3_conclusion.md`.

### RQ4 — Account Categorization (completed 2026-04-02)
7 creators, 5 amplifiers. IGA selectivity significant (OR=2.82, p=0.0013). 41 external sources, highly dispersed. Report: `src/docs/rq4_analysis_report.md`.

### Chapter Synthesis (completed 2026-04-02)
Cross-RQ narrative with 3 threads: transparency laundering, invisible AI, resource substitution. Manual revision methodology defined.

### Synthesis Clustering v1–v5 (completed 2026-04-04)
5-cluster GMM on ProGAN + SD14 + impressions (originals only, N=671). Reports: `src/docs/synthesis_evolution_report.md`, `src/docs/v5_synthesis_clustering_report.md`.

### Retweet Repercussions Audit (completed 2026-04-04)
Confirmed v4 silent cluster was 100% retweet artifact. RQ2 engagement significance was retweet artifact. All reports corrected.

### Workspace Restructure (2026-04-04)
Removed completed-phase directories (detection, extraction, RQ scripts, raw data, backups). Moved conclusions to `src/docs/`. Master CSVs to `src/data/`. Clean `src/eda/` for next phase.

### Retweet Gap Closure (2026-04-11)
Cross-referenced master dataset RTs (51) against API retweet files (42) to identify 9 missing retweets (Jul–Sep 2025, pre-API-window). Used targeted `get_tweets()` lookup on 9 specific IDs instead of full backfill (~27 reads/$0.14 vs ~1,032 reads/$5.16). Appended to `archive/data-backup-2026-03-31/retweets/`: RoblesBarrantes +7 (→31), nuevarepublica7 +2 (→2). All 51 retweets now have original engagement metrics. Script: `src/eda/find_missing_retweets.py`.

## Current Phase
Workspace restructured. All retweet data complete. Next: HIVE detector + manual revision using cluster labels for stratification.

## Data Profile Summary
| Fact | Value |
|---|---|
| Total images | 737 (671 originals + 66 retweets) |
| Total tweets | 424 (373 originals + 51 retweets) |
| IGA images (originals only) | 92 (13.7%) |
| IGA images (all incl. RTs) | 114 (15.5%) |
| Genuine AI disclosures | 0 |
| Date range | 2025-07-01 to 2026-01-31 |

## Method Viability (Verified)
**Viable:** Mann-Whitney U, permutation test, Fisher's exact, bootstrapped CIs, Spearman, Wilson score CIs, chi-squared, two-proportion z-test, Kruskal-Wallis, Jonckheere-Terpstra, GMM, PCA, hierarchical clustering, one-sided binomial.
**Not viable:** t-test, ANOVA (non-normal/skew), deep learning (needs larger training set).

## Pending
1. HIVE detection on all 737 images.
2. Manual revision: 304 images, 5 tiers, 3-level coding (IGA/IAE/ORG).
3. Test hypotheses H1–H4 during manual revision.
4. ~~Budget backfill: Jul-Oct 2025 retweets~~ — Completed 2026-04-11 via targeted ID lookup (9 tweets, $0.14).
5. SPAI integration: await `spai.pth`.
