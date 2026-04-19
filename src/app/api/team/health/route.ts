import { supabaseServer } from "@core/supabase";
import { embed } from "@core/embed";
import { MODEL_REGISTRY, type ModelId, type Provider } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "ok" | "error" | "no-key";

interface Check {
  status: Status;
  ms?: number;
  error?: string;
  detail?: Record<string, unknown>;
}

const PROVIDER_ENV: Record<Provider, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  gemini: ["GOOGLE_GENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  ollama: ["OLLAMA_BASE_URL", "OLLAMA_REMOTE_URL"], // Ollama: key-less by default; presence of URL env counts as configured
};

async function checkSupabase(): Promise<Check> {
  const t0 = Date.now();
  try {
    const { error, count } = await supabaseServer()
      .from("pc_chunks")
      .select("id", { count: "exact", head: true });
    if (error) return { status: "error", ms: Date.now() - t0, error: error.message };
    return { status: "ok", ms: Date.now() - t0, detail: { chunkCount: count ?? null } };
  } catch (e) {
    return { status: "error", ms: Date.now() - t0, error: (e as Error).message };
  }
}

async function checkEmbed(): Promise<Check> {
  const t0 = Date.now();
  if (!process.env.HF_TOKEN) {
    return { status: "no-key", error: "HF_TOKEN not set — using local pipeline" };
  }
  try {
    const [vec] = await embed(["ping"], "query");
    return {
      status: "ok",
      ms: Date.now() - t0,
      detail: { dim: vec?.length ?? 0 },
    };
  } catch (e) {
    return { status: "error", ms: Date.now() - t0, error: (e as Error).message };
  }
}

function checkProviders(): Record<ModelId, Status> {
  const out: Partial<Record<ModelId, Status>> = {};
  for (const [id, info] of Object.entries(MODEL_REGISTRY) as Array<
    [ModelId, { provider: Provider }]
  >) {
    const envVars = PROVIDER_ENV[info.provider];
    const hasKey = envVars.some((v) => !!process.env[v]);
    out[id] = hasKey ? "ok" : "no-key";
  }
  return out as Record<ModelId, Status>;
}

export async function GET() {
  const [supabase, embedCheck] = await Promise.all([checkSupabase(), checkEmbed()]);
  const providers = checkProviders();
  return Response.json({
    supabase,
    embed: embedCheck,
    providers,
    env: {
      vercel: !!process.env.VERCEL,
      hfTokenSet: !!process.env.HF_TOKEN,
    },
    ts: Date.now(),
  });
}
