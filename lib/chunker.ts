import { readFile } from "node:fs/promises";
import { basename } from "node:path";
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

    const text = `${r.name} is a ${typeStr} type Pokémon. Abilities: ${abilities}. Moves: ${moves}.`;

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
    const text = `${r.mega_name} is the Mega Evolution of ${r.base_pokemon}. Type: ${typeStr}. Ability: ${r.ability}.`;

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
// 8. Plain text files (status_conditions.txt, training_mechanics.txt)
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
// 9. Markdown files
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
      for (const part of parts) {
        chunks.push({
          id: `md:${source}:${sectionIndex}`,
          text: `${currentHeading}\n${part.trim()}`,
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
