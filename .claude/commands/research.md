Automated competitive data gathering for Pokemon Champions (2026) VGC.

## Task

Research the following topic and save structured findings for the project's RAG knowledge base:

**Topic:** $ARGUMENTS

## Step 1: Construct Search Queries

Build Champions-specific search queries. ALWAYS prepend disambiguation terms to avoid Scarlet/Violet results:
- "Pokemon Champions 2026 VGC [topic]"
- "VGC 2026 Champions Regulation M-A [topic]"
- "Pokemon Champions competitive [topic]"

### Query Templates by Focus Area

**Usage statistics:**
```
"Pokemon Champions 2026 VGC usage statistics pikalytics"
"Pokemon Champions 2026 top Pokemon usage rate win rate"
```

**Tier list / meta snapshot:**
```
"Pokemon Champions 2026 VGC tier list regulation M-A"
"Pokemon Champions 2026 meta analysis best Pokemon"
```

**Specific Pokemon:**
```
"[Pokemon name] Pokemon Champions 2026 VGC best set moveset"
"[Pokemon name] Pokemon Champions competitive build guide"
```

**Tournament results:**
```
"Pokemon Champions 2026 VGC tournament results top teams"
"Pokemon Champions 2026 regionals winning team"
```

**Archetype / strategy:**
```
"Pokemon Champions 2026 VGC [archetype] team guide"
"Pokemon Champions [strategy] doubles competitive"
```

## Step 2: Execute Searches

Use WebSearch to find relevant pages, then WebFetch to extract data from the most promising results.

### Priority Sources (most reliable for Champions data)
1. **Pikalytics** — Real-time usage stats, EV/SP spreads, teammate data
2. **StrataDex / Showdown Tier** — Daily-updated tiering from ranked battles
3. **ChampionsHub.gg** — Community analysis and team reports
4. **Pokemon Zone** — News and competitive coverage
5. **Champions Lab** — ML-powered analysis
6. **Limitless TCG** — Tournament results and decklists (team lists)
7. **Victory Road** — Premier VGC coverage
8. **Game8** — Tier lists and calc integrations
9. **Smogon Forums** — Champions subforum discussion
10. **ChampTeams.gg** — Team builder with meta data

## Step 3: Disambiguate Results

Before saving any data, verify it is actually Champions data, NOT Scarlet/Violet:

**Champions indicators (GOOD):**
- Mentions "Regulation M-A", "Omni Ring", "Stat Points", "66 SP"
- References Mega Evolution as the battle gimmick
- Mentions Champions-specific Pokemon/moves/abilities
- Date is April 2026 or later

**S/V indicators (REJECT):**
- Mentions "Regulation H", "Regulation I", "Paldea"
- Mentions "Terastallize", "Tera Type", "Tera Blast"
- Mentions Paradox Pokemon (Flutter Mane, Iron Hands, etc.)
- Mentions Choice Band/Specs, Life Orb, Assault Vest as viable
- Date before April 2026

If a result is ambiguous, note the uncertainty in your output.

## Step 4: Save Results

Save findings as a markdown file in the `research/` directory:

**Filename format:** `research/YYYY-MM-DD-[topic-slug].md`

**File structure:**
```markdown
# [Topic Title]

**Date researched:** YYYY-MM-DD
**Sources:** [list URLs]
**Confidence:** High / Medium / Low

## Summary
[2-3 sentence overview]

## Findings
[Structured data — tables for stats, bullet points for analysis]

## Raw Data
[Any CSV-structured data, usage numbers, etc.]

## Notes
[Caveats, uncertainties, things to verify]
```

For usage statistics or structured numerical data, also save a CSV:
```
research/YYYY-MM-DD-[topic-slug].csv
```

## Step 5: Remind to Reindex

After saving research files, remind the user:

> New research data saved. Run `/reindex` to add it to the vector search index so `/lookup` and `/team` can access it.

## Rules

- ALWAYS disambiguate Champions from Scarlet/Violet — this is the #1 source of bad data
- Include source URLs for every claim
- Flag confidence level: High (official/Pikalytics data), Medium (community analysis), Low (speculation/small sample)
- Do NOT overwrite existing research files — create new dated files
- If a source mixes Champions and S/V data, extract only the Champions portions
- Note when data may be outdated (meta shifts quickly in the first weeks)

## Argument

$ARGUMENTS
