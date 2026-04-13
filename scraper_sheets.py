"""Scraper for VGCPastes Google Sheets tournament teams repository."""

import csv
import io
import sys
import requests

SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/"
    "gviz/tq?tqx=out:csv&gid=791705272"
)
HEADERS = {"User-Agent": "Mozilla/5.0 (Pokemon Champions Scraper)"}

# Column indices (0-based) in the Google Sheet
COL_TEAM_ID = 0
COL_DESCRIPTION = 1
COL_PLAYER = 3
COL_ITEMS = [7, 10, 13, 16, 19, 22]  # Held items for slots 1-6
COL_POKEPASTE = 24
COL_REPLICA_CODE = 28
COL_DATE = 29
COL_TOURNAMENT = 30
COL_RANK = 31
COL_SOURCE = 32
COL_OWNER = 35
COL_POKEMON = [37, 38, 39, 40, 41, 42]  # Pokemon names for slots 1-6

HEADER_ROW = 2  # Row index where actual headers are
DATA_START = 3  # First data row


def fetch_sheet():
    """Download the sheet as CSV and return parsed rows."""
    print("Fetching Google Sheet...")
    resp = requests.get(SHEET_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    reader = csv.reader(io.StringIO(resp.text))
    return list(reader)


def safe_get(row, idx):
    """Get a cell value safely, returning empty string if out of range."""
    if idx < len(row):
        return row[idx].strip()
    return ""


def parse_teams(rows):
    """Parse raw sheet rows into normalized team dicts."""
    teams = []
    for row in rows[DATA_START:]:
        team_id = safe_get(row, COL_TEAM_ID)
        if not team_id or not team_id.startswith("PC"):
            continue

        pokemon = [safe_get(row, c) for c in COL_POKEMON]
        items = [safe_get(row, c) for c in COL_ITEMS]

        # Skip rows with no Pokemon data
        if not any(pokemon):
            continue

        teams.append({
            "team_id": team_id,
            "description": safe_get(row, COL_DESCRIPTION),
            "player": safe_get(row, COL_PLAYER),
            "pokemon1": pokemon[0],
            "pokemon2": pokemon[1],
            "pokemon3": pokemon[2],
            "pokemon4": pokemon[3],
            "pokemon5": pokemon[4],
            "pokemon6": pokemon[5],
            "item1": items[0],
            "item2": items[1],
            "item3": items[2],
            "item4": items[3],
            "item5": items[4],
            "item6": items[5],
            "replica_code": safe_get(row, COL_REPLICA_CODE),
            "date": safe_get(row, COL_DATE),
            "tournament": safe_get(row, COL_TOURNAMENT),
            "player_rank": safe_get(row, COL_RANK),
            "pokepaste_link": safe_get(row, COL_POKEPASTE),
            "source_link": safe_get(row, COL_SOURCE),
            "owner": safe_get(row, COL_OWNER),
        })
    return teams


def write_csv(path, rows, fieldnames):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Saved {len(rows)} rows to {path}")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    rows = fetch_sheet()
    print(f"  Sheet has {len(rows)} raw rows")

    teams = parse_teams(rows)
    print(f"  Parsed {len(teams)} teams")

    fieldnames = [
        "team_id", "description", "player",
        "pokemon1", "pokemon2", "pokemon3", "pokemon4", "pokemon5", "pokemon6",
        "item1", "item2", "item3", "item4", "item5", "item6",
        "replica_code", "date", "tournament", "player_rank",
        "pokepaste_link", "source_link", "owner",
    ]
    write_csv("tournament_teams.csv", teams, fieldnames)


if __name__ == "__main__":
    main()
