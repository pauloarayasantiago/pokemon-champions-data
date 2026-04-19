import type { ChatDelta, ChatParams, ChatResult } from "./types.js";
import { compatChat, compatChatStream } from "./openai-compat.js";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  return key;
}

const config = {
  apiUrl: API_URL,
  getApiKey,
  extraHeaders: {
    "HTTP-Referer": "https://champions-vgc.local",
    "X-Title": "Champions VGC",
  },
};

export function chat(params: ChatParams): Promise<ChatResult> {
  return compatChat(params, config);
}

export function chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
  return compatChatStream(params, config);
}
