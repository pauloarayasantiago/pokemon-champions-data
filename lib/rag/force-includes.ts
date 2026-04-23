// Force-include blocks — inject specific chunks into the candidate pool
// outside the hybrid RPC. Guarantees that chunks the boost layer is
// calibrated to promote (rules doc, phantom sections, vsPair primaries,
// banned-item bullets, exact-entity rows) actually appear in the pool.
//
// Extraction of six blocks from lib/rag.ts plus the exact-entity block.
// Phase 5 (executor redesign) will re-call this against the ORIGINAL query
// after sub-query merge so the Stage 4.6 invariant holds under planner
// decomposition. Keep the signature stable: (question, intent, route,
// supabase) → Map<id, ForcedChunk> with first-seen base scores preserved.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPokemonTypes, type QueryIntent } from "./classify.js";
import type { QueryRoute } from "./route.js";

export interface ForcedChunk {
  row: Record<string, unknown>;
  /** Base score applied when the row is NOT already in the RPC pool. */
  baseScore: number;
}

export async function collectForceIncludes(
  question: string,
  intent: QueryIntent,
  route: QueryRoute,
  supabase: SupabaseClient,
): Promise<Map<string, ForcedChunk>> {
  const forced = new Map<string, ForcedChunk>();
  const add = (rows: Record<string, unknown>[], baseScore: number): void => {
    for (const row of rows) {
      const id = row.id as string;
      if (!forced.has(id)) forced.set(id, { row, baseScore });
    }
  };

  // 1. Rules doc mechanic keywords. Force-include champions_rules.md chunks
  //    when the query asks about mechanic changes / bans. The rules doc is an
  //    authoritative delta list from S/V, but its chunks tend to dense-match
  //    many transcripts in FTS and fall outside the RRF fetch pool. Inject
  //    them directly so the rerank boost can place them.
  if (/\b(change|changed|differ|different|differently|banned|unavailable|missing|nerf|nerfed|how does)\b/i.test(question)) {
    // Extract content words (drop stopwords & short tokens) and OR-join them
    // for a loose FTS match against the rules doc. websearch parsing of the
    // raw question too often yields zero hits because every token must match.
    const stop = new Set(["how","does","what","when","where","which","who","work","works","the","and","for","with","from","are","was","were","been","this","that","these","those","but","not","you","your","their","our","champions","champion","in","on","of","to","is","it","a","an","do","did"]);
    const terms = question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stop.has(w));
    if (terms.length > 0) {
      const { data: rulesRows } = await supabase
        .from("pc_chunks")
        .select("*")
        .eq("source", "data/knowledge/champions_rules.md")
        .textSearch("text_tsv", terms.join(" | "), { config: "english" })
        .limit(5);
      add((rulesRows ?? []) as Record<string, unknown>[], 0.08);
    }
  }

  // 2. Phantom pre-evolution section. Adversarial queries that name a
  //    pre-evolution not in Champions (e.g. "Scyther EV spread") should
  //    always surface the rules doc's "Phantom Pre-Evolutions" section.
  //    FTS on the phantom name against that single file is a guaranteed hit.
  if (route.phantomName) {
    const { data: phantomRows } = await supabase
      .from("pc_chunks")
      .select("*")
      .eq("source", "data/knowledge/champions_rules.md")
      .textSearch("text_tsv", route.phantomName, { config: "english" })
      .limit(3);
    add((phantomRows ?? []) as Record<string, unknown>[], 0.10);
  }

  // 3. Evolved-form co-surface. When the user names a pre-evolution
  //    (Litwick), also inject the evolved-form Pokemon chunk (Chandelure)
  //    so they get a directly actionable answer alongside the rules doc.
  if (route.phantomEvolved) {
    const { data: evoRows } = await supabase
      .from("pc_chunks")
      .select("*")
      .eq("id", `pokemon:${route.phantomEvolved}`);
    add((evoRows ?? []) as Record<string, unknown>[], 0.09);
  }

  // 4. vsPair primaries. For A-vs-B queries, the weaker side can fall
  //    outside the RPC candidate pool (embedding signal collapses to one
  //    Pokemon). Guarantee both primary chunks by fetching the
  //    pokemon_champions.csv row for each name directly (case-insensitive
  //    ilike against CamelCase pokemon_name).
  if (route.vsPair) {
    const [aName, bName] = route.vsPair;
    const { data: vsRows } = await supabase
      .from("pc_chunks")
      .select("*")
      .eq("source", "pokemon_champions.csv")
      .or(`pokemon_name.ilike.${aName},pokemon_name.ilike.${bName}`)
      .limit(4);
    add((vsRows ?? []) as Record<string, unknown>[], 0.08);
  }

  // 5. type_chart force-include on vsPair (Stage 4.6 P3). Matchup queries
  //    name Pokemon, not types, so type_chart.md sub-chunks frequently miss
  //    the RPC pool even though the vsPair boost (in applyBoosts) is ready
  //    to lift them. Translate each side's types via getPokemonTypes() and
  //    fetch up to 6 type_chart rows whose heading matches any type
  //    (offensive + defensive sections per type).
  if (route.vsPair) {
    const [aName, bName] = route.vsPair;
    const types = [...getPokemonTypes(aName), ...getPokemonTypes(bName)]
      .map((t) => t.toLowerCase())
      .filter((t, i, arr) => arr.indexOf(t) === i);
    if (types.length > 0) {
      const orClause = types.map((t) => `metadata->>heading.ilike.%${t}%`).join(",");
      const { data: typeRows } = await supabase
        .from("pc_chunks")
        .select("*")
        .eq("source", "data/knowledge/type_chart.md")
        .or(orClause)
        .limit(6);
      add((typeRows ?? []) as Record<string, unknown>[], 0.07);
    }
  }

  // 6. Exact-entity force-include. When the query names a specific move /
  //    item / strategic Pokemon, the RPC can still rank that chunk outside
  //    top-10 if FTS matches noisier long-form chunks (e.g. "Fake Out
  //    restriction Champions" → transcripts hit all 4 terms while
  //    move:fake-out hits only 2). Force-include by id.
  const entityIds: string[] = [];
  if (intent.moveName) entityIds.push(`move:${intent.moveName.replace(/\s+/g, "-")}`);
  if (intent.itemName) entityIds.push(`item:${intent.itemName.replace(/\s+/g, "-")}`);
  // Strategic Pokemon queries (counter / matchup / "pivots into") — fetch
  // the Pokemon row so it can co-surface with theory docs.
  if (intent.pokemonName && (intent.isCounterQuery || intent.isMatchupQuery)) {
    entityIds.push(`pokemon:${intent.pokemonName.replace(/\s+/g, "-")}`);
  }
  if (entityIds.length > 0) {
    const { data: entityRows } = await supabase
      .from("pc_chunks")
      .select("*")
      .in("id", entityIds);
    add((entityRows ?? []) as Record<string, unknown>[], 0.08);
  }

  // 7. Adversarial banned-item force-include (Stage 4.6 P2). The rulesResults
  //    trigger (block 1) only fires on mechanic-change keywords and misses
  //    natural queries like "Life Orb best Pokemon for damage boost" that
  //    name a banned item without using any of those words. Fetch every
  //    banned-item bullet (~23 rows) and filter in-memory by whether the
  //    question text contains any of its entries. Rank-1 comes from the
  //    +0.15 boost in applyBoosts; baseline 0.08 puts the chunk in the pool.
  {
    const { data: bannedRows } = await supabase
      .from("pc_chunks")
      .select("*")
      .eq("source", "data/knowledge/champions_rules.md")
      .filter("metadata->>list_kind", "eq", "banned-item");
    const qLower = question.toLowerCase();
    const matching = ((bannedRows ?? []) as Record<string, unknown>[]).filter((r) => {
      const entries = (r.metadata as { entries?: unknown })?.entries;
      if (!Array.isArray(entries)) return false;
      return entries.some(
        (e) => typeof e === "string" && qLower.includes(e.toLowerCase()),
      );
    });
    add(matching, 0.08);
  }

  return forced;
}
