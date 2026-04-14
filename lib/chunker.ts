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
    const text = `${r.name} is a ${typeStr} type Pokémon.${statLine} Abilities: ${abilities}. Moves: ${moves}.`;

    return {
      id: `pokemon:${slug(r.name)}`,
      text,
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
    const text = `${r.mega_name} is the Mega Evolution of ${r.base_pokemon}. Type: ${typeStr}. Ability: ${r.ability}.${statLine}`;

    return {
      id: `mega:${slug(r.mega_name)}:${i}`,
      text,
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

    return {
      id: `move:${slug(r.name)}`,
      text: parts.join(" "),
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
    const text = `${r.name} is an item. ${r.effect} Location: ${r.location}.`;

    return {
      id: `item:${slug(r.name)}`,
      text,
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
    const text = `${r.name} was updated in Pokémon Champions. Champions: ${champParts}.${effect} In Scarlet/Violet: ${svParts}.`;

    return {
      id: `updated-attack:${slug(r.name)}`,
      text,
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
    const text = `${r.name} is a new ability introduced in Pokémon Champions. Effect: ${r.effect}`;

    return {
      id: `ability:${slug(r.name)}`,
      text,
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
    const text = `${r.pokemon} has the ability ${r.ability}. Type: ${typeStr}.`;

    return {
      id: `mega-ability:${slug(r.pokemon)}`,
      text,
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
    const parts = [`Tournament team ${r.team_id} by ${r.player}`];
    if (r.tournament && r.tournament !== "-") parts[0] += ` from ${r.tournament}`;
    if (r.player_rank && r.player_rank !== "-") parts[0] += ` (${r.player_rank})`;
    parts[0] += `: ${paired}.`;
    if (r.description) parts.push(r.description + ".");
    if (r.replica_code) parts.push(`Replica code: ${r.replica_code}.`);

    return {
      id: `team:${slug(r.team_id)}`,
      text: parts.join(" "),
      source,
      sourceType: "csv-row" as const,
      metadata: {
        team_id: r.team_id,
        player: r.player,
        tournament: r.tournament || null,
        player_rank: r.player_rank || null,
        pokemon,
        items: items.filter(Boolean),
        replica_code: r.replica_code || null,
        pokepaste_link: r.pokepaste_link || null,
      },
    };
  });
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

    return {
      id: `usage:${slug(r.pokemon)}`,
      text: parts.join(" "),
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

    const parts = [`${attacker} matchup profile: avg damage ${avgDmg.toFixed(1)}%, OHKOs ${ohkoCount}/${matchups.length} matchups.`];
    parts.push(`Best matchups: ${beats}.`);
    if (walls) parts.push(`Walled by: ${walls}.`);

    chunks.push({
      id: `matchup:${slug(attacker)}`,
      text: parts.join(" "),
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
  const text = `${title}: ${raw.trim()}`;

  return [
    {
      id: `txt:${source}`,
      text,
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

export async function chunkMarkdownFile(filePath: string, source: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf-8");
  const lines = raw.split("\n");
  const chunks: Chunk[] = [];

  let currentHeading = "(top)";
  let currentBody: string[] = [];
  let sectionIndex = 0;

  function flush() {
    const body = currentBody.join("\n").trim();
    if (!body) return;

    const fullText = `${currentHeading}\n${body}`;

    if (fullText.length <= MAX_SECTION_CHARS) {
      chunks.push({
        id: `md:${source}:${sectionIndex}`,
        text: fullText,
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
          text: `${currentHeading}\n${chunkBody}`,
          source,
          sourceType: "markdown-section",
          metadata: { heading: currentHeading, section_index: sectionIndex },
        });
        sectionIndex++;
      }
    }
  }

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
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
