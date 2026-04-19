import type { ChatDelta, ChatParams, ChatResult } from "./types.js";
import { compatChat, compatChatStream } from "./openai-compat.js";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

function getApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  return key;
}

const config = { apiUrl: API_URL, getApiKey };

export function chat(params: ChatParams): Promise<ChatResult> {
  return compatChat(params, config);
}

export function chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
  return compatChatStream(params, config);
}
