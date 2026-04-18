import Link from "next/link";
import { readFileSync } from "fs";
import { join, resolve } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loadSpeedTiers(): string {
  const root = process.env.POKEMON_DATA_ROOT
    ? resolve(process.env.POKEMON_DATA_ROOT)
    : resolve(process.cwd(), "..");
  return readFileSync(join(root, "data", "knowledge", "speed_tiers.md"), "utf-8");
}

export default async function SpeedPage() {
  let content: string;
  try {
    content = loadSpeedTiers();
  } catch (err) {
    content = `Could not load speed_tiers.md: ${(err as Error).message}`;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-xl font-semibold">Speed Tiers</h1>
        <p className="text-xs text-muted-foreground">Lv50 benchmarks · Tailwind · Trick Room</p>
      </header>
      <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono bg-muted/30 p-3 rounded-md border">
        {content}
      </pre>
    </div>
  );
}
