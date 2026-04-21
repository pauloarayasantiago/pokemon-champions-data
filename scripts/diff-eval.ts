import { readFileSync } from "node:fs";

const [baselinePath, currentPath] = process.argv.slice(2);
if (!baselinePath || !currentPath) {
  console.error("usage: tsx diff-eval.ts <baseline.json> <current.json>");
  process.exit(2);
}

type Metrics = { n: number; ndcg: number; recall: number; precision: number; mrr: number; forbiddenRate: number };
type Snap = { overall: Metrics; per_intent: Record<string, Metrics>; per_difficulty: Record<string, Metrics> };

const base = JSON.parse(readFileSync(baselinePath, "utf-8")) as Snap;
const curr = JSON.parse(readFileSync(currentPath, "utf-8")) as Snap;

const fmt = (n: number) => n.toFixed(3);
const delta = (b: number, c: number) => {
  const d = c - b;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(3)}`;
};

const row = (label: string, b: Metrics, c: Metrics) => {
  const nd = delta(b.ndcg, c.ndcg);
  const re = delta(b.recall, c.recall);
  const pr = delta(b.precision, c.precision);
  const mr = delta(b.mrr, c.mrr);
  const pct = ((c.ndcg - b.ndcg) / Math.max(b.ndcg, 0.001)) * 100;
  const flag = c.ndcg < b.ndcg * 0.95 ? " ⚠ REGRESS>5%" : "";
  console.log(`  ${label.padEnd(14)} n=${b.n.toString().padStart(3)}  nDCG ${fmt(b.ndcg)}→${fmt(c.ndcg)} (${nd}, ${pct.toFixed(1)}%)  R ${nd === "+0.000" ? "" : ""}${fmt(b.recall)}→${fmt(c.recall)} (${re})  P ${fmt(b.precision)}→${fmt(c.precision)} (${pr})  MRR ${fmt(b.mrr)}→${fmt(c.mrr)} (${mr})${flag}`);
};

console.log("=".repeat(100));
console.log(`BASELINE: ${baselinePath}`);
console.log(`CURRENT:  ${currentPath}`);
console.log("=".repeat(100));
console.log("\nOVERALL:");
row("overall", base.overall, curr.overall);

console.log("\nPER INTENT:");
for (const k of Object.keys(base.per_intent)) {
  if (curr.per_intent[k]) row(k, base.per_intent[k], curr.per_intent[k]);
}

console.log("\nPER DIFFICULTY:");
for (const k of Object.keys(base.per_difficulty)) {
  if (curr.per_difficulty[k]) row(k, base.per_difficulty[k], curr.per_difficulty[k]);
}

console.log("\nGATES:");
const gates: Array<[string, number, number]> = [
  ["counter ≥ 0.65", curr.per_intent.counter?.ndcg ?? 0, 0.65],
  ["matchup ≥ 0.65", curr.per_intent.matchup?.ndcg ?? 0, 0.65],
  ["matchup P@10 ≥ 0.5", curr.per_intent.matchup?.precision ?? 0, 0.5],
  ["adversarial ≥ 0.5", curr.per_difficulty.adversarial?.ndcg ?? 0, 0.5],
  ["overall ≥ 0.78", curr.overall.ndcg, 0.78],
];
for (const [label, value, target] of gates) {
  const mark = value >= target ? "✓" : "✗";
  console.log(`  ${mark} ${label}: ${fmt(value)}`);
}

console.log("\nROLLBACK TRIGGERS:");
const triggers: string[] = [];
for (const k of Object.keys(base.per_intent)) {
  const b = base.per_intent[k];
  const c = curr.per_intent[k];
  if (c && c.ndcg < b.ndcg * 0.95) triggers.push(`  ⚠ intent ${k}: ${fmt(b.ndcg)} → ${fmt(c.ndcg)} (${(((c.ndcg - b.ndcg) / b.ndcg) * 100).toFixed(1)}%)`);
}
if (curr.per_difficulty.adversarial?.ndcg < 0.1) triggers.push(`  ⚠ adversarial nDCG ${fmt(curr.per_difficulty.adversarial.ndcg)} below floor 0.10`);
if (curr.overall.forbiddenRate > 0) triggers.push(`  ⚠ forbidden hit rate ${curr.overall.forbiddenRate}`);
if (triggers.length === 0) console.log("  (none)");
else triggers.forEach((t) => console.log(t));
