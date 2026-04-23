import { extractTypes, extractStatConditions } from "../structured-query.js";
import { supabaseServer } from "../supabase.js";

export async function runStructuredFilter(
  question: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const types = extractTypes(question);
  const stats = extractStatConditions(question);
  if (types.length === 0 && stats.length === 0) return [];

  let q = supabaseServer().from("pc_chunks").select("*");

  if (types.length > 0) {
    // Each type expands to "(col_type1=X OR col_type2=X)". Multiple types → AND of those.
    // supabase-js .or() only unions within one call, so chain per type via .or().
    for (const t of types) {
      q = q.or(`col_type1.eq.${t},col_type2.eq.${t}`);
    }
  }
  for (const c of stats) {
    if (c.operator === ">=") q = q.gte(c.column, c.value);
    else q = q.lte(c.column, c.value);
  }
  q = q.not("pokemon_name", "is", null).limit(limit);

  const { data, error } = await q;
  if (error) {
    console.error("Structured query failed:", error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}
