import csv
import re
import time
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.serebii.net"
LIST_URL = f"{BASE_URL}/pokemonchampions/pokemon.shtml"
HEADERS = {"User-Agent": "Mozilla/5.0 (Pokemon Champions Scraper)"}
CATEGORY_TYPES = {"physical", "special", "other"}


def fetch(url):
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def type_from_src(src):
    """Extract type name from an img src like /pokedex-bw/type/rock.gif."""
    m = re.search(r"/type/(\w+)\.\w+$", src or "")
    if m:
        t = m.group(1).lower()
        if t not in CATEGORY_TYPES:
            return t.capitalize()
    return None


# ---------------------------------------------------------------------------
# 1. Pokémon list
# ---------------------------------------------------------------------------

def get_pokemon_list():
    """Return list of (name, relative_url) deduplicated by URL."""
    soup = fetch(LIST_URL)
    seen_urls = {}
    pokemon = []
    for a in soup.find_all("a", href=re.compile(r"^/pokedex-champions/\w")):
        href = a["href"]
        name = a.get_text(strip=True)
        if not name or href in seen_urls:
            continue
        seen_urls[href] = name
        pokemon.append((name, href))
    return pokemon


# ---------------------------------------------------------------------------
# 2. Individual Pokémon page parsing
# ---------------------------------------------------------------------------

def parse_types(soup):
    """Extract type1 and type2 from a Pokémon page (base/first form only)."""
    types = []
    for table in soup.find_all("table", class_="dextable"):
        rows = table.find_all("tr", recursive=False)
        if not rows:
            continue
        headers = [td.get_text(strip=True) for td in rows[0].find_all("td", class_="fooevo")]
        if "Name" not in headers or "Type" not in headers:
            continue
        if len(rows) > 1:
            type_cell = rows[1].find_all("td", recursive=False)[-1]
            # Check for nested sub-cells (regional forms have a 2x2 inner table)
            inner_tds = type_cell.find_all("td", width="50%")
            if inner_tds:
                # Use the second sub-cell (first form's type images, after the "Normal" label)
                source = inner_tds[1] if len(inner_tds) > 1 else inner_tds[0]
            else:
                source = type_cell
            for img in source.find_all("img", src=re.compile(r"/pokedex-bw/type/\w+\.gif")):
                t = type_from_src(img.get("src"))
                if t and t not in types:
                    types.append(t)
        if types:
            break
    type1 = types[0] if len(types) >= 1 else ""
    type2 = types[1] if len(types) >= 2 else ""
    return type1, type2


def parse_abilities(soup):
    """Extract abilities from a Pokémon page. Returns list of ability names."""
    abilities = []
    for td in soup.find_all("td", class_="fooleft"):
        text = td.get_text(strip=True)
        if "Abilities" in text:
            for a in td.find_all("a", href=re.compile(r"/abilitydex/")):
                name = a.get_text(strip=True)
                if name and name not in abilities:
                    abilities.append(name)
            break
    return abilities


def parse_moves(soup):
    """Extract all move names from the Standard Moves table."""
    moves = []
    seen = set()
    for table in soup.find_all("table", class_="dextable"):
        header = table.find("h3")
        if not header or "Standard Moves" not in header.get_text():
            continue
        for td in table.find_all("td", class_="fooinfo"):
            link = td.find("a", href=re.compile(r"/attackdex-champions/"))
            if link:
                move_name = link.get_text(strip=True)
                if move_name and move_name not in seen:
                    seen.add(move_name)
                    moves.append(move_name)
        break
    return moves


def extract_all_forms(soup):
    """Extract all forms (base + Mega) from a Pokémon page.
    Returns list of dicts: [{name, type1, type2, abilities}, ...]
    """
    forms = []
    for table in soup.find_all("table", class_="dextable"):
        rows = table.find_all("tr", recursive=False)
        if not rows:
            continue
        headers = [td.get_text(strip=True) for td in rows[0].find_all("td", class_="fooevo")]
        if "Name" not in headers or "Type" not in headers:
            continue
        # Data row(s)
        for row in rows[1:]:
            cells = row.find_all("td", recursive=False)
            if len(cells) < 2:
                continue
            form_name = re.sub(r"\s+", " ", cells[0].get_text(strip=True))
            # Type cell is the last one with type images
            type_cell = cells[-1]
            type_imgs = type_cell.find_all("img", src=re.compile(r"/type/\w+\.gif"))
            types = [type_from_src(img.get("src")) for img in type_imgs]
            types = [t for t in types if t]
            if not types:
                continue
            # Abilities from next sibling table
            next_t = table.find_next_sibling("table", class_="dextable")
            abilities = []
            if next_t:
                fooleft = next_t.find("td", class_="fooleft")
                if fooleft and "Abilities" in fooleft.get_text():
                    abilities = [a.get_text(strip=True)
                                 for a in fooleft.find_all("a", href=re.compile(r"/abilitydex/"))]
            forms.append({
                "name": form_name.strip(),
                "type1": types[0] if types else "",
                "type2": types[1] if len(types) > 1 else "",
                "abilities": abilities,
            })
    return forms


def parse_base_stats(soup):
    """Extract base stats (HP/Atk/Def/SpA/SpD/Spe) from a Pokémon page.
    Serebii layout: row0 = fooevo "Stats", row1 = column headers, row2 = base stats.
    Returns dict with stat keys or None if not found."""
    for table in soup.find_all("table", class_="dextable"):
        rows = table.find_all("tr", recursive=False)
        if len(rows) < 3:
            continue
        # Base form stat table has exactly "Stats" in the fooevo header
        header_text = rows[0].get_text(strip=True)
        if header_text != "Stats":
            continue
        # Row 2 has: ["Base Stats - Total: XXX", HP, Atk, Def, SpA, SpD, Spe]
        data_cells = rows[2].find_all("td", recursive=False)
        vals = []
        for cell in data_cells:
            text = cell.get_text(strip=True)
            if text.isdigit():
                vals.append(int(text))
        if len(vals) >= 6:
            return {
                "hp": vals[0],
                "attack": vals[1],
                "defense": vals[2],
                "sp_atk": vals[3],
                "sp_def": vals[4],
                "speed": vals[5],
            }
    return None


def parse_mega_stats(soup):
    """Extract Mega Evolution base stats from the same Pokémon page.
    Mega stat tables have "Stats -" in the fooevo header (one table per Mega).
    Returns list of dicts: [{mega_name, hp, attack, ...}, ...] or empty list."""
    mega_stats = []
    for table in soup.find_all("table", class_="dextable"):
        rows = table.find_all("tr", recursive=False)
        if len(rows) < 3:
            continue
        header_text = rows[0].get_text(strip=True)
        if header_text != "Stats -":
            continue
        # Row 2 has base stats for this Mega form
        data_cells = rows[2].find_all("td", recursive=False)
        vals = []
        for cell in data_cells:
            text = cell.get_text(strip=True)
            if text.isdigit():
                vals.append(int(text))
        if len(vals) >= 6:
            mega_stats.append({
                "hp": vals[0],
                "attack": vals[1],
                "defense": vals[2],
                "sp_atk": vals[3],
                "sp_def": vals[4],
                "speed": vals[5],
            })
    return mega_stats


def scrape_pokemon(name, url):
    """Scrape a single Pokémon page. Returns dict or None on 404."""
    full_url = BASE_URL + url
    try:
        soup = fetch(full_url)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return None
        raise
    type1, type2 = parse_types(soup)
    abilities = parse_abilities(soup)
    moves = parse_moves(soup)
    forms = extract_all_forms(soup)
    megas = [f for f in forms if f["name"].startswith("Mega ")]
    stats = parse_base_stats(soup)
    mega_stats = parse_mega_stats(soup)
    # Form variants (Alolan/Hisuian/Galarian/Paldean/Rotom/etc.)
    variants = extract_form_variant_rows(soup, name, moves, stats)
    return {
        "type1": type1,
        "type2": type2,
        "abilities": abilities,
        "moves": moves,
        "megas": megas,
        "stats": stats,
        "mega_stats": mega_stats,
        "variants": variants,
    }


# ---------------------------------------------------------------------------
# Form variants (regional forms, Rotom appliances, Tauros breeds, size/gender)
# ---------------------------------------------------------------------------

# Variant spec: (form_name, type1, type2, abilities, moves_section, stats_section)
# moves_section = header text to find (None -> share base moves)
# stats_section = header text to find (None -> share base stats)
FORM_VARIANTS = {
    "Raichu": [
        ("Raichu-Alola", "Electric", "Psychic", ["Surge Surfer"],
         "Alola Form Standard Moves", "Stats - Alolan Raichu"),
    ],
    "Ninetales": [
        ("Ninetales-Alola", "Ice", "Fairy", ["Snow Cloak", "Snow Warning"],
         "Alola Form Standard Moves", "Stats - Alolan Ninetales"),
    ],
    "Arcanine": [
        ("Arcanine-Hisui", "Fire", "Rock", ["Intimidate", "Flash Fire", "Rock Head"],
         "Hisuian Form Standard Moves", "Stats - Hisuian Arcanine"),
    ],
    "Typhlosion": [
        ("Typhlosion-Hisui", "Fire", "Ghost", ["Blaze", "Flash Fire", "Frisk"],
         "Hisuian Form Standard Moves", "Stats - Hisuian Typhlosion"),
    ],
    "Samurott": [
        ("Samurott-Hisui", "Water", "Dark", ["Torrent", "Shell Armor", "Sharpness"],
         "Hisuian Form Standard Moves", "Stats - Hisuian Samurott"),
    ],
    "Zoroark": [
        ("Zoroark-Hisui", "Normal", "Ghost", ["Illusion"],
         "Hisuian Form Standard Moves", "Stats - Hisuian Zoroark"),
    ],
    "Decidueye": [
        ("Decidueye-Hisui", "Grass", "Fighting", ["Overgrow", "Long Reach"],
         "Hisuian Form Standard Moves", "Stats - Hisuian Decidueye"),
    ],
    "Goodra": [
        ("Goodra-Hisui", "Steel", "Dragon", ["Sap Sipper", "Shell Armor", "Gooey"],
         "Hisuian Form Standard Moves", "Stats - Hisuian Goodra"),
    ],
    "Avalugg": [
        ("Avalugg-Hisui", "Ice", "Rock", ["Strong Jaw", "Ice Body", "Sturdy"],
         "Hisuian Form Standard Moves", "Stats - Hisuian Avalugg"),
    ],
    "Slowbro": [
        ("Slowbro-Galar", "Poison", "Psychic", ["Quick Draw", "Own Tempo", "Regenerator"],
         "Galar Form Standard Moves", "Stats - Galarian Slowbro"),
    ],
    "Slowking": [
        ("Slowking-Galar", "Poison", "Psychic", ["Curious Medicine", "Own Tempo", "Regenerator"],
         "Galar Form Standard Moves", "Stats - Galarian Slowking"),
    ],
    "Stunfisk": [
        ("Stunfisk-Galar", "Ground", "Steel", ["Mimicry"],
         "Galar Form Standard Moves", "Stats - Galarian Stunfisk"),
    ],
    "Tauros": [
        ("Tauros-Paldea-Combat", "Fighting", "", ["Intimidate", "Anger Point", "Cud Chew"],
         "Paldean Form Standard Moves", "Stats - Paldean Tauros"),
        ("Tauros-Paldea-Blaze", "Fire", "Fighting", ["Intimidate", "Anger Point", "Cud Chew"],
         "Standard Moves - Blaze Breed", "Stats - Paldean Tauros"),
        ("Tauros-Paldea-Aqua", "Water", "Fighting", ["Intimidate", "Anger Point", "Cud Chew"],
         "Standard Moves - Aqua Breed", "Stats - Paldean Tauros"),
    ],
    "Rotom": [
        ("Rotom-Heat", "Electric", "Fire", ["Levitate"],
         None, "Stats - Alternate Forms"),
        ("Rotom-Wash", "Electric", "Water", ["Levitate"],
         None, "Stats - Alternate Forms"),
        ("Rotom-Frost", "Electric", "Ice", ["Levitate"],
         None, "Stats - Alternate Forms"),
        ("Rotom-Fan", "Electric", "Flying", ["Levitate"],
         None, "Stats - Alternate Forms"),
        ("Rotom-Mow", "Electric", "Grass", ["Levitate"],
         None, "Stats - Alternate Forms"),
    ],
    "Floette": [
        ("Floette-Eternal", "Fairy", "", ["Flower Veil"],
         None, "Stats - Eternal Floette"),
    ],
    "Meowstic": [
        ("Meowstic-F", "Psychic", "", ["Keen Eye", "Infiltrator", "Competitive"],
         "Standard Moves - Female", None),
    ],
    "Aegislash": [
        ("Aegislash-Blade", "Steel", "Ghost", ["Stance Change"],
         None, "Stats - Blade Forme"),
    ],
    "Lycanroc": [
        ("Lycanroc-Midnight", "Rock", "", ["Keen Eye", "Vital Spirit", "No Guard"],
         "Standard Moves - Midnight Form", "Stats - Midnight Form"),
        ("Lycanroc-Dusk", "Rock", "", ["Tough Claws"],
         "Standard Moves - Dusk Form", "Stats - Dusk Form"),
    ],
    "Gourgeist": [
        ("Gourgeist-Small", "Ghost", "Grass", ["Pickup", "Frisk", "Insomnia"],
         None, "Stats - Small Variety"),
        ("Gourgeist-Large", "Ghost", "Grass", ["Pickup", "Frisk", "Insomnia"],
         None, "Stats - Large Variety"),
        ("Gourgeist-Jumbo", "Ghost", "Grass", ["Pickup", "Frisk", "Insomnia"],
         None, "Stats - Jumbo Variety"),
    ],
    "Basculegion": [
        ("Basculegion-F", "Water", "Ghost", ["Swift Swim", "Adaptability", "Mold Breaker"],
         "Standard Moves - Female", "Stats - Female"),
    ],
    "Palafin": [
        ("Palafin-Hero", "Water", "", ["Zero to Hero"],
         None, "Stats - Hero Form"),
    ],
}


def parse_section_moves(soup, header_text):
    """Find a move-list section by its h2/h3 text and return list of move names."""
    for h in soup.find_all(["h2", "h3"]):
        if h.get_text(" ", strip=True) == header_text:
            table = h.find_parent("table", class_="dextable")
            if not table:
                return []
            moves = []
            seen = set()
            for a in table.find_all("a", href=re.compile(r"/attackdex-champions/")):
                n = a.get_text(strip=True)
                if n and n not in seen:
                    seen.add(n)
                    moves.append(n)
            return moves
    return []


def parse_section_stats(soup, header_text):
    """Find a stats section by its h2 text and return stats dict."""
    for h in soup.find_all(["h2", "h3"]):
        if h.get_text(" ", strip=True) == header_text:
            table = h.find_parent("table", class_="dextable")
            if not table:
                return None
            rows = table.find_all("tr", recursive=False)
            if len(rows) < 3:
                return None
            data_cells = rows[2].find_all("td", recursive=False)
            vals = [int(c.get_text(strip=True)) for c in data_cells
                    if c.get_text(strip=True).isdigit()]
            if len(vals) >= 6:
                return {
                    "hp": vals[0], "attack": vals[1], "defense": vals[2],
                    "sp_atk": vals[3], "sp_def": vals[4], "speed": vals[5],
                }
    return None


def extract_form_variant_rows(soup, base_name, base_moves, base_stats):
    """Build rows for known regional/form variants from a Pokemon page."""
    specs = FORM_VARIANTS.get(base_name, [])
    rows = []
    for form_name, t1, t2, abilities, moves_section, stats_section in specs:
        moves = (parse_section_moves(soup, moves_section)
                 if moves_section else list(base_moves))
        if not moves:
            moves = list(base_moves)
        stats = (parse_section_stats(soup, stats_section)
                 if stats_section else base_stats)
        if not stats:
            stats = base_stats or {}
        rows.append({
            "name": form_name,
            "type1": t1, "type2": t2,
            "abilities": abilities,
            "moves": moves,
            "stats": stats,
        })
    return rows


# ---------------------------------------------------------------------------
# 3. Items
# ---------------------------------------------------------------------------

def scrape_items():
    """Scrape items from the items listing page."""
    soup = fetch(f"{BASE_URL}/pokemonchampions/items.shtml")
    items = []
    for table in soup.find_all("table", class_="dextable"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all("td")
            if len(cells) == 4:
                name = cells[1].get_text(strip=True)
                effect = cells[2].get_text(strip=True)
                location = cells[3].get_text(strip=True)
                if name and name != "Name":
                    items.append({
                        "name": name,
                        "effect": effect,
                        "location": location,
                    })
    return items


# ---------------------------------------------------------------------------
# 4. Full move database
# ---------------------------------------------------------------------------

def scrape_move_database():
    """Scrape the complete move list with stats."""
    soup = fetch(f"{BASE_URL}/pokemonchampions/moves.shtml")
    moves = []
    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"], recursive=False)
        if len(cells) != 7:
            continue
        # Skip header rows
        if cells[0].name == "th":
            continue
        name_tag = cells[0].find("a")
        name = name_tag.get_text(strip=True) if name_tag else cells[0].get_text(strip=True)
        if not name or name == "Name":
            continue

        # Type from img src
        type_img = cells[1].find("img")
        move_type = type_from_src(type_img.get("src") if type_img else None) or ""

        # Category from img src
        cat_img = cells[2].find("img")
        cat_src = cat_img.get("src", "") if cat_img else ""
        category = ""
        if "physical" in cat_src:
            category = "Physical"
        elif "special" in cat_src:
            category = "Special"
        elif cat_src:
            category = "Status"

        pp = cells[3].get_text(strip=True)
        power = cells[4].get_text(strip=True)
        accuracy = cells[5].get_text(strip=True)
        effect = cells[6].get_text(strip=True)

        moves.append({
            "name": name,
            "type": move_type,
            "category": category,
            "pp": pp,
            "power": power,
            "accuracy": accuracy,
            "effect": effect,
        })
    return moves


# ---------------------------------------------------------------------------
# 5. Updated attacks
# ---------------------------------------------------------------------------

def scrape_updated_attacks():
    """Scrape updated attacks — Champions vs S/V comparison."""
    soup = fetch(f"{BASE_URL}/pokemonchampions/updatedattacks.shtml")
    updates = []
    current_move = None

    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"], recursive=False)
        if len(cells) == 9:
            # Champions row (first row of a pair)
            name_tag = cells[0].find("a")
            name = name_tag.get_text(strip=True) if name_tag else cells[0].get_text(strip=True)
            game = cells[1].get_text(strip=True)
            type_img = cells[2].find("img")
            move_type = type_from_src(type_img.get("src") if type_img else None) or ""
            cat_img = cells[3].find("img")
            cat_src = cat_img.get("src", "") if cat_img else ""
            category = ""
            if "physical" in cat_src:
                category = "Physical"
            elif "special" in cat_src:
                category = "Special"
            elif cat_src:
                category = "Status"

            pp = cells[4].get_text(strip=True)
            power = cells[5].get_text(strip=True)
            accuracy = cells[6].get_text(strip=True)
            effect = cells[7].get_text(strip=True)
            effect_chance = cells[8].get_text(strip=True)

            current_move = {
                "name": name,
                "champions_type": move_type,
                "champions_category": category,
                "champions_pp": pp,
                "champions_power": power,
                "champions_accuracy": accuracy,
                "champions_effect": effect,
                "champions_effect_chance": effect_chance,
            }

        elif len(cells) in (5, 6) and current_move:
            # S/V row (second row of a pair)
            offset = 0
            game = cells[0].get_text(strip=True)
            if game == "S/V":
                if len(cells) == 6:
                    # Has type column
                    type_img = cells[1].find("img")
                    current_move["sv_type"] = type_from_src(type_img.get("src") if type_img else None) or ""
                    offset = 1
                current_move["sv_pp"] = cells[1 + offset].get_text(strip=True)
                current_move["sv_power"] = cells[2 + offset].get_text(strip=True)
                current_move["sv_accuracy"] = cells[3 + offset].get_text(strip=True)
                current_move["sv_effect_chance"] = cells[4 + offset].get_text(strip=True) if len(cells) > 4 + offset else ""
                updates.append(current_move)
                current_move = None

    return updates


# ---------------------------------------------------------------------------
# 6. Status conditions (text content)
# ---------------------------------------------------------------------------

def scrape_status_conditions():
    """Scrape changed status conditions as structured text."""
    soup = fetch(f"{BASE_URL}/pokemonchampions/statusconditions.shtml")
    content = []
    for table in soup.find_all("table", class_="dextable"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all("td")
            for cell in cells:
                text = cell.get_text(strip=True)
                if text and len(text) > 10:
                    content.append(text)
    return "\n\n".join(content)


# ---------------------------------------------------------------------------
# 7. Training mechanics (text content)
# ---------------------------------------------------------------------------

def scrape_training():
    """Scrape training mechanics page as structured text."""
    soup = fetch(f"{BASE_URL}/pokemonchampions/training.shtml")
    content = []
    for table in soup.find_all("table", class_="dextable"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all("td")
            for cell in cells:
                text = cell.get_text(strip=True)
                if text and len(text) > 5:
                    content.append(text)
    return "\n\n".join(content)


# ---------------------------------------------------------------------------
# 8. New abilities + Mega abilities
# ---------------------------------------------------------------------------

def scrape_new_abilities():
    """Scrape new abilities page."""
    soup = fetch(f"{BASE_URL}/pokemonchampions/newabilities.shtml")
    abilities = []
    for table in soup.find_all("table", class_="tab"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all("td")
            if len(cells) >= 2:
                name = cells[0].get_text(strip=True)
                effect = cells[1].get_text(strip=True)
                if name and effect and name != "Name":
                    abilities.append({"name": name, "effect": effect})
    return abilities


def scrape_mega_abilities():
    """Scrape mega evolution abilities page."""
    soup = fetch(f"{BASE_URL}/pokemonchampions/megaabilities.shtml")
    megas = []
    for table in soup.find_all("table", class_="tab"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all("td")
            if len(cells) == 6:
                pokemon = cells[3].get_text(strip=True)
                # Types from imgs in cells[4]
                type_imgs = cells[4].find_all("img")
                types = []
                for img in type_imgs:
                    t = type_from_src(img.get("src"))
                    if t:
                        types.append(t)
                ability = cells[5].get_text(strip=True)
                if pokemon and ability:
                    megas.append({
                        "pokemon": pokemon,
                        "type1": types[0] if types else "",
                        "type2": types[1] if len(types) > 1 else "",
                        "ability": ability,
                    })
    return megas


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def write_csv(path, rows, fieldnames):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Saved {len(rows)} rows to {path}")


def main():
    # --- Items ---
    print("Scraping items...")
    items = scrape_items()
    write_csv("items.csv", items, ["name", "effect", "location"])

    # --- Move database ---
    print("Scraping move database...")
    moves_db = scrape_move_database()
    write_csv("moves.csv", moves_db, ["name", "type", "category", "pp", "power", "accuracy", "effect"])

    # --- Updated attacks ---
    print("Scraping updated attacks...")
    updates = scrape_updated_attacks()
    write_csv("updated_attacks.csv", updates, [
        "name",
        "champions_type", "champions_category", "champions_pp", "champions_power",
        "champions_accuracy", "champions_effect", "champions_effect_chance",
        "sv_type", "sv_pp", "sv_power", "sv_accuracy", "sv_effect_chance",
    ])

    # --- New abilities ---
    print("Scraping new abilities...")
    new_abs = scrape_new_abilities()
    write_csv("new_abilities.csv", new_abs, ["name", "effect"])

    # --- Mega abilities ---
    print("Scraping mega abilities...")
    mega_abs = scrape_mega_abilities()
    write_csv("mega_abilities.csv", mega_abs, ["pokemon", "type1", "type2", "ability"])

    # --- Status conditions ---
    print("Scraping status conditions...")
    status_text = scrape_status_conditions()
    with open("status_conditions.txt", "w", encoding="utf-8") as f:
        f.write(status_text)
    print(f"  Saved status_conditions.txt ({len(status_text)} chars)")

    # --- Training mechanics ---
    print("Scraping training mechanics...")
    training_text = scrape_training()
    with open("training_mechanics.txt", "w", encoding="utf-8") as f:
        f.write(training_text)
    print(f"  Saved training_mechanics.txt ({len(training_text)} chars)")

    # --- Pokémon (with abilities now) ---
    print("\nFetching Pokémon list...")
    pokemon_list = get_pokemon_list()
    print(f"Found {len(pokemon_list)} unique Pokémon to scrape.\n")

    results = []
    all_megas = []
    failed = []

    for i, (name, url) in enumerate(pokemon_list, 1):
        print(f"[{i}/{len(pokemon_list)}] Scraping {name}...", end=" ")
        try:
            data = scrape_pokemon(name, url)
            if data is None:
                print("404 — skipped")
                failed.append(name)
            else:
                stats = data.get("stats") or {}
                bst = sum(stats.values()) if stats else ""
                results.append({
                    "name": name,
                    "type1": data["type1"],
                    "type2": data["type2"],
                    "abilities": "|".join(data["abilities"]),
                    "moves": "|".join(data["moves"]),
                    "hp": stats.get("hp", ""),
                    "attack": stats.get("attack", ""),
                    "defense": stats.get("defense", ""),
                    "sp_atk": stats.get("sp_atk", ""),
                    "sp_def": stats.get("sp_def", ""),
                    "speed": stats.get("speed", ""),
                    "bst": bst,
                })
                # Match mega stats by index order (forms and stat tables appear in same order)
                mega_stats_list = data.get("mega_stats", [])
                # Disambiguate duplicate mega names (e.g., Charizard has two "Mega Charizard" entries — X / Y)
                mega_name_counts = {}
                for mega in data["megas"]:
                    mega_name_counts[mega["name"]] = mega_name_counts.get(mega["name"], 0) + 1
                dup_suffix_index = {}
                for idx, mega in enumerate(data["megas"]):
                    ms = mega_stats_list[idx] if idx < len(mega_stats_list) else {}
                    mega_bst = sum(ms.values()) if ms else ""
                    mega_name = mega["name"]
                    if mega_name_counts[mega_name] > 1:
                        dup_suffix_index[mega_name] = dup_suffix_index.get(mega_name, 0) + 1
                        suffix = " X" if dup_suffix_index[mega_name] == 1 else " Y"
                        mega_name = mega_name + suffix
                    all_megas.append({
                        "base_pokemon": name,
                        "mega_name": mega_name,
                        "type1": mega["type1"],
                        "type2": mega["type2"],
                        "ability": "|".join(mega["abilities"]),
                        "hp": ms.get("hp", ""),
                        "attack": ms.get("attack", ""),
                        "defense": ms.get("defense", ""),
                        "sp_atk": ms.get("sp_atk", ""),
                        "sp_def": ms.get("sp_def", ""),
                        "speed": ms.get("speed", ""),
                        "bst": mega_bst,
                    })
                # Emit form variant rows (regional/breed/size/gender forms)
                for v in data.get("variants", []):
                    vs = v.get("stats") or {}
                    vbst = sum(vs.values()) if vs else ""
                    results.append({
                        "name": v["name"],
                        "type1": v["type1"],
                        "type2": v["type2"],
                        "abilities": "|".join(v["abilities"]),
                        "moves": "|".join(v["moves"]),
                        "hp": vs.get("hp", ""),
                        "attack": vs.get("attack", ""),
                        "defense": vs.get("defense", ""),
                        "sp_atk": vs.get("sp_atk", ""),
                        "sp_def": vs.get("sp_def", ""),
                        "speed": vs.get("speed", ""),
                        "bst": vbst,
                    })
                mega_info = f", {len(data['megas'])} mega(s)" if data["megas"] else ""
                var_info = f", {len(data.get('variants', []))} variant(s)" if data.get("variants") else ""
                stats_info = f", BST {bst}" if bst else ", no stats found"
                print(f"{data['type1']}/{data['type2'] or '—'}, {len(data['abilities'])} abilities, {len(data['moves'])} moves{mega_info}{var_info}{stats_info}")
        except Exception as e:
            print(f"ERROR: {e}")
            failed.append(name)

        if i < len(pokemon_list):
            time.sleep(1)

    write_csv("pokemon_champions.csv", results,
             ["name", "type1", "type2", "abilities", "moves",
              "hp", "attack", "defense", "sp_atk", "sp_def", "speed", "bst"])
    write_csv("mega_evolutions.csv", all_megas,
             ["base_pokemon", "mega_name", "type1", "type2", "ability",
              "hp", "attack", "defense", "sp_atk", "sp_def", "speed", "bst"])

    # Summary
    print(f"\n{'='*50}")
    print(f"Total Pokémon scraped: {len(results)}")
    if failed:
        print(f"Failed/skipped ({len(failed)}): {', '.join(failed)}")
    else:
        print("No failures.")
    print("\nAll files:")
    for f in ["pokemon_champions.csv", "items.csv", "moves.csv", "updated_attacks.csv",
              "new_abilities.csv", "mega_abilities.csv", "status_conditions.txt", "training_mechanics.txt"]:
        print(f"  {f}")


if __name__ == "__main__":
    main()
