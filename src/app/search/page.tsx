import { Search } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { query } from "@core/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface SearchPageProps {
  searchParams: Promise<{ q?: string; topK?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const topK = Math.max(1, Math.min(20, Number(params.topK ?? "10") || 10));

  const results = q ? await safeQuery(q, topK) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-xl font-semibold">Search</h1>
      </header>

      <form action="/search" method="get" className="relative" role="search">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Pokemon, moves, items, meta..."
          className="h-11 pl-9"
          autoComplete="off"
          enterKeyHint="search"
          required
        />
      </form>

      {!q && (
        <p className="text-sm text-muted-foreground">
          Semantic search over 186 Pokemon, 59 Megas, 494 moves, 138 items, 136 tournament teams, and competitive transcripts.
        </p>
      )}

      {q && results === "error" && (
        <Card className="p-4 text-sm text-destructive">
          Search failed. Check the dev console.
        </Card>
      )}

      {q && results && results !== "error" && results.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          No results for &ldquo;{q}&rdquo;.
        </Card>
      )}

      {q && results && results !== "error" && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
          </p>
          {results.map((r, i) => (
            <Card key={i} className="p-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-mono text-muted-foreground">{r.source}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.score.toFixed(3)}
                </span>
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">
                {r.text.length > 600 ? r.text.slice(0, 600) + "…" : r.text}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

async function safeQuery(q: string, topK: number) {
  try {
    return await query(q, topK);
  } catch (err) {
    const e = err as Error;
    console.error(`[/search] query failed: name=${e.name} msg=${e.message}`);
    if (e.stack) console.error(`[/search] stack: ${e.stack.split("\n").slice(0, 5).join(" | ")}`);
    return "error" as const;
  }
}
