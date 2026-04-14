/**
 * Fetches Italian -> English name mappings for moves, items, and abilities
 * from PokeAPI and writes them to lib/translations.json.
 *
 * Usage: npx tsx scripts/build-translations.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const OUTPUT_PATH = resolve(PROJECT_ROOT, "lib", "translations.json");
const POKEAPI = "https://pokeapi.co/api/v2";
const DELAY_MS = 100; // 100ms between requests (~600 req/min, within PokeAPI guidelines)

interface PokeAPIName {
  language: { name: string };
  name: string;
}

interface PokeAPIResource {
  names: PokeAPIName[];
}

interface PokeAPIListResult {
  results: Array<{ name: string; url: string }>;
}

type TranslationDict = Record<string, string>;

async function fetchJSON<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} fetching ${url}`);
  return resp.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch all resources of a given category and build an IT -> EN dictionary.
 * Only includes entries where Italian name differs from English name.
 */
async function buildDict(
  category: string,
  limit: number
): Promise<TranslationDict> {
  console.log(`Fetching ${category} list (limit=${limit})...`);
  const list = await fetchJSON<PokeAPIListResult>(
    `${POKEAPI}/${category}?limit=${limit}`
  );
  console.log(`  Found ${list.results.length} ${category} entries. Fetching details...`);

  const dict: TranslationDict = {};
  let fetched = 0;

  for (const entry of list.results) {
    try {
      const resource = await fetchJSON<PokeAPIResource>(entry.url);
      const en = resource.names.find((n) => n.language.name === "en");
      const it = resource.names.find((n) => n.language.name === "it");

      if (en && it && en.name !== it.name) {
        dict[it.name] = en.name;
      }
    } catch {
      // Some resources may not have names (e.g., shadow/purified moves)
    }

    fetched++;
    if (fetched % 100 === 0) {
      console.log(`  ${fetched}/${list.results.length} ${category} processed`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`  ${category}: ${Object.keys(dict).length} IT->EN translations found`);
  return dict;
}

async function main() {
  console.log("Building IT -> EN translation dictionary from PokeAPI...\n");

  const moves = await buildDict("move", 1000);
  const items = await buildDict("item", 2000);
  const abilities = await buildDict("ability", 400);

  const translations = { moves, items, abilities };
  const totalCount =
    Object.keys(moves).length +
    Object.keys(items).length +
    Object.keys(abilities).length;

  writeFileSync(OUTPUT_PATH, JSON.stringify(translations, null, 2), "utf-8");
  console.log(
    `\nDone! ${totalCount} total translations written to ${OUTPUT_PATH}`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
