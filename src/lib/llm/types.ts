export type ModelId =
  | "nemotron-super"
  | "gemma-4-31b"
  | "gemma-4-26b"
  | "gemini-2.5-flash"
  | "llama-3.3-70b"
  | "sonnet-4-6"
  | "opus-4-7"
  // Ollama local (RTX 2070 SUPER — 8GB VRAM → 7-9B models only)
  | "qwen2.5-7b"
  | "llama3.1-8b"
  // Ollama remote (your server — model depends on server GPU)
  | "remote-gemma4"
  | "remote-qwen32b";

export type Provider = "anthropic" | "openrouter" | "gemini" | "groq" | "ollama";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatParams {
  model: ModelId;
  messages: Message[];
  tools?: Tool[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export type FinishReason = "stop" | "tool_calls" | "length" | "error";

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  model: ModelId;
  finishReason: FinishReason;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type ChatDelta =
  | { type: "content"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; finishReason: FinishReason }
  | { type: "error"; error: string };

export const MODEL_REGISTRY: Record<
  ModelId,
  { provider: Provider; remoteName: string; tier: "free" | "paid" }
> = {
  "nemotron-super": {
    provider: "openrouter",
    remoteName: "openai/gpt-oss-120b:free",
    tier: "free",
  },
  "gemma-4-31b": {
    provider: "openrouter",
    remoteName: "google/gemma-4-31b-it:free",
    tier: "free",
  },
  "gemma-4-26b": {
    provider: "openrouter",
    remoteName: "google/gemma-4-26b-a4b-it",
    tier: "free",
  },
  "gemini-2.5-flash": {
    provider: "gemini",
    remoteName: "gemini-2.5-flash",
    tier: "free",
  },
  "llama-3.3-70b": {
    provider: "groq",
    remoteName: "llama-3.3-70b-versatile",
    tier: "free",
  },
  "sonnet-4-6": {
    provider: "anthropic",
    remoteName: "claude-sonnet-4-6",
    tier: "paid",
  },
  "opus-4-7": {
    provider: "anthropic",
    remoteName: "claude-opus-4-7",
    tier: "paid",
  },
  // ── Ollama local (OLLAMA_BASE_URL, default http://localhost:11434) ──────────
  // RTX 2070 SUPER has 8GB VRAM → Q4 models up to ~8B fit on GPU
  "qwen2.5-7b": {
    provider: "ollama",
    remoteName: "qwen2.5:7b-instruct-q4_K_M",
    tier: "free",
  },
  "llama3.1-8b": {
    provider: "ollama",
    remoteName: "llama3.1:8b-instruct-q4_K_M",
    tier: "free",
  },
  // ── Ollama remote (OLLAMA_REMOTE_URL + OLLAMA_REMOTE_KEY) ────────────────────
  // Swap remoteName once you know your server GPU and pull the right quant.
  // 24GB GPU (RTX 3090/4090): gemma4:27b-it-q4_K_M or qwen2.5:32b-instruct-q4_K_M
  // 48GB GPU (A6000/2×3090): gemma4:27b-it-q8_0 or qwen2.5:72b-instruct-q4_K_M
  "remote-gemma4": {
    provider: "ollama",
    remoteName: "gemma4:27b-it-q4_K_M", // update after `ollama pull` on server
    tier: "free",
  },
  "remote-qwen32b": {
    provider: "ollama",
    remoteName: "qwen2.5:32b-instruct-q4_K_M",
    tier: "free",
  },
};
