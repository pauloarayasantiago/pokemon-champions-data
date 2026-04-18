# Source Validation Notes — Pokemon Champions

Some transcripts and research sources indexed in this database contain recommendations that are incorrect or inapplicable to Pokemon Champions (typically because they assume S/V item/mechanic pools). When the retrieval layer surfaces claims from these sources, apply the filters below before passing the recommendation to the user.

## Items banned in Champions (NEVER recommend)
Per `CLAUDE.md` and `items.csv`, these items do not exist in Pokemon Champions despite appearing in S/V, Showdown, or third-party team-preview tooling:

Life Orb, Choice Band, Choice Specs, Assault Vest, Rocky Helmet, Heavy-Duty Boots, Eviolite, Flame Orb, Toxic Orb, Power Herb, Light Clay, Covert Cloak, Loaded Dice, Utility Umbrella, Expert Belt, Clear Amulet, Throat Spray, Metronome (held item), Booster Energy, Normal Gem, typed Gems, Weakness Policy, Black Sludge, Safety Goggles.

## Transcripts that recommend banned items / outdated mechanics

### `unknown_mrsteelixyourgirl-30-pokemon-you-need-to-use-in-pokemon-champions.md`
**Issue:** Recommends Assault Vest, Throat Spray, and Flame Orb across several of the 30 featured Pokemon.
**How to apply:** When citing this transcript for Pokemon recommendations or role assignments, IGNORE the item recommendation and substitute a valid Champions item. The archetype/role/move reasoning is still useful; just swap the item.
**Common substitutions:**
- Assault Vest → Sitrus Berry (generic bulk) or a type-resist Berry if weak to a specific type
- Throat Spray → no direct substitute; consider Sitrus Berry or rework the set
- Flame Orb → no direct substitute; reroll the set without burn synergy, or use a status-inflicting teammate (Will-O-Wisp)

### `unknown_skraw-vgc-choose-your-battle-style-for-pokémon-champions.md`
**Issue:** Largely pre-Champions S/V content. Archetype definitions (Balance / HO / Hard TR / Rain / Sun / Sand / Snow) are still accurate, but specific move power numbers, item references, and Pokemon like Amoonguss / Porygon2 / restricted legendaries are S/V-only.
**How to apply:** Use for archetype primer / Doubles teambuilding concepts only. Do NOT cite specific damage calcs, item recommendations, or roster-dependent claims from this transcript.

### `unknown_moxie-boosted-which-pokemon-champion-is-the-strongest-competitively-vgc.md`
**Issue:** This video is about historical human VGC champions (Kieran et al.), not Pokemon Champions the game. Title similarity causes false retrieval.
**How to apply:** Deprioritize for any Champions-meta or team-building query. Only relevant if the user explicitly asks about competitive VGC history.

## Mechanics that differ from S/V (agent should prefer these over retrieved claims)
When a source claims S/V mechanics that Champions overrides, trust Champions. Key overrides:
- No 0 Speed IVs (Trick Room minimum Speed higher)
- Paralysis full para 12.5% (not 25%)
- Sleep / Freeze guaranteed thaw/wake T3
- Fake Out T1-only (button greyed out after)
- Protect 8 PP (not 16)
- Screens 33% reduction in Doubles (not 50%)
- Moonblast SpA drop 10% (not 30%)
- Iron Head flinch 20% (not 30%)
- Dire Claw status 30% (not 50%)
- King's Shield attack drop -1 (not -2)
- No Terastallize / Dynamax / Z-Moves — only Mega Evolution
- 186 Pokemon + Pikachu roster — no legendaries, paradoxes, pre-evolutions, or Amoonguss

## When to trust a transcript over the knowledge base
Transcripts from high-credibility creators (WolfeyVGC, AngrySlowbroPlus, PanFro Games, TheDelybird, iStarlyTV) playing active Champions ladder often surface meta innovations (new spreads, tech choices, item adaptations) before the static knowledge base catches up. When a transcript reports a novel but valid-in-Champions finding:
- Cite the transcript
- Cross-check against `pokemon_champions.csv` (moves/abilities) and `items.csv` (item legality)
- Flag for the user as "emerging" if not yet confirmed by multiple sources
