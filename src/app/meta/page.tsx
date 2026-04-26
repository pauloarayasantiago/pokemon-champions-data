import Link from "next/link";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { MarkdownView } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDataRoot(): string {
  if (process.env.POKEMON_DATA_ROOT) return resolve(process.env.POKEMON_DATA_ROOT);
  return resolve(process.cwd(), "..");
}

function loadMetaSnapshot(): string {
  const root = getDataRoot();
  return readFileSync(join(root, "data", "knowledge", "meta_snapshot.md"), "utf-8");
}

export default async function MetaPage() {
  let content: string;
  try {
    content = loadMetaSnapshot();
  } catch (err) {
    content = `# Error\n\nCould not load meta_snapshot.md:\n\n${(err as Error).message}`;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-xl font-semibold">Meta Snapshot</h1>
        <p className="text-xs text-muted-foreground">Regulation M-A · Updated on data refresh</p>
      </header>
      <article className="prose prose-sm max-w-none dark:prose-invert">
        <MarkdownView text={content} />
      </article>
    </div>
  );
}
