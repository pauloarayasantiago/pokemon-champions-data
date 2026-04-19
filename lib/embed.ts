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

async function embedRemote(texts: string[]): Promise<number[][]> {
  const res = await fetch(
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
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HF Inference API ${res.status}: ${body}`);
  }

  const data = (await res.json()) as number[][] | number[];
  // Single-input responses may come back as a flat array; normalize to batched shape.
  const vectors: number[][] = Array.isArray(data[0]) ? (data as number[][]) : [data as number[]];
  return vectors;
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
