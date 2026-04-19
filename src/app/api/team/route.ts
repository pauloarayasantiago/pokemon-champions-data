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
export const maxDuration = 60;

const MAX_TOOL_ITERATIONS = 20;

interface TeamRequestBody {
  model: ModelId;
  messages: Message[];
  systemPromptVersion?: string;
}

function sseEncode(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
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
  const requestId = shortId();
  const providerInfo = MODEL_REGISTRY[body.model];
  const tStart = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(sseEncode({ ...event, ts: Date.now() })),
        );
      };

      const log = (...parts: unknown[]) => {
        console.log(`[team ${requestId}]`, ...parts);
      };

      try {
        send({
          type: "meta",
          requestId,
          model: body.model,
          provider: providerInfo.provider,
          remoteName: providerInfo.remoteName,
          tier: providerInfo.tier,
          systemPromptVersion: SYSTEM_PROMPT_VERSION,
        });
        log(`start model=${body.model} provider=${providerInfo.provider}`);

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const iterT0 = Date.now();
          let firstTokenAt: number | null = null;
          let assistantContent = "";
          const pendingToolCalls: ToolCall[] = [];
          let finishReason: ChatDelta extends { type: "done"; finishReason: infer R } ? R : never =
            "stop" as never;

          send({ type: "iter_start", iter, tSinceStart: Date.now() - tStart });
          log(`iter ${iter} start`);

          const iterable = chatStream({
            model: body.model,
            messages,
            system: SYSTEM_PROMPT,
            tools: TOOL_DEFINITIONS,
          });

          for await (const delta of iterable) {
            if (delta.type === "content") {
              if (firstTokenAt === null) {
                firstTokenAt = Date.now();
                send({
                  type: "llm_first_token",
                  iter,
                  latencyMs: firstTokenAt - iterT0,
                });
              }
              assistantContent += delta.delta;
              send({ type: "content", delta: delta.delta });
            } else if (delta.type === "tool_call") {
              pendingToolCalls.push(delta.toolCall);
              send({
                type: "tool_call",
                name: delta.toolCall.name,
                arguments: delta.toolCall.arguments,
                id: delta.toolCall.id,
                iter,
              });
            } else if (delta.type === "done") {
              finishReason = delta.finishReason as typeof finishReason;
            } else if (delta.type === "error") {
              log(`iter ${iter} LLM error: ${delta.error}`);
              send({ type: "error", stage: "llm", iter, error: delta.error });
              controller.close();
              return;
            }
          }

          const iterDuration = Date.now() - iterT0;
          send({
            type: "iter_end",
            iter,
            durationMs: iterDuration,
            ttftMs: firstTokenAt ? firstTokenAt - iterT0 : null,
            contentChars: assistantContent.length,
            toolCallCount: pendingToolCalls.length,
            finishReason,
          });
          log(
            `iter ${iter} end ${iterDuration}ms ttft=${firstTokenAt ? firstTokenAt - iterT0 : "n/a"}ms chars=${assistantContent.length} tools=${pendingToolCalls.length} finish=${finishReason}`,
          );

          messages.push({
            role: "assistant",
            content: assistantContent,
            toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
          });

          if (pendingToolCalls.length === 0 || finishReason !== "tool_calls") {
            send({ type: "done", finishReason, totalMs: Date.now() - tStart });
            log(`done in ${Date.now() - tStart}ms`);
            controller.close();
            return;
          }

          for (const call of pendingToolCalls) {
            const toolT0 = Date.now();
            send({
              type: "tool_start",
              id: call.id,
              name: call.name,
              iter,
              arguments: call.arguments,
            });
            log(`tool_start ${call.name} id=${call.id}`);

            const result = await executeTool(call, (stage, detail) => {
              send({
                type: "tool_progress",
                id: call.id,
                name: call.name,
                stage,
                detail: detail ?? null,
              });
            });

            const parsed = tryParseJson(result);
            const parsedRec =
              parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : null;
            const ok = !(parsedRec && typeof parsedRec.error === "string");
            const errorText =
              parsedRec && typeof parsedRec.error === "string" ? parsedRec.error : null;
            const durationMs = Date.now() - toolT0;

            // Legacy event (full payload — kept for any existing consumer)
            send({ type: "tool_result", id: call.id, name: call.name, result: parsed });
            // New summarized event
            send({
              type: "tool_end",
              id: call.id,
              name: call.name,
              ok,
              durationMs,
              error: errorText,
              summary: summarizeToolResult(call.name, parsedRec),
            });
            log(
              `tool_end ${call.name} id=${call.id} ${durationMs}ms ok=${ok}${errorText ? ` err=${errorText.slice(0, 120)}` : ""}`,
            );

            messages.push({
              role: "tool",
              content: result,
              toolCallId: call.id,
            });
          }
        }

        send({
          type: "error",
          stage: "loop",
          error: `Hit max tool iterations (${MAX_TOOL_ITERATIONS})`,
        });
        log(`hit max iterations`);
        controller.close();
      } catch (err) {
        const msg = (err as Error).message;
        log(`fatal: ${msg}`);
        send({ type: "error", stage: "fatal", error: msg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Request-Id": requestId,
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

function summarizeToolResult(
  name: string,
  result: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!result) return null;
  if (name === "search") {
    const results = Array.isArray(result.results)
      ? (result.results as Array<{ source?: string; score?: number; sourceType?: string }>)
      : [];
    return {
      resultCount: results.length,
      topSource: results[0]?.source ?? null,
      topScore: results[0]?.score ?? null,
      topSourceType: results[0]?.sourceType ?? null,
      sources: results.slice(0, 5).map((r) => r.source ?? null),
    };
  }
  if (name === "calc") {
    if (typeof result.error === "string") return { error: result.error };
    const singleResult = result.result as
      | { moveName?: string; minPct?: number; maxPct?: number; isOHKO?: boolean }
      | undefined;
    if (singleResult) {
      return {
        attacker: result.attacker ?? null,
        defender: result.defender ?? null,
        move: singleResult.moveName,
        minPct: singleResult.minPct,
        maxPct: singleResult.maxPct,
        isOHKO: singleResult.isOHKO,
      };
    }
    const list = Array.isArray(result.results)
      ? (result.results as Array<{ moveName?: string; maxPct?: number }>)
      : [];
    return {
      attacker: result.attacker ?? null,
      defender: result.defender ?? null,
      moves: list.length,
      topMove: list[0]?.moveName ?? null,
      topMaxPct: list[0]?.maxPct ?? null,
    };
  }
  return null;
}
