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

// Routing (2026-04-25): Gemma 4 26B is the eval/batch default (13/13 + 100% citations after A4c, ~$0.008/run, ~50s/team-build).
// Gemini 3 Flash Preview drives the team-building UI (faster ~21s, parallel tools, 8/8 citations clean on real-world Snow-Balance run, no banned-item hallucination observed).
// See memory-bank/progress.md "Real-world gemini-3-flash run observed" + "Compare — Gemma 4 26B run" entries.
export const DEFAULT_MODEL: ModelId = "gemma-4-26b";
export const TEAM_BUILDING_MODEL: ModelId = "gemini-3-flash";

// Curated dropdown — paid OpenRouter models verified working as of 2026-04-25
// after paid-routing fix (provider.allow_fallbacks=false + sort=throughput +
// require_parameters=true) and system prompt v4.5. See
// memory/project_openrouter_paid_routing.md and per-model eval memos.
//
// MODEL_REGISTRY in llm/types.ts retains the rest (groq llama, ollama locals,
// claude, gemini-2.5-flash, etc.) for eval-models.ts benchmarking without
// surfacing them to end users; restore an entry here to expose it in the
// /team selector.
//
// Excluded: gemini-2.5-flash (Google free-tier 5 RPM daily quota — unusable
// in any session > 5 LLM calls). Use paid Google AI Studio key to re-enable.
export const AVAILABLE_MODELS: { id: ModelId; label: string; tier: "free" | "paid" }[] = [
  { id: "gemini-3-flash", label: "Gemini 3 Flash Preview", tier: "paid" },
  { id: "gemma-4-26b", label: "Gemma 4 26B", tier: "paid" },
  { id: "grok-4-1-fast", label: "Grok 4.1 Fast", tier: "paid" },
  { id: "kimi-k2-6", label: "Kimi K2.6 (slow ~4min)", tier: "paid" },
  { id: "minimax-m2-5", label: "MiniMax M2.5", tier: "paid" },
  { id: "minimax-m2-7", label: "MiniMax M2.7", tier: "paid" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash (slow ~30min)", tier: "paid" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro (intermittent 429)", tier: "paid" },
];
