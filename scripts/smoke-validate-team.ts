// Smoke-test for A15 — team-level validator catches item clause + species clause + SP cap violations.

import {
  extractTeamBlock,
  validateTeam,
  formatTeamValidationNudge,
} from "../lib/validate-team.js";

// 1. Gemma's known-bad team from run aw0u5a — Milotic + Kingambit have spread 84
const gemmaBadTeam = `
Some prose here.

\`\`\`team-json
{
  "archetype": "Snow-Tailwind Offense",
  "megaStone": "Froslassite",
  "pokemon": [
    {"name": "Mega Froslass", "item": "Froslassite", "ability": "Snow Warning", "moves": ["Aurora Veil", "Blizzard", "Shadow Ball", "Destiny Bond"], "spread": "0/0/0/32/0/32", "nature": "Timid"},
    {"name": "Krookodile", "item": "Choice Scarf", "ability": "Moxie", "moves": ["Earthquake", "Knock Off", "Stone Edge", "Close Combat"], "spread": "0/32/0/0/0/32", "nature": "Jolly"},
    {"name": "Sneasler", "item": "White Herb", "ability": "Unburden", "moves": ["Dire Claw", "Close Combat", "Acrobatics", "Protect"], "spread": "0/32/0/0/0/32", "nature": "Jolly"},
    {"name": "Milotic", "item": "Leftovers", "ability": "Competitive", "moves": ["Scald", "Recover", "Ice Beam", "Protect"], "spread": "32/0/0/20/32/0", "nature": "Bold"},
    {"name": "Aerodactyl", "item": "Focus Sash", "ability": "Pressure", "moves": ["Tailwind", "Rock Slide", "Dual Wingbeat", "Protect"], "spread": "0/32/0/0/0/32", "nature": "Jolly"},
    {"name": "Kingambit", "item": "Black Glasses", "ability": "Supreme Overlord", "moves": ["Kowtow Cleave", "Sucker Punch", "Iron Head", "Protect"], "spread": "32/32/20/0/0/0", "nature": "Adamant"}
  ]
}
\`\`\`
`;

// 2. Kimi's known-bad team from run 6nfkt7 — 2× Black Glasses
const kimiBadTeam = `
prose

\`\`\`team-json
{
  "archetype": "Tailwind Snow Hybrid",
  "megaStone": "Froslassite",
  "pokemon": [
    {"name": "Froslass", "item": "Froslassite", "ability": "Cursed Body", "moves": ["Blizzard","Shadow Ball","Aurora Veil","Protect"], "spread": "2/0/0/32/0/32", "nature": "Timid"},
    {"name": "Krookodile", "item": "Black Glasses", "ability": "Intimidate", "moves": ["Knock Off","High Horsepower","Rock Slide","Protect"], "spread": "2/32/0/0/0/32", "nature": "Jolly"},
    {"name": "Aerodactyl", "item": "Focus Sash", "ability": "Unnerve", "moves": ["Tailwind","Rock Slide","Dual Wingbeat","Protect"], "spread": "2/32/0/0/0/32", "nature": "Jolly"},
    {"name": "Sneasler", "item": "White Herb", "ability": "Unburden", "moves": ["Fake Out","Dire Claw","Close Combat","Protect"], "spread": "2/32/0/0/0/32", "nature": "Jolly"},
    {"name": "Milotic", "item": "Leftovers", "ability": "Competitive", "moves": ["Scald","Icy Wind","Recover","Protect"], "spread": "32/0/32/0/0/2", "nature": "Bold"},
    {"name": "Kingambit", "item": "Black Glasses", "ability": "Defiant", "moves": ["Sucker Punch","Kowtow Cleave","Iron Head","Protect"], "spread": "32/32/0/0/0/2", "nature": "Adamant"}
  ]
}
\`\`\`
`;

// 3. Clean team for control
const cleanTeam = `
\`\`\`team-json
{
  "archetype": "Test",
  "megaStone": "Froslassite",
  "pokemon": [
    {"name": "Froslass", "item": "Froslassite", "ability": "Snow Warning", "moves": ["Blizzard","Aurora Veil","Shadow Ball","Protect"], "spread": "2/0/0/32/0/32", "nature": "Timid"},
    {"name": "Krookodile", "item": "Sitrus Berry", "ability": "Intimidate", "moves": ["Earthquake","Knock Off","Rock Slide","Protect"], "spread": "0/32/0/0/0/32", "nature": "Jolly"}
  ]
}
\`\`\`
`;

function run(label: string, text: string) {
  console.log(`\n=== ${label} ===`);
  const ext = extractTeamBlock(text);
  if (!ext.parsed) {
    console.log("  parse error:", ext.parseError);
    return;
  }
  const v = validateTeam(ext.parsed);
  console.log("  valid:", v.valid);
  console.log("  duplicateItems:", v.duplicateItems);
  console.log("  duplicateSpecies:", v.duplicateSpecies);
  console.log("  spreadIssues:", v.spreadIssues);
  if (!v.valid) {
    console.log("\n  --- nudge ---");
    console.log(formatTeamValidationNudge(v).split("\n").map((l) => "  " + l).join("\n"));
  }
}

run("Gemma aw0u5a (expect: 2 spread violations)", gemmaBadTeam);
run("Kimi 6nfkt7 (expect: 1 item-clause violation)", kimiBadTeam);
run("Clean team (expect: valid)", cleanTeam);
