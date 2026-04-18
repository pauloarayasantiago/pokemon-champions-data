import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { findPokemon, findMega, getMoves } from "@core/calc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function PokedexEntryPage({ params }: PageProps) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const pokemon = findPokemon(decoded);
  if (!pokemon) notFound();
  const mega = findMega(decoded);
  const moves = getMoves();

  const pokemonMoves = pokemon.moves
    .map((mn) => moves.get(mn.toLowerCase()))
    .filter((m): m is NonNullable<typeof m> => !!m);

  const types = [pokemon.type1];
  if (pokemon.type2) types.push(pokemon.type2);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <Link href="/pokedex" className="text-xs text-muted-foreground hover:underline">
          ← Pokedex
        </Link>
        <h1 className="text-2xl font-semibold">{pokemon.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {types.map((t) => (
            <span key={t} className="rounded-md border px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
      </header>

      <Card className="p-4 space-y-2">
        <h2 className="text-sm font-semibold">Base Stats</h2>
        <div className="grid grid-cols-6 gap-2 text-center text-xs">
          <Stat label="HP" value={pokemon.baseStats.hp} />
          <Stat label="Atk" value={pokemon.baseStats.attack} />
          <Stat label="Def" value={pokemon.baseStats.defense} />
          <Stat label="SpA" value={pokemon.baseStats.spAtk} />
          <Stat label="SpD" value={pokemon.baseStats.spDef} />
          <Stat label="Spe" value={pokemon.baseStats.speed} />
        </div>
        <div className="text-xs text-muted-foreground">
          Total: {Object.values(pokemon.baseStats).reduce((a, b) => a + b, 0)}
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h2 className="text-sm font-semibold">Abilities</h2>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {pokemon.abilities.map((a) => (
            <span key={a} className="rounded-md border px-2 py-0.5">{a}</span>
          ))}
        </div>
      </Card>

      {mega && (
        <Card className="p-4 space-y-2">
          <h2 className="text-sm font-semibold">{mega.megaName}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border px-2 py-0.5">{mega.type1}</span>
            {mega.type2 && <span className="rounded-md border px-2 py-0.5">{mega.type2}</span>}
            <span className="rounded-md border px-2 py-0.5">Ability: {mega.ability}</span>
          </div>
          <div className="grid grid-cols-6 gap-2 text-center text-xs">
            <Stat label="HP" value={mega.baseStats.hp} />
            <Stat label="Atk" value={mega.baseStats.attack} />
            <Stat label="Def" value={mega.baseStats.defense} />
            <Stat label="SpA" value={mega.baseStats.spAtk} />
            <Stat label="SpD" value={mega.baseStats.spDef} />
            <Stat label="Spe" value={mega.baseStats.speed} />
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <h2 className="text-sm font-semibold">Moves ({pokemonMoves.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="p-1.5 text-left">Move</th>
                <th className="p-1.5 text-left">Type</th>
                <th className="p-1.5 text-left">Cat</th>
                <th className="p-1.5 text-right">BP</th>
                <th className="p-1.5 text-right">Acc</th>
              </tr>
            </thead>
            <tbody>
              {pokemonMoves.map((m) => (
                <tr key={m.name} className="border-b">
                  <td className="p-1.5 font-medium">{m.name}</td>
                  <td className="p-1.5">{m.type}</td>
                  <td className="p-1.5">{m.category.slice(0, 3)}</td>
                  <td className="p-1.5 text-right font-mono">{m.power || "—"}</td>
                  <td className="p-1.5 text-right font-mono">{m.accuracy === 101 ? "—" : m.accuracy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/calc?attacker=${encodeURIComponent(pokemon.name)}`}
          className="text-xs rounded-md border px-3 py-1.5 hover:bg-accent"
        >
          Run a calc with {pokemon.name}
        </Link>
        <Link
          href={`/search?q=${encodeURIComponent(pokemon.name + " set")}`}
          className="text-xs rounded-md border px-3 py-1.5 hover:bg-accent"
        >
          Search sets
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono tabular-nums">{value}</div>
    </div>
  );
}
