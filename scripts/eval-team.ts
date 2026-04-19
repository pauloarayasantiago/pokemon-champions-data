/**
 * Team-builder accuracy eval.
 *
 * Sends fixture prompts to /api/team (or a local equivalent via direct tool invocation),
 * extracts the `team-json` fenced block from the assistant's final content,
 * and validates every set with lib/team-validator.ts.
 *
 * Usage:
 *   npx tsx scripts/eval-team.ts [--base-url http://localhost:3000] [--model gemini-2.5-flash] [--fixtures all|from-report,rain-pelipper]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { validateSet, type SetValidation } from "../lib/team-validator.js";

interface Fixture {
  id: string;
  prompt: string;
  requiredMon?: string[];
  archetypeKeywords?: string[];
  requireSlowHitter?: boolean;
}

interface TeamJson {
  archetype?: string;
  megaStone?: string;
  pokemon: Array<{
    name: string;
    item?: string;
    ability?: string;
    moves: string[];
    spread?: string;
    nature?: string;
  }>;
}

interface FixtureResult {
  id: string;
  ok: boolean;
  error?: string;
  totalMs?: number;
  contentChars?: number;
  toolCalls?: Record<string, number>;
  team?: TeamJson;
  validations?: SetValidation[];
  phantomMoves?: Array<{ pokemon: string; move: string; reason: string }>;
  illegalItems?: Array<{ pokemon: string; item: string; reason: string }>;
  illegalAbilities?: Array<{ pokemon: string; ability: string; reason: string }>;
  megaIssues?: Array<{ pokemon: string; stone: string; reason: string }>;
  archetypeOk?: boolean;
  requiredMonOk?: boolean;
  legalTeam?: boolean;
}

function parseArgs() {
  const args: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true";
      args[key] = val;
    }
  }
  return args;
}

async function runFixture(fixture: Fixture, baseUrl: string, model: string): Promise<FixtureResult> {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/team`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: fixture.prompt }],
    }),
  });
  if (!res.ok || !res.body) {
    return { id: fixture.id, ok: false, error: `HTTP ${res.status}` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let assistantContent = "";
  const toolCalls: Record<string, number> = {};
  let finishError: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === "content" && typeof evt.delta === "string") {
          assistantContent += evt.delta;
        } else if (evt.type === "tool_call" && typeof evt.name === "string") {
          toolCalls[evt.name] = (toolCalls[evt.name] ?? 0) + 1;
        } else if (evt.type === "error") {
          finishError = String(evt.error);
        }
      } catch {
        // ignore
      }
    }
  }

  const totalMs = Date.now() - t0;
  if (finishError) {
    return { id: fixture.id, ok: false, error: finishError, totalMs, contentChars: assistantContent.length, toolCalls };
  }

  const team = extractTeamJson(assistantContent);
  if (!team) {
    return {
      id: fixture.id,
      ok: false,
      error: "no team-json fenced block found",
      totalMs,
      contentChars: assistantContent.length,
      toolCalls,
    };
  }

  const validations = team.pokemon.map((p) =>
    validateSet({
      pokemon: p.name,
      moves: p.moves,
      item: p.item,
      ability: p.ability,
      megaStone: p.item && /ite( x| y)?$/i.test(p.item) ? p.item : team.megaStone,
    }),
  );

  const phantomMoves: Array<{ pokemon: string; move: string; reason: string }> = [];
  const illegalItems: Array<{ pokemon: string; item: string; reason: string }> = [];
  const illegalAbilities: Array<{ pokemon: string; ability: string; reason: string }> = [];
  const megaIssues: Array<{ pokemon: string; stone: string; reason: string }> = [];

  validations.forEach((v, i) => {
    const mon = team.pokemon[i].name;
    v.moves.filter((m) => !m.valid).forEach((m) => phantomMoves.push({ pokemon: mon, move: m.name, reason: m.reason ?? "" }));
    if (v.item && !v.item.valid) illegalItems.push({ pokemon: mon, item: team.pokemon[i].item ?? "", reason: v.item.reason ?? "" });
    if (v.ability && !v.ability.valid) illegalAbilities.push({ pokemon: mon, ability: team.pokemon[i].ability ?? "", reason: v.ability.reason ?? "" });
    if (v.megaStone && !v.megaStone.valid) megaIssues.push({ pokemon: mon, stone: team.megaStone ?? team.pokemon[i].item ?? "", reason: v.megaStone.reason ?? "" });
  });

  const teamNames = new Set(team.pokemon.map((p) => p.name.toLowerCase().replace(/^mega\s+/, "")));
  const requiredMonOk =
    !fixture.requiredMon || fixture.requiredMon.every((r) => teamNames.has(r.toLowerCase()));

  const lowerArch = (team.archetype ?? "").toLowerCase() + " " + assistantContent.toLowerCase();
  const archetypeOk = !fixture.archetypeKeywords || fixture.archetypeKeywords.some((kw) => lowerArch.includes(kw));

  const legalTeam = validations.every((v) => v.overall);

  return {
    id: fixture.id,
    ok: true,
    totalMs,
    contentChars: assistantContent.length,
    toolCalls,
    team,
    validations,
    phantomMoves,
    illegalItems,
    illegalAbilities,
    megaIssues,
    archetypeOk,
    requiredMonOk,
    legalTeam,
  };
}

function extractTeamJson(content: string): TeamJson | null {
  const match = content.match(/```team-json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as TeamJson;
  } catch {
    return null;
  }
}

function printReport(results: FixtureResult[]) {
  const line = "─".repeat(80);
  console.log("\n" + line + "\nTEAM-BUILDER ACCURACY REPORT\n" + line);

  let totalMoves = 0, phantomMoves = 0, totalItems = 0, illegalItems = 0;
  let legalTeams = 0, runsOk = 0;

  for (const r of results) {
    console.log(`\n[${r.id}] ${r.ok ? "✓" : "✗"} ${r.totalMs ?? 0}ms  chars=${r.contentChars ?? 0}  tools=${r.toolCalls ? Object.entries(r.toolCalls).map(([k, v]) => `${k}:${v}`).join(" ") : "none"}`);
    if (!r.ok) {
      console.log(`  ERROR: ${r.error}`);
      continue;
    }
    runsOk++;
    const monCount = r.team?.pokemon.length ?? 0;
    const moveCount = (r.team?.pokemon ?? []).reduce((s, p) => s + p.moves.length, 0);
    totalMoves += moveCount;
    phantomMoves += r.phantomMoves?.length ?? 0;
    totalItems += (r.team?.pokemon ?? []).filter((p) => p.item).length;
    illegalItems += r.illegalItems?.length ?? 0;
    if (r.legalTeam) legalTeams++;
    console.log(`  archetype=${r.team?.archetype ?? "?"}  mega=${r.team?.megaStone ?? "?"}  pokemon=${monCount}`);
    console.log(`  legal=${r.legalTeam}  requiredMon=${r.requiredMonOk}  archetypeOk=${r.archetypeOk}`);
    if (r.phantomMoves?.length) {
      console.log(`  phantom moves (${r.phantomMoves.length}):`);
      r.phantomMoves.forEach((p) => console.log(`    • ${p.pokemon} → ${p.move}: ${p.reason}`));
    }
    if (r.illegalItems?.length) {
      console.log(`  illegal items (${r.illegalItems.length}):`);
      r.illegalItems.forEach((p) => console.log(`    • ${p.pokemon} → ${p.item}: ${p.reason}`));
    }
    if (r.illegalAbilities?.length) {
      console.log(`  illegal abilities (${r.illegalAbilities.length}):`);
      r.illegalAbilities.forEach((p) => console.log(`    • ${p.pokemon} → ${p.ability}: ${p.reason}`));
    }
    if (r.megaIssues?.length) {
      console.log(`  mega issues:`);
      r.megaIssues.forEach((p) => console.log(`    • ${p.pokemon} → ${p.stone}: ${p.reason}`));
    }
  }

  console.log("\n" + line + "\nAGGREGATE\n" + line);
  console.log(`runs ok: ${runsOk}/${results.length}`);
  console.log(`legal teams: ${legalTeams}/${runsOk}  (${runsOk ? ((legalTeams / runsOk) * 100).toFixed(1) : 0}%)`);
  console.log(`phantom move rate: ${phantomMoves}/${totalMoves}  (${totalMoves ? ((phantomMoves / totalMoves) * 100).toFixed(2) : 0}%)`);
  console.log(`illegal item rate: ${illegalItems}/${totalItems}  (${totalItems ? ((illegalItems / totalItems) * 100).toFixed(2) : 0}%)`);
  console.log(line + "\n");
}

async function main() {
  const args = parseArgs();
  const baseUrl = args["base-url"] ?? process.env.EVAL_BASE_URL ?? "http://localhost:3000";
  const model = args.model ?? "gemini-2.5-flash";
  const fixturesFilter = args.fixtures ?? "all";

  const fixturesPath = join(process.cwd(), "tests/fixtures/team-prompts.json");
  const all = (JSON.parse(readFileSync(fixturesPath, "utf-8")) as { fixtures: Fixture[] }).fixtures;
  const selected = fixturesFilter === "all"
    ? all
    : all.filter((f) => fixturesFilter.split(",").includes(f.id));

  if (selected.length === 0) {
    console.error(`No fixtures matched: ${fixturesFilter}`);
    process.exit(1);
  }

  console.log(`Running ${selected.length} fixture(s) against ${baseUrl} with model ${model}...`);
  const results: FixtureResult[] = [];
  for (const fix of selected) {
    console.log(`  → ${fix.id}: ${fix.prompt.slice(0, 70)}${fix.prompt.length > 70 ? "…" : ""}`);
    try {
      results.push(await runFixture(fix, baseUrl, model));
    } catch (e) {
      results.push({ id: fix.id, ok: false, error: (e as Error).message });
    }
  }

  printReport(results);

  const snapshotsDir = join(process.cwd(), "snapshots");
  if (!existsSync(snapshotsDir)) mkdirSync(snapshotsDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  const snapshotPath = join(snapshotsDir, `team-eval-${stamp}.json`);
  writeFileSync(snapshotPath, JSON.stringify({ model, baseUrl, fixturesFilter, results }, null, 2));
  console.log(`Snapshot: ${snapshotPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
