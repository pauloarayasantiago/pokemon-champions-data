import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
const BATCH_SIZE = 16;
const QUERY_PREFIX = "task: search result | query: ";
const DOCUMENT_PREFIX = "title: none | text: ";

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    console.log(`Loading embedding model ${MODEL_ID} (first run downloads ~300MB)...`);
    extractor = await pipeline("feature-extraction", MODEL_ID, {
      dtype: "q8",
    }) as FeatureExtractionPipeline;
    console.log("Embedding model loaded.");
  }
  return extractor;
}

/**
 * Embed an array of texts into 768-dim normalized vectors.
 * Processes in batches of 16 to stay within memory limits.
 *
 * @param mode - "query" for search queries, "document" for indexing text chunks.
 *               Each mode applies a different prefix required by EmbeddingGemma.
 */
export async function embed(
  texts: string[],
  mode: "query" | "document" = "document"
): Promise<number[][]> {
  const ext = await getExtractor();
  const prefix = mode === "query" ? QUERY_PREFIX : DOCUMENT_PREFIX;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => prefix + t);
    const output = await ext(batch, { pooling: "mean", normalize: true });
    const nested: number[][] = output.tolist();
    results.push(...nested);
  }

  return results;
}
