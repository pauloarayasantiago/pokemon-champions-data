import { createHash } from "node:crypto";

// Read lazily — scripts/eval-models.ts loads .env manually AFTER module init,
// so capturing this at top-level gives undefined.
const getJinaKey = () => process.env.JINA_API_KEY;
const JINA_URL = "https://api.jina.ai/v1/rerank";
const JINA_MODEL = "jina-reranker-v2-base-multilingual";
const JINA_TIMEOUT_MS = 4000;
const RERANK_POOL = 40;

const cache = new Map<string, Map<string, number>>();
const CACHE_MAX = 200;

function cacheKey(query: string, ids: string[]): string {
  const normalized = query.trim().toLowerCase();
  const sortedIds = [...ids].sort().join(",");
  return createHash("sha256").update(`${normalized}\u2016${sortedIds}`).digest("hex");
}

interface JinaResult {
  index: number;
  relevance_score: number;
}

interface JinaResponse {
  results: JinaResult[];
}

/**
 * Rerank the top candidates with Jina Reranker v2, returning a map of
 * candidate id → relevance score in [0, 1]. Only the first RERANK_POOL
 * (40) candidates are scored — the rest keep their RRF score (scaled
 * into [0, 1] downstream).
 *
 * Returns null on any failure (missing key, timeout, non-OK response) so
 * callers can fall back to the pre-rerank RRF ordering without blocking.
 */
export async function rerankCandidates(
  query: string,
  candidates: Array<{ id: string; text: string }>,
): Promise<Map<string, number> | null> {
  const apiKey = getJinaKey();
  if (!apiKey) return null;
  if (candidates.length === 0) return new Map();

  const pool = candidates.slice(0, RERANK_POOL);
  const ids = pool.map((c) => c.id);
  const key = cacheKey(query, ids);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(JINA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: JINA_MODEL,
        query,
        documents: pool.map((c) => c.text),
        top_n: pool.length,
        return_documents: false,
      }),
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[rerank] Jina ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as JinaResponse;
    const scores = new Map<string, number>();
    for (const r of data.results ?? []) {
      const c = pool[r.index];
      if (c) scores.set(c.id, r.relevance_score);
    }

    if (cache.size >= CACHE_MAX) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(key, scores);
    return scores;
  } catch (e) {
    console.error(`[rerank] Jina failed: ${(e as Error).message}`);
    return null;
  }
}

export { RERANK_POOL };
