/**
 * Phase 2 — Forced-JSON claims envelope + chunk_id validation.
 *
 * Parses a trailing ```claims-json fenced block from the agent's final
 * response, verifies every cited chunk_id was actually returned by a
 * `search` tool call this conversation, and produces an auto-retry
 * nudge when citations are invalid.
 *
 * Pure module: no DB, no LLM, no Node APIs beyond stdlib. Imported by
 * both the production agent loop (src/app/api/team/route.ts) and the
 * eval harness (scripts/eval-models.ts).
 */

export interface Claim {
  text: string;
  chunk_ids: string[];
}

export interface ClaimsEnvelope {
  claims: Claim[];
}

export interface ExtractResult {
  /** Raw inner text of the claims-json fenced block (or "" if no block found). */
  raw: string;
  /** Parsed + schema-checked envelope, or null if extraction/parse/schema failed. */
  parsed: ClaimsEnvelope | null;
  /** Short description of why parsing failed. Undefined on success. */
  parseError?: string;
}

export interface ValidateResult {
  /** True iff every chunk_id in every claim appeared in seenChunkIds AND claims.length >= 1. */
  valid: boolean;
  /** chunk_ids cited by the agent that were NOT in seenChunkIds. */
  invalidIds: string[];
  /** Total count of chunk_ids across all claims (including duplicates). */
  totalCited: number;
  /** Count of chunk_ids that were in seenChunkIds. */
  validCited: number;
}

// Fenced-block fallbacks: prefer claims-json, tolerate hyphen/underscore/drop.
const BLOCK_PATTERNS = [
  /```claims-json\s*([\s\S]*?)```/gi,
  /```claims_json\s*([\s\S]*?)```/gi,
  /```claims\s*([\s\S]*?)```/gi,
];

/** Find the LAST matching fenced block (models often emit drafts first). */
function lastMatch(text: string, re: RegExp): string | null {
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) last = m;
  return last ? last[1] : null;
}

/** Conservative Gemma JSON-repair layer — only the cheap, safe fixes. */
function repairJson(s: string): string {
  let out = s.trim();
  // Strip "thought" / "Thought:" prefixes that some Gemma builds emit.
  out = out.replace(/^(?:thought\s*:?\s*)/i, "").trim();
  // Unwrap accidental double braces: {{...}} → {...}
  if (out.startsWith("{{") && out.endsWith("}}")) out = out.slice(1, -1);
  // Remove trailing commas before } or ]
  out = out.replace(/,(\s*[}\]])/g, "$1");
  return out;
}

function isClaimsEnvelope(v: unknown): v is ClaimsEnvelope {
  if (!v || typeof v !== "object") return false;
  const obj = v as { claims?: unknown };
  if (!Array.isArray(obj.claims)) return false;
  return obj.claims.every(
    (c) =>
      c &&
      typeof c === "object" &&
      typeof (c as Claim).text === "string" &&
      Array.isArray((c as Claim).chunk_ids) &&
      (c as Claim).chunk_ids.every((id) => typeof id === "string"),
  );
}

export function extractClaimsBlock(text: string): ExtractResult {
  let raw = "";
  for (const pat of BLOCK_PATTERNS) {
    const m = lastMatch(text, pat);
    if (m !== null) {
      raw = m;
      break;
    }
  }
  if (!raw) return { raw: "", parsed: null, parseError: "no-block" };

  const repaired = repairJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch (e) {
    return { raw, parsed: null, parseError: `json-parse: ${(e as Error).message}` };
  }
  if (!isClaimsEnvelope(parsed)) {
    return { raw, parsed: null, parseError: "schema" };
  }
  return { raw, parsed };
}

export function validateCitations(
  claims: Claim[],
  seenChunkIds: Set<string>,
): ValidateResult {
  const invalidIds: string[] = [];
  let totalCited = 0;
  let validCited = 0;
  for (const c of claims) {
    for (const id of c.chunk_ids) {
      totalCited++;
      if (seenChunkIds.has(id)) validCited++;
      else invalidIds.push(id);
    }
  }
  const valid = claims.length >= 1 && invalidIds.length === 0;
  return { valid, invalidIds, totalCited, validCited };
}

// Cap the valid-id enumeration to avoid context bloat on long sessions; 50
// IDs × ~20 chars each ≈ 1k tokens. Typical turns see 10-25 results.
const MAX_VALID_IDS_IN_NUDGE = 50;

function formatValidIdsList(seenChunkIds: Set<string>): string {
  const all = Array.from(seenChunkIds);
  if (all.length === 0) return "(none — no `search` tool calls have returned results yet)";
  const shown = all.slice(0, MAX_VALID_IDS_IN_NUDGE).map((id) => `\`${id}\``).join(", ");
  const tail = all.length > MAX_VALID_IDS_IN_NUDGE
    ? ` (+${all.length - MAX_VALID_IDS_IN_NUDGE} more)`
    : "";
  return shown + tail;
}

export function formatValidationNudge(
  invalidIds: string[],
  seenChunkIds: Set<string>,
): string {
  const validList = formatValidIdsList(seenChunkIds);
  if (invalidIds.length === 0) {
    return `Your response is missing a \`claims-json\` block, or its \`claims\` array is empty. Look at your prose above: any statement of fact you drew from a \`search\` tool result (usage %, win rates, teammates, rosters, tier-list rankings, mechanics citations, creator opinions) MUST appear as a claim with the chunk_id(s) from the search results that supported it. Re-emit your full response with a trailing \`\`\`claims-json fenced block that includes every search-backed factual claim. An empty \`claims\` array is only appropriate when you genuinely made no search-backed claims (e.g. a pure stylistic reply).\n\n**Valid chunk_ids you received this conversation — you MUST pick from this set:** ${validList}`;
  }
  const preview = invalidIds.slice(0, 5).map((id) => `\`${id}\``).join(", ");
  const invalidTail = invalidIds.length > 5 ? ` (+${invalidIds.length - 5} more)` : "";
  return `Your claims-json cites chunk_id(s) ${preview}${invalidTail} that were NOT returned by any \`search\` tool call in this conversation. Replace each invalid chunk_id with one you actually received, or rewrite the claim to match a chunk_id you do have. Re-emit your full response with an updated claims-json block. Do not invent chunk_ids. Do not collapse to \`{"claims": []}\` just to avoid the validator — ground the claim properly.\n\n**Valid chunk_ids you received this conversation — you MUST pick from this set:** ${validList}`;
}

/**
 * Collect chunk_ids from a raw tool-result string (stringified JSON returned
 * by executeSearch / executeSearchRealRag / executeSearchStub). Defensively
 * handles malformed JSON and missing fields.
 */
export function collectChunkIdsFromSearchResult(resultJson: string): string[] {
  try {
    const obj = JSON.parse(resultJson) as { results?: Array<{ id?: unknown }> };
    if (!obj || !Array.isArray(obj.results)) return [];
    return obj.results
      .map((r) => (typeof r?.id === "string" ? r.id : null))
      .filter((id): id is string => id !== null);
  } catch {
    return [];
  }
}
