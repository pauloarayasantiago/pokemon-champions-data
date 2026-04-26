import type { ChatDelta, ChatParams, ChatResult } from "./types.js";
import { MODEL_REGISTRY } from "./types.js";
import { compatChat, compatChatStream } from "./openai-compat.js";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  return key;
}

// Build a per-request config so we can inject per-model `provider.order`
// pinning when a registry entry sets `openrouterProviderOrder`. Without this,
// OpenRouter routes via its default cost/throughput chain — which lands on
// shared-pool backends (Together, DeepInfra) that 429 aggressively even on
// paid accounts.
function buildConfig(params: ChatParams) {
  const reg = MODEL_REGISTRY[params.model];
  const provider: Record<string, unknown> = {
    allow_fallbacks: false,
    // We always pass tools — only route to providers that support them.
    // Without this, OpenRouter may silently pick a tools-less provider and
    // ignore our tool definitions, producing useless responses.
    require_parameters: true,
  };
  if (reg.openrouterProviderOrder && reg.openrouterProviderOrder.length > 0) {
    provider.order = reg.openrouterProviderOrder;
  } else {
    provider.sort = "throughput";
  }
  return {
    apiUrl: API_URL,
    getApiKey,
    extraHeaders: {
      "HTTP-Referer": "https://champions-vgc.local",
      "X-Title": "Champions VGC",
    },
    extraBody: { provider },
  };
}

export function chat(params: ChatParams): Promise<ChatResult> {
  return compatChat(params, buildConfig(params));
}

export function chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
  return compatChatStream(params, buildConfig(params));
}
