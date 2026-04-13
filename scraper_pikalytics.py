"""Scraper for Pikalytics Pokemon Champions VGC 2026 usage statistics."""

import csv
import re
import sys
import time
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.pikalytics.com/pokedex/championstournaments"
HEADERS = {"User-Agent": "Mozilla/5.0 (Pokemon Champions Scraper)"}

# Pokemon whose CSV name doesn't match the Pikalytics URL slug
SLUG_OVERRIDES = {
    "Mr. Rime": None,  # Not on Pikalytics — skip
}

TOP_N = 10  # Max entries to keep per category


def get_pokemon_names():
    """Read Pokemon names from pokemon_champions.csv."""
    names = []
    with open("pokemon_champions.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            names.append(row["name"])
    return names


def fetch(url):
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def parse_usage_rank(soup):
    """Extract usage % and rank from meta description tag."""
    meta = soup.find("meta", attrs={"name": "Description"})
    if not meta:
        return None, None
    content = meta.get("content", "")
    usage_m = re.search(r"(\d+(?:\.\d+)?)%\s*usage\s*rate", content)
    rank_m = re.search(r"#(\d+)\s*ranked", content)
    usage = float(usage_m.group(1)) if usage_m else None
    rank = int(rank_m.group(1)) if rank_m else None
    return usage, rank


def parse_section(soup, section_title):
    """Parse a data section (moves, items, abilities) by finding its h2 header.
    Returns list of (name, pct_str) tuples."""
    h2 = soup.find("h2", string=re.compile(section_title))
    if not h2:
        return []
    container = h2.find_parent("div", class_="pokemon-stat-container")
    if not container:
        return []
    entries = container.find_all("div", class_="pokedex-move-entry-new")
    results = []
    for entry in entries[:TOP_N]:
        name_el = (
            entry.find("div", class_="pokedex-inline-text-offset")
            or entry.find("div", class_="pokedex-inline-text")
        )
        pct_el = entry.find("div", class_="pokedex-inline-right")
        if name_el and pct_el:
            name = name_el.get_text(strip=True)
            pct = pct_el.get_text(strip=True).rstrip("%")
            if name:
                results.append((name, pct))
    return results


def parse_teammates(soup):
    """Parse teammates section (uses teammate_entry class)."""
    entries = soup.find_all(class_="teammate_entry")
    results = []
    for entry in entries[:TOP_N]:
        name_el = entry.find("div", class_="pokedex-inline-text")
        pct_el = entry.find("div", class_="pokedex-inline-right")
        if name_el and pct_el:
            name = name_el.get_text(strip=True)
            pct = pct_el.get_text(strip=True).rstrip("%")
            if name:
                results.append((name, pct))
    return results


def format_pairs(pairs):
    """Format [(name, pct), ...] as pipe-delimited 'Name:Pct' string."""
    return "|".join(f"{name}:{pct}" for name, pct in pairs)


def scrape_pokemon(name):
    """Scrape usage data for a single Pokemon. Returns dict or None."""
    if name in SLUG_OVERRIDES:
        slug = SLUG_OVERRIDES[name]
        if slug is None:
            return None
    else:
        slug = name

    url = f"{BASE_URL}/{slug}"
    soup = fetch(url)
    if soup is None:
        return None

    usage, rank = parse_usage_rank(soup)
    if usage is None:
        return None

    moves = parse_section(soup, "Best Moves")
    items = parse_section(soup, "Best Items")
    abilities = parse_section(soup, "Best Abilities")
    teammates = parse_teammates(soup)

    return {
        "pokemon": name,
        "usage_pct": usage,
        "rank": rank or "",
        "top_moves": format_pairs(moves),
        "top_items": format_pairs(items),
        "top_abilities": format_pairs(abilities),
        "top_teammates": format_pairs(teammates),
    }


def write_csv(path, rows, fieldnames):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Saved {len(rows)} rows to {path}")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("Reading Pokemon names from pokemon_champions.csv...")
    names = get_pokemon_names()
    print(f"  {len(names)} Pokemon to check\n")

    results = []
    skipped = []
    failed = []

    for i, name in enumerate(names, 1):
        print(f"[{i}/{len(names)}] {name}...", end=" ")

        if name in SLUG_OVERRIDES and SLUG_OVERRIDES[name] is None:
            print("skip (no Pikalytics page)")
            skipped.append(name)
        else:
            try:
                data = scrape_pokemon(name)
                if data is None:
                    print("no data (404)")
                    skipped.append(name)
                else:
                    results.append(data)
                    print(f"usage {data['usage_pct']}%, rank #{data['rank']}, "
                          f"{len(data['top_moves'].split('|'))} moves, "
                          f"{len(data['top_items'].split('|'))} items")
            except Exception as e:
                print(f"ERROR: {e}")
                failed.append(name)

        if i < len(names):
            time.sleep(1)

    fieldnames = [
        "pokemon", "usage_pct", "rank",
        "top_moves", "top_items", "top_abilities", "top_teammates",
    ]
    write_csv("pikalytics_usage.csv", results, fieldnames)

    print(f"\n{'='*50}")
    print(f"Pokemon with data: {len(results)}")
    print(f"Skipped (no data): {len(skipped)}")
    if failed:
        print(f"Failed ({len(failed)}): {', '.join(failed)}")
    else:
        print("No failures.")


if __name__ == "__main__":
    main()
