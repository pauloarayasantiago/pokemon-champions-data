import Link from "next/link";
import { Card } from "@/components/ui/card";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { parse } from "csv-parse/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamRow {
  team_id: string;
  player: string;
  event: string;
  pokemon: string;
  item: string;
  ability: string;
  moves: string;
}

function getRoot(): string {
  return process.env.POKEMON_DATA_ROOT
    ? resolve(process.env.POKEMON_DATA_ROOT)
    : resolve(process.cwd(), "..");
}

function loadTeams(): TeamRow[] {
  try {
    const csv = readFileSync(join(getRoot(), "tournament_teams.csv"), "utf-8");
    return parse(csv, { columns: true, skip_empty_lines: true }) as TeamRow[];
  } catch {
    return [];
  }
}

interface PageProps {
  searchParams: Promise<{ pokemon?: string; event?: string }>;
}

export default async function SetsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filter = params.pokemon?.toLowerCase() ?? "";
  const eventFilter = params.event ?? "";
  const rows = loadTeams();
  const teams = groupByTeam(rows);
  const filtered = teams.filter((t) => {
    if (eventFilter && !t.event.includes(eventFilter)) return false;
    if (filter && !t.members.some((m) => m.pokemon.toLowerCase().includes(filter))) return false;
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-xl font-semibold">Sample Sets</h1>
        <p className="text-xs text-muted-foreground">
          {filtered.length} / {teams.length} tournament teams
        </p>
      </header>

      <form action="/sets" method="get" className="flex gap-2">
        <input
          name="pokemon"
          type="search"
          defaultValue={filter}
          placeholder="Filter by Pokemon..."
          className="flex-1 h-10 rounded-md border bg-background px-3 text-sm"
        />
      </form>

      <div className="space-y-3">
        {filtered.slice(0, 40).map((t) => (
          <Card key={t.team_id} className="p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-medium">{t.player || "Unknown"}</div>
              <div className="text-xs text-muted-foreground">{t.event}</div>
            </div>
            <div className="text-xs space-y-1">
              {t.members.map((m, i) => (
                <div key={i} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{m.pokemon}</span>
                  {m.item && <span className="text-muted-foreground">@ {m.item}</span>}
                  {m.ability && <span className="text-muted-foreground">· {m.ability}</span>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface GroupedTeam {
  team_id: string;
  player: string;
  event: string;
  members: TeamRow[];
}

function groupByTeam(rows: TeamRow[]): GroupedTeam[] {
  const byId = new Map<string, GroupedTeam>();
  for (const r of rows) {
    if (!byId.has(r.team_id)) {
      byId.set(r.team_id, {
        team_id: r.team_id,
        player: r.player,
        event: r.event,
        members: [],
      });
    }
    byId.get(r.team_id)!.members.push(r);
  }
  return Array.from(byId.values());
}
