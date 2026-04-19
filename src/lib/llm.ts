import type {
  ChatDelta,
  ChatParams,
  ChatResult,
  ModelId,
} from "./llm/types.js";
import { MODEL_REGISTRY } from "./llm/types.js";
import * as anthropic from "./llm/anthropic.js";
import * as openrouter from "./llm/openrouter.js";
import * as gemini from "./llm/gemini.js";
import * as groq from "./llm/groq.js";

export type {
  ChatDelta,
  ChatParams,
  ChatResult,
  Message,
  ModelId,
  Provider,
  Tool,
  ToolCall,
  FinishReason,
} from "./llm/types.js";
export { MODEL_REGISTRY } from "./llm/types.js";

const ADAPTERS = {
  anthropic,
  openrouter,
  gemini,
  groq,
} as const;

function pick(model: ModelId) {
  const provider = MODEL_REGISTRY[model].provider;
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`No adapter for provider: ${provider}`);
  return adapter;
}

export function chat(params: ChatParams): Promise<ChatResult> {
  return pick(params.model).chat(params);
}

export function chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
  return pick(params.model).chatStream(params);
}

export const DEFAULT_MODEL: ModelId = "gemini-2.5-flash";

export const AVAILABLE_MODELS: { id: ModelId; label: string; tier: "free" | "paid" }[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "free" },
  { id: "llama-3.3-70b", label: "Llama 3.3 70B", tier: "free" },
  { id: "nemotron-super", label: "Nemotron Super 120B (reasoning)", tier: "free" },
  { id: "sonnet-4-6", label: "Claude Sonnet 4.6", tier: "paid" },
  { id: "opus-4-7", label: "Claude Opus 4.7", tier: "paid" },
];
