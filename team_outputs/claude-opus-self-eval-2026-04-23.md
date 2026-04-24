# A5 — Claude Opus 4.7 Self-Eval (13-Test Agentic Suite)

**Date:** 2026-04-23
**Model under test:** Claude Opus 4.7 (`claude-opus-4-7`) running in Claude Code CLI as the "local CLI delivery surface"
**Retrieval:** `/lookup` (via `npx tsx scripts/search.ts`) + direct CSV reads for ground-truth files
**Baseline for comparison:** Gemma 4 26B A4B via `npm run eval:models` on the web-agent surface (13/13 pass, 16327 tok/pass, 2026-04-20 baseline)

## Summary Table

| # | Test ID | Tag | Score | Applicable | Notes |
|---|---------|-----|-------|------------|-------|
| 1 | tool_workflow | behavior | N/A | No | Scores programmatic `pokedex → validate_set` call order; Claude-via-CLI has no programmatic tools, only `/lookup` + CSV reads |
| 2 | team_json | behavior | **PASS** | Yes | 6-mon Rain team with Mega Feraligatr, valid ```team-json``` block |
| 3 | validate_loop | behavior | N/A | No | Scores `validate_set` call count; no equivalent in manual flow |
| 4 | pokedex_dedup | behavior | N/A | No | Scores `pokedex` dedup; no programmatic `pokedex` tool |
| 5 | item_availability | behavior | **PASS** | Yes | Mentions Sitrus/Focus Sash/Lum/Dragoninite; flags Life Orb + Choice Band as unavailable with negation |
| 6 | phantom_pokemon | hallucination | **PASS** | Yes | Flagged both Amoonguss (not in Champions roster) and Porygon2 (pre-evolution, use Porygon-Z) |
| 7 | stat_accuracy | hallucination | **PASS** | Yes | All 6 Mega Dragonite stats match `mega_evolutions.csv` row 18 (91/124/115/145/125/100) |
| 8 | banned_comprehensive | hallucination | **PASS** | Yes | Named ≥5 banned items (Life Orb, Choice Band/Specs, Assault Vest, Rocky Helmet, Heavy-Duty Boots, etc.) + all 3 gimmicks (Tera, Dynamax, Z-Moves) |
| 9 | usage_lookup | retrieval | **PASS** | Yes | Incineroar 51.0% usage from `pikalytics_usage.csv` (target range: 48–54%, within ±3pp) |
| 10 | usage_teammates | retrieval | **PASS** | Yes | Named Sneasler, Incineroar, Charizard as Garchomp's top-3 teammates (matches CSV column) |
| 11 | tournament_retrieval | retrieval | **PASS** | Yes | Named pokefey's PC105 Mega Golurk team members (Incineroar, Torkoal, Venusaur, Sneasler, Farigiraf) |
| 12 | creator_opinion | retrieval | **PASS** | Yes | Cited AngrySlowbroPlus, Garchomp in S tier, "Earthquake spam is just very powerful" quote from transcript |
| 13 | meta_core_attribution | retrieval | **PASS** | Yes | 55.8% Archaludon+Pelipper Rain WR (exact match from `meta_snapshot.md`) |

**Score: 10/10 applicable tests passed (100%).** 3/13 tests marked N/A because their scoring predicate checks programmatic tool-call patterns (`pokedex` / `validate_set`) that don't apply when Claude answers directly via `/lookup` + CSV reads.

## Per-Test Detail (Applicable Tests)

### Test 2 — team_json
**Prompt:** "Build me a complete 6-Pokemon rain team for VGC Doubles Champions format. Include a Mega."

**Queries run:**
- `/lookup "rain team Pelipper Archaludon Basculegion Incineroar Sinistcha"` → hit `team_archetypes.md` Template 3 rain core
- Direct CSV reads on `mega_evolutions.csv` (rain-capable Megas), `pikalytics_usage.csv` (top items + moves per team member)

**Answer:** Built team with Pelipper (Focus Sash, Drizzle) / Archaludon (Leftovers, Stamina) / Basculegion (Choice Scarf, Swift Swim) / **Mega Feraligatr** (Feraligite, Sheer Force → Dragonize) / Incineroar (Sitrus, Intimidate) / Sinistcha (Sitrus, Hospitality). Includes trailing ```team-json``` block with all 6 members, complete moves + spreads + natures.

**Self-score vs predicate:** `team-json` block present, JSON parses, `pokemon[]` length = 6. **PASS**.

**Tokens:** ~8500. Saved to [team_outputs/rain-team-mega-feraligatr-eval-2026-04-23.md](../team_outputs/rain-team-mega-feraligatr-eval-2026-04-23.md).

### Test 5 — item_availability
**Prompt:** "Give me a list of the best held items to use in Champions for a Dragonite set. What are my options?"

**Queries run:**
- `/lookup "Dragonite best held items Champions"` → hit `pikalytics_usage.csv` Dragonite row
- Direct read of Dragonite `top_items` column: Dragoninite 65.2%, Lum Berry 14.9%, White Herb 4.2%, Dragon Fang 2.9%, Silk Scarf 2.3%, Sitrus Berry 1.5%, Focus Sash 1.0%

**Answer:** Listed Dragoninite (Mega), Lum Berry, White Herb, Dragon Fang, Silk Scarf, Sitrus Berry, Focus Sash, Leftovers. Flagged Life Orb, Choice Band, Choice Specs, Heavy-Duty Boots, Loaded Dice as "unavailable in Champions — do NOT try to run these" with explicit negation ("missing", "doesn't apply").

**Self-score vs predicate:** Banned-item sentences all contain negation (`missing`, `doesn't`) → not flagged as recommendations. Valid-item set mentions Sitrus Berry + Focus Sash + Lum Berry + Mega Stone. **PASS**.

**Tokens:** ~6500. Saved to [team_outputs/dragonite-items-eval-2026-04-23.md](../team_outputs/dragonite-items-eval-2026-04-23.md).

### Test 6 — phantom_pokemon
**Prompt:** "Build me a team with Amoonguss and Porygon2 as the core."

**Self-score:** Refused both — Amoonguss explicitly flagged as "not in the Champions roster", Porygon2 explicitly flagged as "pre-evolution, use Porygon-Z". No moveset written for either. **PASS**.

### Test 7 — stat_accuracy
**Prompt:** "What are Mega Dragonite's base stats in Champions?"

**Ground truth** (`mega_evolutions.csv:18`): HP 91, Atk 124, Def 115, SpA 145, SpD 125, Spe 100.

**Self-score:** All 6 values cited correctly. **PASS**.

### Test 8 — banned_comprehensive
**Prompt:** "What S/V items and gimmicks are NOT available in Champions?"

**Self-score:** Listed Life Orb, Choice Band, Choice Specs, Assault Vest, Rocky Helmet, Heavy-Duty Boots, Eviolite, Weakness Policy, Covert Cloak + all three gimmicks (Terastallization, Dynamax, Z-Moves) — comfortably ≥5 items + 3 gimmicks. **PASS**.

### Test 9 — usage_lookup
**Prompt:** "What is Incineroar's tournament usage percentage in the current Pokemon Champions meta?"

**Ground truth** (`pikalytics_usage.csv`): Incineroar 51.0% usage, rank 1.

**Self-score:** Cited 51.0% (exact match, within ±3pp). **PASS**.

### Test 10 — usage_teammates
**Prompt:** "Who are Garchomp's top 3 teammates in the current meta?"

**Ground truth** (`pikalytics_usage.csv` Garchomp row): Sneasler | Incineroar | Charizard | Rotom-Wash | Kingambit | ...

**Self-score:** Named Sneasler, Incineroar, Charizard — all three match truth's top-3. **PASS**.

### Test 11 — tournament_retrieval
**Prompt:** "Build me a team around Mega Golurk using a real tournament team for reference."

**Ground truth** (`tournament_teams.csv` PC105 pokefey Champion team): Golurk-Mega + Incineroar + Torkoal + Venusaur + Sneasler + Farigiraf.

**Self-score:** Named Incineroar, Torkoal, Venusaur, Sneasler, Farigiraf (5/5 teammates from the PC105 team), cited player name "pokefey" and event. **PASS**.

### Test 12 — creator_opinion
**Prompt:** "What does AngrySlowbroPlus say about Garchomp in their Regulation A tier list?"

**Ground truth** (`data/transcripts/unknown_angryslowbroplus-the-definitive-pokemon-champions-regulation-a-doubles-tier-list.md`): Garchomp in S tier. Quote: "Garchomp is good. Maybe better than Charizard, more consistent. You can run in different ways. Earthquake Spam is just very powerful at the moment."

**Self-score:** Mentioned AngrySlowbroPlus, Garchomp, S tier, and the Earthquake spam quote — all scorer regexes satisfied. **PASS**.

### Test 13 — meta_core_attribution
**Prompt:** "What is the win rate of the Archaludon + Pelipper rain core in the current Pokemon Champions meta?"

**Ground truth** (`data/knowledge/meta_snapshot.md:32`): 55.8% WR, 20.8% usage, Rain (Electro Shot).

**Self-score:** Cited 55.8% (exact match, within ±2pp of target 55.8). **PASS**.

## Comparison: Claude Opus 4.7 (CLI) vs Gemma 4 26B (web agent)

Matching only the 10 tests applicable to both surfaces:

| Metric | Claude Opus 4.7 (CLI) | Gemma 4 26B (web agent) |
|--------|----------------------|-------------------------|
| Pass rate on applicable tests | 10/10 (100%) | 10/10 (100%)* |
| Retrieval tests (9–13) | 5/5 | 5/5 |
| Hallucination tests (6–8) | 3/3 | 3/3 (100% after phantom-guard interceptor shipped 2026-04-23) |
| Behavior tests applicable to CLI (2, 5) | 2/2 | 2/2 |
| Token cost per applicable test | ~5000 avg, ~3500–8500 range | 16327 tok/pass on full 13-test suite |
| Citation discipline | Prose citations (file paths) — no `claims-json` block | 80–100% `claims-json` chunk coverage |

*Gemma's reported baseline is 13/13 on the full 13-test suite; restricted to the 10 applicable here, it remains 10/10.

**Key observations:**

1. **Ceiling is the same.** On the 10 tests that can fairly compare both surfaces, Claude-via-CLI and Gemma-via-tools both score 100%. The expected Claude advantage ("bigger model, better synthesis") does not show up on a test set that Gemma already aces.

2. **The 3 N/A tests are structurally gated against the CLI surface.** `tool_workflow`, `validate_loop`, and `pokedex_dedup` all score *how the model uses tools*, not *what the model answers*. The CLI surface doesn't ship with programmatic `pokedex` / `validate_set` — it has `/lookup` and file-read. To make these tests applicable to Claude-via-CLI, we'd either (a) register `pokedex`/`validate_set` as MCP tools in the CLI environment, or (b) redefine the tests to score retrieval coverage (e.g., "did the final answer include base stats for every team member?").

3. **Citation format diverges.** Gemma emits `claims-json` blocks as instructed by SYSTEM prompt (100% on retrieval tests). Claude-via-CLI cites inline ("`mega_evolutions.csv:18`", "`data/knowledge/meta_snapshot.md:32`") because there's no SYSTEM prompt enforcing the trailing JSON block. For UI parity, a local CLI slash command that wraps Claude's answer in `claims-json` would bring this to parity.

4. **Token economy favors Claude-via-CLI *per test*, but the test set is tiny.** Claude averaged ~5000 tokens per applicable test vs Gemma's ~16000 per test. Claude benefits from one-shot answering (no retry loops, no force-completion fallback, no pokedex-dedup nudges). On a larger workload this would matter; on 10 tests, not much.

5. **Behavioral differences that don't show up as pass/fail.**
   - Claude-via-CLI is free to refuse pre-evolutions by name (test 6) with a clean "Porygon2 is a pre-evolution, use Porygon-Z" response; Gemma now does the same because of the 2026-04-23 `phantom-guard.ts` interceptor.
   - Claude-via-CLI can freely blend multiple sources in one answer (e.g., Dragonite items from Pikalytics + `items.csv` + CLAUDE.md banned list). Gemma has to call each tool separately and stitch.

## N/A Test Commentary

- **Test 1 (tool_workflow):** "Build team around Mega Dragonite — does the model call `pokedex` before `validate_set`?" Not applicable because Claude-via-CLI has no programmatic `pokedex` tool. If asked this prompt manually, Claude would `/lookup` for Dragonite moves + read `mega_evolutions.csv` for stats, then write the team. The team quality is scorable; the tool-order predicate is not.
- **Test 3 (validate_loop):** "Sand Rush team — does the model call `validate_set` for each member?" Same issue: no `validate_set` tool in CLI. Claude can self-check against CLAUDE.md constraints (item pool, pre-evo blocklist, Mega rules) but emits no programmatic validate record.
- **Test 4 (pokedex_dedup):** "Trick Room team — does the model repeat `pokedex` calls?" Same issue, inverted: with no programmatic `pokedex`, there is nothing to dedup. Claude's `/lookup` calls happen but aren't logged to `toolCallLog` in the eval-harness format.

If we wanted to promote these to applicable, the right move is a harness wrapper that captures Claude-via-CLI `/lookup` + Read calls in the same `toolCallLog` shape and defines "pokedex" as "any `/lookup` hitting `pokemon_champions.csv` chunks". Not free, but mechanical.

## Conclusion

On the apples-to-apples subset, the local CLI path (Claude Opus 4.7 + `/lookup`) is *not demonstrably better* than the web agent path (Gemma 4 26B + tools) at a 10-test scale. Both score 100%. The CLI path burns fewer tokens per successful answer but loses `claims-json` format compliance. For the end user deciding "should I use the CLI or the web app?", these tests don't differentiate — tie goes to whichever UI they prefer. A bigger differentiating eval would need (a) adversarial retrieval (prompts that lean on `/lookup`'s top-5 vs the web agent's separate `search` → `pokedex` calls) or (b) multi-turn scenarios where Claude's cheaper continuation cost compounds.

## Source Files

- Prompts + scoring predicates: [scripts/eval-models.ts:998-1281](../scripts/eval-models.ts)
- Ground-truth CSVs: [pikalytics_usage.csv](../pikalytics_usage.csv), [tournament_teams.csv](../tournament_teams.csv), [mega_evolutions.csv](../mega_evolutions.csv), [items.csv](../items.csv)
- Ground-truth knowledge: [data/knowledge/meta_snapshot.md](../data/knowledge/meta_snapshot.md), [data/knowledge/team_archetypes.md](../data/knowledge/team_archetypes.md)
- Creator transcript: [data/transcripts/unknown_angryslowbroplus-the-definitive-pokemon-champions-regulation-a-doubles-tier-list.md](../data/transcripts/unknown_angryslowbroplus-the-definitive-pokemon-champions-regulation-a-doubles-tier-list.md)
- Gemma baseline snapshot: [memory-bank/eval-baselines/](../memory-bank/eval-baselines/)
