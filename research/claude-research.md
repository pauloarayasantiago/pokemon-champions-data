# Pokémon Champions (2026): Competitive Knowledge Base

**Pokémon Champions is a ground-up competitive battle simulator — not a mainline RPG — that launched April 8, 2026, as the official replacement for Scarlet/Violet VGC.** The game introduces sweeping mechanical changes: Mega Evolution returns as the sole battle gimmick, Terastallization is absent, IVs are eliminated, paralysis and freeze are nerfed, Protect PP is halved, Fake Out becomes unselectable after turn one, and several key items like Life Orb and Choice Band are missing entirely. Regulation M-A runs through June 17, 2026, with **~186 fully-evolved Pokémon and 59 Mega Evolutions** on the roster. The first official VGC event on Champions is the Global Challenge (May 1–4), followed by Indianapolis Regionals (May 29–31) and ultimately the 2026 World Championships (August 28–30). The early meta is weather-dominated and well-balanced, with no S-tier Pokémon identified.

---

## Priority 1: Every mechanical change from previous games

Champions was built from scratch by The Pokémon Works (a TPC/ILCA joint venture). Its battle engine is entirely server-side and rewritten — legacy bugs like Trick Room Underflow are gone, and **post-launch balance patches are officially confirmed**, a franchise first. Producer Masaaki Hoshino stated devs will "pay very close attention to how players are playing it" and make adjustments accordingly.

### Complete move changelog

Serebii's Updated Attacks page and Smogon's mechanics research thread together document all known changes. The count exceeds the initially reported 21 due to additional effect and classification changes.

**Power buffs:**

| Move | Type | Old BP → New BP | Other Changes |
|------|------|-----------------|---------------|
| Apple Acid | Grass | 80 → 90 | — |
| Beak Blast | Flying | 100 → **120** | PP cut to 8 (from 15 base) |
| Bone Rush | Ground | 25 → 30 | — |
| Fire Lash | Fire | 80 → 90 | — |
| First Impression | Bug | 90 → 100 | — |
| Grav Apple | Grass | 80 → 90 | — |
| Infernal Parade | Ghost | 60 → 65 | — |
| Mountain Gale | Ice | 100 → **120** | — |
| Night Daze | Dark | 85 → 90 | — |
| Psyshield Bash | Psychic | 70 → **90** | — |
| Spirit Shackle | Ghost | 80 → 90 | — |
| Trop Kick | Grass | 70 → **85** | — |

**Accuracy buffs:**

| Move | Old → New Accuracy |
|------|--------------------|
| Crabhammer | 90% → 95% |
| Syrup Bomb | 85% → 90% |

**Nerfs:**

| Move | Change |
|------|--------|
| Moonblast | SpAtk drop chance: 30% → **10%** |
| Iron Head | Flinch chance: 30% → **20%** |
| Dire Claw | Status infliction chance: 50% → **30%** |
| Salt Cure | Residual damage halved: 1/8 → **1/16** HP (Water/Steel: 1/4 → 1/8) |
| Ice Beam | **Can no longer freeze** the target |
| Leech Seed | Drain reduced to **1/16** HP per turn (was 1/8). Note: Smogon reports a possible bug where damage appears to still deal ~1/8 despite the description saying 1/16 |

**Type and classification changes:**

| Move | Change |
|------|--------|
| Growth | Changed from Normal-type to **Grass-type** |
| Snap Trap | Changed from Grass-type to **Steel-type** |
| Dragon Claw | Now classified as a **slicing move** (boosted by Sharpness) |
| Shadow Claw | Now classified as a **slicing move** |
| Dire Claw | Now classified as a **slicing move** |
| Poltergeist | Now works on **Mega Stones** (activates against Mega Stone holders) |
| Toxic Thread | Speed drop increased from **1 stage to 2 stages** |

**Behavioral changes:**

- **Fake Out** is now **completely unselectable** after the first turn the user enters battle. The button is greyed out. If Encored into Fake Out, the Pokémon uses **Struggle** instead. This eliminates the classic Fake Out + Sucker Punch mind game.
- **Encore priority**: An Encored Pokémon now executes at the **priority bracket of the Encored move**, not the move the player originally selected. Confirmed via video clips on Smogon.

### PP system overhaul

All PP is automatically maxed (no PP Up/PP Max items exist). PP values follow a standardized formula: `maxPP = 4 × (basePP / 5 + 1)`.

| Base PP (S/V) | Champions Max PP |
|---------------|-----------------|
| 5 | 8 |
| 10 | 12 |
| 15 | 16 |
| 20+ | 20 |

Two critical **exceptions**: **Protect PP is 8** (would be 12 under the formula from base 10) and **Beak Blast PP is 8** (would be 16 from base 15). Protect's halved PP is a deliberate competitive balance change that limits stalling strategies.

### All 4 new abilities and 23 Mega abilities

**Brand-new abilities (Champions-exclusive):**

| Ability | Pokémon | Effect |
|---------|---------|--------|
| **Mega Sol** | Mega Meganium | All moves act as if harsh sunlight is active, regardless of actual weather — a personal, ability-based sun effect |
| **Dragonize** | Mega Feraligatr | Normal-type moves become Dragon-type with a **1.2× power boost** (similar to Pixilate/Refrigerate) |
| **Piercing Drill** | Mega Excadrill | Contact moves bypass Protect/Detect and deal **25% of normal damage** through protection |
| **Spicy Spray** | Mega Scovillain | Any attacker that hits Scovillain is **burned** — does NOT require contact, activates even if Scovillain is KO'd by the hit |

**Existing ability nerf:**
- **Unseen Fist** (Urshifu, Mega Golurk): Now deals only **25% damage through Protect** (was full damage in S/V). This aligns it with Piercing Drill's behavior.

**Complete Mega ability assignments (from Serebii):**

| Mega Pokémon | Ability |
|---|---|
| Mega Clefable | Magic Bounce |
| Mega Victreebel | Innards Out |
| Mega Starmie | **Huge Power** |
| Mega Dragonite | Multiscale |
| Mega Meganium | Mega Sol ★ |
| Mega Feraligatr (Water/Dragon) | Dragonize ★ |
| Mega Skarmory | Stalwart |
| Mega Chimecho | Levitate |
| Mega Froslass | **Snow Warning** |
| Mega Emboar | Mold Breaker |
| Mega Excadrill | Piercing Drill ★ |
| Mega Chandelure | Infiltrator |
| Mega Golurk | Unseen Fist |
| Mega Chesnaught | Bulletproof |
| Mega Delphox | **Levitate** |
| Mega Greninja | Protean |
| Mega Floette | Fairy Aura |
| Mega Meowstic | Trace |
| Mega Hawlucha | **No Guard** |
| Mega Crabominable | Iron Fist |
| Mega Drampa | Berserk |
| Mega Scovillain | Spicy Spray ★ |
| Mega Glimmora | **Adaptability** |

★ = brand-new ability. Datamines suggest at least 4 additional unrevealed ability slots (IDs 313, 314, 316, 317) exist in the code.

### Status condition overhaul

Champions nerfs every major status condition, reducing RNG frustration:

| Status | Previous (S/V) | Champions | Impact |
|--------|----------------|-----------|--------|
| **Paralysis** | 25% chance to skip turn | **12.5%** (1/8) chance | Halved; Thunder Wave/Nuzzle strategies weakened |
| **Freeze** | 20% thaw per turn, can last forever | **25% thaw per turn**, guaranteed thaw by **turn 3** | No more infinite freeze hax |
| **Sleep** | Random 1–3 turns | Turn 2: 33% wake; Turn 3: **guaranteed wake** | More predictable |
| **Rest** | 2 turns asleep | **3 turns** asleep | Rest nerfed (longer recovery) |

### Stat system changes (no base stat changes)

**Base stats are identical to mainline games.** The formula at Level 50 is unchanged: HP = Base + SP + 75; Other = Nature × (Base + SP + 20). However, the training system is completely different:

- **IVs are eliminated.** All Pokémon calculate as **31 IVs in every stat**, removing the breeding/Hyper Training grind entirely.
- **EVs are replaced by "Stat Points" (SP).** Maximum **32 SP per stat**, **66 SP total** across all stats. This is functionally equivalent to the old EV system divided by 8 (252 EVs / 8 ≈ 32, 510 EVs / 8 ≈ 64), with slight extra flexibility.
- **Natures renamed "Stat Alignment."** Same 1.1×/0.9× mechanic, changeable freely through the training UI.

### Battle mechanics: what changed, what didn't

**Confirmed unchanged (HIGH confidence):**
- **Critical hit multiplier**: 1.5× (same as Gen VI onward)
- **Weather/terrain duration**: 5 turns standard; weather-extending items presumably extend to 8 (though with several key items missing, verify specific rock availability)
- **Priority brackets**: Same as Gen 9. Helping Hand at +5, Protect at +4, Fake Out at +3, Trick Room at −7.
- **Protect failure rate**: Successive use still follows the 1/3 degradation formula from prior games.

**Confirmed changed (HIGH confidence):**
- **Timer tiebreaker**: If both players have equal Pokémon remaining when the 20-minute game timer expires, the match is a **DRAW**. HP percentage no longer matters. This is controversial.
- **Mega Evolution priority**: Mega Evolution now occurs **before switching** in turn order (a bug on day one had this randomized; patched April 9).
- **Mega persistence**: If a Mega-Evolved Pokémon is revived via Revival Blessing, it **stays Mega**.
- **Protean re-trigger**: Protean can be retriggered after Mega Evolution.
- **Type effectiveness display**: 4× super-effective now shows as "Extremely Effective"; 1/4× resistance shows as "Mostly Ineffective."
- **In-battle stat display**: Stat multipliers from buffs/debuffs shown numerically during battle.

**Uncertain/early research (MEDIUM confidence):**
- **Speed ties**: Appear to resolve via **random coin flip** (50/50). Smogon's Karxrida notes "randomized port priority." With IVs gone, speed ties cannot be manipulated.
- **Entry hazards**: Stealth Rock, Spikes, and Toxic Spikes are available moves. **Heavy-Duty Boots do NOT exist** in Champions, making hazards harder to ignore — but the limited item pool and doubles-centric meta may minimize their impact.

### Terastallization: absent at launch, planned for future

**Terastallization is NOT available in Regulation M-A.** The original Champions trailer briefly showed a Dondozo Terastallizing, confirming the mechanic is planned. The **Omni Ring** (Champions' activation device for Mega Evolution) is explicitly described as supporting future mechanics: "Other special features may be added to the Omni Ring in the future." The Omni Ring's design includes Z-Move and Dynamax symbols, hinting at eventual rotation of multiple gimmicks across regulation sets.

### Item pool: dramatically reduced

This is one of the most impactful competitive changes. Champions launched with approximately **117 items** total (including berries and Mega Stones), but only roughly **30 non-berry, non-Mega Stone competitive items**.

**Confirmed MISSING (multiple independent sources):**
- Life Orb, Choice Band, Choice Specs, Assault Vest
- Rocky Helmet, Heavy-Duty Boots, Eviolite
- Flame Orb, Toxic Orb, Power Herb
- Light Clay, Covert Cloak, Loaded Dice, Utility Umbrella

**Choice Scarf status — CONFLICTING:** GameFragger says cut; Polygon and PokéBase say available. **Most likely available** based on weight of evidence (Garchomp's top item on Pikalytics). Confidence: MEDIUM.

**Confirmed AVAILABLE:** Focus Sash, Leftovers, Sitrus Berry, White Herb, Mental Herb, Lum Berry, Scope Lens, Throat Spray, Booster Energy, damage-reducing berries, type-boosting items (Charcoal, Mystic Water, etc.), all relevant Mega Stones.

**Item Clause** is built directly into the game engine — you physically cannot obtain duplicates of any item, making it impossible to equip the same item on two Pokémon.

---

## Priority 2: Regulation M-A competitive format rules

### Core format specification

| Rule | Detail |
|------|--------|
| **Battle type** | Double Battles (VGC standard) |
| **Team composition** | Bring 6, pick 4 |
| **Level** | All Pokémon auto-scaled to Level 50 |
| **Mega Evolution** | Allowed; **one per battle** |
| **Terastallization** | Not available |
| **Species Clause** | No duplicate National Dex numbers (e.g., Heat Rotom + Wash Rotom = illegal) |
| **Item Clause** | One of each item per team (enforced by game engine) |
| **Nickname Clause** | No duplicate nicknames; no naming a Pokémon after another species |
| **Active period** | April 8 – June 17, 2026 |

### Timer rules (Doubles/VGC)

| Timer | Duration |
|-------|----------|
| Team Preview | **90 seconds** |
| Move selection per turn | **45 seconds** |
| Player total time ("Your Time") | **7 minutes** |
| Game time | **20 minutes** |

Singles ladder uses different timers: 60s turn time, 10 minutes player time.

### Match format at official events

Swiss rounds can be Best-of-1 or **Best-of-3** (Bo3 strongly recommended at Regional level+). Top cuts must be Bo3. **Open Team Lists** are used at TPCi events — players swap team sheets showing species, forms, abilities, held items, all four moves, and (if applicable) Tera Type.

### Pokémon eligibility

The roster is restricted to Pokémon available in Champions — approximately **186 species** (only fully evolved forms, with Pikachu as the sole exception). **All Legendary, Mythical, Restricted, and Paradox Pokémon are banned.** Regional forms (Alolan, Galarian, Hisuian, Paldean) of eligible species are allowed. Notable competitive absences include **Amoonguss** (historically dominant VGC staple) and all Paradox Pokémon (Flutter Mane, Iron Hands, etc.).

### Mega Evolution availability in M-A

Not all Pokémon with Mega forms can Mega Evolve in M-A. **Missing Mega Stones** include: Mega Sceptile, Mega Blaziken, Mega Swampert, Mega Mawile, Mega Salamence, Mega Metagross, and several Legends Z-A Megas (Mega Raichu, Mega Staraptor, Mega Baxcalibur, and others). The "Z Mega" forms (Z Mega Absol, Z Mega Garchomp, Z Mega Lucario) are also inaccessible despite base Pokémon and regular Megas being available.

---

## Priority 3: Early meta intelligence (5 days of data)

### Usage rankings across three data sources

The early meta shows strong consensus across Pikalytics, Showdown Tier (14,595 ranked games), and Champions Lab (1,410 tournament teams + ladder data):

| Rank | Pokémon | Usage Range | Win Rate Range | Tier |
|------|---------|-------------|----------------|------|
| 1 | **Incineroar** | 48–54% | 49.8–51.4% | B (overcentralizing but not dominant) |
| 2 | **Sneasler** | 38–43% | 51.8–52.1% | A |
| 3 | **Garchomp** | 35–36% | 51.8–52.1% | A |
| 4 | **Sinistcha** | 32–35% | 50.9–53.2% | B |
| 5 | **Kingambit** | 22–26% | 52.4–52.6% | A |
| 6 | **Whimsicott** | 20–22% | 48.3–50.8% | D |
| 7 | **Basculegion** | 18–22% | 51.2–52.8% | B |
| 8 | **Charizard** | 15–19% | 50.2–51.6% | C |
| 9 | **Pelipper** | 15–19% | 49.7–51.2% | C |
| 10 | **Tyranitar** | 15–16% | 51.0–51.8% | C |

**No S-tier Pokémon have been identified.** Showdown Tier explicitly labels the format as well-balanced. Incineroar's B-tier rating despite highest usage reflects its sub-50% win rate — a classic "overcentralizing but not actually winning" pattern.

### Highest win-rate Pokémon (sleeper picks)

| Pokémon | Win Rate | Usage | Notes |
|---------|----------|-------|-------|
| **Azumarill** | **57.9%** | 1.4% | Highest WR in format; classic Belly Drum/Aqua Jet threat |
| **Floette-Eternal** | **55.7%** | 13.9% | Best WR among commonly-used Pokémon; Fairy Aura Mega available |
| **Aerodactyl** | 54.1% | 7.7% | Fast Rock-type support |
| **Mega Delphox** | 54.1% | 6.1% | Fire/Psychic with Levitate; S-tier Mega per Game8 |
| **Rotom-Wash** | 53.1% | 18.2% | Reliable Water/Electric utility |

### Dominant team archetypes and core pairs

**Weather wars define the Regulation M-A meta.** The absence of Terastallization means type matchups are more rigid, and weather-boosted attacks gain relative power.

**Highest win-rate cores (from tournament data):**

| Core | Win Rate | Usage | Strategy |
|------|----------|-------|----------|
| Torkoal + Venusaur | 56.8% | 6.2% | Drought + Chlorophyll Sun |
| Tyranitar + Excadrill | 56.2% | 15.8% | Sand Stream + Sand Rush |
| Archaludon + Pelipper | 55.8% | 20.8% | Rain-boosted Electro Shot + Stamina |
| Charizard + Venusaur | 55.4% | 12.8% | Mega Charizard Y Drought + Chlorophyll |
| Pelipper + Basculegion | 55.2% | 21.4% | Drizzle + Swift Swim |
| Torkoal + Farigiraf | 55.2% | 8.6% | Drought + Trick Room Eruption |

**Top archetypes by meta share:**

- **Standard Goodstuffs** (~22%): Incineroar/Garchomp/Dragapult/Kingambit/Hatterene/Whimsicott
- **Tailwind Offense** (~20%): Whimsicott-led speed control with Garchomp/Dragapult
- **Sand Rush** (~19%): Tyranitar + Excadrill + Garchomp core
- **Sun Hyper Offense**: Torkoal/Venusaur/Charizard with Mega Charizard Y
- **Hard Trick Room** (~64% WR): Hatterene/Clefable/Kingambit/Rhyperior — one of the highest-performing archetypes
- **Rain Rush**: Pelipper/Politoed with Basculegion and Mega Blastoise

### Early tournament results

The first major community tournament (Champions Hub Discord, April 8) drew **500+ players** with a $500 prize pool, hosted on Limitless TCG. Key finding: **none of the top 3 finishing teams used Incineroar**, despite its 54% usage rate. Sneasler appeared on all three top teams. Aerodactyl posted a **60.9% win rate** on just 2.3% usage — the format's most efficient sleeper pick.

**Notable winning teams from 14 tracked community tournaments:**
- **Striider** (203-player event): Incineroar/Gengar/Floette/Politoed/Whimsicott/Kommo-o
- **Magnetman** (122-player event): Excadrill/Tyranitar/Sinistcha/Rotom-Wash/Incineroar/Floette
- **OkayTokay369** (56-player Wolfey Patreon tournament): Victreebel/H-Arcanine/Charizard/Corviknight/Milotic/Sneasler

### Top Pokémon builds (Champions SP system)

**Incineroar** — Role: Disruptive pivot
- Ability: Intimidate (97–100% usage)
- Nature: Careful (+SpD) or Impish (+Def)
- SP spread: Max HP, rest into Def/SpD
- Moves: Fake Out (99%), Parting Shot (95%), Flare Blitz (85%), Throat Chop or Knock Off
- Item: Sitrus Berry (~59%)
- Top teammates: Sinistcha, Sneasler, Garchomp

**Sneasler** — Role: Fast physical attacker/Fake Out support
- Ability: Unburden (primary)
- Nature: Jolly (+Spe) or Adamant (+Atk)
- SP spread: Max Atk and Spe
- Moves: Dire Claw (35%), Close Combat (35%), Fake Out (25%), Protect (16%)
- Items: White Herb, Focus Sash, Psychic Seed
- 4× Psychic weakness is the key vulnerability in a meta with Mega Delphox and Farigiraf

**Garchomp** — Role: Versatile physical sweeper
- Ability: Rough Skin (primary)
- Nature: Adamant or Jolly
- Moves: Earthquake, Dragon Claw (now Sharpness-eligible), Rock Slide, Protect
- Items: Choice Scarf, White Herb, Lum Berry
- Mega Garchomp (Sand Force, 170 Atk) used on Tyranitar Sand teams

### Highest win-rate moves

| Move | Win Rate | Primary Users |
|------|----------|---------------|
| Dire Claw | 55.6% | Sneasler |
| Endure | 55.0% | Various |
| Eruption | 54.2% | Torkoal (Trick Room) |
| Amnesia | 53.7% | Slowbro, Farigiraf |
| Instruct | 53.5% | Oranguru |
| Electro Shot | 53.4% | Archaludon |

---

## Priority 4: Community resources and tools

### Databases and reference sites

**Serebii** (serebii.net/pokemonchampions/) has the most comprehensive Champions database, with dedicated pages for every system: Pokédex, Attackdex, Available Pokémon, Updated Attacks, Mega Abilities, Items, Ranked Battle rules, Training, Battle Pass, Recruiting, and more. This is the single best reference for raw game data.

**Bulbapedia** (bulbapedia.bulbagarden.net) maintains a Champions article, Regulation M-A page, and full Pokémon roster list. **Smogon** (smogon.com/forums/forums/champions.1019/) has launched a dedicated Champions forum section with active OU metagame discussion (91K+ views, 400+ replies), a mechanics research thread, and BSS Role Compendium for Reg M-A.

### Competitive analytics platforms

- **Pikalytics** (pikalytics.com) — Live Champions VGC usage data from ranked ladder; includes damage calculator at pikalytics.com/calc
- **Showdown Tier** (showdowntier.com/formats/dma/) — Daily-updated tier rankings from 14,595+ Showdown battles; viability tiers with win-rate analysis
- **Champions Lab** (championslab.xyz/meta) — ML-powered analysis combining real tournament data with 2M+ simulated battles; core pair matrices, archetype rankings, rental teams. Treat ML simulation data with appropriate skepticism.
- **Pokémon Showdown** (play.pokemonshowdown.com) — Has implemented VGC 2026 Regulation M-A ladder for team testing

### Damage calculators and team builders

- **Porygon Labs** (porygonlabs.com) — Dedicated Champions VGC damage calculator with Mega Evolution support, SP system, and speed tier tools
- **Nerd of Now Calculator** (nerd-of-now.github.io/NCP-VGC-Damage-Calculator/) — VGC 2026 Champions calc maintained by Alex Collins; Honko/Trainer Tower lineage
- **ChampTeams.gg** (champteams.gg) — All-in-one team builder with built-in damage calc, type coverage, speed tiers, Showdown import/export, and community team browser
- **Champions Builder** (championsbuilder.com) — Free team builder with SP calculator, damage calc, Mega Evolution support
- **Game8** (game8.co/games/Pokemon-Champions/) — Integrated damage calculator and team builder plus comprehensive tier lists and guides
- **Pokesample** (pokesample.com/en/calculator-champions) — Champions-specific damage calculator
- **ChampDex** (iOS app) — Mobile companion with Pokédex, team builder, and meta tracking (some users report data quality issues)

### Tournament platforms and VGC coverage

**Victory Road** (victoryroad.pro) is the premier VGC coverage site, with a dedicated Champions regulations page (victoryroad.pro/champions-regulations/), 2026 season calendar, and event-specific pages for Indianapolis Regionals, NAIC, and Worlds. **Limitless TCG** (play.limitlesstcg.com) hosts community tournaments, including the 500-player launch day event.

### Community hubs

**Reddit:** r/PokemonChampions is active with game discussion; r/stunfisk remains the primary competitive Pokémon subreddit with Champions meta analysis; r/pokemon (4.7M+ members) has general discussion. **Discord:** Smogon Champions Discord (linked from forum); Pokémon Champions community server (~3,130 members at discord.com/invite/pokemon-champions); Pokémon Champions VGC server (~300–450 members, competitive focus with team building, replay analysis, and rental teams).

### Content creators

**WolfeyVGC** (Wolfe Glick, 2016 World Champion) has already provided early-access Champions coverage including analysis of the Protect PP change. **CybertronVGC** (Aaron Zheng) and **Freezai** (Bhushan Thumsi, 2026 Orlando Regionals winner) are producing Champions competitive content. **Skraw!VGC** is running live community tournaments with Champions' built-in spectator mode. Official broadcasts will begin with Indianapolis Regionals on the Play! Pokémon YouTube channel.

### Patch tracking

**Perfectly Nintendo** (perfectly-nintendo.com) maintains an update tracker for all Champions patches. The first patch (April 9) fixed Mega Evolution turn ordering, and **PocketMonsters.Net** documented seven launch bugs including Leech Seed description mismatch, Lightning Rod/Encore interaction failure, and HOME transfer errors.

---

## Known bugs and discrepancies to monitor

Several unresolved issues deserve ongoing attention. **Leech Seed** displays 1/16 HP drain in its description but may mechanically deal ~1/8 — Smogon's mechanics thread flagged this discrepancy and it appears on the official known-issues list. **Unnerve** sometimes fails to prevent switch-in berry consumption. **Lightning Rod** does not correctly redirect Encored Electric-type moves. The **Stalwart** ability on Mega Skarmory may have been buffed to include Mold Breaker effects (bypassing defensive abilities), but this is **unconfirmed**.

Some Pikalytics data currently visible may blend pre-Champions Regulation I data with Champions Regulation M-A data — item usage showing Assault Vest and Rocky Helmet on Incineroar likely reflects legacy data, since both items are confirmed absent from Champions.

---

## Event timeline

| Date | Event | Notes |
|------|-------|-------|
| Apr 8 | Champions launch + Ranked Battles begin | Regulation M-A starts |
| Apr 8–12 | Warm-Up Challenge (in-game) | First official event |
| May 1–4 | **Global Challenge I** (online) | First official Champions tournament; no CP in TPCi regions |
| May 29–31 | **Indianapolis Regionals** | First live VGC event on Champions |
| Jun 6–7 | Turin Special Event | — |
| Jun 12–14 | **North America International Championships** | Major live event |
| Jun 17 | Regulation M-A ends | New regulation expected |
| Aug 28–30 | **2026 Pokémon World Championships** | Champions as official platform |

## Conclusion

Champions represents the most aggressive rebalancing in competitive Pokémon history. The removal of Terastallization, the gutting of the item pool, and status condition nerfs collectively shift the game toward more predictable, skill-testing interactions — fewer stolen games from infinite freeze or Tera-type surprises, more emphasis on team composition and weather control. The **dramatically reduced item pool** (no Life Orb, no Choice Band/Specs, no Assault Vest) is perhaps the single most impactful change, compressing viable item choices and making Focus Sash, Sitrus Berry, and White Herb the new staples. The meta is early but healthy: Incineroar is overcentralizing in usage but underperforming in win rate, weather archetypes compete with Trick Room and goodstuffs builds, and sleeper picks like Azumarill (57.9% WR) and Floette-Eternal (55.7% WR) suggest significant undiscovered depth. With balance patches confirmed and Terastallization, Z-Moves, and Dynamax all hinted at for future regulations via the Omni Ring system, the competitive landscape will continue evolving rapidly.