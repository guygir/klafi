import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cards = JSON.parse(await readFile(path.join(root, "app/data/cards.json"), "utf8"));
const advocacy = JSON.parse(await readFile(path.join(root, "app/data/advocacy.json"), "utf8"));
const avatars = JSON.parse(await readFile(path.join(root, "app/data/avatars.json"), "utf8"));
const studio = JSON.parse(await readFile(path.join(root, "app/data/studio-content.json"), "utf8"));

const idleCards = cards.filter((card) => card.idleEligible && !card.eventOnly);
const parties = [];
const seen = new Set();
for (const card of cards) {
  if (!card.set || card.set === "SYS" || String(card.set).startsWith("special-") || seen.has(card.set)) continue;
  seen.add(card.set);
  const party = studio.parties?.find(({ id }) => id === card.set);
  parties.push({
    id: card.set,
    displayNameHe: card.setNameHe || card.set,
    displayNameEn: card.setName || card.set,
    requestedLetters: party?.requestedLetters || (card.letters ? [card.letters] : []),
    finalLetters: party?.finalLetters || null,
    letterStatus: party?.letterStatus || null,
    filingStatus: party?.filingStatus || null,
    asOfDate: party?.asOfDate || null,
    pip: card.pip || null,
  });
}

const shell = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  idleCardIds: idleCards.map(({ id }) => id),
  totals: {
    collectible: cards.length,
    idleEligible: idleCards.length,
  },
  editorial: { advocacy, debugEnabled: false },
  gameConfig: {
    revealTiming: studio.gameConfig?.revealTiming,
    visual: studio.gameConfig?.visual,
    progression: {
      rankNames: studio.gameConfig?.progression?.rankNames || [],
      releaseLevelIncrements: studio.gameConfig?.progression?.releaseLevelIncrements || {},
      thresholdExponent: studio.gameConfig?.progression?.thresholdExponent || 1.2,
      teaser: studio.gameConfig?.progression?.teaser || "האם תגיעו לדרגת ראש הממשלה?",
      reward: studio.gameConfig?.progression?.reward || "קלף בונוס מיידי",
    },
    releaseSets: studio.gameConfig?.releaseSets || [],
    parties,
    avatars: avatars.avatars || [],
  },
};

const out = path.join(root, "app/public/shell.json");
await writeFile(out, `${JSON.stringify(shell)}\n`);
console.log(`Wrote ${path.relative(root, out)} (${shell.idleCardIds.length} idle cards, ${parties.length} parties)`);
