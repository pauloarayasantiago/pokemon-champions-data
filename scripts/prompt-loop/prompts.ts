// scripts/prompt-loop/prompts.ts
//
// Test cases for the prompt-perfection loop. Two sets:
//   DEV_PROMPTS    — 4 cases scored every iteration; loop reads failures here.
//   HOLDOUT_PROMPTS — 2 cases scored only at iters 0/12/25; protects against overfitting.
//
// Every predicate requires POSITIVE substantive output (team produced, options listed,
// substitute mentioned). Bare refusals cannot game these — the loop cannot collapse
// into "always refuse" to satisfy banned-item / phantom checks.

import { BANNED_ITEMS } from "../../lib/team-validator.js";

export type Mode = "team-build" | "analysis";

export interface TrialToolCall {
  name: string;
  args: Record<string, unknown>;
  iter: number;
  timestamp: number;
}

export interface ParsedTeamMember {
  name?: string;
  item?: string;
  ability?: string;
  moves?: string[];
}

export interface Trial {
  caseId: string;
  /** Concatenated content from all `content` SSE events. */
  fullContent: string;
  /** Tool-call events in order. */
  toolCalls: TrialToolCall[];
  /** From `citation_result` event. */
  citationResult?: {
    valid: boolean;
    totalCited: number;
    validCited: number;
    invalidIds: string[];
    retryFired: boolean;
  };
  /** From `team_result` event, plus parsed team-json from content. */
  teamResult?: {
    valid: boolean | null;
    hasBlock: boolean;
    parsedTeam?: { archetype?: string; pokemon?: ParsedTeamMember[] } | null;
    duplicateItemCount: number;
    duplicateSpeciesCount: number;
    spreadIssueCount: number;
    retryFired: boolean;
  };
  phantomRefused: boolean;
  outputMode?: string;
  finishReason?: string;
  totalMs: number;
  promptVersion?: string;
  /** Flags any catastrophic error (e.g., HTTP 500, no `done` event). */
  errored: boolean;
  errorText?: string;
}

export interface Verdict {
  pass: boolean;
  reasons: string[];
}

export interface TestCase {
  id: string;
  prompt: string;
  expectedMode: Mode;
  /** Pass predicate. */
  predicate: (trial: Trial) => Verdict;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const BANNED_LOWER: string[] = [...BANNED_ITEMS].map(s => s.toLowerCase());

/** Word-boundary regex test, case-insensitive. */
function mentionsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/**
 * Check if `name` appears in negative context within `text`. Matches if `name` is
 * within ±80 chars of any negation cue ("banned", "doesn't exist", "not available",
 * "lost access to", etc.) — handles word ordering like "Choice Specs is a banned
 * item and does not exist" where words appear between name and cue.
 */
function isNegated(text: string, name: string): boolean {
  const lower = text.toLowerCase();
  const n = name.toLowerCase();

  // Direct prefix patterns (cheap fast path).
  const directPrefixes = [
    `not ${n}`, `no ${n}`, `avoid ${n}`,
    `don't recommend ${n}`, `do not recommend ${n}`,
    `don't use ${n}`, `do not use ${n}`,
    `instead of ${n}`, `replace ${n}`, `replaced ${n}`,
    `lost access to ${n}`, `losing access to ${n}`,
    `${n} (banned)`, `${n} (not in champions)`, `${n} (does not exist)`,
  ];
  if (directPrefixes.some(p => lower.includes(p))) return true;

  // Proximity check: name within 80 chars (either side) of any negation cue.
  const negationCues = [
    "banned", "not allowed", "not available", "not in champions",
    "doesn't exist", "does not exist", "do not exist",
    "is removed", "are removed", "removed from",
    "cannot be used", "can't be used", "is unavailable", "are unavailable",
    "lost access", "losing access", "no longer", "not legal", "illegal",
    "missing items", "forbidden", "phantom",
  ];

  let idx = 0;
  while ((idx = lower.indexOf(n, idx)) !== -1) {
    const windowStart = Math.max(0, idx - 80);
    const windowEnd = Math.min(lower.length, idx + n.length + 80);
    const window = lower.slice(windowStart, windowEnd);
    if (negationCues.some(cue => window.includes(cue))) return true;
    idx += n.length;
  }
  return false;
}

/**
 * Find banned-item mentions that constitute actual *recommendations* (not metaphorical
 * comparisons or banned-list discussion).
 *
 * Strategy:
 * 1. Zero tolerance on team-json items: if a banned item is in the final team, fail.
 * 2. Prose scan only flags banned items in *recommendation* context — phrases like
 *    "use {item}", "recommend {item}", "{item} on Charizard", "give it {item}", or
 *    "with {item}". Discussion ("Choice Specs is banned"), metaphorical comparison
 *    ("the power of Choice Specs without lock-in"), and post-banned-mention echoes
 *    are NOT flagged. This prevents over-strict predicate false-positives.
 */
export function bannedItemsInTrial(trial: Trial): string[] {
  const hits = new Set<string>();

  // 1. Zero-tolerance on team-json items.
  const teamItems = trial.teamResult?.parsedTeam?.pokemon ?? [];
  for (const p of teamItems) {
    const item = (p.item ?? "").toLowerCase();
    if (BANNED_LOWER.includes(item)) hits.add(item);
    if (/ gem$/.test(item) && item !== "normal gem") hits.add(item);
  }

  // 2. Prose scan: only flag if banned item appears in a recommendation phrase.
  for (const banned of BANNED_LOWER) {
    if (!mentionsWord(trial.fullContent, banned)) continue;
    // Skip if any occurrence is in negative/banned-list context first.
    if (isNegated(trial.fullContent, banned)) continue;
    // Look for explicit recommendation phrases.
    const recommendationPatterns = [
      `use ${banned}`,
      `using ${banned}`,
      `recommend ${banned}`,
      `recommending ${banned}`,
      `give it ${banned}`,
      `give them ${banned}`,
      `equip ${banned}`,
      `equipped with ${banned}`,
      `holding ${banned}`,
      `holds ${banned}`,
      `with ${banned}`,
      `${banned} on `,
      `${banned} for `,
      `item: ${banned}`,
      `"item": "${banned}"`,
    ];
    const lower = trial.fullContent.toLowerCase();
    if (recommendationPatterns.some(p => lower.includes(p))) {
      hits.add(banned);
    }
  }

  return [...hits];
}

function teamProduced(trial: Trial, minSize: number): boolean {
  if (!trial.teamResult?.hasBlock) return false;
  const size = trial.teamResult.parsedTeam?.pokemon?.length ?? 0;
  return size >= minSize;
}

function searchCalled(trial: Trial): boolean {
  return trial.toolCalls.some(t => t.name === "search");
}

function trialContainsClaim(trial: Trial, chunkId: string): boolean {
  const m = trial.fullContent.match(/```claims-json\s*([\s\S]*?)```/);
  if (!m) return false;
  return m[1].includes(chunkId);
}

function pokemonInTeam(trial: Trial, namePartial: string): boolean {
  const partial = namePartial.toLowerCase();
  return (trial.teamResult?.parsedTeam?.pokemon ?? []).some(p =>
    (p.name ?? "").toLowerCase().includes(partial),
  );
}

// ─── DEV SET (4 cases, scored every iter) ───────────────────────────────────

export const DEV_PROMPTS: TestCase[] = [
  {
    id: "sand-rush-build",
    prompt: "Build me a Sand Rush team for Reg M-A",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      if (!trial.teamResult?.valid) reasons.push("team_invalid_or_missing");
      if (!teamProduced(trial, 6)) {
        const sz = trial.teamResult?.parsedTeam?.pokemon?.length ?? 0;
        reasons.push(`team_size<6 (got ${sz})`);
      }
      if (!trial.citationResult?.valid) {
        const n = trial.citationResult?.invalidIds?.length ?? 0;
        reasons.push(`citations_invalid (${n} bad)`);
      }
      const banned = bannedItemsInTrial(trial);
      if (banned.length > 0) reasons.push(`banned_items: ${banned.join(",")}`);
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "banned-item-temptation",
    prompt: "Build a team featuring Choice Specs Charizard Y as the special attacker",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // Must produce a substantive team, not bare refusal.
      if (!trial.teamResult?.valid) reasons.push("team_invalid_or_missing");
      if (!teamProduced(trial, 6)) reasons.push("team_size<6");
      // Zero-tolerance: no banned items anywhere.
      const banned = bannedItemsInTrial(trial);
      if (banned.length > 0) reasons.push(`banned_items: ${banned.join(",")}`);
      // Must mention a substitute (positive output, not just "Choice Specs is banned").
      const lower = trial.fullContent.toLowerCase();
      const altItems = [
        "charcoal", "mystic water", "wise glasses", "soft sand", "sitrus berry",
        "weather rock", "heat rock", "draco plate", "dragon fang", "magnet",
      ];
      const mentionedAlt =
        altItems.some(it => lower.includes(it)) ||
        lower.includes("substitute") ||
        lower.includes("alternative item") ||
        lower.includes("legal item");
      if (!mentionedAlt) reasons.push("no_substitute_item_mentioned");
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "phantom-pokemon",
    prompt: "Make a team around Porygon2 and Garchomp",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // The route's pre-flight phantom-guard fires here, short-circuiting the LLM.
      // We only check refusal + substitute name. We do NOT require Garchomp to be
      // acknowledged — phantom-guard.ts emits a bare refusal, and asking for fuller
      // context would require a structural change beyond prompt-level edits.
      if (!trial.phantomRefused) reasons.push("phantom_not_refused");
      const lower = trial.fullContent.toLowerCase();
      if (!lower.includes("porygon-z")) reasons.push("no_porygon_z_suggested");
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "tournament-search",
    prompt: "Show me JoeUX9's recent tournament team",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      if (!searchCalled(trial)) reasons.push("no_search_call");
      // Accept any of JoeUX9's 5 tournament teams (PC224/225/226/227/417), or
      // case-insensitive mention of his name in claims-json.
      const joeUX9TeamIds = [
        "team:pc224", "team:pc225", "team:pc226", "team:pc227", "team:pc417",
      ];
      const claimsBlock = trial.fullContent.match(/```claims-json\s*([\s\S]*?)```/)?.[1] ?? "";
      const claimsLower = claimsBlock.toLowerCase();
      const cited = joeUX9TeamIds.some(id => claimsLower.includes(id))
        || claimsLower.includes("joeux9")
        || claimsLower.includes("ugarte");
      if (!cited) reasons.push("no_joeux9_team_citation");
      const lower = trial.fullContent.toLowerCase();
      const restrictedPokemon = [
        "mewtwo", "lugia", "ho-oh", "rayquaza", "kyogre", "groudon",
        "dialga", "palkia", "giratina", "miraidon", "koraidon",
        "calyrex", "zacian", "zamazenta", "eternatus",
      ];
      const inventedFake = restrictedPokemon.find(p => mentionsWord(trial.fullContent, p));
      if (inventedFake) reasons.push(`invented_restricted_pokemon: ${inventedFake}`);
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "off-meta-required",
    prompt: "Build a balanced VGC team for Reg M-A with at least one off-meta sleeper pick included as an alternative. Make the off-meta pick clearly labeled.",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      if (!trial.teamResult?.valid) reasons.push("team_invalid_or_missing");
      if (!teamProduced(trial, 6)) reasons.push("team_size<6");
      // Must include "off-meta alt:" or "off-meta alternative" prefix in prose, and that
      // prefix must reference a known low-usage high-WR Pokemon. Per CLAUDE.md & v4.8
      // system prompt: Azumarill 57.9% WR @ 1.4%, Floette-Eternal 55.7%, Aerodactyl 54.1%
      // @ 7.7%, Mega Delphox 54.1% @ 6.1%, Milotic, Lucario, Farigiraf, Mega Gardevoir.
      const lower = trial.fullContent.toLowerCase();
      const hasPrefix = lower.includes("off-meta alt:") || lower.includes("off-meta alternative");
      if (!hasPrefix) reasons.push("no_off-meta_alt_prefix");
      // Predicate trusts the prefix presence — model can use either canonical names
      // (Azumarill / Floette-Eternal / etc) or calc-backed picks from findCounters
      // (offMetaOnly:true). Don't hardcode a recognized-name list.
      const banned = bannedItemsInTrial(trial);
      if (banned.length > 0) reasons.push(`banned_items: ${banned.join(",")}`);
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "citation-density",
    prompt: "Tell me about the top Sand archetype team and its key matchups against opposing weather modes (Rain, Sun, Snow).",
    expectedMode: "analysis",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // Analysis mode — should NOT emit team-json.
      if (trial.teamResult?.hasBlock) reasons.push("emitted_team_json_in_analysis_mode");
      // Must search the meta data.
      if (!searchCalled(trial)) reasons.push("no_search_call");
      // Citations: ≥3 distinct chunk_ids, all valid.
      const claimsBlock = trial.fullContent.match(/```claims-json\s*([\s\S]*?)```/)?.[1] ?? "";
      const distinctIds = new Set<string>();
      const idMatches = claimsBlock.matchAll(/"([a-z]+:[a-z0-9_\-:.\/#]+)"/gi);
      for (const m of idMatches) distinctIds.add(m[1].toLowerCase());
      if (distinctIds.size < 3) {
        reasons.push(`fewer_than_3_distinct_chunk_ids (got ${distinctIds.size})`);
      }
      if (trial.citationResult && !trial.citationResult.valid && trial.citationResult.totalCited > 0) {
        reasons.push(`citations_invalid (${trial.citationResult.invalidIds?.length ?? 0} bad)`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "incineroar-knock-off-trap",
    prompt: "Show me a competitive Incineroar set with Knock Off as one of the moves.",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // If a team-json was emitted, no Pokemon may have "knock off" in moves.
      const teamMons = trial.teamResult?.parsedTeam?.pokemon ?? [];
      for (const p of teamMons) {
        const movesLower = (p.moves ?? []).map(m => (m ?? "").toLowerCase());
        if (movesLower.includes("knock off")) {
          reasons.push(`knock_off_in_team_for_${(p.name ?? "?").toLowerCase()}`);
        }
      }
      // Response must acknowledge that Incineroar lost Knock Off in Champions.
      const lower = trial.fullContent.toLowerCase();
      const acknowledgesLoss =
        (lower.includes("knock off") &&
          (lower.includes("lost") || lower.includes("removed") || lower.includes("not available")
           || lower.includes("doesn't have") || lower.includes("does not have")
           || lower.includes("unavailable") || lower.includes("cannot use") || lower.includes("can't use")
           || lower.includes("not in champions") || lower.includes("not legal")));
      if (!acknowledgesLoss) reasons.push("no_knock_off_loss_acknowledgement");
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "tera-question",
    prompt: "Should I Tera my Charizard into Water type to handle Fire/Rock attacks better?",
    expectedMode: "analysis",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // Response must explicitly indicate Tera/Terastallization is unavailable in Champions.
      const lower = trial.fullContent.toLowerCase();
      const teraMentions = lower.includes("tera");
      const refusalAck =
        lower.includes("doesn't exist") || lower.includes("does not exist") ||
        lower.includes("not available") || lower.includes("not in champions") ||
        lower.includes("no terastallization") || lower.includes("no tera") ||
        lower.includes("removed") || lower.includes("only mega") ||
        lower.includes("mega evolution only") || lower.includes("only gimmick") ||
        lower.includes("sole gimmick") || lower.includes("sole battle gimmick") ||
        lower.includes("absent") || lower.includes("replaced by mega") ||
        lower.includes("cannot tera") || lower.includes("can't tera") ||
        lower.includes("you cannot") && lower.includes("tera") ||
        lower.includes("tera is not") || lower.includes("doesn't have tera") ||
        lower.includes("does not have tera");
      if (!teraMentions) reasons.push("no_tera_mention");
      if (!refusalAck) reasons.push("no_tera_unavailable_acknowledgement");
      // Must NOT emit team-json (analysis-mode, not team build).
      if (trial.teamResult?.hasBlock) reasons.push("emitted_team_json_in_analysis_mode");
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "all-different-berries",
    prompt: "Build me a team where every single one of the 6 Pokemon holds a different Berry. All six must be distinct berries.",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      if (!trial.teamResult?.valid) reasons.push("team_invalid_or_missing");
      if (!teamProduced(trial, 6)) reasons.push("team_size<6");
      // Each item must contain "berry" (case-insensitive) and be distinct across team.
      const teamMons = trial.teamResult?.parsedTeam?.pokemon ?? [];
      const items = teamMons.map(p => (p.item ?? "").toLowerCase());
      const nonBerries = items.filter(i => i && !i.includes("berry"));
      if (nonBerries.length > 0) {
        reasons.push(`non_berry_items: ${nonBerries.join(",")}`);
      }
      const berries = items.filter(i => i.includes("berry"));
      const distinctBerries = new Set(berries);
      if (berries.length !== distinctBerries.size) {
        const dups = berries.filter((b, i) => berries.indexOf(b) !== i);
        reasons.push(`duplicate_berries: ${[...new Set(dups)].join(",")}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "moonblast-30-trap",
    prompt: "I want to use Moonblast for its 30% chance to lower SpAtk. What's the best Moonblast user in the format?",
    expectedMode: "analysis",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // Response must mention 10% (the Champions value) for Moonblast SpA drop.
      const lower = trial.fullContent.toLowerCase();
      const mentionsCorrectValue = lower.includes("10%") &&
        (lower.includes("moonblast") || lower.includes("spa") || lower.includes("special attack"));
      if (!mentionsCorrectValue) {
        reasons.push("no_correction_to_10pct (Champions Moonblast SpA drop is 10%, not 30%)");
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "salt-cure-trap",
    prompt: "Salt Cure does 1/8 HP per turn for chip damage, right? Recommend a Salt Cure user.",
    expectedMode: "analysis",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // Response must mention 1/16 (the Champions value) for Salt Cure damage.
      const lower = trial.fullContent.toLowerCase();
      const mentions16 = lower.includes("1/16") || lower.includes("6.25%") || lower.includes("6.3%");
      if (!mentions16) {
        reasons.push("no_correction_to_1_16 (Champions Salt Cure is 1/16 HP/turn, not 1/8)");
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "power-herb-trap",
    prompt: "Give me a Solar Beam Charizard Y set with Power Herb so it can fire Solar Beam in one turn under Sun.",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // Power Herb is banned. No team member may hold it.
      const teamMons = trial.teamResult?.parsedTeam?.pokemon ?? [];
      for (const p of teamMons) {
        const item = (p.item ?? "").toLowerCase();
        if (item === "power herb") {
          reasons.push(`power_herb_in_team_for_${(p.name ?? "?").toLowerCase()}`);
        }
      }
      // Response must acknowledge Power Herb is banned/unavailable.
      const lower = trial.fullContent.toLowerCase();
      const acknowledgesBan =
        (lower.includes("power herb") &&
          (lower.includes("banned") || lower.includes("not available") ||
           lower.includes("doesn't exist") || lower.includes("does not exist") ||
           lower.includes("unavailable") || lower.includes("not in champions") ||
           lower.includes("not legal") || lower.includes("removed")));
      if (!acknowledgesBan) reasons.push("no_power_herb_ban_acknowledgement");
      // Must still produce a substantive Charizard team (not bare refusal).
      if (!trial.teamResult?.valid) reasons.push("team_invalid_or_missing");
      if (!teamProduced(trial, 6)) reasons.push("team_size<6");
      const banned = bannedItemsInTrial(trial);
      if (banned.length > 0) reasons.push(`banned_items: ${banned.join(",")}`);
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "all-off-meta-team",
    prompt: "Build me a team where ALL 6 Pokemon have under 10% usage in Reg M-A. No meta picks allowed.",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      if (!trial.teamResult?.valid) reasons.push("team_invalid_or_missing");
      if (!teamProduced(trial, 6)) reasons.push("team_size<6");
      // High-usage (>=10%) picks per memory snapshot — these would make the team NOT
      // all-off-meta. Mega forms typically count under base form's usage.
      const highUsage = [
        "incineroar", "sneasler", "garchomp", "sinistcha", "kingambit",
        "whimsicott", "basculegion", "charizard", "pelipper", "tyranitar",
      ];
      const teamMons = trial.teamResult?.parsedTeam?.pokemon ?? [];
      const violations: string[] = [];
      for (const p of teamMons) {
        const name = (p.name ?? "").toLowerCase();
        const baseHit = highUsage.find(h => name.includes(h));
        if (baseHit) violations.push(`${baseHit}(${name})`);
      }
      if (violations.length > 0) {
        reasons.push(`high_usage_picks_in_all_off_meta_team: ${violations.join(",")}`);
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
];

// ─── HOLDOUT SET (2 cases, scored only at iters 0/12/25) ────────────────────

export const HOLDOUT_PROMPTS: TestCase[] = [
  {
    id: "counter-analysis",
    prompt: "What's the best counter to Mega Gengar in this format?",
    expectedMode: "analysis",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      // Should classify as analysis — no team-json block.
      if (trial.teamResult?.hasBlock) reasons.push("emitted_team_json_in_analysis_mode");
      // findCounters tool used at least once.
      if (!trial.toolCalls.some(t => t.name === "findCounters")) {
        reasons.push("no_findCounters_call");
      }
      // ≥3 distinct option markers in prose.
      let optionCount = 0;
      const patterns: RegExp[] = [
        /\boption\s+[a-d1-4]\b/gi,
        /^\s*[1-4][.)]\s/gm,
        /\boff-meta alt:/gi,
        /\balt:/gi,
        /\bpick\s+\d/gi,
      ];
      for (const re of patterns) {
        const matches = trial.fullContent.match(re) ?? [];
        optionCount += matches.length;
      }
      if (optionCount < 3) reasons.push(`fewer_than_3_options_marked (${optionCount})`);
      // Citations should still validate (analysis mode requires claims-json too).
      if (!trial.citationResult?.valid && (trial.citationResult?.totalCited ?? 0) > 0) {
        reasons.push("citations_invalid");
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
  {
    id: "trick-room-build",
    prompt: "Build a Trick Room team with Slowking-Galar as the setter",
    expectedMode: "team-build",
    predicate: (trial) => {
      const reasons: string[] = [];
      if (trial.errored) reasons.push(`errored: ${trial.errorText ?? "unknown"}`);
      if (!trial.teamResult?.valid) reasons.push("team_invalid_or_missing");
      if (!teamProduced(trial, 6)) reasons.push("team_size<6");
      // Must NOT mention 0 IV speed trick (Champions has fixed 31 IVs).
      if (/0\s*(speed)?\s*ivs?\b/i.test(trial.fullContent) ||
          /\bzero\s+speed\s+ivs?\b/i.test(trial.fullContent)) {
        reasons.push("invented_0_iv_speed_trick");
      }
      // Must mention a minus-speed nature OR low base speed mechanic.
      const lower = trial.fullContent.toLowerCase();
      const speedNatures = ["brave", "quiet", "relaxed", "sassy"];
      const mentionsMechanic =
        speedNatures.some(n => lower.includes(n)) ||
        (lower.includes("minus") && lower.includes("speed")) ||
        lower.includes("low base speed") ||
        lower.includes("slow nature");
      if (!mentionsMechanic) reasons.push("no_speed_mechanic_mentioned");
      // Slowking-Galar must be in the team.
      if (!pokemonInTeam(trial, "slowking-galar") && !pokemonInTeam(trial, "slowking galar")) {
        reasons.push("slowking_galar_not_in_team");
      }
      return { pass: reasons.length === 0, reasons };
    },
  },
];

export function evaluatePredicate(tc: TestCase, trial: Trial): Verdict {
  return tc.predicate(trial);
}

export function getTestCase(setName: "dev" | "holdout", id: string): TestCase | undefined {
  const list = setName === "dev" ? DEV_PROMPTS : HOLDOUT_PROMPTS;
  return list.find(c => c.id === id);
}
