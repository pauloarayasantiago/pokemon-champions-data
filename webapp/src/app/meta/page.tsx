import Link from "next/link";
import { readFileSync } from "fs";
import { join, resolve } from "path";

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

function MarkdownView({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.type === "h1") return <h1 key={i} className="text-2xl font-bold mt-4">{b.text}</h1>;
        if (b.type === "h2") return <h2 key={i} className="text-lg font-semibold mt-4">{b.text}</h2>;
        if (b.type === "h3") return <h3 key={i} className="text-base font-semibold mt-3">{b.text}</h3>;
        if (b.type === "table") {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {b.headers.map((h, j) => (
                      <th key={j} className="border-b p-1.5 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border-b p-1.5">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1 text-sm">
              {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
            </ul>
          );
        }
        return <p key={i} className="text-sm leading-relaxed">{renderInline(b.text)}</p>;
      })}
    </div>
  );
}

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

function parseMarkdown(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2) });
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3) });
      i++;
    } else if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4) });
      i++;
    } else if (line.startsWith("|") && lines[i + 1]?.match(/^\s*\|[\s\-|:]+\|/)) {
      const headers = line.split("|").map((s) => s.trim()).filter(Boolean);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").map((s) => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 + 0).slice(0));
        i++;
      }
      const fixedRows = rows.map((r) => {
        const cells = r;
        return cells.length > headers.length ? cells.slice(0, headers.length) : cells;
      });
      blocks.push({ type: "table", headers, rows: fixedRows });
    } else if (line.startsWith("- ") || line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].match(/^\d+\.\s/))) {
        items.push(lines[i].replace(/^(-\s|\d+\.\s)/, ""));
        i++;
      }
      blocks.push({ type: "list", items });
    } else {
      const buf: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("|") && !lines[i].startsWith("- ")) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ type: "p", text: buf.join(" ") });
    }
  }
  return blocks;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let key = 0;
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    if (match[1]) parts.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2]) parts.push(<em key={key++}>{match[2]}</em>);
    else if (match[3]) parts.push(<code key={key++} className="font-mono text-xs">{match[3]}</code>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}
