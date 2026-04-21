import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse } from "csv-parse/sync";

export interface Chunk {
  id: string;
  text: string;
  source: string;
  sourceType: "csv-row" | "markdown-section" | "text-section";
  metadata: Record<string, unknown>;
  /**
   * Space-separated canonical names / identity tokens for this chunk.
   * Stored in pc_chunks.names_text and lifted to setweight('A') in the
   * generated text_tsv, so FTS queries for a Pokemon / move / item / banned
   * entity name rank the matching chunk far above incidental mentions.
   */
  names?: string;
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function parseCsv(raw: string): Record<string, string>[] {
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
}

function slug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// Stage 4.2 — Metadata prefix
//
// Injected at the start of chunk.text so both the embedding vector AND the
// tsvector (GENERATED column on pc_chunks.text) pick up canonical identity
// tokens and (for champions_rules.md) banned-entity / phantom pre-evo tokens.
// ---------------------------------------------------------------------------

// File-level tag prefix for knowledge documents. Applied to every chunk of
// these files. champions_rules.md is the adversarial target — it must surface
// for banned-item, banned-mechanic, phantom-pre-evo, and banned-entity queries.
// Short file-level tags (~15-25 tokens) — just enough to give FTS a canonical
// category token per doc without dominating the body via self-similarity. The
// detailed content (banned items, phantom pre-evos) lives in the doc body
// itself so different sections of the doc can still differentiate.
const FILE_LEVEL_TAGS: Record<string, string> = {
  "champions_rules.md":
    "[rules] Champions Regulation M-A rules banned items banned mechanics phantom pre-evolutions.",
  "team_building_theory.md":
    "[theory] Team building theory VGC Doubles counters role compression speed control.",
  "team_archetypes.md":
    "[archetype] Team archetypes Sun Rain Sand Snow Trick Room Tailwind Balance Goodstuffs.",
  "type_chart.md":
    "[types] Type chart effectiveness weakness resistance immunity.",
  "meta_snapshot.md":
    "[meta] Current meta snapshot top usage win rates tier list cores archetypes.",
  "speed_tiers.md":
    "[speed] Speed tiers benchmarks Trick Room Tailwind priority brackets.",
  "damage_calc.md":
    "[calc] Damage calculation Stat Points system modifiers STAB weather.",
};

// Pre-evolution -> evolved-form tokens. Keys match Pokemon csv `name` field
// (evolved form); values are pre-evo tokens to inject into that Pokemon's
// chunk so phantom-pre-evo queries route to the evolved form.
const PRE_EVOS: Record<string, string[]> = {
  "Gardevoir": ["ralts", "kirlia"],
  "Scizor": ["scyther"],
  "Weavile": ["sneasel"],
  "Chandelure": ["litwick", "lampent"],
  "Gliscor": ["gligar"],
  "Togekiss": ["togepi", "togetic"],
  "Porygon-Z": ["porygon", "porygon2"],
  "Clefable": ["cleffa", "clefairy"],
  "Blissey": ["happiny", "chansey"],
  "Rhyperior": ["rhyhorn", "rhydon"],
  "Dusknoir": ["duskull", "dusclops"],
  "Electivire": ["elekid", "electabuzz"],
  "Magmortar": ["magby", "magmar"],
  "Dragonite": ["dratini", "dragonair"],
  "Crobat": ["zubat", "golbat"],
  "Aegislash": ["honedge", "doublade"],
  "Roserade": ["budew", "roselia"],
  "Mamoswine": ["swinub", "piloswine"],
  "Honchkrow": ["murkrow"],
  "Mismagius": ["misdreavus"],
  "Yanmega": ["yanma"],
  "Lickilicky": ["lickitung"],
  "Tangrowth": ["tangela"],
};

function prefix(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => !!p && typeof p === "string").join(" ");
}

// ---------------------------------------------------------------------------
// 1. pokemon_champions.csv
// ---------------------------------------------------------------------------

export async function chunkPokemonCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r) => {
    const abilities = (r.abilities || "").replace(/\|/g, ", ");
    const moves = (r.moves || "").replace(/\|/g, ", ");
    const typeStr = r.type2 ? `${r.type1}/${r.type2}` : r.type1;

    const statLine = r.hp
      ? ` Base stats: HP ${r.hp}, Atk ${r.attack}, Def ${r.defense}, SpA ${r.sp_atk}, SpD ${r.sp_def}, Spe ${r.speed} (BST ${r.bst}).`
      : "";
    const preEvos = PRE_EVOS[r.name];
    const prefixLine = prefix([
      "[pokemon]",
      r.name.toLowerCase(),
      r.type1?.toLowerCase(),
      r.type2?.toLowerCase(),
      preEvos ? `also known by pre-evolution ${preEvos.join(", ")}` : "",
    ]);
    const text = `${prefixLine}\n${r.name} is a ${typeStr} type Pokémon.${statLine} Abilities: ${abilities}. Moves: ${moves}.`;
    // Weight-A names: canonical Pokemon name + pre-evo aliases. Pre-evos go
    // into names so phantom-pre-evo FTS queries (e.g. "Litwick moveset") rank
    // the evolved-form chunk (Chandelure) high via setweight('A').
    const names = [r.name, ...(preEvos ?? [])].join(" ");

    return {
      id: `pokemon:${slug(r.name)}`,
      text,
      names,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        name: r.name,
        type1: r.type1,
        type2: r.type2 || null,
        abilities: (r.abilities || "").split("|"),
        move_count: (r.moves || "").split("|").length,
        hp: r.hp ? Number(r.hp) : null,
        attack: r.attack ? Number(r.attack) : null,
        defense: r.defense ? Number(r.defense) : null,
        sp_atk: r.sp_atk ? Number(r.sp_atk) : null,
        sp_def: r.sp_def ? Number(r.sp_def) : null,
        speed: r.speed ? Number(r.speed) : null,
        bst: r.bst ? Number(r.bst) : null,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 2. mega_evolutions.csv
// ---------------------------------------------------------------------------

export async function chunkMegaEvolutionsCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r, i) => {
    const typeStr = r.type2 ? `${r.type1}/${r.type2}` : r.type1;
    const statLine = r.hp
      ? ` Base stats: HP ${r.hp}, Atk ${r.attack}, Def ${r.defense}, SpA ${r.sp_atk}, SpD ${r.sp_def}, Spe ${r.speed} (BST ${r.bst}).`
      : "";
    const prefixLine = prefix([
      "[mega]",
      r.mega_name?.toLowerCase(),
      r.base_pokemon?.toLowerCase(),
      r.type1?.toLowerCase(),
      r.type2?.toLowerCase(),
      r.ability?.toLowerCase(),
      "mega-evolution",
    ]);
    const text = `${prefixLine}\n${r.mega_name} is the Mega Evolution of ${r.base_pokemon}. Type: ${typeStr}. Ability: ${r.ability}.${statLine}`;
    const names = `${r.mega_name} ${r.base_pokemon}`;

    return {
      id: `mega:${slug(r.mega_name)}:${i}`,
      text,
      names,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        base_pokemon: r.base_pokemon,
        mega_name: r.mega_name,
        type1: r.type1,
        type2: r.type2 || null,
        ability: r.ability,
        hp: r.hp ? Number(r.hp) : null,
        attack: r.attack ? Number(r.attack) : null,
        defense: r.defense ? Number(r.defense) : null,
        sp_atk: r.sp_atk ? Number(r.sp_atk) : null,
        sp_def: r.sp_def ? Number(r.sp_def) : null,
        speed: r.speed ? Number(r.speed) : null,
        bst: r.bst ? Number(r.bst) : null,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 3. moves.csv
// ---------------------------------------------------------------------------

export async function chunkMovesCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r) => {
    const parts: string[] = [
      `${r.name} is a ${r.type}-type ${r.category} move. PP: ${r.pp}.`,
    ];
    if (r.power && r.power !== "--") parts.push(`Power: ${r.power}.`);
    if (r.accuracy === "101") {
      parts.push("This move never misses.");
    } else {
      parts.push(`Accuracy: ${r.accuracy}%.`);
    }
    if (r.effect) parts.push(r.effect);

    const prefixLine = prefix([
      "[move]",
      r.name?.toLowerCase(),
      r.type?.toLowerCase(),
      r.category?.toLowerCase(),
    ]);
    return {
      id: `move:${slug(r.name)}`,
      text: `${prefixLine}\n${parts.join(" ")}`,
      names: r.name,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        name: r.name,
        type: r.type,
        category: r.category,
        pp: Number(r.pp),
        power: r.power === "--" ? null : Number(r.power),
        accuracy: Number(r.accuracy),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 4. items.csv
// ---------------------------------------------------------------------------

export async function chunkItemsCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r) => {
    const prefixLine = prefix(["[item]", r.name?.toLowerCase()]);
    const text = `${prefixLine}\n${r.name} is an item. ${r.effect} Location: ${r.location}.`;

    return {
      id: `item:${slug(r.name)}`,
      text,
      names: r.name,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        name: r.name,
        location: r.location,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 5. updated_attacks.csv
// ---------------------------------------------------------------------------

export async function chunkUpdatedAttacksCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r) => {
    const champParts = [
      `${r.champions_type}-type ${r.champions_category}`,
      `PP ${r.champions_pp || "--"}`,
      `Power ${r.champions_power || "--"}`,
      `Accuracy ${r.champions_accuracy || "--"}`,
    ].join(", ");

    const svType = r.sv_type || r.champions_type;
    const svParts = [
      `${svType}-type`,
      `PP ${r.sv_pp || "--"}`,
      `Power ${r.sv_power || "--"}`,
      `Accuracy ${r.sv_accuracy || "--"}`,
    ].join(", ");

    const effect = r.champions_effect ? ` ${r.champions_effect}` : "";
    const prefixLine = prefix([
      "[updated-attack]",
      r.name?.toLowerCase(),
      r.champions_type?.toLowerCase(),
      r.champions_category?.toLowerCase(),
      "nerfed changed",
    ]);
    const text = `${prefixLine}\n${r.name} was updated in Pokémon Champions. Champions: ${champParts}.${effect} In Scarlet/Violet: ${svParts}.`;

    return {
      id: `updated-attack:${slug(r.name)}`,
      text,
      names: r.name,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        name: r.name,
        champions_type: r.champions_type,
        champions_category: r.champions_category,
        sv_type: r.sv_type || null,
        type_changed: !!(r.sv_type && r.sv_type !== r.champions_type),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 6. new_abilities.csv
// ---------------------------------------------------------------------------

export async function chunkNewAbilitiesCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r) => {
    const prefixLine = prefix(["[ability]", r.name?.toLowerCase(), "new-ability"]);
    const text = `${prefixLine}\n${r.name} is a new ability introduced in Pokémon Champions. Effect: ${r.effect}`;

    return {
      id: `ability:${slug(r.name)}`,
      text,
      names: r.name,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        name: r.name,
        is_new: true,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 7. mega_abilities.csv
// ---------------------------------------------------------------------------

export async function chunkMegaAbilitiesCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r) => {
    const typeStr = r.type2 ? `${r.type1}/${r.type2}` : r.type1;
    const prefixLine = prefix([
      "[mega-ability]",
      r.pokemon?.toLowerCase(),
      r.ability?.toLowerCase(),
      r.type1?.toLowerCase(),
      r.type2?.toLowerCase(),
    ]);
    const text = `${prefixLine}\n${r.pokemon} has the ability ${r.ability}. Type: ${typeStr}.`;
    const names = `${r.pokemon} ${r.ability}`;

    return {
      id: `mega-ability:${slug(r.pokemon)}`,
      text,
      names,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        pokemon: r.pokemon,
        ability: r.ability,
        type1: r.type1,
        type2: r.type2 || null,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 8. tournament_teams.csv
// ---------------------------------------------------------------------------

export async function chunkTournamentTeamsCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r) => {
    const pokemon = [r.pokemon1, r.pokemon2, r.pokemon3, r.pokemon4, r.pokemon5, r.pokemon6].filter(Boolean);
    const items = [r.item1, r.item2, r.item3, r.item4, r.item5, r.item6];
    const paired = pokemon.map((p, i) => items[i] ? `${p} @ ${items[i]}` : p).join(", ");
    const archetype = inferArchetype(pokemon, r.description || "");
    const roster = pokemon.map((p) => p.toLowerCase()).join(" ");

    // Stage 4.1 archetype-coherent framing: [team] tokens + archetype + roster
    // on the first line so matchup/counter queries can lexically reach the team.
    const prefixLine = prefix([
      "[team]",
      r.team_id?.toLowerCase(),
      r.player?.toLowerCase(),
      archetype ? archetype.toLowerCase() : "",
      roster,
    ]);
    const parts = [`Tournament team ${r.team_id} by ${r.player}`];
    if (r.tournament && r.tournament !== "-") parts[0] += ` from ${r.tournament}`;
    if (r.player_rank && r.player_rank !== "-") parts[0] += ` (${r.player_rank})`;
    parts[0] += `: ${paired}.`;
    if (archetype) parts.push(`Archetype: ${archetype}.`);
    if (pokemon.length > 0) parts.push(`Core: ${pokemon.join(", ")}.`);
    if (r.description) parts.push(r.description + ".");
    if (r.replica_code) parts.push(`Replica code: ${r.replica_code}.`);

    // Weight-A names for team chunks: team_id + archetype + full roster so
    // matchup queries naming two Pokemon on a team rank the team chunk.
    const names = [r.team_id, archetype ?? "", ...pokemon].filter(Boolean).join(" ");

    return {
      id: `team:${slug(r.team_id)}`,
      text: `${prefixLine}\n${parts.join(" ")}`,
      names,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        team_id: r.team_id,
        player: r.player,
        tournament: r.tournament || null,
        player_rank: r.player_rank || null,
        archetype: archetype || null,
        pokemon,
        items: items.filter(Boolean),
        replica_code: r.replica_code || null,
        pokepaste_link: r.pokepaste_link || null,
      },
    };
  });
}

// Heuristic archetype classifier from team roster + description. Drives Stage
// 4.1 archetype coherence — tags each team chunk with Sun/Rain/Sand/TR/etc so
// archetype queries (e.g. "sand team tyranitar excadrill") route correctly.
function inferArchetype(pokemon: string[], description: string): string | null {
  const hay = (pokemon.join(" ") + " " + description).toLowerCase();
  const tags: string[] = [];
  if (/\btorkoal\b|\bninetales-alola\b|\bvenusaur\b.*(drought|chlorophyll)|\bmega meganium\b/.test(hay) || /\bsun\b|drought/.test(hay)) tags.push("Sun");
  if (/\bpelipper\b|\bkingdra\b|\barchaludon\b.*\bswift swim\b|\bswift swim\b|\brain\b|drizzle/.test(hay)) tags.push("Rain");
  if (/\btyranitar\b|\bhippowdon\b|\bgigalith\b|\bsand\b|sand stream|sand rush/.test(hay)) tags.push("Sand");
  if (/\bninetales\b(?!-alola)|\bsnow\b|snow warning|slush rush/.test(hay)) tags.push("Snow");
  if (/trick room|\btr\b|\bfarigiraf\b|\bdusknoir\b|\bporygon-?z\b.*\btrick room\b/.test(hay)) tags.push("Trick Room");
  if (/tailwind|\baerodactyl\b|\bwhimsicott\b.*\btailwind\b/.test(hay)) tags.push("Tailwind");
  return tags.length ? tags.join(" / ") : null;
}

// ---------------------------------------------------------------------------
// 9. pikalytics_usage.csv
// ---------------------------------------------------------------------------

// Lazy-loaded IT -> EN translation dictionary for fixing Italian Pikalytics data
let _translations: { moves: Record<string, string>; items: Record<string, string>; abilities: Record<string, string> } | null = null;

function getTranslations() {
  if (_translations) return _translations;
  const path = resolve(import.meta.dirname, "translations.json");
  if (existsSync(path)) {
    _translations = JSON.parse(readFileSync(path, "utf-8"));
  } else {
    _translations = { moves: {}, items: {}, abilities: {} };
  }
  return _translations!;
}

function translatePairs(encoded: string, dict: Record<string, string>): string {
  if (!encoded) return encoded;
  return encoded
    .split("|")
    .map((pair) => {
      const sepIdx = pair.lastIndexOf(":");
      if (sepIdx === -1) return pair;
      const name = pair.slice(0, sepIdx);
      const pct = pair.slice(sepIdx + 1);
      const translated = dict[name] ?? name;
      return `${translated}:${pct}`;
    })
    .join("|");
}

function expandPairs(encoded: string): string {
  if (!encoded) return "";
  return encoded
    .split("|")
    .map((pair) => {
      const [name, pct] = pair.split(":");
      return `${name} (${pct}%)`;
    })
    .join(", ");
}

export async function chunkPikalyticsUsageCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);
  const t = getTranslations();

  return rows.map((r) => {
    // Translate Italian names to English before building chunk text
    const moves = translatePairs(r.top_moves, t.moves);
    const items = translatePairs(r.top_items, t.items);
    const abilities = translatePairs(r.top_abilities, t.abilities);

    const parts = [
      `${r.pokemon} competitive usage statistics: Ranked #${r.rank} with ${r.usage_pct}% usage in Champions tournaments.`,
    ];
    if (moves) parts.push(`Top moves: ${expandPairs(moves)}.`);
    if (items) parts.push(`Top items: ${expandPairs(items)}.`);
    if (abilities) parts.push(`Top abilities: ${expandPairs(abilities)}.`);
    if (r.top_teammates) parts.push(`Common teammates: ${expandPairs(r.top_teammates)}.`);

    const topMove = moves ? moves.split("|")[0]?.split(":")[0] : null;
    const topItem = items ? items.split("|")[0]?.split(":")[0] : null;
    const topAbility = abilities ? abilities.split("|")[0]?.split(":")[0] : null;

    const prefixLine = prefix([
      "[usage]",
      r.pokemon?.toLowerCase(),
      "pikalytics usage tournament",
    ]);
    return {
      id: `usage:${slug(r.pokemon)}`,
      text: `${prefixLine}\n${parts.join(" ")}`,
      names: r.pokemon,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        pokemon: r.pokemon,
        usage_pct: Number(r.usage_pct),
        rank: Number(r.rank),
        top_move: topMove,
        top_item: topItem,
        top_ability: topAbility,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 10. matchup_matrix.csv — aggregated per-Pokemon matchup profiles
// ---------------------------------------------------------------------------

export async function chunkMatchupMatrixCsv(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);

  // Group rows by attacker
  const byAttacker = new Map<string, Array<Record<string, string>>>();
  for (const r of rows) {
    const atk = r.attacker;
    if (!byAttacker.has(atk)) byAttacker.set(atk, []);
    byAttacker.get(atk)!.push(r);
  }

  const chunks: Chunk[] = [];
  for (const [attacker, matchups] of byAttacker) {
    // Sort by damage % descending
    matchups.sort((a, b) => Number(b.damage_pct) - Number(a.damage_pct));

    const bestMatchups = matchups.slice(0, 8);
    const worstMatchups = matchups.slice(-5).reverse();
    const beats = bestMatchups
      .map((m) => `${m.defender} (${m.best_move} ${m.damage_pct}%)`)
      .join(", ");
    const walls = worstMatchups
      .filter((m) => Number(m.damage_pct) < 40)
      .map((m) => `${m.defender} (${m.best_move} ${m.damage_pct}%)`)
      .join(", ");

    const avgDmg = matchups.reduce((s, m) => s + Number(m.damage_pct), 0) / matchups.length;
    const ohkoCount = matchups.filter((m) => Number(m.damage_pct) >= 100).length;

    const prefixLine = prefix([
      "[matchup]",
      attacker.toLowerCase(),
    ]);
    const parts = [`${attacker} matchup profile: avg damage ${avgDmg.toFixed(1)}%, OHKOs ${ohkoCount}/${matchups.length} matchups.`];
    parts.push(`Best matchups: ${beats}.`);
    if (walls) parts.push(`Walled by: ${walls}.`);

    chunks.push({
      id: `matchup:${slug(attacker)}`,
      text: `${prefixLine}\n${parts.join(" ")}`,
      names: attacker,
      source,
      sourceType: "csv-row" as const,
      metadata: {
        pokemon: attacker,
        avg_damage_pct: Math.round(avgDmg * 10) / 10,
        ohko_count: ohkoCount,
        total_matchups: matchups.length,
      },
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// 11. Plain text files (status_conditions.txt, training_mechanics.txt)
// ---------------------------------------------------------------------------

export async function chunkPlainTextFile(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const filename = basename(source, ".txt");
  const title = filename.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const prefixLine = prefix(["[text]", filename.toLowerCase(), title.toLowerCase()]);
  const text = `${prefixLine}\n${title}: ${raw.trim()}`;

  return [
    {
      id: `txt:${source}`,
      text,
      names: title,
      source,
      sourceType: "text-section" as const,
      metadata: { filename: basename(source) },
    },
  ];
}

// ---------------------------------------------------------------------------
// 11. Markdown files
// ---------------------------------------------------------------------------

const MAX_SECTION_CHARS = 2000;

// Stage 4.3: sections within champions_rules.md that benefit from per-item
// sub-chunking. Each bullet becomes its own chunk with the item / phantom
// name lifted into `names` (weight-A tsvector). FTS queries for a specific
// banned item ("Life Orb") or phantom pre-evo ("Litwick") then land on a
// dense-match chunk instead of competing with transcript mentions.
const RULES_LIST_SECTIONS: Array<{ re: RegExp; kind: "banned-item" | "phantom-pre-evo" }> = [
  { re: /missing items/i, kind: "banned-item" },
  { re: /phantom pre-evolution/i, kind: "phantom-pre-evo" },
];

function headingToText(heading: string): string {
  return heading.replace(/^#+\s*/, "").trim();
}

function extractH1(lines: string[]): string {
  for (const l of lines) {
    if (/^#\s/.test(l)) return headingToText(l);
  }
  return "";
}

function parseBullet(line: string): { raw: string; names: string[] } | null {
  const t = line.trim();
  if (!/^[-*]\s/.test(t)) return null;
  const content = t.replace(/^[-*]\s*/, "");
  // "- Porygon, Porygon2 → use Porygon-Z" or "- Life Orb" or
  // "- **Survival:** Focus Sash, Focus Band, ..." — extract the list of
  // comma-separated entity tokens before any colon / arrow / parenthetical.
  const head = content.split(/[→:(]/, 1)[0];
  const names = head
    .replace(/\*/g, "")
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { raw: content, names };
}

export async function chunkMarkdownFile(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const lines = raw.split("\n");
  const chunks: Chunk[] = [];

  const filename = basename(source);
  const fileTag = FILE_LEVEL_TAGS[filename] || "";
  const fileTagLine = fileTag ? `${fileTag}\n` : "";
  const h1 = extractH1(lines);
  const h1Prefix = h1 ? `[doc] ${h1.toLowerCase()}` : "";

  let currentHeading = "(top)";
  let currentBody: string[] = [];
  let sectionIndex = 0;

  function namesForSection(): string {
    // Combine H1 + section heading so both breadcrumb levels get weight A.
    const headingText = headingToText(currentHeading);
    return [h1, headingText].filter(Boolean).join(" ");
  }

  function flush() {
    const body = currentBody.join("\n").trim();
    if (!body) return;

    const headingText = headingToText(currentHeading);

    // Stage 4.3 special case: split rules-doc list sections per bullet so
    // each banned item / phantom pre-evo has its own dense-match chunk.
    const listKind = filename === "champions_rules.md"
      ? RULES_LIST_SECTIONS.find((s) => s.re.test(headingText))?.kind
      : undefined;
    if (listKind) {
      const bullets = currentBody
        .map(parseBullet)
        .filter((b): b is { raw: string; names: string[] } => b !== null);
      if (bullets.length > 0) {
        for (let j = 0; j < bullets.length; j++) {
          const b = bullets[j];
          const entityTokens = b.names.map((n) => n.toLowerCase()).join(" ");
          const kindPrefix = listKind === "banned-item"
            ? `[rules-banned] banned item unavailable missing champions ${entityTokens}`
            : `[rules-phantom] phantom pre-evolution not in champions ${entityTokens}`;
          chunks.push({
            id: `md:${source}:${sectionIndex}:${j}`,
            text: `${fileTagLine}${currentHeading}\n${kindPrefix}\n- ${b.raw}`,
            names: `${h1} ${headingText} ${b.names.join(" ")}`.trim(),
            source,
            sourceType: "markdown-section",
            metadata: {
              heading: currentHeading,
              section_index: sectionIndex,
              sub_index: j,
              list_kind: listKind,
              entries: b.names,
            },
          });
        }
        sectionIndex++;
        return;
      }
    }

    const breadcrumb = h1Prefix ? `${h1Prefix}\n${currentHeading}` : currentHeading;
    const fullText = `${fileTagLine}${breadcrumb}\n${body}`;

    if (fullText.length <= MAX_SECTION_CHARS) {
      chunks.push({
        id: `md:${source}:${sectionIndex}`,
        text: fullText,
        names: namesForSection(),
        source,
        sourceType: "markdown-section",
        metadata: { heading: currentHeading, section_index: sectionIndex },
      });
      sectionIndex++;
    } else {
      const parts = body.split(/\n\s*\n/).filter((p) => p.trim());
      for (let j = 0; j < parts.length; j++) {
        // Carry trailing lines of previous paragraph as overlap for context
        const overlap =
          j > 0 ? parts[j - 1].trim().split("\n").slice(-3).join("\n") : "";
        const chunkBody = overlap
          ? `${overlap}\n\n${parts[j].trim()}`
          : parts[j].trim();
        chunks.push({
          id: `md:${source}:${sectionIndex}`,
          text: `${fileTagLine}${breadcrumb}\n${chunkBody}`,
          names: namesForSection(),
          source,
          sourceType: "markdown-section",
          metadata: { heading: currentHeading, section_index: sectionIndex },
        });
        sectionIndex++;
      }
    }
  }

  for (const line of lines) {
    // Start a new section on H2+, but let H1 pass into the first flush so
    // the H1-only body (usually intro paragraph) is captured.
    if (/^#{2,6}\s/.test(line)) {
      flush();
      currentHeading = line;
      currentBody = [];
    } else if (/^#\s/.test(line)) {
      flush();
      currentHeading = line;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  flush();

  return chunks;
}
