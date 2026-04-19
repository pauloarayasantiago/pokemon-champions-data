/**
 * Ollama adapter — works for both local and remote Ollama instances.
 *
 * Local:  OLLAMA_BASE_URL=http://localhost:11434  (default)
 * Remote: OLLAMA_REMOTE_URL=https://your-server.com:11434
 *         OLLAMA_REMOTE_KEY=<bearer token if your proxy requires one>
 *
 * Ollama exposes an OpenAI-compatible API at /v1/chat/completions, so this
 * adapter is just a thin config wrapper around openai-compat.ts.
 */

import type { ChatDelta, ChatParams, ChatResult } from "./types.js";
import { compatChat, compatChatStream } from "./openai-compat.js";

function makeConfig(variant: "local" | "remote") {
  if (variant === "remote") {
    return {
      apiUrl: `${process.env.OLLAMA_REMOTE_URL ?? "http://localhost:11434"}/v1/chat/completions`,
      getApiKey: () => process.env.OLLAMA_REMOTE_KEY ?? "ollama",
      extraHeaders: {} as Record<string, string>,
    };
  }
  return {
    apiUrl: `${process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"}/v1/chat/completions`,
    getApiKey: () => "ollama", // Ollama local doesn't require a real key
    extraHeaders: {} as Record<string, string>,
  };
}

const localConfig  = makeConfig("local");
const remoteConfig = makeConfig("remote");

export function chat(params: ChatParams): Promise<ChatResult> {
  const cfg = params.model.startsWith("remote-") ? remoteConfig : localConfig;
  return compatChat(params, cfg);
}

export function chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
  const cfg = params.model.startsWith("remote-") ? remoteConfig : localConfig;
  return compatChatStream(params, cfg);
}
