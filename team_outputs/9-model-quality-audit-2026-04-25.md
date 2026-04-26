# 9-Model Quality Audit — Froslass + Krookodile (2026-04-25)

Comparison prompt: **"Build a team around Froslass and Krookodile"** — same input across 5 batches today so output differences reflect model behavior.

This audit goes BEYOND operational metrics (latency, completion, citation count) and scores each team against CLAUDE.md banned-items list, item-move interactions, system-prompt format conventions, and Champions VGC strategic principles.

## Per-team audit

### gemini-3-flash — Q-tier A ✓
- **Mons:** Mega Froslass · Krookodile · Sneasler · Kingambit · Aerodactyl · Milotic
- **Items:** Froslassite, Choice Scarf, White Herb, Black Glasses, Focus Sash, Leftovers — all legal, no dupes
- **Mega ability:** Snow Warning ✓
- **Strategic shape:** Snow (Mega Froslass) + Tailwind (Aerodactyl) — dual speed control. Wide Guard on Aero blocks Rock Slide / EQ. Milotic Bold + Haze for setup denial. Strong, clean, well-rounded.
- **Verdict:** **Q-A clean.** Reference baseline.

### gemma-4-26b — Q-tier D ⚠️ ILLEGAL
- **Mons:** Mega Froslass · Krookodile · Sneasler · Incineroar · Kingambit · Clefable
- **Items:** Froslassite, Sitrus Berry, **Focus Sash**, **Assault Vest**, Black Glasses, Leftovers
- **CRITICAL — banned item:** **Assault Vest on Incineroar.** AV is in CLAUDE.md MISSING ITEMS list. validate_set would reject it.
- **CRITICAL — item-move conflict:** **Sneasler Focus Sash + Acrobatics.** Acrobatics is 55 BP with held item, 110 BP without — Focus Sash permanently halves the move's power.
- **Why it shipped:** Gemma skipped `validate_set` entirely (called only `pokedex × 2` and `search × 2` then synthesized from reasoning). The system prompt requires validate_set on every member; Gemma ignored that.
- **Other choices:** Krookodile Moxie (instead of meta-standard Intimidate), Clefable Unaware redirector with Helping Hand. Otherwise functional.
- **Verdict:** **Q-D illegal.** Two non-trivial issues; cannot be presented as a usable team without manual fixes.

### grok-4-1-fast — Q-tier A ✓
- **Mons:** Mega Froslass · Krookodile · Sneasler · Incineroar · Garchomp · Sinistcha
- **Items:** Froslassite, Choice Scarf, White Herb, Sitrus Berry, Soft Sand, Leftovers — all legal, no dupes
- **Mega ability:** Snow Warning ✓
- **Strategic shape:** Snow + TR (Sinistcha) + Intimidate spam (Krookodile + Incineroar). Garchomp w/ Soft Sand EQ as ground answer. Coherent.
- **Verdict:** **Q-A clean.**

### kimi-k2-6 — Q-tier B (convention slip)
- **Mons:** Mega Froslass · Krookodile · Aerodactyl · Sneasler · Milotic · Kingambit
- **Items:** Froslassite, Choice Scarf, Focus Sash, White Herb, Leftovers, Black Glasses — all legal, no dupes
- **Mega ability listed:** **Cursed Body** (Froslass base ability) instead of `Snow Warning` (Mega Froslass ability per system-prompt convention example).
- **Functional impact:** the Mega Evolution sets the ability to Snow Warning automatically when the user clicks Mega-evolve, so the team functions. But a careful reader sees "Cursed Body" + "Aurora Veil" + no other Snow setter and thinks the team is broken.
- **Other choices:** Milotic Modest (special attacker variant) — unusual but valid.
- **Verdict:** **Q-B convention slip.** Team works in practice; reads as broken on the page.

### minimax-m2-5 — Q-tier A ✓
- **Mons:** Mega Froslass · Krookodile · Whimsicott · Incineroar · Basculegion · Kingambit
- **Items:** Froslassite, Sitrus Berry, Focus Sash, Chople Berry, Choice Scarf, Black Glasses — all legal, no dupes
- **Mega ability:** Snow Warning ✓
- **Strategic shape:** Tailwind (Whimsicott Prankster) + Snow (Mega Froslass) + late-game Last Respects sweep (Basculegion Choice Scarf). Chople Berry on Incineroar for Fighting resist. Sophisticated.
- **Other choices:** Krookodile Stealth Rock (situational in Doubles), Incineroar Throat Chop instead of Knock Off (custom but coherent).
- **Verdict:** **Q-A clean.** Most strategically diverse team in the lineup.

### minimax-m2-7 — Q-tier B (strategic suboptimals)
- **Mons:** Mega Froslass · Krookodile · Sinistcha · Sneasler · Kingambit · Basculegion
- **Items:** Froslassite, Leftovers, Sitrus Berry, White Herb, Black Glasses, Mystic Water — all legal, no dupes
- **Mega ability:** Snow Warning ✓
- **Krookodile Leftovers + Superpower:** Superpower self-debuffs Atk/Def each use; Leftovers' 1/16 HP/turn doesn't compensate. Suboptimal pairing.
- **Basculegion Mystic Water (no Choice Scarf):** loses its Last Respects revenge-killer role. Mystic Water is +20% water boost which is fine, but the speed loss matters more.
- **Kingambit Swords Dance:** setup variant, requires safe turns. Coherent with the slower TR mode (Sinistcha) but contradicts the priority-revenge role of standard Kingambit.
- **Verdict:** **Q-B strategic suboptimals.** Legal, coherent at the archetype level, but multiple slot-level choices weaken the team.

### deepseek-v4-flash — Q-tier B (convention slip)
- **Mons:** Mega Froslass · Krookodile · Basculegion · Kingambit · Sneasler · Incineroar
- **Items:** Froslassite, Soft Sand, Choice Scarf, Black Glasses, White Herb, Sitrus Berry — all legal, no dupes
- **Mega ability listed:** **Snow Cloak** (Froslass base) instead of `Snow Warning` per convention. Same issue as Kimi.
- **Other choices:** Krookodile Stone Edge instead of Rock Slide (single-target accuracy 80% vs Rock Slide spread 90% — Doubles favors spread). Basculegion Scarf Last Respects revenge killer. Solid otherwise.
- **Verdict:** **Q-B convention slip + minor move choice.**

### deepseek-v4-pro
- **No successful run on this prompt today.** All 3 tool-supporting OpenRouter providers (DeepSeek, Together, Io Net) returned 429 simultaneously. Cannot audit team quality. Routing config is pinned correctly; retest when capacity recovers.

## Tier summary (operational × quality)

| Combined | Models | Recommended use |
|---|---|---|
| **S — production default** | `gemini-3-flash` | Always default unless comparing alternatives |
| **A — recommended alternatives** | `grok-4-1-fast`, `minimax-m2-5` | Comparison or 60-90s budget |
| **B — slow but consistent** | `minimax-m2-7`, `kimi-k2-6` | Tolerate convention slips for depth |
| **C — fast but flawed** | `gemma-4-26b` | **Avoid for end-user output** until validate_set compliance improves; OK for batch/eval (suite catches it post-hoc) |
| **C — very slow** | `deepseek-v4-flash` | Last resort; ~30min wall + minor convention slip |
| **C — intermittent** | `deepseek-v4-pro` | Retry periodically |

## Recommendations

1. **Keep `gemini-3-flash` as the production webapp default** (`TEAM_BUILDING_MODEL`). Currently the cleanest combination of speed + quality + convention adherence.
2. **Don't promote `gemma-4-26b` to the webapp default** despite being the eval default. The `validate_set`-skip behavior produces banned items in real user-facing output. Acceptable for batch/eval where the suite's `item_availability` test catches it; risky for live users who may not double-check.
3. **Consider `minimax-m2-5` as a strong A-tier alternative** for users who want diverse-architecture comparison. Sophisticated tactical choices; clean execution.
4. **Update system prompt to clarify Mega ability convention** — Kimi and DeepSeek both listed base Froslass abilities (Cursed Body, Snow Cloak) instead of the Mega ability (Snow Warning). The system-prompt example uses Snow Warning but doesn't explicitly state "list the Mega ability when megaStone is set." A one-line clarification would close this gap.
5. **Filed harness improvements (B3a-f in [rag-master-plan.md](../memory-bank/rag-master-plan.md))** — including a route-side `validate_set`-on-every-mon enforcement that would catch Gemma-style banned-item leaks even when the model skips the call.

Captured for future reference. Per-model run files: see [runs/](../runs/) timestamped 2026-04-25/26.
