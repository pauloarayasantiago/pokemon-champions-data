import type {
  ChatDelta,
  ChatParams,
  ChatResult,
  Message,
  Tool,
  ToolCall,
} from "./types.js";
import { MODEL_REGISTRY } from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[] | AnthropicToolResultBlock[];
}

interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId!,
            content: m.content,
          },
        ],
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }
    out.push({ role: m.role as "user" | "assistant", content: m.content });
  }
  return out;
}

function toAnthropicTools(tools?: Tool[]) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return key;
}

export async function chat(params: ChatParams): Promise<ChatResult> {
  const reg = MODEL_REGISTRY[params.model];
  const body: Record<string, unknown> = {
    model: reg.remoteName,
    max_tokens: params.maxTokens ?? 4096,
    messages: toAnthropicMessages(params.messages),
  };
  if (params.system) {
    body.system = [
      {
        type: "text",
        text: params.system,
        cache_control: { type: "ephemeral" },
      },
    ];
  }
  if (params.tools) body.tools = toAnthropicTools(params.tools);
  if (params.temperature !== undefined) body.temperature = params.temperature;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText}`);
  }
  const data = await res.json();

  let content = "";
  const toolCalls: ToolCall[] = [];
  for (const block of data.content as AnthropicContentBlock[]) {
    if (block.type === "text" && block.text) content += block.text;
    else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id!,
        name: block.name!,
        arguments: block.input ?? {},
      });
    }
  }

  return {
    content,
    toolCalls,
    model: params.model,
    finishReason:
      data.stop_reason === "tool_use"
        ? "tool_calls"
        : data.stop_reason === "max_tokens"
          ? "length"
          : "stop",
    usage: {
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    },
  };
}

export async function* chatStream(
  params: ChatParams,
): AsyncIterable<ChatDelta> {
  const reg = MODEL_REGISTRY[params.model];
  const body: Record<string, unknown> = {
    model: reg.remoteName,
    max_tokens: params.maxTokens ?? 4096,
    messages: toAnthropicMessages(params.messages),
    stream: true,
  };
  if (params.system) {
    body.system = [
      {
        type: "text",
        text: params.system,
        cache_control: { type: "ephemeral" },
      },
    ];
  }
  if (params.tools) body.tools = toAnthropicTools(params.tools);
  if (params.temperature !== undefined) body.temperature = params.temperature;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text();
    yield { type: "error", error: `Anthropic API ${res.status}: ${errText}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const partialTools = new Map<
    number,
    { id: string; name: string; input: string }
  >();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "content_block_start" && evt.content_block?.type === "tool_use") {
          partialTools.set(evt.index, {
            id: evt.content_block.id,
            name: evt.content_block.name,
            input: "",
          });
        } else if (evt.type === "content_block_delta") {
          if (evt.delta?.type === "text_delta" && evt.delta.text) {
            yield { type: "content", delta: evt.delta.text };
          } else if (evt.delta?.type === "input_json_delta") {
            const t = partialTools.get(evt.index);
            if (t) t.input += evt.delta.partial_json ?? "";
          }
        } else if (evt.type === "content_block_stop") {
          const t = partialTools.get(evt.index);
          if (t) {
            try {
              const args = t.input ? JSON.parse(t.input) : {};
              yield {
                type: "tool_call",
                toolCall: { id: t.id, name: t.name, arguments: args },
              };
            } catch (e) {
              yield { type: "error", error: `Bad tool_use JSON: ${(e as Error).message}` };
            }
            partialTools.delete(evt.index);
          }
        } else if (evt.type === "message_delta" && evt.delta?.stop_reason) {
          yield {
            type: "done",
            finishReason:
              evt.delta.stop_reason === "tool_use"
                ? "tool_calls"
                : evt.delta.stop_reason === "max_tokens"
                  ? "length"
                  : "stop",
          };
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }
}
