import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { parse } from "csv-parse/sync";
import { getPokemon } from "@core/calc";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 3600;

interface PikalyticsRow {
  pokemon: string;
  usage_pct: string;
  rank: string;
}

function getDataRoot(): string {
  if (process.env.POKEMON_DATA_ROOT) return resolve(process.env.POKEMON_DATA_ROOT);
  return process.cwd();
}

function loadPikalytics(): Map<string, { usagePct: number; rank: number }> {
  const out = new Map<string, { usagePct: number; rank: number }>();
  try {
    const raw = readFileSync(
      join(getDataRoot(), "pikalytics_usage.csv"),
      "utf-8",
    );
    const rows: PikalyticsRow[] = parse(raw, {
      columns: true,
      skip_empty_lines: true,
    });
    for (const row of rows) {
      const key = row.pokemon.trim().toLowerCase();
      const usagePct = parseFloat(row.usage_pct);
      const rank = parseInt(row.rank, 10);
      if (Number.isFinite(usagePct) && Number.isFinite(rank)) {
        out.set(key, { usagePct, rank });
      }
    }
  } catch {
    /* missing pikalytics is non-fatal */
  }
  return out;
}

export async function GET() {
  const pokemon = getPokemon();
  const usageMap = loadPikalytics();
  const roster = Array.from(pokemon.values()).map((p) => {
    const usage = usageMap.get(p.name.toLowerCase()) ?? null;
    return {
      name: p.name,
      types: p.type2 ? [p.type1, p.type2] : [p.type1],
      stats: {
        hp: p.baseStats.hp,
        atk: p.baseStats.attack,
        def: p.baseStats.defense,
        spa: p.baseStats.spAtk,
        spd: p.baseStats.spDef,
        spe: p.baseStats.speed,
        bst:
          p.baseStats.hp +
          p.baseStats.attack +
          p.baseStats.defense +
          p.baseStats.spAtk +
          p.baseStats.spDef +
          p.baseStats.speed,
      },
      usage: usage ? { pct: usage.usagePct, rank: usage.rank } : null,
    };
  });
  return NextResponse.json({ pokemon: roster });
}
