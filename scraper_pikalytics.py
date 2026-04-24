"""Scraper for Pikalytics Pokemon Champions VGC 2026 usage statistics."""

import csv
import random
import re
import sys
import time
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.pikalytics.com/pokedex/championstournaments"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Pokemon Champions Scraper)",
    "Accept-Language": "en-US,en;q=0.9",
    # Cloudflare in front of Pikalytics caches by URL and ignores the
    # Accept-Language header; without a cache-bust query param it sometimes
    # serves a Japanese-localized variant (observed 2026-04-23 for Delphox,
    # Tauros, Floette-Eternal). See A6 in rag-master-plan.md.
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}

# Pokemon whose CSV name doesn't match the Pikalytics URL slug
SLUG_OVERRIDES = {
    "Mr. Rime": None,  # Not on Pikalytics — skip
}

TOP_N = 10  # Max entries to keep per category

# A6 — detect any non-ASCII in scraped names. Pikalytics has been observed
# serving Japanese, Traditional Chinese, Spanish, German, French, and Korean
# variants across separate URLs (2026-04-23). moves.csv + items.csv are 100%
# ASCII so any non-ASCII char in scraped output is a non-English regression.
NON_ENGLISH_RE = re.compile(r"[^\x00-\x7f]")


def contains_non_english(pairs):
    """True if any (name, pct) pair's name contains any non-ASCII character."""
    return any(NON_ENGLISH_RE.search(name) for name, _ in pairs)


def get_pokemon_names():
    """Read Pokemon names from pokemon_champions.csv."""
    names = []
    with open("pokemon_champions.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            names.append(row["name"])
    return names


def load_prior_english_rows(path="pikalytics_usage.csv"):
    """Load the existing CSV; keep only rows whose top_moves + top_items are
    fully English. Used as a fallback source when a fresh scrape regresses to
    Japanese/Chinese for a Pokemon that previously had good English data.

    Pikalytics' Cloudflare layer occasionally serves Japanese or Traditional
    Chinese variants per-URL regardless of Accept-Language header. Observed
    2026-04-23: two consecutive scrapes affected different subsets (Delphox,
    Tauros, Floette-Eternal on run N; Ninetales-Alola, Gengar, Gyarados,
    Whimsicott on run N+1). Cache-bust query param fixes most but not all.
    """
    try:
        with open(path, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
    except FileNotFoundError:
        return {}
    return {
        r["pokemon"]: r
        for r in rows
        if r.get("pokemon")
        and not NON_ENGLISH_RE.search(r.get("top_moves", ""))
        and not NON_ENGLISH_RE.search(r.get("top_items", ""))
    }


def fetch(url):
    # Cache-bust query param — forces Cloudflare to fetch fresh from origin.
    bust_url = f"{url}{'&' if '?' in url else '?'}_r={random.randint(1_000_000, 9_999_999)}"
    resp = requests.get(bust_url, headers=HEADERS, timeout=30)
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


MAX_LANG_RETRIES = 2


def scrape_pokemon(name):
    """Scrape usage data for a single Pokemon. Returns dict or None.

    On Japanese-language output (per-Pokemon Cloudflare cache artifact), retries
    up to MAX_LANG_RETRIES times — fetch() injects a fresh random cache-bust
    query param on every call, so each retry defeats the stale cache entry.
    """
    if name in SLUG_OVERRIDES:
        slug = SLUG_OVERRIDES[name]
        if slug is None:
            return None
    else:
        slug = name

    url = f"{BASE_URL}/{slug}"

    soup = None
    usage = rank = None
    moves = items = abilities = teammates = []
    attempts = 0
    while attempts <= MAX_LANG_RETRIES:
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

        if not (contains_non_english(moves) or contains_non_english(items)):
            break
        attempts += 1
        if attempts <= MAX_LANG_RETRIES:
            print(f"[non-EN retry {attempts}/{MAX_LANG_RETRIES}]", end=" ", flush=True)
            time.sleep(0.5)

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
    print(f"  {len(names)} Pokemon to check")

    prior_en = load_prior_english_rows()
    if prior_en:
        print(f"  Loaded {len(prior_en)} prior English rows as regression fallback\n")
    else:
        print()

    results = []
    skipped = []
    failed = []
    fallback_used = []  # Pokemon whose fresh scrape regressed; kept prior EN

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
                    is_non_en = (NON_ENGLISH_RE.search(data["top_moves"])
                                 or NON_ENGLISH_RE.search(data["top_items"]))
                    if is_non_en and name in prior_en:
                        print(f"non-EN after retries — using prior English row")
                        results.append(prior_en[name])
                        fallback_used.append(name)
                    else:
                        results.append(data)
                        print(f"usage {data['usage_pct']}%, rank #{data['rank']}, "
                              f"{len(data['top_moves'].split('|'))} moves, "
                              f"{len(data['top_items'].split('|'))} items"
                              f"{' [STUCK NON-EN]' if is_non_en else ''}")
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

    if fallback_used:
        print(f"Fresh scrape regressed to non-EN; kept prior English for "
              f"{len(fallback_used)}: {', '.join(fallback_used)}")

    # A6 — guard: any remaining non-English content means we neither got a
    # fresh English scrape nor had a prior English row to fall back to.
    jp_rows = [
        r["pokemon"] for r in results
        if NON_ENGLISH_RE.search(r.get("top_moves", ""))
        or NON_ENGLISH_RE.search(r.get("top_items", ""))
    ]
    if jp_rows:
        print(f"\nERROR: {len(jp_rows)} row(s) still non-English with no EN "
              f"fallback available: {', '.join(jp_rows)}")
        print("Options: re-run (scope drifts); bump MAX_LANG_RETRIES; manual"
              " English seed in CSV for these Pokemon.")
        sys.exit(1)
    print("\nLanguage check: all rows English.")


if __name__ == "__main__":
    main()
