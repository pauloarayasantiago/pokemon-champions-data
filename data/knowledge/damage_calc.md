# Damage Calculation - Pokemon Champions

## Base Damage Formula
The Champions damage formula is the same as Generation 9:
`Damage = ((2 * Level / 5 + 2) * Power * A / D) / 50 + 2) * Modifier`

At Level 50 (all VGC battles): `((22) * Power * A / D) / 50 + 2) * Modifier`

Where A = attacker's offensive stat, D = defender's defensive stat. Physical moves use Attack vs Defense. Special moves use Sp. Atk vs Sp. Def.

Modifier = STAB * Type Effectiveness * Weather * Critical * Random * Other

## STAB (Same-Type Attack Bonus)
STAB multiplier: 1.5x when the move's type matches the user's type.
Adaptability (Mega Glimmora ability): STAB becomes 2.0x instead of 1.5x.
Dragonize (Mega Feraligatr ability): Normal-type moves become Dragon-type with a 1.2x boost (stacks with STAB if user is Dragon-type).

## Type Effectiveness Multipliers
Super effective: 2.0x per advantage (4.0x if double super effective).
Not very effective: 0.5x per resistance (0.25x if double resisted).
Immune: 0x (no damage).

## Weather Modifiers
Sun (Drought/Mega Charizard Y/Mega Meganium's Mega Sol):
- Fire moves: 1.5x damage
- Water moves: 0.5x damage
- Solar Beam/Solar Blade: No charge turn needed
- Moonlight/Morning Sun/Synthesis: Heals 66.7% HP

Rain (Drizzle/Pelipper):
- Water moves: 1.5x damage
- Fire moves: 0.5x damage
- Thunder/Hurricane: Never miss
- Electro Shot: No charge turn needed (Archaludon synergy)

Sandstorm (Sand Stream/Tyranitar/Hippowdon):
- Rock-type SpD: +50%
- Damages non-Rock/Ground/Steel types for 1/16 HP per turn
- Sand Rush doubles speed (Excadrill)

Snow (Snow Warning/Mega Froslass/Alolan Ninetales):
- Ice-type Def: +50%
- Aurora Veil can be set (halves damage from both physical and special attacks)
- Slush Rush doubles speed

## Critical Hits
Critical hit multiplier: 1.5x damage.
Crits ignore the attacker's stat drops and the defender's stat boosts.
Base crit rate: 1/24 (~4.17%). Focus Energy or Scope Lens: 1/8 (12.5%). Both: 1/2 (50%).

## Burn Effect on Damage
Burned Pokemon deal 0.5x damage with physical moves.
Exception: Pokemon with the Guts ability deal 1.5x damage instead when burned (physical moves only).

## Spread Move Damage in Doubles
Moves that hit multiple targets (Earthquake, Rock Slide, Heat Wave, etc.) deal 0.75x damage in Doubles when hitting two targets. Full damage if only one target remains.

## Champions Stat Points (SP) System
IVs: All Pokemon have 31 IVs in every stat (locked, cannot be changed).
Stat Points (SP): 66 total, maximum 32 per stat.
SP are equivalent to EVs / 8. So 32 SP ≈ 256 EVs, 66 total SP ≈ 528 total EVs.
Common spreads: 32/32/2 (two maxed stats + 2 leftover), or 32/20/14 (bulk + offense).

## Stat Calculation at Level 50
HP = ((2 * Base + 31) * 50 / 100) + 50 + 10 + floor(SP * 4 / 8) * 50 / 100
Other stats = (((2 * Base + 31) * 50 / 100) + 5) * Nature

Nature modifier: 1.1x for boosted stat, 0.9x for reduced stat (called "Stat Alignment" in Champions, freely changeable).

## Item Damage Modifiers in Champions
IMPORTANT: Many standard competitive items are MISSING from Champions.

Available damage items:
- Type-boosting items (Charcoal, Mystic Water, Magnet, etc.): 1.2x to that type
- Scope Lens: Raises crit rate by one stage
- Shell Bell: Restores 1/8 of damage dealt to holder

NOT available (do NOT use in calculations):
- Life Orb (1.3x — not in game)
- Choice Band / Choice Specs (1.5x — not in game)
- Assault Vest (1.5x SpD — not in game)
- Expert Belt (1.2x on SE — not in game)
- Metronome held item (escalating boost — not in game)
- Throat Spray (+1 SpA on sound moves — not in game)
- Gems (Normal Gem, typed Gems — not in game)

## Protect Interaction
Protect blocks all damage. PP is 8 in Champions (reduced from standard).
Unseen Fist (Mega Golurk): Deals 25% of normal damage through Protect (nerfed from 100% in S/V).
Piercing Drill (Mega Excadrill): Deals 25% through Protect.
Feint: Breaks Protect and deals damage.

## Screens in Doubles
Reflect: Reduces physical damage by 33% in Doubles (nerfed from 50% in S/V).
Light Screen: Reduces special damage by 33% in Doubles (nerfed from 50% in S/V).
Aurora Veil: Reduces all damage by 33% in Doubles. Requires Snow.
Note: Light Clay is NOT available in Champions, so screens last 5 turns (not 8).
