Refresh competitive meta data (Pikalytics usage stats + tournament teams) and rebuild the vector index.

## What to do

Parse the argument to determine scope:

- **No argument / `all`**: Run both scrapers + reindex
- **`pikalytics`**: Run only Pikalytics scraper + reindex
- **`sheets`**: Run only Google Sheets scraper + reindex

### Step 1: Run Scrapers

**Pikalytics** (if in scope):
```bash
PYTHONIOENCODING=utf-8 python scraper_pikalytics.py
```
- Scrapes ~186 Pokemon pages from Pikalytics (~4 min with 1s delay)
- Outputs `pikalytics_usage.csv` with usage %, moves, items, abilities, teammates
- Pokemon without tournament data are skipped (404)

**Google Sheets** (if in scope):
```bash
PYTHONIOENCODING=utf-8 python scraper_sheets.py
```
- Downloads VGCPastes tournament team repository (single HTTP request)
- Outputs `tournament_teams.csv` with team compositions, items, players, events

### Step 2: Reindex

```bash
npx tsx scripts/index-data.ts --force
```

### Step 3: Report

Tell the user:
- Number of Pokemon with Pikalytics data (and how many skipped)
- Number of tournament teams scraped
- Total chunks indexed
- Any failures or errors

## Known Limitations

- Pikalytics move names may appear in non-English languages (depends on tournament submission language)
- Not all 186 Pokemon have Pikalytics data (only those with tournament appearances)
- Google Sheets structure may change if the sheet owner reorganizes columns

## Argument

$ARGUMENTS
