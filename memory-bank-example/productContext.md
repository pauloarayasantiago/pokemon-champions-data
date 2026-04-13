# Product Context

## Why this project exists
This study, *"Democracia artificial"*, analyzes how AI-generated images (IGA) are used in Costa Rica's 2026 political landscape. As AI tools become more accessible, their role in political communication needs empirical analysis.

## Research Questions
1. **RQ1 (Prevalence):** Identify IGA shared on X during Costa Rica 2026 elections; determine which candidates had the most IGA representation.
2. **RQ2 (Engagement):** Measure IGA effectiveness (likes, comments, impressions) vs organic content.
3. **RQ3 (Disclosure):** Assess whether IGA posts include AI-generation disclosures.
4. **RQ4 (Distribution):** Identify whether official accounts create IGA or amplify it from external sources.

## Pipeline
1. **Extraction** — Automated collection from 13 political accounts via Twitter API. *(complete)*
2. **Detection** — Multi-model inference (AIDE + UFD) to score and classify images. *(complete)*
3. **Data Prep** — Merged detection results + engagement metrics into master datasets. *(complete)*
4. **EDA & Analysis** — Statistical testing across 4 RQs. *(complete)*
5. **Chapter Synthesis** — Cross-RQ narrative, clustering, manual revision methodology. *(complete)*
6. **Manual Revision (next)** — HIVE commercial detector + stratified human review (304 images, 3-level coding).

## Cross-RQ Narrative
1. AI imagery is **prevalent** (15.5%), concentrated in party accounts (2x rate), used for resource substitution.
2. IGA **does not boost engagement** — null across all metrics. Account identity drives engagement.
3. **Zero transparency** — not a single disclosure across any channel.
4. Official accounts **preferentially amplify** IGA from supporters (2x selectivity, p=0.0013).

## Current Status (2026-04-04)
Preliminary computational phase **complete**. Workspace restructured to remove completed-phase artifacts. All conclusions preserved in `src/docs/`. Next: HIVE detection + manual revision.
