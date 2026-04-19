export type ModelId =
  | "deepseek-v3"
  | "gemini-2.5-flash"
  | "llama-3.3-70b"
  | "sonnet-4-6"
  | "opus-4-7";

export type Provider = "anthropic" | "openrouter" | "gemini" | "groq";

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
  "deepseek-v3": {
    provider: "openrouter",
    remoteName: "deepseek/deepseek-chat-v3:free",
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
};
