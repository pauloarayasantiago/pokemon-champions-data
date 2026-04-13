# Project Brief: Democracia Artificial

Book chapter: *"Democracia artificial: Aproximación al uso de imágenes generadas con IA generativa para expresar ideas relacionadas a las personas candidatas más populares en las elecciones 2026 en Costa Rica"*
**Author:** Ing. Oscar Alvarado Ph.D.
**Repo:** [pauloarayasantiago/democracia-artificial](https://github.com/pauloarayasantiago/democracia-artificial)

## Research Objectives
1. **RQ1 (Prevalence):** Identify IGA shared on X during Costa Rica 2026 elections.
2. **RQ2 (Engagement):** Measure IGA effectiveness vs organic content.
3. **RQ3 (Disclosure):** Assess whether IGA posts include AI-generation disclosures.
4. **RQ4 (Distribution):** Identify creation vs amplification patterns in official accounts.

**Excluded accounts:** `@aramosc`, `@plncr`, `@ppscostarica` (not updated, out of scope)

## Target Accounts (13)
**Candidates (7):** laurapresi2026, RoblesBarrantes, ClaudiaDobles, jchidalgo, JoseAguilarBerr, FabriAlvarado7, elifeinzaig
**Parties (6):** FrenteAmplio, accionciudadana, pusc_cr, Avanza_cr, nuevarepublica7, liberalcr

## Data Summary
- **424 image-tweets** across 12 active accounts (Jul 2025–Jan 2026)
- **737 images** (1 failed download)
- **114 IGA images** (15.5%, revised to 16.8% after calibration)
- **0 genuine AI disclosures**
- Budget: $0.00/$25 (planned ~$5.17 for Jul-Oct 2025 backfill)

## IGA Detection Methodology
- **Threshold:** `aide_agreement_t0.30 >= 2` (at least 2 of 3 AIDE checkpoints agree).
- **AI-editing spectrum:** AIDE catches generative AI + AI-powered photo editing. Binary IGA/non-IGA is a simplification.
- **SD14 calibration:** When SD14 is lone flagger (86 images), only 12% confirmed IGA.

## Key Documents (in `src/docs/`)
- `propuesta.md` — Research proposal
- `informe_preliminar.md` — Preliminary report (retweet-corrected)
- `rq1_conclusion.md` through `rq4_analysis_report.md` — Individual RQ conclusions
- `synthesis_evolution_report.md` — Clustering v1–v5 decision log
- `v5_synthesis_clustering_report.md` — Final clustering analysis with communicational interpretations
