import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogExtrasFromStudio, expandPublicCatalog } from "../app/server/public-catalog.js";
import { cardPullOdds, normalizePackConfig, packCardAllowed, rarityBucket, rarityOrderReport, resolvePackTable } from "../app/server/pack-config.js";
import { cardIndexFromCatalog, isLiveReleaseSet, visiblePlayerCards, visibleReleaseSets } from "../app/server/visible-sets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cards = JSON.parse(await readFile(path.join(root, "app/data/cards.json"), "utf8"));
const specials = JSON.parse(await readFile(path.join(root, "app/data/specials-content.json"), "utf8"));
const advocacy = JSON.parse(await readFile(path.join(root, "app/data/advocacy.json"), "utf8"));
const avatars = JSON.parse(await readFile(path.join(root, "app/data/avatars.json"), "utf8"));
const studio = JSON.parse(await readFile(path.join(root, "app/data/studio-content.json"), "utf8"));
const set5 = JSON.parse(await readFile(path.join(root, "docs/intake/research/set5-wip-pool.json"), "utf8"));

const visibleCards = visiblePlayerCards(expandPublicCatalog(cards, specials, catalogExtrasFromStudio(studio, set5)));
const pack = normalizePackConfig(studio.gameConfig?.pack);
const packById = new Map(pack.sets.map((set) => [set.id, set]));
const releaseById = new Map((studio.gameConfig?.releaseSets || []).map((set) => [set.id, set]));
const idleCards = visibleCards.filter((card) => {
  const packSet = packById.get(card.releaseSetId);
  const release = releaseById.get(card.releaseSetId);
  return Boolean(packSet && packSet.weight > 0 && release?.runtimeState !== "held" && packCardAllowed(card, packSet) && rarityBucket(card));
});
const visiblePartyIds = new Set(visibleCards
  .map(({ set }) => set)
  .filter((set) => set && set !== "SYS" && !String(set).startsWith("special-")));
const parties = [];
const seen = new Set();
for (const card of visibleCards) {
  if (!visiblePartyIds.has(card.set) || seen.has(card.set)) continue;
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
  cardIndex: cardIndexFromCatalog(visibleCards),
  totals: {
    collectible: visibleCards.length,
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
    releaseSets: visibleReleaseSets(studio.gameConfig?.releaseSets || []),
    pack: (() => {
      const pack = {
        ...normalizePackConfig(studio.gameConfig?.pack),
        sets: normalizePackConfig(studio.gameConfig?.pack).sets.filter((set) => isLiveReleaseSet(set.id)),
      };
      const releaseSets = visibleReleaseSets(studio.gameConfig?.releaseSets || []);
      const current = resolvePackTable({
        pack,
        releaseSets,
        cards: visibleCards,
        now: Date.now(),
      });
      return {
        ...pack,
        current: {
          ...current,
          rarityOrder: rarityOrderReport(cardPullOdds({
            pack,
            releaseSets,
            cards: visibleCards,
            now: Date.now(),
          })),
        },
      };
    })(),
    parties,
    avatars: avatars.avatars || [],
  },
};

const out = path.join(root, "app/public/shell.json");
await writeFile(out, `${JSON.stringify(shell)}\n`);
console.log(`Wrote ${path.relative(root, out)} (${shell.idleCardIds.length} idle cards, ${parties.length} parties)`);
