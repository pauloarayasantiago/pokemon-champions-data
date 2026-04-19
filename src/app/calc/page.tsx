import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getPokemon, getMoves } from "@core/calc";
import { CalcForm } from "./calc-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CalcPage() {
  const pokemonNames = Array.from(getPokemon().values()).map((p) => p.name).sort();
  const moveNames = Array.from(getMoves().values())
    .filter((m) => m.category !== "Status")
    .map((m) => m.name)
    .sort();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-xl font-semibold">Damage Calculator</h1>
        <p className="text-xs text-muted-foreground">
          16-roll Champions mechanics · SP (not EVs) · Lv50 Doubles defaults
        </p>
      </header>
      <Card className="p-4">
        <CalcForm pokemonNames={pokemonNames} moveNames={moveNames} />
      </Card>
    </div>
  );
}
