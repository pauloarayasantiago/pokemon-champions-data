import Link from "next/link";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPokemon } from "@core/calc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string; type?: string }>;
}

export default async function PokedexIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const typeFilter = params.type?.trim() ?? "";

  const all = Array.from(getPokemon().values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const filtered = all.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (typeFilter && p.type1 !== typeFilter && p.type2 !== typeFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-xl font-semibold">Pokedex</h1>
        <p className="text-xs text-muted-foreground">
          {filtered.length} / {all.length} Pokemon
        </p>
      </header>

      <form action="/pokedex" method="get" className="relative" role="search">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Filter by name..."
          className="h-11 pl-9"
          autoComplete="off"
          enterKeyHint="search"
        />
        {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {filtered.map((p) => (
          <Link key={p.name} href={`/pokedex/${encodeURIComponent(p.name)}`}>
            <Card className="p-3 space-y-1 hover:bg-accent/50 transition-colors">
              <div className="font-medium text-sm">{p.name}</div>
              <div className="flex gap-1 text-[10px] text-muted-foreground">
                <span>{p.type1}</span>
                {p.type2 && <span>· {p.type2}</span>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
