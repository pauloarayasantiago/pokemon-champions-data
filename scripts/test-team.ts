// scripts/test-team.ts
//
// Capture a /api/team SSE run for offline review. POSTs to a running Next dev
// server, persists the full event stream to runs/{model}-{ts}.{jsonl,md},
// and updates runs/latest.{jsonl,md}. Requires `npm run dev` running.
//
// Usage:
//   npx tsx scripts/test-team.ts <model-key> [prompt]
//   npx tsx scripts/test-team.ts <model-key> --prompt-file <path>
//   echo "..." | npx tsx scripts/test-team.ts <model-key>
//
// Flags:
//   --prompt-file <path>           read prompt from file
//   --system-prompt-version <ver>  passthrough to /api/team body
//   --base-url <url>               default http://localhost:3000
//   --quiet                        suppress per-iter stdout progress
//   --no-latest                    skip writing runs/latest.{jsonl,md}

import { mkdir, writeFile, copyFile, readFile, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import process, { argv, stdin } from "node:process";

interface Args {
  model: string;
  prompt?: string;
  promptFile?: string;
  systemPromptVersion?: string;
  baseUrl: string;
  quiet: boolean;
  noLatest: boolean;
}

function parseArgs(): Args {
  const out: Args = {
    model: "",
    baseUrl: "http://localhost:3000",
    quiet: false,
    noLatest: false,
  };
  const positional: string[] = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--prompt-file": out.promptFile = argv[++i]; break;
      case "--system-prompt-version": out.systemPromptVersion = argv[++i]; break;
      case "--base-url": out.baseUrl = (argv[++i] ?? "").replace(/\/+$/, ""); break;
      case "--quiet": out.quiet = true; break;
      case "--no-latest": out.noLatest = true; break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        if (a.startsWith("--")) { console.error(`Unknown flag: ${a}`); process.exit(3); }
        positional.push(a);
    }
  }
  out.model = positional[0] ?? "";
  if (positional[1] !== undefined) out.prompt = positional.slice(1).join(" ");
  return out;
}

function printHelp(): void {
  console.log(
    [
      "Usage: tsx scripts/test-team.ts <model-key> [prompt] [flags]",
      "",
      "Flags:",
      "  --prompt-file <path>           read prompt from file",
      "  --system-prompt-version <ver>  passthrough to /api/team body",
      "  --base-url <url>               default http://localhost:3000",
      "  --quiet                        suppress per-iter stdout progress",
      "  --no-latest                    skip writing runs/latest.{jsonl,md}",
      "",
      "Prompt resolution: positional → --prompt-file → piped stdin → scripts/test-prompts/snow-balance.txt",
    ].join("\n"),
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function resolvePrompt(args: Args): Promise<string> {
  if (args.prompt) return args.prompt;
  if (args.promptFile) return (await readFile(args.promptFile, "utf8")).trim();
  if (!stdin.isTTY) {
    const piped = (await readStdin()).trim();
    if (piped) return piped;
  }
  return (await readFile(join("scripts", "test-prompts", "snow-balance.txt"), "utf8")).trim();
}

// ───────── Capture state ─────────

interface IterCapture {
  iter: number;
  startedAt: number;
  firstTokenAt?: number;
  ttftMs?: number | null;
  endedAt?: number;
  durationMs?: number;
  contentChars?: number;
  toolCallCount?: number;
  finishReason?: string;
  contentDeltas: string[];
  toolIds: string[];
}

interface ToolCapture {
  id: string;
  name: string;
  iter: number;
  arguments?: Record<string, unknown>;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  ok?: boolean;
  error?: string | null;
  result?: unknown;
  summary?: Record<string, unknown> | null;
  stages: Array<{ stage: string; detail?: unknown; ts: number }>;
}

interface PhantomRefusal {
  phantoms: unknown;
  content?: string;
}

interface RunCapture {
  requestId?: string;
  model: string;
  provider?: string;
  remoteName?: string;
  systemPromptVersion?: string;
  prompt: string;
  baseUrl: string;
  startedAt: number;
  endedAt?: number;
  finishReason?: string;
  totalMs?: number;
  iters: Map<number, IterCapture>;
  tools: Map<string, ToolCapture>;
  staleness?: unknown;
  citationResult?: Record<string, unknown>;
  teamResult?: Record<string, unknown>;
  citationRetries: Array<Record<string, unknown>>;
  teamRetries: Array<Record<string, unknown>>;
  phantomRefusal?: PhantomRefusal;
  error?: { stage: string; text: string; iter?: number };
  malformedEventCount: number;
  rawEventCount: number;
  sawDone: boolean;
  hitMaxIter: boolean;
}

// ───────── Event handler ─────────

function handleEvent(cap: RunCapture, evt: Record<string, unknown>, quiet: boolean): void {
  const t = evt.type as string;
  switch (t) {
    case "meta":
      cap.requestId = (evt.requestId as string) ?? cap.requestId;
      cap.provider = evt.provider as string;
      cap.remoteName = evt.remoteName as string;
      cap.systemPromptVersion = evt.systemPromptVersion as string;
      break;
    case "staleness":
      cap.staleness = evt.data;
      break;
    case "phantom_pokemon_refused":
      cap.phantomRefusal = { phantoms: evt.phantoms };
      break;
    case "iter_start": {
      const iter = evt.iter as number;
      cap.iters.set(iter, {
        iter,
        startedAt: (evt.ts as number) ?? Date.now(),
        contentDeltas: [],
        toolIds: [],
      });
      break;
    }
    case "llm_first_token": {
      const ic = cap.iters.get(evt.iter as number);
      if (ic) {
        ic.firstTokenAt = (evt.ts as number) ?? Date.now();
        ic.ttftMs = evt.latencyMs as number;
      }
      break;
    }
    case "content": {
      const delta = (evt.delta as string) ?? "";
      if (cap.phantomRefusal) {
        cap.phantomRefusal.content = (cap.phantomRefusal.content ?? "") + delta;
      } else {
        const arr = [...cap.iters.values()];
        const active = arr[arr.length - 1];
        if (active) active.contentDeltas.push(delta);
      }
      break;
    }
    case "tool_call": {
      // Fires during the LLM stream — BEFORE iter_end. tool_start fires later
      // (route runs tools in Promise.all after the stream closes), so we seed
      // the skeleton here so iter_end can show names.
      const id = evt.id as string;
      const ic = cap.iters.get(evt.iter as number);
      if (ic) ic.toolIds.push(id);
      cap.tools.set(id, {
        id,
        name: evt.name as string,
        iter: evt.iter as number,
        arguments: evt.arguments as Record<string, unknown>,
        startedAt: (evt.ts as number) ?? Date.now(),
        stages: [],
      });
      break;
    }
    case "tool_start": {
      // Enrich the existing skeleton with the actual start timestamp; do NOT
      // overwrite (tool_call already populated name/args/iter).
      const tc = cap.tools.get(evt.id as string);
      if (tc) {
        tc.startedAt = (evt.ts as number) ?? tc.startedAt;
      } else {
        cap.tools.set(evt.id as string, {
          id: evt.id as string,
          name: evt.name as string,
          iter: evt.iter as number,
          arguments: evt.arguments as Record<string, unknown>,
          startedAt: (evt.ts as number) ?? Date.now(),
          stages: [],
        });
      }
      break;
    }
    case "tool_progress": {
      const tc = cap.tools.get(evt.id as string);
      if (tc) {
        tc.stages.push({
          stage: evt.stage as string,
          detail: evt.detail,
          ts: (evt.ts as number) ?? Date.now(),
        });
      }
      break;
    }
    case "tool_result": {
      const tc = cap.tools.get(evt.id as string);
      if (tc) tc.result = evt.result;
      break;
    }
    case "tool_end": {
      const tc = cap.tools.get(evt.id as string);
      if (tc) {
        tc.endedAt = (evt.ts as number) ?? Date.now();
        tc.durationMs = evt.durationMs as number;
        tc.ok = evt.ok as boolean;
        tc.error = evt.error as string | null;
        tc.summary = evt.summary as Record<string, unknown> | null;
      }
      break;
    }
    case "iter_end": {
      const iter = evt.iter as number;
      const ic = cap.iters.get(iter);
      if (ic) {
        ic.endedAt = (evt.ts as number) ?? Date.now();
        ic.durationMs = evt.durationMs as number;
        ic.ttftMs = (evt.ttftMs as number | null) ?? ic.ttftMs ?? null;
        ic.contentChars = evt.contentChars as number;
        ic.toolCallCount = evt.toolCallCount as number;
        ic.finishReason = evt.finishReason as string;
      }
      if (!quiet) {
        // Durations aren't known here — tool execution runs in Promise.all
        // after iter_end fires. Show names + count only.
        const names = ic
          ? ic.toolIds.map((id) => cap.tools.get(id)?.name ?? "?").join(", ")
          : "";
        const toolsPart = names ? ` | tools(${ic?.toolCallCount ?? 0}): ${names}` : " | tools: none";
        const ttftPart = ic?.ttftMs != null ? ` ttft=${formatMs(ic.ttftMs)}` : "";
        console.log(
          `[iter ${iter}] ${formatMs(ic?.durationMs)}${ttftPart}${toolsPart} | content: ${ic?.contentChars ?? 0} chars | finish: ${ic?.finishReason ?? "?"}`,
        );
      }
      break;
    }
    case "citation_retry":
      cap.citationRetries.push(evt);
      break;
    case "citation_result":
      cap.citationResult = evt;
      break;
    case "team_retry":
      cap.teamRetries.push(evt);
      break;
    case "team_result":
      cap.teamResult = evt;
      break;
    case "done":
      cap.sawDone = true;
      cap.finishReason = evt.finishReason as string;
      cap.totalMs = evt.totalMs as number;
      if (!quiet && cap.phantomRefusal) {
        const phs = cap.phantomRefusal.phantoms as Array<{ phantom?: string }> | undefined;
        const names = (phs ?? []).map((p) => p.phantom ?? "?").join(", ");
        console.log(`[phantom_refusal] ${names}`);
      }
      break;
    case "error": {
      const stage = (evt.stage as string) ?? "unknown";
      const text = (evt.error as string) ?? "(no message)";
      cap.error = { stage, text, iter: evt.iter as number | undefined };
      if (stage === "loop" && /Hit max tool iterations/i.test(text)) cap.hitMaxIter = true;
      break;
    }
  }
}

// ───────── Markdown rendering ─────────

function formatMs(ms: number | undefined | null): string {
  if (ms == null) return "n/a";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (+${s.length - max})`;
}

function formatSummary(s: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof s.count === "number") parts.push(`${s.count} results`);
  if (typeof s.topId === "string") parts.push(`top: \`${s.topId}\``);
  if (typeof s.id === "string" && !s.topId) parts.push(`id: \`${s.id}\``);
  if (typeof s.name === "string") parts.push(`name: ${s.name}`);
  if (parts.length === 0) return truncate(JSON.stringify(s), 80);
  return parts.join(" · ");
}

function formatResult(r: unknown): string {
  let text: string;
  try { text = JSON.stringify(r, null, 2); }
  catch { text = String(r); }
  const MAX = 50_000;
  if (text.length > MAX) {
    text = text.slice(0, MAX) + `\n… [truncated ${text.length - MAX} chars; see jsonl]`;
  }
  return text;
}

function renderPromptBlock(prompt: string): string[] {
  if (prompt.includes("\n") || prompt.includes("`")) {
    const fence = prompt.includes("```") ? "````" : "```";
    return [fence, prompt, fence + "\n"];
  }
  return [`> ${prompt}\n`];
}

function renderMarkdown(cap: RunCapture, jsonlPath: string): string {
  const out: string[] = [];

  out.push(`# Team Run — ${cap.model}\n`);
  out.push(`- **Request ID:** \`${cap.requestId ?? "(unknown)"}\``);
  const providerSuffix = cap.provider
    ? ` (${cap.provider}${cap.remoteName ? ` · ${cap.remoteName}` : ""})`
    : "";
  out.push(`- **Model:** \`${cap.model}\`${providerSuffix}`);
  out.push(`- **System prompt version:** \`${cap.systemPromptVersion ?? "(unknown)"}\``);
  out.push(`- **Base URL:** ${cap.baseUrl}`);
  out.push(`- **Started:** ${new Date(cap.startedAt).toISOString()}`);
  out.push(`- **Total wall time:** ${formatMs(cap.totalMs)}`);
  out.push(`- **Finish reason:** \`${cap.finishReason ?? "(none)"}\``);
  out.push(`- **Iterations:** ${cap.iters.size} (cap 20)`);
  const toolList = [...cap.tools.values()];
  const okCount = toolList.filter((t) => t.ok === true).length;
  const errCount = toolList.filter((t) => t.ok === false).length;
  out.push(`- **Tool calls:** ${toolList.length} (${okCount} ok / ${errCount} err)`);
  out.push(`- **Tokens:** not exposed by /api/team\n`);

  out.push(`## Prompt\n`);
  out.push(...renderPromptBlock(cap.prompt));

  if (cap.phantomRefusal) {
    out.push(`## Phantom Pokemon Refusal\n`);
    out.push("```json");
    out.push(JSON.stringify(cap.phantomRefusal.phantoms, null, 2));
    out.push("```\n");
    if (cap.phantomRefusal.content) {
      out.push(`### Refusal text\n`);
      out.push("```text");
      out.push(cap.phantomRefusal.content);
      out.push("```\n");
    }
  }

  out.push(`## Validation summary\n`);
  if (cap.teamResult) {
    const tr = cap.teamResult;
    if (tr.hasBlock === true) {
      const status = tr.valid ? "valid" : "**invalid**";
      const issues: string[] = [];
      if ((tr.duplicateItemCount as number ?? 0) > 0) issues.push(`${tr.duplicateItemCount} duplicate items`);
      if ((tr.duplicateSpeciesCount as number ?? 0) > 0) issues.push(`${tr.duplicateSpeciesCount} duplicate species`);
      if ((tr.spreadIssueCount as number ?? 0) > 0) issues.push(`${tr.spreadIssueCount} spread issues`);
      out.push(
        `- **Team JSON:** ${status}${issues.length ? ` — ${issues.join(", ")}` : ""}${tr.retryFired ? " (retry fired)" : ""}`,
      );
    } else {
      out.push(
        `- **Team JSON:** no \`team-json\` block emitted${tr.parseError ? ` (parse error: ${tr.parseError})` : ""}`,
      );
    }
  } else if (!cap.phantomRefusal) {
    out.push(`- **Team JSON:** no team_result event`);
  }
  if (cap.citationResult) {
    const cr = cap.citationResult;
    const invalidIds = (cr.invalidIds as string[] | undefined) ?? [];
    const invalidPart = invalidIds.length
      ? ` — invalid: ${invalidIds.slice(0, 5).join(", ")}${invalidIds.length > 5 ? "…" : ""}`
      : "";
    out.push(
      `- **Citations:** ${cr.validCited ?? 0}/${cr.totalCited ?? 0} valid${cr.retryFired ? " (retry fired)" : ""}${invalidPart}${cr.parseError ? ` (parse: ${cr.parseError})` : ""}`,
    );
  } else if (!cap.phantomRefusal) {
    out.push(`- **Citations:** no citation_result event`);
  }
  out.push(`- **Phantom Pokemon:** ${cap.phantomRefusal ? "detected (refusal path)" : "none"}`);
  if (cap.staleness) {
    out.push(`- **Staleness:** \`${truncate(JSON.stringify(cap.staleness), 200)}\``);
  }
  out.push("");

  const iters = [...cap.iters.values()].sort((a, b) => a.iter - b.iter);
  for (let i = 0; i < iters.length; i++) {
    const ic = iters[i];
    const isLast = i === iters.length - 1;
    out.push(`## Iteration ${ic.iter}${isLast ? " (final)" : ""} — ${formatMs(ic.durationMs)}\n`);
    out.push(
      `- **TTFT:** ${ic.ttftMs == null ? "n/a" : formatMs(ic.ttftMs)} · **content:** ${ic.contentChars ?? 0} chars · **tools:** ${ic.toolCallCount ?? 0} · **finish:** \`${ic.finishReason ?? "?"}\``,
    );

    for (const r of cap.teamRetries) {
      if (r.iter === ic.iter) {
        const dupItems = (r.duplicateItems as string[] | undefined) ?? [];
        const dupSpecies = (r.duplicateSpecies as string[] | undefined) ?? [];
        out.push(
          `> [!] **Team retry fired** — duplicateItems: ${dupItems.join(", ") || "—"} | duplicateSpecies: ${dupSpecies.join(", ") || "—"} | spreadIssues: ${r.spreadIssueCount ?? 0}`,
        );
      }
    }
    for (const r of cap.citationRetries) {
      if (r.iter === ic.iter) {
        const invalid = (r.invalidIds as string[] | undefined) ?? [];
        out.push(
          `> [!] **Citation retry fired** — invalid (${invalid.length}): ${invalid.slice(0, 8).join(", ") || "(none)"}${r.parseError ? ` | parse: ${r.parseError}` : ""}`,
        );
      }
    }
    out.push("");

    out.push(`### Tool calls\n`);
    if (ic.toolIds.length === 0) {
      out.push(`*(no tool calls this iteration)*\n`);
    } else {
      for (const id of ic.toolIds) {
        const tc = cap.tools.get(id);
        if (!tc) { out.push(`- (missing tool ${id})`); continue; }
        const argStr = tc.arguments ? truncate(JSON.stringify(tc.arguments), 200) : "{}";
        const status = tc.ok === true ? "ok" : tc.ok === false ? "**err**" : "?";
        const summaryPart = tc.summary ? ` · ${formatSummary(tc.summary)}` : "";
        const errorPart = tc.error ? ` · error: ${truncate(tc.error, 200)}` : "";
        out.push(`- \`${tc.name}(${argStr})\` → ${status} in ${formatMs(tc.durationMs)}${summaryPart}${errorPart}`);
        if (tc.result !== undefined) {
          const resultText = formatResult(tc.result);
          const sizeBytes = Buffer.byteLength(resultText, "utf8");
          const sizeLabel = sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` : `${sizeBytes} B`;
          out.push(`  <details><summary>full result (${sizeLabel})</summary>`);
          out.push("");
          out.push("  ```json");
          out.push(resultText.split("\n").map((l) => "  " + l).join("\n"));
          out.push("  ```");
          out.push("");
          out.push(`  </details>`);
        }
      }
      out.push("");
    }

    out.push(`### Content\n`);
    const content = ic.contentDeltas.join("");
    if (!content.trim()) {
      out.push(`*(no streaming content this iteration)*\n`);
    } else {
      const MAX = 8000;
      const trimmed = content.length > MAX
        ? content.slice(0, MAX) + `\n\n… [truncated ${content.length - MAX} chars; see jsonl]`
        : content;
      out.push("```text");
      out.push(trimmed);
      out.push("```\n");
    }
  }

  out.push(`## Errors\n`);
  if (cap.error) {
    out.push(`- **stage:** \`${cap.error.stage}\`${cap.error.iter !== undefined ? ` (iter ${cap.error.iter})` : ""}`);
    out.push(`- **text:** ${cap.error.text}`);
  } else {
    out.push(`*(none)*`);
  }
  out.push("");

  out.push(
    `## Raw event count: ${cap.rawEventCount}${cap.malformedEventCount ? ` (${cap.malformedEventCount} malformed, skipped)` : ""}\n`,
  );
  out.push(`Full per-event trace: \`${jsonlPath.replace(/\\/g, "/")}\``);

  return out.join("\n") + "\n";
}

function formatFinalSummary(cap: RunCapture, mdPath: string, exitCode: number): string {
  const mdRel = mdPath.replace(/\\/g, "/");
  if (exitCode === 0) {
    const team = cap.teamResult
      ? cap.teamResult.hasBlock
        ? cap.teamResult.valid ? "valid" : "invalid"
        : "no-block"
      : "n/a";
    const cites = cap.citationResult
      ? `${cap.citationResult.validCited ?? 0}/${cap.citationResult.totalCited ?? 0}`
      : "n/a";
    return `[done] ${cap.model} req=${cap.requestId ?? "?"} ${formatMs(cap.totalMs)} | iters=${cap.iters.size} tools=${cap.tools.size} | team=${team} citations=${cites} | ${mdRel}`;
  }
  const e = cap.error ?? { stage: "unknown", text: "stream ended without 'done'" };
  return `[error] ${cap.model} req=${cap.requestId ?? "?"} ${formatMs(cap.totalMs)} | stage=${e.stage} | error=${truncate(e.text, 120)} | ${mdRel}`;
}

// ───────── Main ─────────

async function main(): Promise<number> {
  const args = parseArgs();
  if (!args.model) {
    console.error("Error: missing <model-key>");
    printHelp();
    return 3;
  }

  let prompt: string;
  try {
    prompt = await resolvePrompt(args);
  } catch (e) {
    console.error(`Error reading prompt: ${(e as Error).message}`);
    return 3;
  }
  if (!prompt) { console.error("Error: empty prompt"); return 3; }

  const startedAt = Date.now();
  const ts = new Date(startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runsDir = "runs";
  await mkdir(runsDir, { recursive: true });
  const safeModel = args.model.replace(/[^a-zA-Z0-9._-]/g, "_");
  const jsonlPath = join(runsDir, `${safeModel}-${ts}.jsonl`);
  const mdPath = join(runsDir, `${safeModel}-${ts}.md`);
  const latestJsonlPath = join(runsDir, "latest.jsonl");
  const latestMdPath = join(runsDir, "latest.md");

  const cap: RunCapture = {
    model: args.model,
    prompt,
    baseUrl: args.baseUrl,
    startedAt,
    iters: new Map(),
    tools: new Map(),
    citationRetries: [],
    teamRetries: [],
    malformedEventCount: 0,
    rawEventCount: 0,
    sawDone: false,
    hitMaxIter: false,
  };

  // Connectivity pre-check via fetch — gives a clean "server not running" message
  // before we open the writer (so no empty artifacts get left behind).
  try {
    const res = await fetch(`${args.baseUrl}/api/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        messages: [{ role: "user", content: prompt }],
        ...(args.systemPromptVersion ? { systemPromptVersion: args.systemPromptVersion } : {}),
      }),
    });

    cap.requestId = res.headers.get("x-request-id") ?? undefined;

    const writer = createWriteStream(jsonlPath, { flags: "w", encoding: "utf8" });
    const writeLine = (obj: Record<string, unknown>) => writer.write(JSON.stringify(obj) + "\n");
    writeLine({
      type: "request_meta",
      model: args.model,
      prompt,
      baseUrl: args.baseUrl,
      systemPromptVersion: args.systemPromptVersion,
      ts: startedAt,
    });

    let exitCode = 0;
    try {
      if (!res.ok || !res.body) {
        const text = await res.text();
        const errText = `HTTP ${res.status}: ${text || "(no body)"}`;
        cap.error = { stage: "http", text: errText };
        cap.rawEventCount++;
        writeLine({ type: "error", stage: "http", error: errText, ts: Date.now() });
        exitCode = 1;
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(payload) as Record<string, unknown>;
            } catch {
              cap.malformedEventCount++;
              continue;
            }
            cap.rawEventCount++;
            writeLine(evt);
            handleEvent(cap, evt, args.quiet);
          }
        }
        if (!cap.sawDone && !cap.error) {
          cap.error = { stage: "transport", text: "stream ended without 'done' event" };
          exitCode = 1;
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      cap.error = { stage: "transport", text: msg };
      cap.rawEventCount++;
      writeLine({ type: "error", stage: "transport", error: msg, ts: Date.now() });
      exitCode = 1;
    }

    cap.endedAt = Date.now();
    if (cap.totalMs == null) cap.totalMs = cap.endedAt - cap.startedAt;

    if (exitCode === 0) {
      if (cap.error || !cap.sawDone) exitCode = 1;
      else if (cap.hitMaxIter) exitCode = 2;
      else if (cap.teamResult?.hasBlock === true && cap.teamResult.valid === false) exitCode = 1;
    } else if (cap.hitMaxIter) {
      exitCode = 2;
    }

    writeLine({
      type: "run_summary",
      endedAt: cap.endedAt,
      totalMs: cap.totalMs,
      iters: cap.iters.size,
      tools: cap.tools.size,
      sawDone: cap.sawDone,
      hitMaxIter: cap.hitMaxIter,
      error: cap.error ?? null,
      exitCode,
      ts: cap.endedAt,
    });

    await new Promise<void>((resolve, reject) =>
      writer.end((err: NodeJS.ErrnoException | null | undefined) =>
        err ? reject(err) : resolve(),
      ),
    );

    const md = renderMarkdown(cap, jsonlPath);
    await writeFile(mdPath, md, "utf8");

    if (!args.noLatest) {
      await copyFile(jsonlPath, latestJsonlPath);
      await copyFile(mdPath, latestMdPath);
    }

    const summary = formatFinalSummary(cap, mdPath, exitCode);
    if (exitCode === 0) console.log(summary);
    else console.error(summary);

    return exitCode;
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const causeCode = err.cause?.code;
    const isUnreachable =
      causeCode === "ECONNREFUSED" ||
      causeCode === "ENOTFOUND" ||
      err.message === "fetch failed";
    if (isUnreachable) {
      console.error(
        `Error: dev server not reachable at ${args.baseUrl}. Start it with: npm run dev`,
      );
      return 1;
    }
    console.error(`Error: ${err.message}`);
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error("Unexpected fatal:", err);
    process.exitCode = 1;
  });
