"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Wrench, User, Bot, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AVAILABLE_MODELS } from "@/lib/llm";
import type { ModelId } from "@/lib/llm/types";

type Role = "user" | "assistant";

interface ToolEvent {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "complete";
}

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  model?: ModelId;
  tools?: ToolEvent[];
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function TeamPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelId>("deepseek-v3");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
      tools: [],
    };

    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);
    setError(null);

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
            const evt = JSON.parse(payload);
            applyEvent(assistantMsg.id, evt, setMessages);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] w-full max-w-3xl flex-col px-4 pt-4">
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
          <MessageView key={m.id} message={m} />
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
  );
}

function applyEvent(
  assistantId: string,
  evt: { type: string; [k: string]: unknown },
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  setMessages((msgs) =>
    msgs.map((m) => {
      if (m.id !== assistantId) return m;
      if (evt.type === "content") {
        return { ...m, content: m.content + (evt.delta as string) };
      }
      if (evt.type === "tool_call") {
        const tools = [...(m.tools ?? [])];
        tools.push({
          id: evt.id as string,
          name: evt.name as string,
          arguments: evt.arguments as Record<string, unknown>,
          status: "pending",
        });
        return { ...m, tools };
      }
      if (evt.type === "tool_result") {
        const tools = (m.tools ?? []).map((t) =>
          t.id === evt.id ? { ...t, result: evt.result, status: "complete" as const } : t,
        );
        return { ...m, tools };
      }
      return m;
    }),
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
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
        {message.tools && message.tools.length > 0 && (
          <div className="space-y-1">
            {message.tools.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Wrench className="h-3 w-3" />
                <span className="font-mono">
                  {t.name}({t.arguments ? summarizeArgs(t.arguments) : ""})
                </span>
                {t.status === "pending" && <span className="opacity-50">…</span>}
              </div>
            ))}
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

function summarizeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).slice(0, 3);
  return entries
    .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 40)}`)
    .join(", ");
}
