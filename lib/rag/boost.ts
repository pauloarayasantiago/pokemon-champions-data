// Domain-specific boost layer. Applies additive score adjustments to the
// candidate pool, calibrated to RRF's ~0.02-0.035 scale.
//
// Fifteen boost categories: tier baselines (knowledge/team/usage/
// transcript/matchup/older-reference), structured-result priority, usage-
// intent, exact entity (pokemon/move/item/mega), matchup-data for counter/
// matchup intents, knowledge-doc for strategic intents, rules-doc mechanic
// lift, adversarial banned-item rank-1 lift, theory-route, archetype match,
// vsPair primary + type_chart, phantom-section, phantom-evolved co-surface,
// speed-tiers doc, core-WR NL (A7), item-intent, team-intent usage/team
// lift, project-doc penalty.
//
// Note: a `boostMul` multiplier previously lived here to scale additive
// boosts when an active reranker pushed candidate scores into [0, 1]. The
// three reranker clients (Jina, Gemma pointwise, BGE cross-encoder) were
// permanently retired after Phase 3's marginal-ROI verdict; the multiplier
// and all reranker plumbing were dropped. If re-introducing a reranker
// later, plumb `boostMul` back through applyBoosts().

import type { QueryIntent } from "./classify.js";
import type { QueryRoute } from "./route.js";

export interface BoostCandidate {
  id: string;
  text: string;
  source: string;
  score: number;
  sourceType: string;
  dataCategory: string;
  metadata: Record<string, unknown>;
  isStructuredResult: boolean;
}

export function applyBoosts(
  candidates: BoostCandidate[],
  intent: QueryIntent,
  route: QueryRoute,
  question: string,
): BoostCandidate[] {
  return candidates.map((r) => {
    let boost = 0;
    const isUsageChunk = r.dataCategory === "usage";
    const isKnowledgeChunk = r.dataCategory === "knowledge";
    const isTeamChunk = r.dataCategory === "team";
    const isTranscriptChunk = r.dataCategory === "transcript";
    const isMatchupChunk = r.dataCategory === "matchup";
    const isOlderReference = r.source === "data/knowledge/validation_notes.md";

    // Tier baselines. Knowledge docs (curated strategy) ride above the data
    // tiers when relevant — but only when the query isn't a pure entity
    // lookup (e.g. "Mega Dragonite"), otherwise generic knowledge docs
    // displace the specific Pokemon/mega chunk.
    const isStrategicIntent =
      intent.isCounterQuery || intent.isMatchupQuery || intent.hasTeamKeyword;
    const isEntityLookup =
      (intent.pokemonName || intent.moveName || intent.itemName) && !isStrategicIntent;

    // Small tier nudges — meant to break ties between equally-relevant
    // chunks, not override quality. Intent-specific boosts (below) do the
    // heavy lifting.
    if (isKnowledgeChunk && !isEntityLookup) boost += 0.020;
    else if (isTeamChunk && intent.hasTeamKeyword) boost += 0.010;
    else if (isUsageChunk && (intent.hasTeamKeyword || intent.isUsageQuery)) boost += 0.007;
    else if (isTranscriptChunk) boost += 0.003;
    else if (isMatchupChunk && !(intent.isCounterQuery || intent.isMatchupQuery)) boost -= 0.003;
    if (isOlderReference) boost -= 0.02;

    // Demote team chunks on non-team queries so tournament pastes don't
    // crowd entity/mechanic/strategic lookups.
    if (isTeamChunk && !intent.hasTeamKeyword) boost -= 0.015;

    // Structured results get priority (they matched SQL stat filters exactly)
    if (r.isStructuredResult) {
      boost += 0.1;
    }

    // Usage intent + matching Pokemon
    if (isUsageChunk && intent.isUsageQuery && intent.pokemonName) {
      const chunkPokemon = (r.metadata.pokemon as string)?.toLowerCase();
      if (chunkPokemon === intent.pokemonName) boost += 0.1;
    }

    // General usage intent
    if (isUsageChunk && intent.isUsageQuery && !intent.pokemonName) {
      boost += 0.05;
    }

    // Exact Pokemon name match
    if (intent.pokemonName) {
      const chunkName = (r.metadata.name as string)?.toLowerCase();
      const chunkPokemon = (typeof r.metadata.pokemon === "string")
        ? r.metadata.pokemon.toLowerCase()
        : undefined;
      if (chunkName === intent.pokemonName || chunkPokemon === intent.pokemonName) {
        boost += 0.04;
      }
      // Mega chunks carry metadata like `base_pokemon: "Meganium"` and
      // `mega_name: "Mega Meganium"`. Match those so "Mega Meganium ability"
      // surfaces the mega row.
      else if (r.dataCategory === "mega") {
        const basePokemon = (r.metadata.base_pokemon as string)?.toLowerCase();
        const megaName = (r.metadata.mega_name as string)?.toLowerCase();
        if (basePokemon === intent.pokemonName || megaName?.includes(intent.pokemonName) ||
            chunkPokemon?.includes(intent.pokemonName)) {
          boost += 0.04;
        }
      }
    }

    // Exact move name match — boost the specific move chunk
    if (intent.moveName && r.dataCategory === "move") {
      const chunkName = (r.metadata.name as string)?.toLowerCase();
      if (chunkName === intent.moveName) {
        boost += 0.04;
      }
    }

    // Exact item name match — boost the specific item chunk
    if (intent.itemName && r.dataCategory === "item") {
      const chunkName = (r.metadata.name as string)?.toLowerCase();
      if (chunkName === intent.itemName) {
        boost += 0.04;
      }
    }

    // Matchup data boost for counter/matchup queries. Keep modest so
    // matchup_matrix.csv rows don't monopolize all 10 slots on counter
    // queries where a curated knowledge doc is the better answer.
    if (r.dataCategory === "matchup" && (intent.isCounterQuery || intent.isMatchupQuery)) {
      boost += 0.03;
      // Extra boost if matching Pokemon name
      if (intent.pokemonName) {
        const chunkPokemon = (r.metadata.pokemon as string)?.toLowerCase();
        if (chunkPokemon === intent.pokemonName) boost += 0.06;
      }
    }

    // Knowledge docs boost for strategic query types.
    //  - Counter/matchup: curated knowledge usually beats a matchup-matrix slice.
    //  - Team queries without a Pokemon name: strategic doc beats team rows.
    //  - Team queries *with* a Pokemon name (e.g. "partners for Gengar"):
    //    the user wants concrete team/usage data, so don't crowd those out.
    if (isKnowledgeChunk) {
      if (intent.isCounterQuery || intent.isMatchupQuery) boost += 0.04;
      else if (intent.hasTeamKeyword && !intent.pokemonName) boost += 0.04;
      else if (intent.hasTeamKeyword) boost += 0.025;
    }

    // Rules/format docs: boost champions_rules.md when the query is about
    // mechanic *changes* (the rules doc summarizes every S/V delta).
    const isRulesDoc = r.source === "data/knowledge/champions_rules.md";
    if (isRulesDoc && /\b(change|changed|differ|different|differently|banned|unavailable|missing|nerf|nerfed|how does)\b/i.test(question)) {
      boost += 0.035;
    }

    // Stage 4.6 P2: adversarial banned-item rank-1 boost. When the query
    // names an item in a banned-item bullet's metadata.entries, lift that
    // per-bullet chunk +0.15 so it clears the RPC top-tier band (~0.10) and
    // wins rank-1. Restricted to list_kind === "banned-item" (NOT
    // phantom-pre-evo — those queries expect the evolved Pokemon chunk at
    // rank-1 per golden set, handled by the phantomEvolved boost above).
    if (r.metadata.list_kind === "banned-item" && Array.isArray(r.metadata.entries)) {
      const entries = r.metadata.entries as unknown[];
      const qLower = question.toLowerCase();
      const hit = entries.some((e) =>
        typeof e === "string" && qLower.includes(e.toLowerCase())
      );
      if (hit) boost += 0.15;
    }

    // Stage 6.1 routing boosts. When routeQuery() classifies the question
    // as "theory", lift the three curated strategy docs (team_building_theory,
    // team_archetypes, type_chart). When an archetype token is detected,
    // give team_archetypes.md an extra bump and lift tournament-team chunks
    // whose text mentions that archetype. For A-vs-B comparisons, boost
    // both Pokemon chunks and the type chart.
    if (route.route === "theory") {
      const theorySources = new Set([
        "data/knowledge/team_building_theory.md",
        "data/knowledge/team_archetypes.md",
        "data/knowledge/type_chart.md",
      ]);
      if (theorySources.has(r.source)) boost += 0.025;
    }
    if (route.archetype) {
      const archLower = route.archetype;
      const textLower = r.text.toLowerCase();
      if (r.source === "data/knowledge/team_archetypes.md" && textLower.includes(archLower)) {
        boost += 0.025;
      }
      if (isTeamChunk && textLower.includes(archLower)) {
        boost += 0.02;
      }
    }
    if (route.vsPair) {
      const [aName, bName] = route.vsPair;
      // metadata.pokemon may be a string (Pokemon/mega chunks) or an array
      // (tournament-team chunks); guard against the array shape.
      const pickStr = (v: unknown): string | undefined =>
        typeof v === "string" ? v.toLowerCase() : undefined;
      const chunkPokemon = pickStr(r.metadata.pokemon)
        ?? pickStr(r.metadata.name)
        ?? pickStr(r.metadata.base_pokemon);
      // +0.12 for the primary Pokemon rows: force-included rows enter with
      // rrf_score=0 so the bump must clear the RPC top-tier band (~0.10) to
      // guarantee both chunks land in top-10. Dragonite-side rows already
      // high in the pool won't over-rank because type_chart+theory boosts
      // still sum higher.
      if (chunkPokemon === aName || chunkPokemon === bName) boost += 0.12;
      // Team chunks listing both names are valuable supporting evidence.
      if (Array.isArray(r.metadata.pokemon)) {
        const arr = (r.metadata.pokemon as unknown[]).map((x) =>
          typeof x === "string" ? x.toLowerCase() : "",
        );
        const hasA = arr.includes(aName);
        const hasB = arr.includes(bName);
        if (hasA && hasB) boost += 0.04;
      }
      if (r.source === "data/knowledge/type_chart.md") boost += 0.02;
    }
    if (
      route.phantomName &&
      isRulesDoc &&
      !r.metadata.list_kind &&
      r.text.toLowerCase().includes(route.phantomName)
    ) {
      // +0.12 same reasoning — phantom section chunk is force-included and
      // needs enough lift to clear the RPC top band. Narrowed to non-bullet
      // chunks (!list_kind): per-bullet phantom sub-chunks from Stage 4.3
      // already have strong lexical match + 0.10 force-include floor, so
      // piling +0.12 on top displaces the grade-3 evolved Pokemon chunk from
      // rank-1 on adv-kirlia-phantom et al.
      boost += 0.12;
    }
    // Evolved-form co-surface: lift the Pokemon chunk matching the phantom
    // pre-evo's evolved form (e.g. Chandelure for Litwick query). Must exceed
    // the +0.12 phantomName+isRulesDoc boost above so the grade-3 evolved form
    // wins rank-1 over the grade-2 rules-phantom bullet on counter-tagged
    // adversarial queries (adv-kirlia, adv-scyther, adv-sneasel, adv-gligar).
    if (route.phantomEvolved && r.dataCategory === "pokemon") {
      const chunkName = (r.metadata.name as string)?.toLowerCase();
      if (chunkName === route.phantomEvolved) boost += 0.14;
    }

    // Speed tiers doc: boost on any speed-benchmark question
    const isSpeedTiers = r.source === "data/knowledge/speed_tiers.md";
    if (isSpeedTiers && /\b(speed tier|speed tiers|outspeed|outspeeds|faster than|slower than)\b/i.test(question)) {
      boost += 0.035;
    }

    // A7 — "X + Y core win rate" NL queries. Meta_snapshot owns the top-cores
    // table but loses to team_archetypes under theory-route + archetype boosts
    // (~+0.05 differential). Lift meta_snapshot over archetype docs when the
    // query is explicitly asking about core win rates. Calibrated to clear the
    // theory+archetype+tier stack (~+0.07) and land in top-3.
    const isMetaSnapshot = r.source === "data/knowledge/meta_snapshot.md";
    if (isMetaSnapshot && /\bcore\b/i.test(question) && /\b(win rate|winrate|wr)\b/i.test(question)) {
      boost += 0.08;
    }

    // Item chunk boost when query has item intent
    if (r.dataCategory === "item" && intent.hasItemKeyword) {
      boost += 0.03;
    }

    // Team query: boost usage + tournament-team chunks so "partners / pairs with X"
    // surfaces Pikalytics teammates and tournament team rows.
    if (intent.hasTeamKeyword) {
      if (isUsageChunk) boost += 0.03;
      if (isTeamChunk) boost += 0.03;
    }

    // Penalize memory-bank/project docs (rarely what users want)
    if (r.dataCategory === "project") {
      boost -= 0.08;
    }

    return { ...r, score: r.score + boost };
  });
}
