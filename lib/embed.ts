import type { FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const HF_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const BATCH_SIZE = 64;

const HF_TOKEN = process.env.HF_TOKEN;

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    const { pipeline } = await import("@huggingface/transformers");
    console.log(`Loading embedding model ${MODEL_ID} (first run downloads ~80MB)...`);
    extractor = await pipeline("feature-extraction", MODEL_ID) as FeatureExtractionPipeline;
    console.log("Embedding model loaded.");
  }
  return extractor;
}

async function embedLocal(texts: string[]): Promise<number[][]> {
  const ext = await getExtractor();
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const output = await ext(batch, { pooling: "mean", normalize: true });
    const nested: number[][] = output.tolist();
    results.push(...nested);
  }
  return results;
}

async function hfCall(texts: string[], timeoutMs: number): Promise<Response> {
  return fetch(
    `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: texts,
        options: { wait_for_model: true },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
}

async function embedRemote(texts: string[]): Promise<number[][]> {
  let res = await hfCall(texts, 8000);

  // HF returns 503 while the model cold-starts. wait_for_model should handle
  // this, but on free tier it sometimes 503s immediately with estimated_time.
  // Retry once with a slightly larger window.
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await hfCall(texts, 15000);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HF Inference API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as unknown;

  // HF feature-extraction for sentence-transformers returns:
  //   number[][]  — batched pooled vectors (expected)
  //   number[]    — occasionally flat for a single-input call
  if (!Array.isArray(data)) {
    throw new Error(`HF response not array: ${JSON.stringify(data).slice(0, 200)}`);
  }
  if (data.length === 0) return [];
  return Array.isArray(data[0]) ? (data as number[][]) : [data as number[]];
}

/**
 * Embed an array of texts into 384-dim normalized vectors.
 *
 * If HF_TOKEN is set (e.g. on Vercel), routes to Hugging Face Inference API —
 * avoids shipping onnxruntime-node native binaries to serverless. Otherwise
 * uses the local @huggingface/transformers pipeline (used by indexing scripts).
 *
 * Both paths return the same 384-dim normalized vectors from
 * sentence-transformers/all-MiniLM-L6-v2, so they share a Supabase pgvector
 * index without re-embedding.
 *
 * MiniLM-L6-v2 does not use task/document prefixes — raw text is embedded directly.
 */
export async function embed(
  texts: string[],
  _mode: "query" | "document" = "document"
): Promise<number[][]> {
  console.log(
    `[embed] texts=${texts.length} HF_TOKEN=${HF_TOKEN ? `set(len=${HF_TOKEN.length})` : "UNSET"}`
  );
  if (HF_TOKEN) {
    try {
      const vecs = await embedRemote(texts);
      console.log(`[embed] remote OK, got ${vecs.length} vectors`);
      return vecs;
    } catch (e) {
      console.error(`[embed] remote FAILED: ${(e as Error).message}`);
      throw e;
    }
  }
  try {
    const vecs = await embedLocal(texts);
    console.log(`[embed] local OK, got ${vecs.length} vectors`);
    return vecs;
  } catch (e) {
    console.error(`[embed] local FAILED: ${(e as Error).message}`);
    throw e;
  }
}
