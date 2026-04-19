import { type NextRequest } from "next/server";
import {
  chatStream,
  type ChatDelta,
  type Message,
  type ModelId,
  type ToolCall,
  MODEL_REGISTRY,
} from "@/lib/llm";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/tools";
import { SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from "@/lib/system-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOOL_ITERATIONS = 8;

interface TeamRequestBody {
  model: ModelId;
  messages: Message[];
  systemPromptVersion?: string;
}

function sseEncode(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  let body: TeamRequestBody;
  try {
    body = (await request.json()) as TeamRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.model || !MODEL_REGISTRY[body.model]) {
    return Response.json(
      { error: `Unknown model: ${body.model}` },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json(
      { error: "messages must be a non-empty array" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const messages: Message[] = [...body.messages];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEncode(event)));
      };

      try {
        send({ type: "meta", model: body.model, systemPromptVersion: SYSTEM_PROMPT_VERSION });

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          let assistantContent = "";
          const pendingToolCalls: ToolCall[] = [];
          let finishReason: ChatDelta extends { type: "done"; finishReason: infer R } ? R : never =
            "stop" as never;

          const iterable = chatStream({
            model: body.model,
            messages,
            system: SYSTEM_PROMPT,
            tools: TOOL_DEFINITIONS,
          });

          for await (const delta of iterable) {
            if (delta.type === "content") {
              assistantContent += delta.delta;
              send({ type: "content", delta: delta.delta });
            } else if (delta.type === "tool_call") {
              pendingToolCalls.push(delta.toolCall);
              send({
                type: "tool_call",
                name: delta.toolCall.name,
                arguments: delta.toolCall.arguments,
                id: delta.toolCall.id,
              });
            } else if (delta.type === "done") {
              finishReason = delta.finishReason as typeof finishReason;
            } else if (delta.type === "error") {
              send({ type: "error", error: delta.error });
              controller.close();
              return;
            }
          }

          messages.push({
            role: "assistant",
            content: assistantContent,
            toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
          });

          if (pendingToolCalls.length === 0 || finishReason !== "tool_calls") {
            send({ type: "done", finishReason });
            controller.close();
            return;
          }

          for (const call of pendingToolCalls) {
            const result = await executeTool(call);
            send({
              type: "tool_result",
              id: call.id,
              name: call.name,
              result: tryParseJson(result),
            });
            messages.push({
              role: "tool",
              content: result,
              toolCallId: call.id,
            });
          }
        }

        send({ type: "error", error: `Hit max tool iterations (${MAX_TOOL_ITERATIONS})` });
        controller.close();
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
