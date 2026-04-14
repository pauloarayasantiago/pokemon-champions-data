/**
 * Evaluation test cases for the RAG search pipeline.
 *
 * Each case defines a query, expected chunk IDs or source patterns that SHOULD
 * appear in the top-K results, and optionally forbidden IDs that MUST NOT appear.
 */

export interface EvalCase {
  /** Human-readable description of what this test verifies */
  description: string;
  /** The search query */
  query: string;
  /** Number of results to retrieve */
  topK: number;
  /**
   * Chunk IDs that SHOULD appear in the top-K results.
   * Uses startsWith matching — e.g. "pokemon:charizard" matches "pokemon:charizard".
   */
  expectedIds: string[];
  /**
   * Chunk IDs that MUST NOT appear in the top-K results.
   * Uses startsWith matching.
   */
  forbiddenIds?: string[];
  /**
   * Source file substrings that SHOULD appear in at least one result.
   * Uses includes matching on the source field.
   */
  expectedSources?: string[];
  /** Category tag for grouping results in the report */
  category: "exact-lookup" | "move-lookup" | "item-lookup" | "counter" | "stat-filter" | "usage" | "strategic" | "mechanic";
}

export const EVAL_CASES: EvalCase[] = [
  // ===== Exact Pokemon Name Lookups =====
  {
    description: "Charizard exact lookup returns Charizard chunk as #1",
    query: "what are Charizard's stats and moves",
    topK: 5,
    expectedIds: ["pokemon:charizard"],
    category: "exact-lookup",
  },
  {
    description: "Garchomp lookup returns Garchomp data",
    query: "Garchomp base stats abilities and movepool",
    topK: 5,
    expectedIds: ["pokemon:garchomp"],
    category: "exact-lookup",
  },
  {
    description: "Incineroar lookup returns Incineroar data",
    query: "Incineroar stats and moves",
    topK: 5,
    expectedIds: ["pokemon:incineroar"],
    category: "exact-lookup",
  },
  {
    description: "Mega Dragonite lookup returns mega chunk",
    query: "Mega Dragonite stats and ability",
    topK: 5,
    expectedIds: ["mega:mega-dragonite"],
    category: "exact-lookup",
  },
  {
    description: "Azumarill lookup returns Azumarill data",
    query: "Azumarill stats abilities and moves",
    topK: 5,
    expectedIds: ["pokemon:azumarill"],
    category: "exact-lookup",
  },

  // ===== Move Lookups =====
  {
    description: "Fake Out mechanics returns Champions-specific knowledge",
    query: "Fake Out mechanics in Champions",
    topK: 5,
    expectedSources: ["team_building_theory.md"],
    category: "mechanic",
  },
  {
    description: "Protect details returns Protect move data",
    query: "how does Protect work in Champions",
    topK: 5,
    expectedIds: ["move:protect"],
    category: "mechanic",
  },
  {
    description: "Earthquake move lookup",
    query: "Earthquake move power type accuracy",
    topK: 5,
    expectedIds: ["move:earthquake"],
    category: "move-lookup",
  },
  {
    description: "Trick Room move lookup",
    query: "Trick Room move details",
    topK: 5,
    expectedIds: ["move:trick-room"],
    category: "move-lookup",
  },

  // ===== Item Lookups =====
  {
    description: "Focus Sash item lookup",
    query: "Focus Sash item effect",
    topK: 5,
    expectedIds: ["item:focus-sash"],
    category: "item-lookup",
  },
  {
    description: "Best items for physical attackers returns item docs",
    query: "best items for physical attackers",
    topK: 5,
    forbiddenIds: ["pokemon:araquanid", "pokemon:blastoise"],
    expectedSources: ["team_building_theory.md", "damage_calc.md"],
    category: "item-lookup",
  },
  {
    description: "Choice Scarf lookup (item exists in Champions)",
    query: "Choice Scarf item effect",
    topK: 5,
    expectedIds: ["item:choice-scarf"],
    category: "item-lookup",
  },

  // ===== Counter / Strategic Queries =====
  {
    description: "Counters to Incineroar should NOT return the move Counter",
    query: "what counters Incineroar in doubles",
    topK: 5,
    forbiddenIds: ["move:counter", "move:double-hit"],
    expectedSources: ["team_building_theory.md"],
    category: "counter",
  },
  {
    description: "How to beat rain teams should return strategy content",
    query: "how to beat rain teams",
    topK: 5,
    expectedSources: ["team_archetypes.md"],
    forbiddenIds: ["move:counter"],
    category: "counter",
  },
  {
    description: "Dealing with Trick Room should return strategy docs",
    query: "how to deal with Trick Room teams",
    topK: 5,
    expectedSources: ["team_archetypes.md"],
    category: "counter",
  },

  // ===== Stat-Based Filtering =====
  {
    description: "Fast Water types should NOT return slow Pokemon",
    query: "fast Water type Pokemon with good special attack",
    topK: 5,
    forbiddenIds: ["pokemon:araquanid", "pokemon:blastoise", "pokemon:clawitzer"],
    category: "stat-filter",
  },
  {
    description: "Slow Pokemon for Trick Room returns speed tier docs",
    query: "slowest Pokemon for Trick Room",
    topK: 5,
    expectedSources: ["speed_tiers.md"],
    category: "stat-filter",
  },
  {
    description: "High attack physical sweepers",
    query: "Pokemon with highest attack stat",
    topK: 5,
    expectedIds: [],
    category: "stat-filter",
  },

  // ===== Usage / Meta Queries =====
  {
    description: "Most used Pokemon returns Pikalytics usage data",
    query: "most used Pokemon in tournaments",
    topK: 5,
    expectedSources: ["pikalytics_usage.csv"],
    category: "usage",
  },
  {
    description: "Garchomp usage stats returns Pikalytics entry",
    query: "Garchomp competitive usage stats top moves items",
    topK: 5,
    expectedIds: ["usage:garchomp"],
    category: "usage",
  },
  {
    description: "Charizard usage stats returns Pikalytics entry",
    query: "Charizard usage rate and common moves",
    topK: 5,
    expectedIds: ["usage:charizard"],
    category: "usage",
  },

  // ===== Strategic / Team Building =====
  {
    description: "Mega Charizard Y team partners returns relevant content",
    query: "best teammates for Mega Charizard Y",
    topK: 5,
    expectedSources: ["pikalytics_usage.csv"],
    category: "strategic",
  },
  {
    description: "Sand team core should return sand archetype info",
    query: "sand team archetype Tyranitar Excadrill core",
    topK: 5,
    expectedSources: ["team_archetypes.md"],
    category: "strategic",
  },
  {
    description: "Speed tiers query should return speed tier doc",
    query: "speed tiers and benchmarks at level 50",
    topK: 5,
    expectedSources: ["speed_tiers.md"],
    category: "strategic",
  },
  {
    description: "Current meta snapshot should return meta doc",
    query: "current meta top Pokemon win rates tier list",
    topK: 5,
    expectedSources: ["meta_snapshot.md"],
    category: "strategic",
  },
];
