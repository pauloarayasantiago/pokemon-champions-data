import { type NextRequest } from "next/server";
import {
  calculateDamage,
  findPokemon,
  findMega,
  findMove,
  DEFAULT_FIELD,
} from "@core/calc";
import type {
  CompetitiveSet,
  StatSpread,
  Nature,
  FieldConditions,
  Weather,
  PokemonData,
  MegaData,
} from "@core/calc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Helpers shared with scripts/calc.ts ──

function parseSP(spStr: string | null): StatSpread {
  if (!spStr) {
    return { hp: 0, attack: 32, defense: 0, spAtk: 0, spDef: 0, speed: 32 };
  }
  const parts = spStr.split("/").map(Number);
  return {
    hp: parts[0] ?? 0,
    attack: parts[1] ?? 0,
    defense: parts[2] ?? 0,
    spAtk: parts[3] ?? 0,
    spDef: parts[4] ?? 0,
    speed: parts[5] ?? 0,
  };
}

function inferNature(
  sp: StatSpread,
  baseStats: { attack: number; spAtk: number },
): Nature {
  if (
    sp.attack > sp.spAtk ||
    (sp.attack === sp.spAtk && baseStats.attack >= baseStats.spAtk)
  ) {
    return { plus: "attack", minus: "spAtk" };
  }
  return { plus: "spAtk", minus: "attack" };
}

function buildSet(
  pokemon: PokemonData,
  mega: MegaData | undefined,
  spStr: string | null,
  item: string | null,
): CompetitiveSet {
  const sp = parseSP(spStr);
  const ability = mega?.ability ?? pokemon.abilities[0];
  const nature = inferNature(sp, pokemon.baseStats);
  return {
    pokemon,
    mega,
    ability,
    item: item ?? "",
    nature,
    sp,
    moves: pokemon.moves,
  };
}

function resolveSet(
  name: string,
  isMega: boolean,
  spStr: string | null,
  item: string | null,
): CompetitiveSet | null {
  const nameLower = name.toLowerCase();
  const nameStartsWithMega = nameLower.startsWith("mega ");

  if (nameStartsWithMega) {
    const mega = findMega(name);
    if (mega) {
      const pokemon = findPokemon(mega.basePokemon);
      if (pokemon) return buildSet(pokemon, mega, spStr, item);
    }
    const stripped = name.replace(/^mega\s+/i, "");
    const mon = findPokemon(stripped);
    const megaData = findMega(stripped);
    if (mon && megaData) return buildSet(mon, megaData, spStr, item);
    if (mon) return buildSet(mon, undefined, spStr, item);
    return null;
  }

  const pokemon = findPokemon(name);
  if (!pokemon) return null;
  const megaData = isMega ? findMega(name) : undefined;
  return buildSet(pokemon, megaData, spStr, item);
}

function buildField(params: URLSearchParams): Partial<FieldConditions> {
  const weather = params.get("weather");
  return {
    weather: weather ? (weather as Weather) : null,
    isSpread: params.get("spread") === "true",
    isCriticalHit: params.get("crit") === "true",
    attackerBurned: params.get("burned") === "true",
    defenderSide: {
      ...DEFAULT_FIELD.defenderSide,
      isReflect: params.get("reflect") === "true",
      isLightScreen: params.get("screen") === "true",
    },
    attackerSide: {
      ...DEFAULT_FIELD.attackerSide,
      isHelpingHand: params.get("helpingHand") === "true",
    },
  };
}

// ── Routes ──

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const attackerName = params.get("attacker");
  const defenderName = params.get("defender");
  const moveName = params.get("move");

  if (!attackerName || !defenderName) {
    return Response.json(
      { error: "Missing required params: attacker, defender" },
      { status: 400 },
    );
  }

  try {
    const attacker = resolveSet(
      attackerName,
      params.get("attackerMega") === "true",
      params.get("attackerSp"),
      params.get("attackerItem"),
    );
    const defender = resolveSet(
      defenderName,
      params.get("defenderMega") === "true",
      params.get("defenderSp"),
      params.get("defenderItem"),
    );

    if (!attacker) {
      return Response.json(
        { error: `Attacker not found: "${attackerName}"` },
        { status: 404 },
      );
    }
    if (!defender) {
      return Response.json(
        { error: `Defender not found: "${defenderName}"` },
        { status: 404 },
      );
    }

    const field = buildField(params);

    // No move → return all damaging moves sorted by max damage
    if (!moveName) {
      const results = attacker.pokemon.moves
        .map((m) => calculateDamage(attacker, defender, m, field))
        .filter((r) => r.maxDmg > 0)
        .sort((a, b) => b.maxDmg - a.maxDmg);
      return Response.json({
        attacker: attacker.mega?.megaName ?? attacker.pokemon.name,
        defender: defender.mega?.megaName ?? defender.pokemon.name,
        results,
      });
    }

    // Single-move calc
    const move = findMove(moveName);
    if (!move) {
      return Response.json(
        { error: `Move not found: "${moveName}"` },
        { status: 404 },
      );
    }

    const result = calculateDamage(attacker, defender, moveName, field);
    return Response.json({
      attacker: attacker.mega?.megaName ?? attacker.pokemon.name,
      defender: defender.mega?.megaName ?? defender.pokemon.name,
      result,
    });
  } catch (err) {
    console.error("[/api/calc] error:", err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

interface CalcBody {
  attacker: string;
  defender: string;
  move?: string;
  attackerMega?: boolean;
  defenderMega?: boolean;
  attackerSp?: string;
  defenderSp?: string;
  attackerItem?: string;
  defenderItem?: string;
  field?: Partial<FieldConditions>;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CalcBody;

    if (!body.attacker || !body.defender) {
      return Response.json(
        { error: "Missing required fields: attacker, defender" },
        { status: 400 },
      );
    }

    const attacker = resolveSet(
      body.attacker,
      body.attackerMega ?? false,
      body.attackerSp ?? null,
      body.attackerItem ?? null,
    );
    const defender = resolveSet(
      body.defender,
      body.defenderMega ?? false,
      body.defenderSp ?? null,
      body.defenderItem ?? null,
    );

    if (!attacker) {
      return Response.json(
        { error: `Attacker not found: "${body.attacker}"` },
        { status: 404 },
      );
    }
    if (!defender) {
      return Response.json(
        { error: `Defender not found: "${body.defender}"` },
        { status: 404 },
      );
    }

    const field: Partial<FieldConditions> = body.field ?? {};

    if (!body.move) {
      const results = attacker.pokemon.moves
        .map((m) => calculateDamage(attacker, defender, m, field))
        .filter((r) => r.maxDmg > 0)
        .sort((a, b) => b.maxDmg - a.maxDmg);
      return Response.json({
        attacker: attacker.mega?.megaName ?? attacker.pokemon.name,
        defender: defender.mega?.megaName ?? defender.pokemon.name,
        results,
      });
    }

    const move = findMove(body.move);
    if (!move) {
      return Response.json(
        { error: `Move not found: "${body.move}"` },
        { status: 404 },
      );
    }

    const result = calculateDamage(attacker, defender, body.move, field);
    return Response.json({
      attacker: attacker.mega?.megaName ?? attacker.pokemon.name,
      defender: defender.mega?.megaName ?? defender.pokemon.name,
      result,
    });
  } catch (err) {
    console.error("[/api/calc] error:", err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
