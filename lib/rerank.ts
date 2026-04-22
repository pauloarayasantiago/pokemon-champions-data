import { createHash } from "node:crypto";

// Read lazily — scripts/eval-models.ts loads .env manually AFTER module init,
// so capturing these at top-level gives undefined.
const getJinaKey = () => process.env.JINA_API_KEY;
const getOpenRouterKey = () => process.env.OPENROUTER_API_KEY;
const getHfToken = () => process.env.HF_TOKEN;

const JINA_URL = "https://api.jina.ai/v1/rerank";
const JINA_MODEL = "jina-reranker-v2-base-multilingual";
const JINA_TIMEOUT_MS = 4000;
const RERANK_POOL = 40;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMMA_MODEL = "google/gemma-4-26b-a4b-it";
const GEMMA_TIMEOUT_MS = 20000;
const GEMMA_CONCURRENCY = 10;
const GEMMA_SNIPPET_CHARS = 800;

const HF_RERANKER_MODEL = "BAAI/bge-reranker-base";
const HF_RERANKER_URL = `https://router.huggingface.co/hf-inference/models/${HF_RERANKER_MODEL}/pipeline/text-classification`;
const HF_RERANKER_TIMEOUT_MS = 20000;
const HF_RERANKER_SNIPPET_CHARS = 1500;

const cache = new Map<string, Map<string, number>>();
const gemmaCache = new Map<string, Map<string, number>>();
const ceCache = new Map<string, Map<string, number>>();
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

// === Phase 3: Gemma pointwise reranker (OpenRouter) ===

interface OpenRouterChoice {
  message?: { content?: string };
}
interface OpenRouterChatResponse {
  choices?: OpenRouterChoice[];
}

const GEMMA_SYSTEM_PROMPT =
  "You score how relevant a passage is to a query for a Pokémon competitive Q&A system. " +
  'Output ONLY valid JSON in this exact format: {"score": X} where X is a number between 0.0 (irrelevant) and 1.0 (perfectly relevant). ' +
  "No prose, no explanation.";

function parseGemmaScore(content: string | undefined | null): number {
  if (!content) return 0.5;
  const stripped = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(stripped) as { score?: unknown };
    if (typeof parsed.score === "number" && Number.isFinite(parsed.score)) {
      return Math.max(0, Math.min(1, parsed.score));
    }
  } catch {
    // fall through to regex
  }
  const m = stripped.match(/-?\d+(?:\.\d+)?/);
  if (m) {
    const n = parseFloat(m[0]);
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  }
  return 0.5;
}

async function scoreOneCandidate(
  apiKey: string,
  query: string,
  text: string,
): Promise<number | null> {
  // Manual AbortController + clearTimeout (NOT AbortSignal.timeout) — avoids
  // the unhandled DOMException race documented in errors.md row 39.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMMA_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://champions-vgc.local",
        "X-Title": "Champions VGC",
      },
      body: JSON.stringify({
        model: GEMMA_MODEL,
        messages: [
          { role: "system", content: GEMMA_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Query: ${query}\n\nPassage: ${text.slice(0, GEMMA_SNIPPET_CHARS)}`,
          },
        ],
        temperature: 0,
        max_tokens: 16,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[rerank] Gemma ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as OpenRouterChatResponse;
    return parseGemmaScore(data.choices?.[0]?.message?.content);
  } catch (e) {
    console.error(`[rerank] Gemma call failed: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Rerank the top RERANK_POOL candidates with Gemma 4 26B over OpenRouter.
 * Pointwise: each candidate gets its own LLM call, so a single bad response
 * defaults to 0.5 (neutral) instead of poisoning the whole rerank.
 *
 * Bounded concurrency (GEMMA_CONCURRENCY=10) keeps wall time within Vercel's
 * search-route 30s budget while respecting OpenRouter rate limits.
 *
 * Returns null when ALL candidates failed (so the caller falls back to RRF
 * + boosts). Partial failures default to 0.5 per candidate.
 */
export async function rerankWithGemma(
  query: string,
  candidates: Array<{ id: string; text: string }>,
): Promise<Map<string, number> | null> {
  const rawKey = getOpenRouterKey();
  if (!rawKey) return null;
  if (candidates.length === 0) return new Map();
  const apiKey: string = rawKey;

  const pool = candidates.slice(0, RERANK_POOL);
  const ids = pool.map((c) => c.id);
  const key = cacheKey(query, ids);
  const cached = gemmaCache.get(key);
  if (cached) return cached;

  const scores = new Map<string, number>();
  let nextIdx = 0;
  let okCount = 0;

  // Inline N-slot worker pool. JS is single-threaded so the synchronous
  // nextIdx++ is safe even though several workers may be in-flight.
  async function worker(): Promise<void> {
    while (true) {
      const i = nextIdx++;
      if (i >= pool.length) return;
      const c = pool[i];
      const score = await scoreOneCandidate(apiKey, query, c.text);
      if (score === null) {
        scores.set(c.id, 0.5);
      } else {
        scores.set(c.id, score);
        okCount++;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(GEMMA_CONCURRENCY, pool.length) },
    worker,
  );
  await Promise.all(workers);

  if (okCount === 0) return null;

  if (gemmaCache.size >= CACHE_MAX) {
    const firstKey = gemmaCache.keys().next().value;
    if (firstKey) gemmaCache.delete(firstKey);
  }
  gemmaCache.set(key, scores);
  return scores;
}

// === Phase 3 (revised): Cross-encoder reranker (BGE via HF Inference) ===
//
// Pivot from Gemma after the 2026-04-22 retrieval eval (snapshot
// `retrieval-2026-04-22T03-52-48-886Z.json`) showed Gemma's pointwise
// scoring overcompresses the 0–1 range — scores cluster in 0.4–0.7 with no
// real discrimination between "is the answer" and "mentions the topic".
// matchup nDCG dropped 0.741 → 0.629, move 0.995 → 0.876.
//
// Cross-encoders give the sharp 0.95-vs-0.05 spread the boost layer was
// calibrated for (same shape Jina produced). Free via HF Inference.

interface HfClassificationLabel {
  label: string;
  score: number;
}

/**
 * Rerank the top RERANK_POOL candidates with a cross-encoder over HF
 * Inference. One batched HTTP call scores all candidates in a single
 * request (HF text-classification pipeline accepts an `inputs` array).
 *
 * Returns null on missing token / timeout / non-OK response so the caller
 * falls back to pre-rerank RRF + boosts (same null-fallback contract as
 * the Jina and Gemma paths).
 */
export async function rerankWithCrossEncoder(
  query: string,
  candidates: Array<{ id: string; text: string }>,
): Promise<Map<string, number> | null> {
  const token = getHfToken();
  if (!token) return null;
  if (candidates.length === 0) return new Map();

  const pool = candidates.slice(0, RERANK_POOL);
  const ids = pool.map((c) => c.id);
  const key = cacheKey(query, ids);
  const cached = ceCache.get(key);
  if (cached) return cached;

  const inputs = pool.map((c) => ({
    text: query,
    text_pair: c.text.slice(0, HF_RERANKER_SNIPPET_CHARS),
  }));

  // Manual AbortController + clearTimeout (avoids the AbortSignal.timeout
  // DOMException race documented in errors.md row 39).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HF_RERANKER_TIMEOUT_MS);
  try {
    const res = await fetch(HF_RERANKER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(
        `[rerank] HF cross-encoder ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
      return null;
    }
    // Response shape: Array<Array<{label, score}>> — one inner array per
    // input pair, each containing one label (single-label classifier).
    const data = (await res.json()) as Array<HfClassificationLabel[] | HfClassificationLabel>;
    const scores = new Map<string, number>();
    for (let i = 0; i < pool.length; i++) {
      const item = data[i];
      const label = Array.isArray(item) ? item[0] : item;
      if (label && typeof label.score === "number" && Number.isFinite(label.score)) {
        scores.set(pool[i].id, Math.max(0, Math.min(1, label.score)));
      } else {
        scores.set(pool[i].id, 0.5);
      }
    }
    if (ceCache.size >= CACHE_MAX) {
      const firstKey = ceCache.keys().next().value;
      if (firstKey) ceCache.delete(firstKey);
    }
    ceCache.set(key, scores);
    return scores;
  } catch (e) {
    console.error(`[rerank] HF cross-encoder failed: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { RERANK_POOL };
