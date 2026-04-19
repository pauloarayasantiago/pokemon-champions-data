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
import * as ollama from "./llm/ollama.js";

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
  ollama,
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

export const DEFAULT_MODEL: ModelId = "gemma-4-26b";

export const AVAILABLE_MODELS: { id: ModelId; label: string; tier: "free" | "paid" }[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "free" },
  { id: "llama-3.3-70b", label: "Llama 3.3 70B", tier: "free" },
  { id: "nemotron-super", label: "GPT-OSS 120B (OpenRouter)", tier: "free" },
  { id: "gemma-4-31b", label: "Gemma 4 31B IT (OpenRouter)", tier: "free" },
  { id: "gemma-4-26b", label: "Gemma 4 26B A4B (OpenRouter)", tier: "free" },
  { id: "qwen2.5-7b", label: "Qwen 2.5 7B (Local Ollama)", tier: "free" },
  { id: "llama3.1-8b", label: "Llama 3.1 8B (Local Ollama)", tier: "free" },
  { id: "remote-gemma4", label: "Gemma 4 27B (Remote Server)", tier: "free" },
  { id: "remote-qwen32b", label: "Qwen 2.5 32B (Remote Server)", tier: "free" },
  { id: "sonnet-4-6", label: "Claude Sonnet 4.6", tier: "paid" },
  { id: "opus-4-7", label: "Claude Opus 4.7", tier: "paid" },
];
