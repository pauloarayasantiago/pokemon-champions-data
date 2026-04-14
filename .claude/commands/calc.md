Pokemon Champions damage calculator. Run calcs for specific matchups or show all moves.

## Usage

Parse the user's request and run one or more damage calculations using the CLI tool.

### Single move calc
```bash
npx tsx scripts/calc.ts "Attacker Move vs Defender"
```

### All moves (best moves ranked)
```bash
npx tsx scripts/calc.ts "Attacker vs Defender"
```

### With conditions
Available flags:
- `--weather sun|rain|sand|snow`
- `--spread` — spread move (0.75x in Doubles)
- `--crit` — critical hit
- `--mega` — attacker is Mega-evolved
- `--mega-def` — defender is Mega-evolved
- `--item <name>` — attacker item (e.g., "Charcoal")
- `--item-def <name>` — defender item
- `--sp hp/atk/def/spa/spd/spe` — attacker Stat Points (default: 0/32/0/0/0/32)
- `--sp-def hp/atk/def/spa/spd/spe` — defender Stat Points
- `--burned` — attacker is burned
- `--reflect` / `--screen` — defender has Reflect/Light Screen
- `--helping-hand` — Helping Hand active

### Examples
```bash
npx tsx scripts/calc.ts "Garchomp Earthquake vs Incineroar"
npx tsx scripts/calc.ts "Mega Charizard Heat Wave vs Venusaur" --weather sun --spread
npx tsx scripts/calc.ts "Dragonite Extreme Speed vs Garchomp" --mega --helping-hand
npx tsx scripts/calc.ts "Garchomp vs Incineroar"
```

## Step 1: Parse the Request

Identify from the user's message:
1. Attacker Pokemon (and whether it's Mega)
2. Move name (if specified) — if not specified, show all moves
3. Defender Pokemon (and whether it's Mega)
4. Field conditions (weather, screens, spread, items, SP spreads)

If the user provides a full competitive set with SP spreads, pass `--sp` and `--sp-def`.
If the user just names Pokemon without spreads, the default 0/32/0/0/0/32 offensive spread is used.

## Step 2: Run the Calc(s)

Run the appropriate `npx tsx scripts/calc.ts` commands. You can run multiple in parallel for bulk requests (e.g., "calc my whole team vs Garchomp").

## Step 3: Format Output

Present results clearly:
- For single calcs: show the full description, damage range, rolls, and 2HKO info
- For all-moves: show the ranked table of best moves
- For bulk calcs: summarize with a table

Always note if a matchup is an OHKO, guaranteed 2HKO, or if the target lives comfortably.

## Argument

$ARGUMENTS
