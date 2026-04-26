import * as React from "react";
import { cn } from "@/lib/utils";
import { TypeBadge, type PokemonType } from "@/components/ui/type-badge";
import {
  TeamBuildGrid,
  type TeamBuildData,
} from "@/components/team-build-card";

export type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; lang: string; content: string }
  | { type: "blockquote"; text: string };

export type EnrichOptions = {
  /** Detect `**Name** @ Item — explanation` lines and render them as cards. */
  pokemon?: boolean;
  /** Detect `**Label:** rest` paragraphs and render them with a yellow left-border. */
  callouts?: boolean;
  /** Detect ```team-json fences and render them as Pokemon Build cards.
   * Also hides ```claims-json fences (internal validation metadata). */
  teamCard?: boolean;
  /** Lookup a Pokemon name → its types for type badges. Returns null if unknown. */
  lookupTypes?: (name: string) => PokemonType[] | null;
};

export function parseMarkdown(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isBlockStart = (line: string): boolean =>
    line.startsWith("#") ||
    line.startsWith("|") ||
    line.startsWith("> ") ||
    line.startsWith("```") ||
    /^\s*[-*]\s/.test(line) ||
    /^\s*\d+\.\s/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: "code", lang, content: buf.join("\n") });
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      const buf: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", text: buf.join(" ") });
      continue;
    }

    if (line.startsWith("|") && lines[i + 1]?.match(/^\s*\|[\s\-|:]+\|/)) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

function splitTableRow(line: string): string[] {
  return line
    .split("|")
    .map((s) => s.trim())
    .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
}

function tryParseTeamJson(raw: string): TeamBuildData | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.pokemon) &&
      parsed.pokemon.length > 0
    ) {
      return parsed as TeamBuildData;
    }
  } catch {
    /* malformed JSON — fall back to raw code block */
  }
  return null;
}

export function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let key = 0;
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    if (match[1])
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[1]}
        </strong>,
      );
    else if (match[2])
      parts.push(
        <em key={key++} className="italic">
          {match[2]}
        </em>,
      );
    else if (match[3])
      parts.push(
        <code
          key={key++}
          className="font-mono text-[0.85em] bg-muted rounded px-1 py-0.5 text-foreground"
        >
          {match[3]}
        </code>,
      );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

const CALLOUT_RE_INSIDE = /^\*\*([^*]+):\*\*\s+(.+)$/;
const CALLOUT_RE_OUTSIDE = /^\*\*([^*]+)\*\*:\s+(.+)$/;

export function parseCalloutLine(text: string): { label: string; rest: string } | null {
  const m1 = text.match(CALLOUT_RE_INSIDE);
  if (m1) return { label: m1[1].trim(), rest: m1[2].trim() };
  const m2 = text.match(CALLOUT_RE_OUTSIDE);
  if (m2) return { label: m2[1].trim(), rest: m2[2].trim() };
  return null;
}

const POKEMON_LINE_WITH_ITEM =
  /^\s*(?:\*\*([^*]+)\*\*|([A-Z][\w\s\-()]+?))\s+@\s+([^—–\-]+?)\s+[—–\-]\s+(.+)$/;
const POKEMON_LINE_NO_ITEM = /^\s*\*\*([^*]+)\*\*\s+[—–\-]\s+(.+)$/;

export function parsePokemonLine(
  line: string,
): { name: string; item?: string; explanation: string } | null {
  const m1 = line.match(POKEMON_LINE_WITH_ITEM);
  if (m1) {
    const name = (m1[1] ?? m1[2] ?? "").trim();
    const item = m1[3].trim();
    const explanation = m1[4].trim();
    if (name && item && explanation) return { name, item, explanation };
  }
  const m2 = line.match(POKEMON_LINE_NO_ITEM);
  if (m2) {
    const name = m2[1].trim();
    const explanation = m2[2].trim();
    if (name && explanation) return { name, explanation };
  }
  return null;
}

function PokemonEntry({
  name,
  item,
  explanation,
  types,
}: {
  name: string;
  item?: string;
  explanation: string;
  types: PokemonType[] | null;
}) {
  return (
    <div className="my-2 rounded-lg border bg-muted/20 px-3 py-2.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{name}</span>
        {types && types.length > 0 && (
          <span className="flex gap-1">
            {types.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </span>
        )}
        {item && (
          <>
            <span className="text-xs text-muted-foreground">@</span>
            <span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5">
              {item}
            </span>
          </>
        )}
      </div>
      <p className="text-sm leading-relaxed text-foreground/90">
        {renderInline(explanation)}
      </p>
    </div>
  );
}

const ATTRIBUTE_BULLET_RE = /^\*\*([A-Z][\w\s\-/]+?)\*\*:\s+(.+)$/;

function parseAttributeBullet(
  text: string,
): { label: string; value: string } | null {
  const m = text.match(ATTRIBUTE_BULLET_RE);
  if (m) return { label: m[1].trim(), value: m[2].trim() };
  return null;
}

function renderListItem(
  item: string,
  key: number,
  _ordered: boolean,
  opts: EnrichOptions,
): React.ReactNode {
  if (opts.pokemon) {
    const pokemon = parsePokemonLine(item);
    if (pokemon) {
      const types = opts.lookupTypes?.(pokemon.name) ?? null;
      return (
        <li key={key} className="list-none -ml-5 first:mt-0">
          <PokemonEntry {...pokemon} types={types} />
        </li>
      );
    }
  }
  const attr = parseAttributeBullet(item);
  if (attr) {
    return (
      <li
        key={key}
        className="list-none -ml-5 grid grid-cols-[5rem_1fr] items-baseline gap-x-2 text-sm leading-relaxed"
      >
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {attr.label}
        </span>
        <span className="text-foreground/90">{renderInline(attr.value)}</span>
      </li>
    );
  }
  return (
    <li key={key} className="text-sm leading-relaxed">
      {renderInline(item)}
    </li>
  );
}

export function renderBlock(
  b: Block,
  key: number,
  opts: EnrichOptions = {},
): React.ReactNode {
  switch (b.type) {
    case "h1":
      return (
        <h1
          key={key}
          className="text-lg font-bold mt-4 mb-2 first:mt-0 text-foreground"
        >
          {renderInline(b.text)}
        </h1>
      );
    case "h2":
      return (
        <h2
          key={key}
          className="text-base font-semibold mt-4 mb-2 first:mt-0 pb-1 border-b border-border/40 text-foreground"
        >
          {renderInline(b.text)}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={key}
          className="text-sm font-semibold mt-3 mb-1.5 text-foreground"
        >
          {renderInline(b.text)}
        </h3>
      );
    case "table":
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {b.headers.map((h, j) => (
                  <th
                    key={j}
                    className="border-b p-1.5 text-left font-semibold bg-muted/40"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b border-border/40 even:bg-muted/20"
                >
                  {row.map((cell, ci) => (
                    <td key={ci} className="p-1.5 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list": {
      const ListEl = b.ordered ? "ol" : "ul";
      return (
        <ListEl
          key={key}
          className={cn(
            "my-2 space-y-1.5 pl-5",
            b.ordered
              ? "list-decimal marker:text-muted-foreground/70 marker:font-mono marker:text-xs"
              : "list-disc marker:text-muted-foreground/60",
          )}
        >
          {b.items.map((it, j) => renderListItem(it, j, b.ordered, opts))}
        </ListEl>
      );
    }
    case "code": {
      const lang = b.lang.toLowerCase();
      if (opts.teamCard && lang === "team-json") {
        const team = tryParseTeamJson(b.content);
        if (team) {
          return (
            <TeamBuildGrid
              key={key}
              team={team}
              lookupTypes={opts.lookupTypes}
            />
          );
        }
      }
      if (opts.teamCard && lang === "claims-json") {
        // Hide claims-json — internal validation metadata, not user content.
        return null;
      }
      return (
        <div
          key={key}
          className="my-2 rounded-lg bg-muted/60 overflow-hidden border border-border/40"
        >
          {b.lang && (
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 bg-muted/40 border-b border-border/40">
              {b.lang}
            </div>
          )}
          <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed">
            <code>{b.content}</code>
          </pre>
        </div>
      );
    }
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-2 border-l-2 border-vgc-accent pl-3 text-sm italic text-muted-foreground"
        >
          {renderInline(b.text)}
        </blockquote>
      );
    case "p":
    default: {
      if (opts.callouts) {
        const callout = parseCalloutLine(b.text);
        if (callout) {
          return (
            <div
              key={key}
              className="my-2 rounded-r-md border-l-2 border-vgc-accent bg-vgc-accent-muted px-3 py-2 text-sm"
            >
              <span className="font-semibold text-foreground">
                {callout.label}:
              </span>{" "}
              <span className="text-foreground/90">
                {renderInline(callout.rest)}
              </span>
            </div>
          );
        }
      }
      return (
        <p key={key} className="text-sm leading-relaxed my-1.5 text-foreground">
          {renderInline(b.text)}
        </p>
      );
    }
  }
}

export function MarkdownView({
  text,
  enrich = {},
  className,
}: {
  text: string;
  enrich?: EnrichOptions;
  className?: string;
}) {
  const blocks = React.useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={cn("space-y-1", className)}>
      {blocks.map((b, i) => renderBlock(b, i, enrich))}
    </div>
  );
}
