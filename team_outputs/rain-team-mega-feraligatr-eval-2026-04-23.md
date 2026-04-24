# Rain Team — Mega Feraligatr (Eval Test 2)

Complete 6-Pokemon rain team for VGC Doubles Champions format, built around Mega Feraligatr.

## Core Strategy

Pelipper sets rain → Archaludon uses instant Electro Shot → Basculegion outspeeds everything via Swift Swim → Feraligatr sets up with Dragon Dance and cleans late with Dragonize-boosted Aqua Jet priority. Sinistcha redirects with Rage Powder; Incineroar provides Intimidate and Fake Out.

## Team

1. **Pelipper** @ Focus Sash — Drizzle. Lead rain setter. Hurricane spread STAB (97% usage). Tailwind gives speed even if rain runs out.
2. **Archaludon** @ Leftovers — Stamina. Rain's premier special attacker. Electro Shot fires instantly in rain (130 BP, no charge). Flash Cannon for Fairy coverage, Draco Meteor for nukes.
3. **Basculegion** @ Choice Scarf — Swift Swim. In rain, effective Speed far above meta; Scarf = outspeed insurance outside rain. Last Respects is a late-game win-con.
4. **Feraligatr (Mega)** @ Feraligite — Sheer Force → Dragonize on Mega. Water/Dragon Mega. Liquidation + rain + Sheer Force boost = colossal Atk 160. Dragon Dance sweep. Aqua Jet + Ice Punch for coverage (Aqua Jet stays Water for STAB; Ice Punch for Ice coverage).
5. **Incineroar** @ Sitrus Berry — Intimidate. Support: Fake Out + Parting Shot + Flare Blitz + Darkest Lariat.
6. **Sinistcha** @ Sitrus Berry — Hospitality. Rage Powder redirects off fragile Mega Feraligatr and Archaludon. Strength Sap + Matcha Gotcha self-heal.

## Bring-4 Plans

- vs Tailwind / fast offense: Pelipper + Archaludon + Basculegion + Incineroar
- vs Trick Room: Feraligatr + Sinistcha + Incineroar + Pelipper (DD setup, redirect, Fake Out)
- vs opposing rain: Pelipper + Basculegion + Archaludon + Feraligatr
- vs Sun (Charizard/Venusaur): Pelipper (rain overwrites sun) + Archaludon + Basculegion + Incineroar

```team-json
{
  "archetype": "Rain",
  "pokemon": [
    {
      "name": "Pelipper",
      "item": "Focus Sash",
      "ability": "Drizzle",
      "moves": ["Hurricane", "Weather Ball", "Tailwind", "Protect"],
      "spread": "32/0/0/32/0/2",
      "nature": "Modest"
    },
    {
      "name": "Archaludon",
      "item": "Leftovers",
      "ability": "Stamina",
      "moves": ["Electro Shot", "Flash Cannon", "Draco Meteor", "Protect"],
      "spread": "32/0/2/32/0/0",
      "nature": "Modest"
    },
    {
      "name": "Basculegion",
      "item": "Choice Scarf",
      "ability": "Swift Swim",
      "moves": ["Wave Crash", "Last Respects", "Aqua Jet", "Flip Turn"],
      "spread": "0/32/0/0/2/32",
      "nature": "Adamant"
    },
    {
      "name": "Feraligatr",
      "item": "Feraligite",
      "ability": "Sheer Force",
      "moves": ["Liquidation", "Dragon Dance", "Aqua Jet", "Ice Punch"],
      "spread": "4/32/0/0/0/30",
      "nature": "Adamant"
    },
    {
      "name": "Incineroar",
      "item": "Sitrus Berry",
      "ability": "Intimidate",
      "moves": ["Fake Out", "Parting Shot", "Flare Blitz", "Darkest Lariat"],
      "spread": "32/0/16/0/18/0",
      "nature": "Careful"
    },
    {
      "name": "Sinistcha",
      "item": "Sitrus Berry",
      "ability": "Hospitality",
      "moves": ["Matcha Gotcha", "Rage Powder", "Life Dew", "Strength Sap"],
      "spread": "32/0/18/0/16/0",
      "nature": "Calm"
    }
  ]
}
```
