"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Square,
  Wrench,
  Bot,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Users,
  Sparkles,
  Search,
  CheckCircle2,
  XCircle,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_MODELS, TEAM_BUILDING_MODEL } from "@/lib/llm";
import type { ModelId, Provider } from "@/lib/llm/types";
import { MarkdownView } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import {
  TeamReferencePanel,
  type StalenessInfo,
} from "./TeamReferencePanel";
import {
  buildRosterIndex,
  extractCitations,
  lookupPokemon,
  parseTeamFromMessages,
  parseTeamJsonFromMessages,
  type RosterEntry,
  type TeamSlot,
} from "./teamParser";
import type { PokemonType } from "@/components/ui/type-badge";

type Role = "user" | "assistant";

type Status = "ok" | "error" | "no-key";

interface HealthResponse {
  supabase: { status: Status; ms?: number; error?: string; detail?: Record<string, unknown> };
  embed: { status: Status; ms?: number; error?: string; detail?: Record<string, unknown> };
  providers: Record<ModelId, Status>;
  staleness: StalenessInfo | null;
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

const QUICK_STARTS: Array<{ label: string; prompt: string; accent: string }> = [
  {
    label: "Build from scratch",
    prompt: "Build a balanced VGC Doubles team for Regulation M-A.",
    accent: "var(--type-grass)",
  },
  {
    label: "Counter a threat",
    prompt: "What counters Sneasler in the current Champions VGC meta?",
    accent: "var(--type-poison)",
  },
  {
    label: "Optimize my team",
    prompt: "I have Pelipper + Kingdra. What should I add to round out a rain team?",
    accent: "var(--type-water)",
  },
];

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function TeamPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelId>(TEAM_BUILDING_MODEL);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const [staleness, setStaleness] = useState<StalenessInfo | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void probeHealth();
    void loadRoster();
  }, []);

  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setNowTick(Date.now()), 100);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Ctrl+Shift+D toggles legacy debug sheet
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setDebugOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function loadRoster() {
    try {
      const res = await fetch("/api/pokemon/roster");
      if (!res.ok) return;
      const json = (await res.json()) as { pokemon: RosterEntry[] };
      if (Array.isArray(json.pokemon)) setRoster(json.pokemon);
    } catch {
      /* roster lookup is non-fatal — chat still works without type badges */
    }
  }

  async function probeHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/team/health", { cache: "no-store" });
      const json = (await res.json()) as HealthResponse;
      setHealth(json);
      if (json.staleness) setStaleness(json.staleness);
    } catch (e) {
      setHealth(null);
      console.error("health probe failed", e);
    } finally {
      setHealthLoading(false);
    }
  }

  async function streamReply(
    apiMessages: Array<{ role: Role; content: string }>,
    assistantId: string,
  ) {
    setIsStreaming(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const freshRun: RunState = {
      startedAt: Date.now(),
      iters: {},
      tools: {},
      rawEvents: [],
    };
    setRun(freshRun);

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: apiMessages }),
        signal: controller.signal,
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
            applyEvent(assistantId, evt, setMessages, setRun);
            if (evt.type === "staleness" && evt.data) {
              setStaleness(evt.data as StalenessInfo);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      const e = err as Error;
      const aborted = e.name === "AbortError" || controller.signal.aborted;
      if (aborted) {
        setRun((r) =>
          r ? { ...r, errorStage: "cancelled", errorText: "Cancelled by user", endedAt: Date.now() } : r,
        );
      } else {
        setError(e.message);
        setRun((r) =>
          r ? { ...r, errorStage: "transport", errorText: e.message, endedAt: Date.now() } : r,
        );
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setRun((r) => {
        if (!r) return r;
        const finished = { ...r, endedAt: r.endedAt ?? Date.now() };
        setRuns((prev) => [finished, ...prev].slice(0, 10));
        return finished;
      });
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
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
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const apiMessages = [...messages, userMsg].map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));

    await streamReply(apiMessages, assistantMsg.id);
  }

  async function retry() {
    if (isStreaming) return;
    const trimmed = (() => {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && !last.content) return messages.slice(0, -1);
      return messages;
    })();
    if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") return;

    const assistantMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      content: "",
      model,
      toolIds: [],
    };
    setMessages([...trimmed, assistantMsg]);

    const apiMessages = trimmed.map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));
    await streamReply(apiMessages, assistantMsg.id);
  }

  // Derived team state — runs whenever messages or roster change.
  const team: TeamSlot[] = useMemo(
    () =>
      parseTeamFromMessages(
        messages.map((m) => ({ role: m.role, content: m.content })),
        roster,
      ),
    [messages, roster],
  );
  const teamJson = useMemo(
    () =>
      parseTeamJsonFromMessages(
        messages.map((m) => ({ role: m.role, content: m.content })),
      ),
    [messages],
  );

  // Roster index for the markdown renderer's Pokemon-line type lookup.
  const rosterIndex = useMemo(
    () => (roster.length > 0 ? buildRosterIndex(roster).byNormalized : null),
    [roster],
  );
  const lookupTypes = useMemo(
    () =>
      rosterIndex
        ? (name: string): PokemonType[] | null => {
            const entry = lookupPokemon(name, rosterIndex);
            return entry ? entry.types : null;
          }
        : undefined,
    [rosterIndex],
  );

  const runActive = !!run && !run.endedAt;
  const teamFilledCount = team.filter(Boolean).length;

  return (
    <div className="mx-auto grid h-[calc(100vh-5rem)] w-full max-w-[1400px] grid-cols-1 gap-4 px-4 pt-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Chat column */}
      <div className="flex min-h-0 flex-col">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold leading-tight">Team Builder</h1>
            <p className="text-[11px] text-muted-foreground">
              Champions VGC · Reg M-A
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={model}
              onValueChange={(v) => setModel(v as ModelId)}
              disabled={isStreaming}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-fit text-xs"
                aria-label="Select model"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {AVAILABLE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                    {m.tier === "free" ? " (free)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-xl border bg-card/40 px-3 py-4 space-y-5"
        >
          {messages.length === 0 ? (
            <EmptyState onPick={(p) => setInput(p)} />
          ) : (
            messages.map((m, idx) => {
              const isLast = idx === messages.length - 1;
              return (
                <MessageView
                  key={m.id}
                  message={m}
                  tools={run?.tools ?? {}}
                  isStreaming={isStreaming && isLast}
                  isFinal={!isStreaming && isLast && !error}
                  lookupTypes={lookupTypes}
                  totalMs={run?.totalMs}
                />
              );
            })
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <div className="flex-1 space-y-2">
                <div>{error}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void retry()}
                  disabled={isStreaming}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="ml-1">Retry</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        <Composer
          ref={textareaRef}
          input={input}
          setInput={setInput}
          onSubmit={submit}
          onCancel={cancel}
          isStreaming={isStreaming}
        />
      </div>

      {/* Right reference panel — desktop */}
      <TeamReferencePanel
        team={team}
        megaStone={teamJson?.megaStone}
        staleness={staleness}
        className="hidden lg:flex"
      />

      {/* Floating reference button — mobile */}
      <button
        type="button"
        onClick={() => setReferenceOpen(true)}
        className={cn(
          "fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg lg:hidden transition-all",
          "bottom-[calc(env(safe-area-inset-bottom)+5rem)]",
          teamFilledCount > 0
            ? "bg-vgc-accent text-black border-vgc-accent"
            : "bg-card text-foreground border-border",
        )}
        aria-label="Open team reference panel"
      >
        <Users className="h-5 w-5" aria-hidden />
        {teamFilledCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background">
            {teamFilledCount}
          </span>
        )}
      </button>

      {/* Reference panel — mobile bottom sheet */}
      <Sheet open={referenceOpen} onOpenChange={setReferenceOpen}>
        <SheetContent
          side="bottom"
          className="lg:hidden h-[80vh] overflow-y-auto p-0 pt-12"
        >
          <SheetHeader className="px-4 pb-3">
            <SheetTitle>Team Reference</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <TeamReferencePanel
              team={team}
              megaStone={teamJson?.megaStone}
              staleness={staleness}
              className="border-0 bg-transparent p-0"
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Debug Sheet — Ctrl+Shift+D */}
      <Sheet open={debugOpen} onOpenChange={setDebugOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto p-3 pt-12">
          <SheetHeader className="p-0 pb-3">
            <SheetTitle>Debug</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 text-xs">
            <DebugPanel
              health={health}
              healthLoading={healthLoading}
              onRefreshHealth={probeHealth}
              model={model}
              run={run}
              isStreaming={isStreaming}
              nowTick={nowTick}
              runs={runs}
            />
            {runActive && (
              <span
                className="absolute top-3 right-3 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"
                aria-hidden
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-1.5 max-w-sm">
        <div className="flex justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-vgc-accent-muted">
            <Sparkles className="h-5 w-5 text-vgc-accent" aria-hidden />
          </div>
        </div>
        <p className="text-sm font-semibold text-foreground">
          Start building your team
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Describe a strategy or ask about the meta. Your team and type
          coverage will populate in the panel as the assistant responds.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 text-left">
          Try asking
        </p>
        {QUICK_STARTS.map(({ label, prompt, accent }) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(prompt)}
            className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-left transition-colors hover:bg-accent/40 hover:border-border"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full transition-transform group-hover:scale-125"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-foreground">{label}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {prompt}
              </div>
            </div>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────

const Composer = React.forwardRef<
  HTMLTextAreaElement,
  {
    input: string;
    setInput: (v: string) => void;
    onSubmit: (e?: React.FormEvent) => void;
    onCancel: () => void;
    isStreaming: boolean;
  }
>(function Composer({ input, setInput, onSubmit, onCancel, isStreaming }, ref) {
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }
  return (
    <form
      onSubmit={onSubmit}
      className="mt-3"
      aria-label="Team builder chat"
    >
      <label htmlFor="team-input" className="sr-only">
        Ask about teams, counters, sets, meta
      </label>
      <div
        className={cn(
          "rounded-xl border border-input bg-background p-2 shadow-sm transition-all",
          isStreaming
            ? "border-vgc-accent/40 shadow-[0_0_0_1px_var(--vgc-accent-muted)]"
            : "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        )}
      >
        <textarea
          id="team-input"
          ref={ref}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autoResize(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ask about teams, counters, sets, meta..."
          disabled={isStreaming}
          rows={1}
          aria-label="Ask about teams, counters, sets, meta"
          className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60 max-h-[140px]"
          autoComplete="off"
          enterKeyHint="send"
        />
        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] text-muted-foreground/60 select-none hidden sm:inline">
            Enter to send · Shift+Enter for new line
          </span>
          <span className="sm:hidden" />
          {isStreaming ? (
            <Button
              type="button"
              onClick={onCancel}
              size="icon"
              variant="destructive"
              aria-label="Stop generation"
              title="Stop generation"
              className="size-7"
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!input.trim()}
              size="icon"
              aria-label="Send message"
              className="size-7"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
});

// ─── Message view ────────────────────────────────────────────────────────

function MessageView({
  message,
  tools,
  isStreaming,
  isFinal,
  lookupTypes,
  totalMs,
}: {
  message: ChatMessage;
  tools: Record<string, ToolEvent>;
  isStreaming: boolean;
  isFinal: boolean;
  lookupTypes: ((name: string) => PokemonType[] | null) | undefined;
  totalMs?: number;
}) {
  const isUser = message.role === "user";
  const msgTools = (message.toolIds ?? []).map((id) => tools[id]).filter(Boolean);
  const isEmpty = !message.content && msgTools.length === 0;
  const showSkeleton = !isUser && isStreaming && isEmpty;
  const showEmptyFallback = !isUser && isFinal && isEmpty;
  const citations = useMemo(
    () => (message.content ? extractCitations(message.content) : []),
    [message.content],
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2">
      <div className="mt-2 shrink-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-vgc-accent-muted">
          <Bot className="h-3.5 w-3.5 text-vgc-accent" aria-hidden />
        </div>
      </div>
      <div className="max-w-[88%] rounded-xl rounded-tl-sm border bg-card px-4 py-3 shadow-sm">
        {msgTools.length > 0 && (
          <ToolSummaryLine tools={msgTools} isStreaming={isStreaming} />
        )}
        {message.content && (
          <MarkdownView
            text={message.content}
            enrich={{
              pokemon: true,
              callouts: true,
              teamCard: true,
              lookupTypes,
            }}
          />
        )}
        {showSkeleton && <ThinkingSkeleton />}
        {showEmptyFallback && (
          <div className="text-xs italic text-muted-foreground">
            Stream ended without output. Try resubmitting your question.
          </div>
        )}
        {citations.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Sources
            </span>
            {citations.map((c) => (
              <span
                key={c}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {!isUser && message.model && !showSkeleton && message.content && (
          <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/50">
            {message.model}
            {totalMs && isFinal && ` · ${(totalMs / 1000).toFixed(1)}s`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool summary (single line, click to expand) ─────────────────────────

function ToolSummaryLine({
  tools,
  isStreaming,
}: {
  tools: ToolEvent[];
  isStreaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const total = tools.length;
  const okCount = tools.filter((t) => t.ok === true).length;
  const failCount = tools.filter((t) => t.ok === false).length;
  const pendingCount = tools.filter((t) => t.ok === undefined).length;

  const isActive = isStreaming && pendingCount > 0;
  const allDone = pendingCount === 0;
  const anyFailed = failCount > 0;

  const subjects = tools
    .map((t) => describeToolSubject(t))
    .filter((s): s is string => !!s);
  const uniqueSubjects = Array.from(new Set(subjects));
  const visibleSubjects = uniqueSubjects.slice(0, 3);
  const moreCount = uniqueSubjects.length - visibleSubjects.length;

  let icon: React.ReactNode;
  let summary: React.ReactNode;
  let toneClass = "";

  if (isActive) {
    icon = (
      <Search
        className="h-3 w-3 text-vgc-accent animate-pulse"
        aria-hidden
      />
    );
    toneClass = "text-vgc-accent";
    summary =
      visibleSubjects.length > 0 ? (
        <>
          Looking up {visibleSubjects.join(", ")}
          {moreCount > 0 && `, +${moreCount}`}…
        </>
      ) : (
        <>Searching…</>
      );
  } else if (anyFailed) {
    icon = <XCircle className="h-3 w-3 text-destructive" aria-hidden />;
    toneClass = "text-destructive";
    summary = (
      <>
        Source lookup failed for {failCount} of {total}
      </>
    );
  } else if (allDone) {
    icon = <CheckCircle2 className="h-3 w-3 text-green-600" aria-hidden />;
    summary =
      visibleSubjects.length > 0 ? (
        <>
          Referenced {okCount} source{okCount === 1 ? "" : "s"} ·{" "}
          {visibleSubjects.join(", ")}
          {moreCount > 0 && ` +${moreCount}`}
        </>
      ) : (
        <>
          Referenced {okCount} source{okCount === 1 ? "" : "s"}
        </>
      );
  } else {
    icon = <Wrench className="h-3 w-3" aria-hidden />;
    summary = (
      <>
        {okCount} done · {pendingCount} pending
      </>
    );
  }

  return (
    <div className="mb-2.5 border-b border-border/40 pb-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground transition-colors",
          toneClass,
        )}
        aria-expanded={open}
      >
        {icon}
        <span className="flex-1 truncate">{summary}</span>
        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-[11px]">
          {tools.map((t) => (
            <ToolDetailRow key={t.id} tool={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolDetailRow({ tool }: { tool: ToolEvent }) {
  const subject = describeToolSubject(tool);
  const status = tool.ok === true ? "ok" : tool.ok === false ? "fail" : "…";
  const statusClass =
    tool.ok === true
      ? "text-green-600"
      : tool.ok === false
        ? "text-destructive"
        : "text-vgc-accent";
  const duration =
    tool.endedAt !== undefined ? formatMs(tool.endedAt - tool.startedAt) : null;
  const summaryRows = tool.summary ? Object.entries(tool.summary) : [];
  const visibleSummary = summaryRows.slice(0, 3);
  return (
    <li className="rounded bg-muted/40 px-2 py-1.5">
      <div className="flex items-center gap-2 font-mono text-[10px]">
        <span className={statusClass}>{status}</span>
        <span className="font-semibold text-foreground/90">{tool.name}</span>
        {subject && <span className="truncate text-muted-foreground">{subject}</span>}
        {duration && <span className="ml-auto text-muted-foreground">{duration}</span>}
      </div>
      {tool.error && (
        <div className="mt-1 rounded bg-destructive/15 px-1 py-0.5 text-[10px] text-destructive">
          {tool.error}
        </div>
      )}
      {visibleSummary.length > 0 && (
        <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          {visibleSummary.map(([k, v]) => (
            <React.Fragment key={k}>
              <span>{k}</span>
              <span className="truncate text-foreground/80">{summaryValue(v)}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </li>
  );
}

function describeToolSubject(t: ToolEvent): string | null {
  const args = t.arguments;
  if (!args) return null;
  if (typeof args.name === "string") return args.name;
  if (typeof args.query === "string")
    return args.query.length > 40 ? `${args.query.slice(0, 40)}…` : args.query;
  if (typeof args.move === "string") return args.move;
  if (typeof args.item === "string") return args.item;
  return null;
}

function summaryValue(v: unknown): string {
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  const s = JSON.stringify(v);
  return s && s.length > 60 ? `${s.slice(0, 60)}…` : (s ?? "");
}

// ─── Thinking skeleton ───────────────────────────────────────────────────

function ThinkingSkeleton() {
  return (
    <div className="space-y-2 py-1" role="status" aria-label="Assistant is thinking">
      <div className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full bg-vgc-accent animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-vgc-accent animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-vgc-accent animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
        <span className="ml-1 text-xs text-muted-foreground">Thinking…</span>
      </div>
      <div className="space-y-1.5">
        <div className="h-2 w-48 animate-pulse rounded bg-muted-foreground/15" />
        <div className="h-2 w-36 animate-pulse rounded bg-muted-foreground/12" />
        <div className="h-2 w-56 animate-pulse rounded bg-muted-foreground/10" />
      </div>
    </div>
  );
}

// ─── Event reducer ───────────────────────────────────────────────────────

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
        next.tools = { ...next.tools, [id]: { ...existing, startedAt: now } };
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
        next.tools = { ...next.tools, [id]: { ...existing, result: evt.result } };
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
      if (type === "iter_start" && (evt.iter as number) > 0) {
        return { ...m, content: "" };
      }
      return m;
    }),
  );
}

// ─── Debug panel (legacy, opens via Ctrl+Shift+D) ────────────────────────

function DebugPanel({
  health,
  healthLoading,
  onRefreshHealth,
  model,
  run,
  isStreaming,
  nowTick,
  runs,
}: {
  health: HealthResponse | null;
  healthLoading: boolean;
  onRefreshHealth: () => void;
  model: ModelId;
  run: RunState | null;
  isStreaming: boolean;
  nowTick: number;
  runs: RunState[];
}) {
  return (
    <>
      <HealthStrip
        health={health}
        loading={healthLoading}
        onRefresh={onRefreshHealth}
        selectedModel={model}
      />
      <CurrentRun run={run} isStreaming={isStreaming} nowTick={nowTick} />
      <IterTimeline run={run} nowTick={nowTick} />
      {runs.length > 0 && <HistorySection runs={runs} />}
      <RawEventLog run={run} />
    </>
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
        <IterCard
          key={it.iter}
          iter={it}
          tools={it.toolIds.map((id) => run.tools[id]).filter(Boolean)}
          nowTick={nowTick}
        />
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
  const badge = tool.ok === true ? "✓" : tool.ok === false ? "✗" : "…";
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
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
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

function summarizeArgs(args?: Record<string, unknown>): string {
  if (!args) return "";
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  const parts = entries.slice(0, 3).map(([k, v]) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return `${k}=${s && s.length > 30 ? `${s.slice(0, 30)}…` : s}`;
  });
  return parts.join(" ");
}

function StageBars({ stages }: { stages: ToolStage[] }) {
  if (stages.length === 0) return null;
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
    case "boost":
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
            const total = (r.endedAt ?? r.startedAt) - r.startedAt;
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
