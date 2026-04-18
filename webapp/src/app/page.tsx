import Link from "next/link";
import {
  Users,
  Calculator,
  BookOpen,
  TrendingUp,
  Gauge,
  Swords,
  Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const TILES = [
  {
    href: "/team",
    label: "Team Builder",
    description: "Build, fill, or evaluate a team",
    icon: Users,
  },
  {
    href: "/calc",
    label: "Damage Calc",
    description: "16-roll Champions-accurate calcs",
    icon: Calculator,
  },
  {
    href: "/pokedex",
    label: "Pokedex",
    description: "186 Pokemon + 59 Megas",
    icon: BookOpen,
  },
  {
    href: "/meta",
    label: "Meta Snapshot",
    description: "Usage, win rates, cores",
    icon: TrendingUp,
  },
  {
    href: "/speed",
    label: "Speed Tiers",
    description: "Lv50 benchmarks + TR",
    icon: Gauge,
  },
  {
    href: "/sets",
    label: "Sample Sets",
    description: "Tournament-tested builds",
    icon: Swords,
  },
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Champions VGC</h1>
        <p className="text-sm text-muted-foreground">
          Pokemon Champions (2026) Doubles assistant · Regulation M-A
        </p>
      </header>

      <form
        action="/search"
        method="get"
        className="relative mb-8"
        role="search"
      >
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          name="q"
          type="search"
          placeholder="Search Pokemon, moves, items, meta..."
          className="h-12 pl-9 text-base"
          autoComplete="off"
          enterKeyHint="search"
          required
        />
      </form>

      <section aria-labelledby="tiles-heading">
        <h2 id="tiles-heading" className="sr-only">
          Tools
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.href} href={tile.href} className="group">
                <Card className="flex h-full min-h-[120px] flex-col gap-2 p-4 transition-colors group-hover:bg-accent/50 group-active:bg-accent">
                  <Icon
                    className="h-6 w-6 text-muted-foreground group-hover:text-foreground"
                    aria-hidden="true"
                  />
                  <div className="mt-auto space-y-0.5">
                    <div className="text-sm font-medium leading-tight">
                      {tile.label}
                    </div>
                    <div className="text-xs text-muted-foreground leading-tight">
                      {tile.description}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
