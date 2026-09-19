import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandPublicCatalog } from "../app/server/public-catalog.js";
import { visiblePlayerCards } from "../app/server/visible-sets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cards = JSON.parse(await readFile(path.join(root, "app/data/cards.json"), "utf8"));
const specials = JSON.parse(await readFile(path.join(root, "app/data/specials-content.json"), "utf8"));
const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  cards: visiblePlayerCards(expandPublicCatalog(cards, specials)),
};
const out = path.join(root, "app/public/catalog.json");
await writeFile(out, `${JSON.stringify(catalog)}\n`);
console.log(`Wrote ${path.relative(root, out)} (${catalog.cards.length} cards)`);
