import type { ChatDelta, ChatParams, ChatResult } from "./types.js";
import { compatChat, compatChatStream } from "./openai-compat.js";

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

function getApiKey(): string {
  const key = process.env.GOOGLE_GENAI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENAI_API_KEY not set");
  return key;
}

const config = { apiUrl: API_URL, getApiKey };

export function chat(params: ChatParams): Promise<ChatResult> {
  return compatChat(params, config);
}

export function chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
  return compatChatStream(params, config);
}
