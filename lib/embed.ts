import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const BATCH_SIZE = 64;

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    console.log(`Loading embedding model ${MODEL_ID} (first run downloads ~80MB)...`);
    extractor = await pipeline("feature-extraction", MODEL_ID, {
      dtype: "fp32",
    }) as FeatureExtractionPipeline;
    console.log("Embedding model loaded.");
  }
  return extractor;
}

/**
 * Embed an array of texts into 384-dim normalized vectors.
 * Processes in batches of 64 to stay within memory limits.
 */
export async function embed(texts: string[]): Promise<number[][]> {
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
