export type OutputMode = "team-build" | "analysis";

const TEAM_BUILD_PATTERNS: RegExp[] = [
  /\bbuild\s+(me\s+)?(a\s+)?(team|squad|core)\b/,
  /\bgive\s+me\s+(a\s+)?(team|squad|6|six)\b/,
  /\b(compose|design|craft|make)\s+(me\s+)?(a\s+)?(team|squad)\b/,
  /\bsuggest\s+(me\s+)?a\s+team\b/,
  /\bteam\s+(for|that|with|around|to\s+(beat|counter|run))\b/,
  /\b(sand\s+rush|trick\s+room|tailwind|sun|rain|sand|snow|hard\s+tr|balance|goodstuffs|hyper\s+offense)\s+team\b/,
  /\bteam\s+composition\b/,
  /\bmy\s+team\b/,
  /\bfill\s+(out|in)\s+(my|a)\s+team\b/,
  /\b(rate|review|evaluate|grade|critique)\s+(my|this)\s+team\b/,
  /\bfinish\s+(my|the)\s+team\b/,
];

const ANALYSIS_PATTERNS: RegExp[] = [
  /\bhow\s+(do|to|can)\s+(i|you|we)?\s*(beat|counter|stop|kill|deal\s+with|handle|approach|play\s+around|punish)\b/,
  /\b(counter|sleeper|spice)s?\s+(for|to|against|of)\b/,
  /\bwhat\s+counters?\b/,
  /\bwhat'?s\s+a\s+(sleeper|counter|spice|good\s+answer|safe\s+answer)/,
  /\bbest\s+(counter|answer|response|pick|switch-?in)s?\s+(to|against|for|vs)\b/,
  /\bis\s+(mega\s+)?\w[\w-]*\s+(viable|good|usable|worth\s+running|worth\s+it|strong|weak|playable|relevant)\b/,
  /\bare\s+(mega\s+)?[\w-]+s?\s+(viable|good|usable|playable)\b/,
  /\b(compare|comparison)\s+(of|between)?\b/,
  /\b\w[\w-]*\s+vs\.?\s+\w[\w-]*\b/,
  /\bwhich\s+is\s+(better|stronger|faster|bulkier|safer|more\s+\w+)\b/,
  /\b(better|stronger|faster)\s+than\b/,
  /\bexplain\b/,
  /\bwhy\s+(does|is|are|do|isn'?t|aren'?t)\b/,
  /\bwhat\s+(makes|does|is)\s+\w[\w-]*\s+(good|bad|tick|work|special)\b/,
  /\bdoes\s+\w[\w-]*\s+(ohko|2hko|outspeed|kill|survive|wall|check)\b/,
  /\bdamage\s+(of|from|against|to)\b/,
  /\btop\s+(threats|counters|picks|sleepers|sleeper\s+picks)\b/,
  /\bbiggest\s+(threats?|problems?)\b/,
  /\b(threats|threat\s+list)\s+(in|for|of)\b/,
];

export function classifyOutputMode(userText: string | undefined | null): OutputMode {
  if (!userText || typeof userText !== "string") return "team-build";
  const t = userText.toLowerCase();

  for (const p of TEAM_BUILD_PATTERNS) {
    if (p.test(t)) return "team-build";
  }
  for (const p of ANALYSIS_PATTERNS) {
    if (p.test(t)) return "analysis";
  }

  return "team-build";
}
