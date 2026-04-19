"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Wrench,
  User,
  Bot,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AVAILABLE_MODELS } from "@/lib/llm";
import type { ModelId, Provider } from "@/lib/llm/types";

type Role = "user" | "assistant";

type Status = "ok" | "error" | "no-key";

interface HealthResponse {
  supabase: { status: Status; ms?: number; error?: string; detail?: Record<string, unknown> };
  embed: { status: Status; ms?: number; error?: string; detail?: Record<string, unknown> };
  providers: Record<ModelId, Status>;
  env: { vercel: boolean; hfTokenSet: boolean };
  ts: number;
}

interface ToolStage {
  stage: string;
  ts: number;
  detail?: Record<string, unknown> | null;
}

interface ToolEvent {
  id: string;
  name: string;
  iter: number;
  arguments?: Record<string, unknown>;
  stages: ToolStage[];
  startedAt: number;
  endedAt?: number;
  ok?: boolean;
  error?: string | null;
  summary?: Record<string, unknown> | null;
  result?: unknown;
}

interface IterEvent {
  iter: number;
  startedAt: number;
  firstTokenAt?: number;
  endedAt?: number;
  contentChars?: number;
  toolCallCount?: number;
  finishReason?: string;
  toolIds: string[];
}

interface RunState {
  requestId?: string;
  model?: ModelId;
  provider?: Provider;
  remoteName?: string;
  systemPromptVersion?: string;
  startedAt: number;
  endedAt?: number;
  finishReason?: string;
  totalMs?: number;
  iters: Record<number, IterEvent>;
  tools: Record<string, ToolEvent>;
  errorStage?: string;
  errorText?: string;
  rawEvents: Array<{ t: number; evt: Record<string, unknown> }>;
}

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  model?: ModelId;
  toolIds?: string[];
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function TeamPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelId>("nemotron-super");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void probeHealth();
  }, []);

  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setNowTick(Date.now()), 100);
    return () => clearInterval(id);
  }, [isStreaming]);

  async function probeHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/team/health", { cache: "no-store" });
      const json = (await res.json()) as HealthResponse;
      setHealth(json);
    } catch (e) {
      setHealth(null);
      console.error("health probe failed", e);
    } finally {
      setHealthLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: input.trim(),
    };
    const assistantMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      content: "",
      model,
      toolIds: [],
    };

    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);
    setError(null);

    const freshRun: RunState = {
      startedAt: Date.now(),
      iters: {},
      tools: {},
      rawEvents: [],
    };
    setRun(freshRun);

    const apiMessages = [...messages, userMsg].map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: apiMessages }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

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
          try {
            const evt = JSON.parse(payload) as Record<string, unknown>;
            applyEvent(assistantMsg.id, evt, setMessages, setRun);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setRun((r) =>
        r ? { ...r, errorStage: "transport", errorText: (err as Error).message, endedAt: Date.now() } : r,
      );
    } finally {
      setIsStreaming(false);
      setRun((r) => {
        if (!r) return r;
        const finished = { ...r, endedAt: r.endedAt ?? Date.now() };
        setRuns((prev) => [finished, ...prev].slice(0, 10));
        return finished;
      });
    }
  }

  return (
    <div className="mx-auto grid h-[calc(100vh-5rem)] w-full max-w-[1400px] grid-cols-1 gap-4 px-4 pt-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      {/* Chat column */}
      <div className="flex min-h-0 flex-col">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Team Builder</h1>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Model:</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
              disabled={isStreaming}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {m.tier === "free" ? "(free)" : ""}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-lg border bg-card/50 p-3 space-y-4"
        >
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              <div className="max-w-md space-y-2">
                <p>Ask me to build, fill, or evaluate a Champions VGC team.</p>
                <p className="text-xs">
                  Try: &ldquo;Build a rain team around Pelipper&rdquo; or &ldquo;What counters Sneasler?&rdquo;
                </p>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageView key={m.id} message={m} tools={run?.tools ?? {}} />
          ))}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about teams, counters, sets, meta..."
            disabled={isStreaming}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            autoComplete="off"
            enterKeyHint="send"
          />
          <Button type="submit" disabled={isStreaming || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* Debug sidebar */}
      <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border bg-card/30 p-3 text-xs lg:flex">
        <HealthStrip
          health={health}
          loading={healthLoading}
          onRefresh={probeHealth}
          selectedModel={model}
        />
        <CurrentRun run={run} isStreaming={isStreaming} nowTick={nowTick} />
        <IterTimeline run={run} nowTick={nowTick} />
        {runs.length > 0 && <HistorySection runs={runs} />}
        <RawEventLog run={run} />
      </aside>
    </div>
  );
}

function HealthStrip({
  health,
  loading,
  onRefresh,
  selectedModel,
}: {
  health: HealthResponse | null;
  loading: boolean;
  onRefresh: () => void;
  selectedModel: ModelId;
}) {
  const supabase = health?.supabase;
  const embed = health?.embed;
  const providerStatus = health?.providers?.[selectedModel];
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-semibold text-muted-foreground">Health</span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded p-1 hover:bg-muted disabled:opacity-50"
          title="Re-probe health endpoints"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="space-y-1">
        <HealthRow
          label="Supabase"
          status={supabase?.status}
          ms={supabase?.ms}
          error={supabase?.error}
          detail={
            supabase?.detail
              ? `${(supabase.detail.chunkCount as number | null) ?? "?"} chunks`
              : undefined
          }
        />
        <HealthRow
          label="HF Embed"
          status={embed?.status}
          ms={embed?.ms}
          error={embed?.error}
          detail={
            embed?.detail
              ? `${(embed.detail.dim as number | undefined) ?? "?"}-dim`
              : undefined
          }
        />
        <HealthRow label={`LLM: ${selectedModel}`} status={providerStatus} />
      </div>
      {health?.env && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>vercel={String(health.env.vercel)}</span>
          <span>hf={health.env.hfTokenSet ? "set" : "unset"}</span>
        </div>
      )}
    </div>
  );
}

function HealthRow({
  label,
  status,
  ms,
  error,
  detail,
}: {
  label: string;
  status?: Status;
  ms?: number;
  error?: string;
  detail?: string;
}) {
  const color =
    status === "ok"
      ? "bg-green-500"
      : status === "no-key"
        ? "bg-yellow-500"
        : status === "error"
          ? "bg-red-500"
          : "bg-muted-foreground/40";
  return (
    <div className="flex items-center gap-2" title={error ?? detail ?? status ?? "unknown"}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
      <span className="flex-1 truncate">{label}</span>
      {detail && <span className="text-muted-foreground">{detail}</span>}
      {typeof ms === "number" && <span className="text-muted-foreground">{ms}ms</span>}
    </div>
  );
}

function CurrentRun({
  run,
  isStreaming,
  nowTick,
}: {
  run: RunState | null;
  isStreaming: boolean;
  nowTick: number;
}) {
  if (!run) {
    return (
      <div className="rounded-md border bg-background/60 p-2 text-muted-foreground">
        No active run. Submit a query to see live progress.
      </div>
    );
  }
  const elapsed = (run.endedAt ?? nowTick) - run.startedAt;
  const activeIter = Object.values(run.iters).find((i) => !i.endedAt);
  const activeTool = Object.values(run.tools).find((t) => !t.endedAt);
  const activeStage = activeTool
    ? `iter ${activeTool.iter} · ${activeTool.name} · ${activeTool.stages.at(-1)?.stage ?? "..."}`
    : activeIter
      ? `iter ${activeIter.iter} · ${activeIter.firstTokenAt ? "streaming" : "waiting for LLM"}`
      : isStreaming
        ? "starting..."
        : "done";
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-muted-foreground">Current run</span>
        <span className={isStreaming ? "text-green-500" : "text-muted-foreground"}>
          {formatMs(elapsed)}
        </span>
      </div>
      <div className="truncate font-mono text-[10px]">{activeStage}</div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
        {run.requestId && <span>req={run.requestId}</span>}
        {run.provider && <span>{run.provider}</span>}
        {run.systemPromptVersion && <span>sp=v{run.systemPromptVersion}</span>}
      </div>
      {run.errorText && (
        <div className="mt-1 rounded bg-destructive/15 p-1 text-destructive">
          [{run.errorStage ?? "error"}] {run.errorText}
        </div>
      )}
    </div>
  );
}

function IterTimeline({ run, nowTick }: { run: RunState | null; nowTick: number }) {
  if (!run) return null;
  const iters = Object.values(run.iters).sort((a, b) => b.iter - a.iter);
  if (iters.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="font-semibold text-muted-foreground">Timeline</div>
      {iters.map((it) => (
        <IterCard key={it.iter} iter={it} tools={it.toolIds.map((id) => run.tools[id]).filter(Boolean)} nowTick={nowTick} />
      ))}
    </div>
  );
}

function IterCard({
  iter,
  tools,
  nowTick,
}: {
  iter: IterEvent;
  tools: ToolEvent[];
  nowTick: number;
}) {
  const total = (iter.endedAt ?? nowTick) - iter.startedAt;
  const ttft = iter.firstTokenAt ? iter.firstTokenAt - iter.startedAt : null;
  const chars = iter.contentChars ?? 0;
  const charsPerSec = chars > 0 && total > 0 ? Math.round((chars / total) * 1000) : null;
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">iter {iter.iter}</span>
        <span className={iter.endedAt ? "text-muted-foreground" : "text-green-500"}>
          {formatMs(total)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 text-[10px] text-muted-foreground">
        <span>TTFT: {ttft !== null ? `${ttft}ms` : "—"}</span>
        <span>chars: {chars}</span>
        <span>rate: {charsPerSec !== null ? `${charsPerSec}/s` : "—"}</span>
        <span>tools: {iter.toolCallCount ?? tools.length}</span>
        {iter.finishReason && <span className="col-span-2">finish: {iter.finishReason}</span>}
      </div>
      {tools.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t pt-1.5">
          {tools.map((t) => (
            <ToolCard key={t.id} tool={t} nowTick={nowTick} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool, nowTick }: { tool: ToolEvent; nowTick: number }) {
  const [open, setOpen] = useState(false);
  const duration = (tool.endedAt ?? nowTick) - tool.startedAt;
  const badge =
    tool.ok === true ? "✓" : tool.ok === false ? "✗" : "…";
  const badgeColor =
    tool.ok === true
      ? "text-green-500"
      : tool.ok === false
        ? "text-red-500"
        : "text-yellow-500";
  return (
    <div className="rounded border bg-muted/40 p-1.5">
      <button
        className="flex w-full items-center justify-between gap-1 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex min-w-0 items-center gap-1">
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono">{tool.name}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className={badgeColor}>{badge}</span>
          <span className="text-muted-foreground">{formatMs(duration)}</span>
        </span>
      </button>
      {tool.error && (
        <div className="mt-1 rounded bg-destructive/15 px-1 py-0.5 text-[10px] text-destructive">
          {tool.error}
        </div>
      )}
      {open && (
        <div className="mt-1.5 space-y-1 text-[10px]">
          <div className="font-mono text-muted-foreground break-all">
            {summarizeArgs(tool.arguments)}
          </div>
          <StageBars stages={tool.stages} />
          {tool.summary && (
            <div className="rounded bg-background/60 p-1">
              {Object.entries(tool.summary).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-muted-foreground">{k}:</span>
                  <span className="font-mono break-all">
                    {typeof v === "number"
                      ? (Math.round(v * 1000) / 1000).toString()
                      : JSON.stringify(v)?.slice(0, 120)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StageBars({ stages }: { stages: ToolStage[] }) {
  if (stages.length === 0) return null;
  // Pair *_start with *_end to derive per-stage ms.
  const segments: Array<{ name: string; ms: number; detail?: Record<string, unknown> | null }> = [];
  const starts: Record<string, number> = {};
  for (const s of stages) {
    if (s.stage.endsWith("_start")) {
      starts[s.stage.replace(/_start$/, "")] = s.ts;
    } else if (s.stage.endsWith("_end")) {
      const key = s.stage.replace(/_end$/, "");
      const start = starts[key];
      const ms =
        typeof s.detail?.ms === "number"
          ? (s.detail.ms as number)
          : start
            ? s.ts - start
            : 0;
      segments.push({ name: key, ms, detail: s.detail });
    } else {
      segments.push({ name: s.stage, ms: 0, detail: s.detail });
    }
  }
  if (segments.length === 0) return null;
  const total = segments.reduce((a, b) => a + b.ms, 0) || 1;
  return (
    <div className="space-y-0.5">
      <div className="flex h-1.5 w-full overflow-hidden rounded">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="h-full"
            style={{
              width: `${Math.max(2, (seg.ms / total) * 100)}%`,
              backgroundColor: stageColor(seg.name),
            }}
            title={`${seg.name}: ${seg.ms}ms`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2 text-[9px] font-mono text-muted-foreground">
        {segments.map((seg, i) => (
          <span key={i}>
            {seg.name}:{seg.ms}ms
            {seg.detail?.rows !== undefined && ` (${String(seg.detail.rows)} rows)`}
            {seg.detail?.dim !== undefined && ` (dim=${String(seg.detail.dim)})`}
            {seg.detail?.kept !== undefined && ` (kept=${String(seg.detail.kept)})`}
          </span>
        ))}
      </div>
    </div>
  );
}

function stageColor(name: string): string {
  switch (name) {
    case "embed":
      return "#3b82f6";
    case "rpc":
      return "#8b5cf6";
    case "rerank":
      return "#10b981";
    case "structured":
      return "#f59e0b";
    case "rules":
      return "#ec4899";
    case "resolve":
      return "#06b6d4";
    case "calc":
      return "#ef4444";
    default:
      return "#64748b";
  }
}

function HistorySection({ runs }: { runs: RunState[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <button
        className="flex w-full items-center justify-between font-semibold text-muted-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          History ({runs.length})
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 font-mono text-[10px]">
          {runs.map((r, i) => {
            const total = (r.endedAt ?? Date.now()) - r.startedAt;
            const iters = Object.keys(r.iters).length;
            const tools = Object.keys(r.tools).length;
            return (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span>
                  {r.requestId ?? "?"} · {r.model ?? "?"} · {iters}i/{tools}t
                </span>
                <span className={r.errorText ? "text-red-500" : ""}>
                  {formatMs(total)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RawEventLog({ run }: { run: RunState | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!run) return null;
  const events = run.rawEvents.slice(-200);
  const jsonl = events.map((e) => JSON.stringify({ t: e.t, ...e.evt })).join("\n");
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1 font-semibold text-muted-foreground"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Raw events ({run.rawEvents.length})
        </button>
        {open && (
          <button
            className="rounded p-1 hover:bg-muted"
            onClick={async () => {
              await navigator.clipboard.writeText(jsonl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            title="Copy JSONL"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
      </div>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted/40 p-1 font-mono text-[9px] leading-snug">
          {jsonl || "(no events)"}
        </pre>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function applyEvent(
  assistantId: string,
  evt: Record<string, unknown>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setRun: React.Dispatch<React.SetStateAction<RunState | null>>,
) {
  const type = evt.type as string;
  const now = Date.now();

  setRun((r) => {
    if (!r) return r;
    const next: RunState = {
      ...r,
      rawEvents: [...r.rawEvents, { t: now, evt }],
    };
    if (type === "meta") {
      next.requestId = evt.requestId as string;
      next.model = evt.model as ModelId;
      next.provider = evt.provider as Provider;
      next.remoteName = evt.remoteName as string;
      next.systemPromptVersion = evt.systemPromptVersion as string;
    } else if (type === "iter_start") {
      const iter = evt.iter as number;
      next.iters = {
        ...next.iters,
        [iter]: { iter, startedAt: now, toolIds: [] },
      };
    } else if (type === "llm_first_token") {
      const iter = evt.iter as number;
      const existing = next.iters[iter];
      if (existing) {
        next.iters = {
          ...next.iters,
          [iter]: { ...existing, firstTokenAt: now },
        };
      }
    } else if (type === "iter_end") {
      const iter = evt.iter as number;
      const existing = next.iters[iter];
      if (existing) {
        next.iters = {
          ...next.iters,
          [iter]: {
            ...existing,
            endedAt: now,
            contentChars: evt.contentChars as number,
            toolCallCount: evt.toolCallCount as number,
            finishReason: evt.finishReason as string,
          },
        };
      }
    } else if (type === "tool_call") {
      const id = evt.id as string;
      const iter = evt.iter as number;
      next.tools = {
        ...next.tools,
        [id]: {
          id,
          name: evt.name as string,
          iter,
          arguments: evt.arguments as Record<string, unknown>,
          stages: [],
          startedAt: now,
        },
      };
      const itExisting = next.iters[iter];
      if (itExisting && !itExisting.toolIds.includes(id)) {
        next.iters = {
          ...next.iters,
          [iter]: { ...itExisting, toolIds: [...itExisting.toolIds, id] },
        };
      }
    } else if (type === "tool_start") {
      const id = evt.id as string;
      const existing = next.tools[id];
      if (existing) {
        next.tools = {
          ...next.tools,
          [id]: { ...existing, startedAt: now },
        };
      }
    } else if (type === "tool_progress") {
      const id = evt.id as string;
      const existing = next.tools[id];
      if (existing) {
        next.tools = {
          ...next.tools,
          [id]: {
            ...existing,
            stages: [
              ...existing.stages,
              {
                stage: evt.stage as string,
                ts: now,
                detail: evt.detail as Record<string, unknown> | null,
              },
            ],
          },
        };
      }
    } else if (type === "tool_result") {
      const id = evt.id as string;
      const existing = next.tools[id];
      if (existing) {
        next.tools = {
          ...next.tools,
          [id]: { ...existing, result: evt.result },
        };
      }
    } else if (type === "tool_end") {
      const id = evt.id as string;
      const existing = next.tools[id];
      if (existing) {
        next.tools = {
          ...next.tools,
          [id]: {
            ...existing,
            endedAt: now,
            ok: evt.ok as boolean,
            error: evt.error as string | null,
            summary: evt.summary as Record<string, unknown> | null,
          },
        };
      }
    } else if (type === "error") {
      next.errorStage = (evt.stage as string) ?? "error";
      next.errorText = evt.error as string;
      next.endedAt = now;
    } else if (type === "done") {
      next.endedAt = now;
      next.finishReason = evt.finishReason as string;
      next.totalMs = evt.totalMs as number;
    }
    return next;
  });

  setMessages((msgs) =>
    msgs.map((m) => {
      if (m.id !== assistantId) return m;
      if (type === "content") {
        return { ...m, content: m.content + (evt.delta as string) };
      }
      if (type === "tool_call") {
        const toolIds = [...(m.toolIds ?? []), evt.id as string];
        return { ...m, toolIds };
      }
      return m;
    }),
  );
}

function MessageView({
  message,
  tools,
}: {
  message: ChatMessage;
  tools: Record<string, ToolEvent>;
}) {
  const isUser = message.role === "user";
  const msgTools = (message.toolIds ?? []).map((id) => tools[id]).filter(Boolean);
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="shrink-0 mt-1">
          <Bot className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div
        className={`max-w-[85%] space-y-2 rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {msgTools.length > 0 && (
          <div className="space-y-1">
            {msgTools.map((t) => {
              const duration = t.endedAt ? t.endedAt - t.startedAt : null;
              const badge = t.ok === true ? "✓" : t.ok === false ? "✗" : "…";
              const badgeColor =
                t.ok === true
                  ? "text-green-500"
                  : t.ok === false
                    ? "text-red-500"
                    : "text-yellow-500 animate-pulse";
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Wrench className="h-3 w-3" />
                  <span className="font-mono truncate">
                    {t.name}({summarizeArgs(t.arguments)})
                  </span>
                  <span className={badgeColor}>{badge}</span>
                  {duration !== null && <span className="text-[10px]">{duration}ms</span>}
                </div>
              );
            })}
          </div>
        )}
        {message.content && (
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </div>
        )}
        {!isUser && message.model && (
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {message.model}
          </div>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 mt-1">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function summarizeArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const entries = Object.entries(args).slice(0, 3);
  return entries
    .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 40)}`)
    .join(", ");
}
