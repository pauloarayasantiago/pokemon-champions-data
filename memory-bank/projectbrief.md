# Project Brief: Pokémon Champions Expert Agent

## Goal
Build an AI system within Claude Code that serves as a Pokémon Champions (released April 8, 2026) competitive expert, helping with VGC Doubles team building.

## Core Capabilities
1. **Team Building** — Suggest 6-Pokémon teams with synergy, coverage, and role balance
2. **Gap Filling** — Given 1-5 existing Pokémon, recommend teammates to complete the team
3. **Set Optimization** — Recommend moves, abilities, items, natures, and Stat Point spreads
4. **Matchup Analysis** — Evaluate team strengths/weaknesses against common threats and meta archetypes
5. **Meta Awareness** — Understand the Champions-specific meta, usage statistics, and competitive landscape
6. **Multiple Teams** — Help build and iterate across several teams simultaneously

## Critical Constraint: Champions ≠ Scarlet/Violet
Pokémon Champions is a **separate game** with sweeping mechanical changes:
- **Mega Evolution** is the sole battle gimmick (no Terastallization at launch)
- **One Mega per battle** — team-wide limit, cannot Mega a second Pokémon even if first faints
- **IVs eliminated** — all Pokémon have 31 IVs; no 0-Speed trick room optimization
- **EVs replaced by Stat Points** — 66 total, max 32 per stat (equivalent to ~528 EVs)
- **Fake Out** hard-locked to first turn only; if Encored, user Struggles
- **Encore** forces the Encored move's priority bracket
- **Status nerfs** — Paralysis 12.5% immobility, Freeze guaranteed thaw turn 3, Sleep guaranteed wake turn 3
- **21+ move changes** — power buffs, type changes (Growth→Grass, Snap Trap→Steel), new slicing classifications
- **4 new abilities** — Piercing Drill, Dragonize, Mega Sol, Spicy Spray
- **23 new Mega abilities** — Mega Starmie (Huge Power), Mega Dragonite (Multiscale), Mega Gengar (Shadow Tag), etc.
- **Dramatically reduced item pool** (~138 items) — Missing: Life Orb, Choice Band/Specs, Assault Vest, Rocky Helmet, Eviolite, Toxic/Flame Orb, Heavy-Duty Boots, Power Herb, Light Clay, Covert Cloak, Loaded Dice, Utility Umbrella, Expert Belt, Clear Amulet, Throat Spray, Metronome (item), Booster Energy, Gems, Weakness Policy, Black Sludge, Safety Goggles
- **186 fully-evolved Pokémon only** (no NFEs except Pikachu) — No Porygon2, Clefairy, Dusclops
- **Incineroar lost Knock Off and U-turn** — massive competitive impact
- **Screens nerfed in Doubles** — Reflect/Light Screen reduce damage by 33% (was 50%)
- **PP standardized** — all PP auto-maxed; Protect has only 8 PP
- **Salt Cure nerfed** — 1/16 HP per turn (Leftovers completely offsets it)
- **Balance patches confirmed** — first-ever in franchise history

## Data Sources
- **Serebii.net** — Game data (Pokémon, moves, items, abilities) via `scraper.py`
- **YouTube creators** — Competitive meta takes and team builds via `scraper_youtube.py`
- **External AI research** — Comprehensive competitive analysis in `research/` folder
- **Pikalytics** — Usage statistics (pending collection)

## Target Format
- **VGC Doubles** — Regulation M-A (April 8 – June 17, 2026)
- Bring 6, pick 4
- Auto-leveled to Level 50
- Open Team Lists at official events

## Interface
- Always-on expert persona via CLAUDE.md
- `/team` skill for structured team-building queries
- `/calc` skill for ad-hoc damage calculations
- `/research` skill for automated competitive data gathering
- Existing `/lookup` and `/reindex` for RAG operations
