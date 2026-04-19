import type {
  ChatDelta,
  ChatParams,
  ChatResult,
  FinishReason,
  Message,
  Tool,
  ToolCall,
} from "./types.js";
import { MODEL_REGISTRY } from "./types.js";

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

function toOpenAIMessages(
  messages: Message[],
  system?: string,
): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId,
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      });
      continue;
    }
    out.push({ role: m.role as "user" | "assistant", content: m.content });
  }
  return out;
}

function toOpenAITools(tools?: Tool[]) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function mapFinishReason(reason?: string): FinishReason {
  if (reason === "tool_calls") return "tool_calls";
  if (reason === "length") return "length";
  return "stop";
}

interface CompatConfig {
  apiUrl: string;
  getApiKey: () => string;
  extraHeaders?: Record<string, string>;
}

export async function compatChat(
  params: ChatParams,
  config: CompatConfig,
): Promise<ChatResult> {
  const reg = MODEL_REGISTRY[params.model];
  const body: Record<string, unknown> = {
    model: reg.remoteName,
    messages: toOpenAIMessages(params.messages, params.system),
  };
  if (params.tools) body.tools = toOpenAITools(params.tools);
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;

  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.getApiKey()}`,
      ...(config.extraHeaders ?? {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${config.apiUrl} ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const msg = choice?.message ?? {};
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || "{}"),
    }),
  );
  return {
    content: msg.content ?? "",
    toolCalls,
    model: params.model,
    finishReason: mapFinishReason(choice?.finish_reason),
    usage: {
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    },
  };
}

export async function* compatChatStream(
  params: ChatParams,
  config: CompatConfig,
): AsyncIterable<ChatDelta> {
  const reg = MODEL_REGISTRY[params.model];
  const body: Record<string, unknown> = {
    model: reg.remoteName,
    messages: toOpenAIMessages(params.messages, params.system),
    stream: true,
  };
  if (params.tools) body.tools = toOpenAITools(params.tools);
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;

  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.getApiKey()}`,
      ...(config.extraHeaders ?? {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text();
    yield { type: "error", error: `${config.apiUrl} ${res.status}: ${errText}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const partialTools = new Map<
    number,
    { id: string; name: string; args: string }
  >();
  let finishReason: FinishReason | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        const choice = evt.choices?.[0];
        const delta = choice?.delta;
        if (!delta) continue;
        if (delta.content) {
          yield { type: "content", delta: delta.content };
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = partialTools.get(idx) ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            partialTools.set(idx, cur);
          }
        }
        if (choice.finish_reason) {
          finishReason = mapFinishReason(choice.finish_reason);
        }
      } catch {
        // skip malformed
      }
    }
  }

  for (const t of partialTools.values()) {
    if (!t.name) continue;
    try {
      yield {
        type: "tool_call",
        toolCall: {
          id: t.id,
          name: t.name,
          arguments: t.args ? JSON.parse(t.args) : {},
        },
      };
    } catch (e) {
      yield { type: "error", error: `Bad tool_use JSON: ${(e as Error).message}` };
    }
  }
  yield { type: "done", finishReason: finishReason ?? "stop" };
}
