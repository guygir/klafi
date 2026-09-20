import { randomInt } from "node:crypto";
import { isPackSetOpen, normalizePackConfig, packCardAllowed, rarityBucket } from "./pack-config.js";

const PACK_SLOTS = ["Common", "Common", "Common", "Uncommon", "Uncommon", "Rare"];

export function rarityTier(card) {
  if (card.rarity.startsWith("Rare")) return "Rare";
  if (card.rarity.startsWith("Uncommon")) return "Uncommon";
  return "Common";
}

function choose(pool, rng) {
  if (!pool.length) return null;
  return pool[rng(pool.length)];
}

function chooseWeighted(items, weightOf, rng) {
  const weights = items.map((item) => Math.max(0, Number(weightOf(item)) || 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!items.length || total <= 0) return items[0] || null;
  let ticket = rng(total);
  for (let index = 0; index < items.length; index += 1) {
    ticket -= weights[index];
    if (ticket < 0) return items[index];
  }
  return items.at(-1);
}

function incompleteSets(cards, inventory) {
  const bySet = new Map();
  for (const card of cards) {
    if (card.set === "SYS") continue;
    if (!bySet.has(card.set)) bySet.set(card.set, []);
    bySet.get(card.set).push(card.id);
  }
  return new Set(
    [...bySet.entries()]
      .filter(([, ids]) => ids.some((id) => !inventory[id]))
      .map(([set]) => set),
  );
}

function poolFor(cards, tier, selected) {
  const available = cards.filter((card) => rarityTier(card) === tier && !selected.has(card.id));
  return available.length ? available : cards.filter((card) => rarityTier(card) === tier);
}

export function generatePack({
  cards,
  inventory,
  dryPacks,
  packCount,
  rng = randomInt,
}) {
  const selected = new Set();
  const pulls = [];
  const incomplete = incompleteSets(cards, inventory);

  PACK_SLOTS.forEach((tier, index) => {
    let pool = poolFor(cards, tier, selected);

    // Every other pack carries shared system literacy.
    if (index === 0 && packCount % 2 === 0) {
      const systemPool = pool.filter((card) => card.set === "SYS");
      if (systemPool.length) pool = systemPool;
    // The next slot prefers a list the player has not completed.
    } else if (index === 1 && incomplete.size) {
      const incompletePool = pool.filter((card) => incomplete.has(card.set));
      if (incompletePool.length) pool = incompletePool;
    }

    const card = choose(pool, rng);
    if (!card) throw new Error(`No cards available for ${tier}`);
    selected.add(card.id);
    pulls.push({
      cardId: card.id,
      finish: tier,
    });
  });

  const alreadyHasNewCard = pulls.some(({ cardId }) => !inventory[cardId]);
  if (dryPacks >= 3 && !alreadyHasNewCard) {
    const unowned = cards.filter((card) => !inventory[card.id]);
    const guaranteed = choose(unowned, rng);
    if (guaranteed) {
      const tier = rarityTier(guaranteed);
      const replaceAt = pulls.findIndex((pull) => {
        const current = cards.find((card) => card.id === pull.cardId);
        return rarityTier(current) === tier;
      });
      pulls[replaceAt] = {
        cardId: guaranteed.id,
        finish: tier,
      };
    }
  }

  return pulls;
}

export function generateIdlePull({
  cards,
  inventory,
  duplicateStreak = 0,
  pityAfter = 4,
  pack,
  releaseSets,
  now = Date.now(),
  rng = randomInt,
}) {
  if (!cards.length) throw new Error("No idle-eligible cards available");
  const config = pack ? normalizePackConfig(pack) : null;
  const threshold = config?.pityAfter ?? pityAfter;
  let pool = cards;
  if (duplicateStreak >= threshold) {
    const unowned = cards.filter((card) => !inventory[card.id]);
    if (unowned.length) pool = unowned;
  }
  const card = config
    ? chooseFromPackTable(pool, config, releaseSets, now, rng)
    : choose(pool, rng);
  if (!card) throw new Error("No idle-eligible cards available");
  return {
    cardId: card.id,
    finish: rarityTier(card),
  };
}

function chooseFromPackTable(cards, pack, releaseSets, now, rng) {
  const releases = new Map((releaseSets || []).map((set) => [set.id, set]));
  const openSets = pack.sets.filter((set) =>
    isPackSetOpen(set, releases.get(set.id), now)
    && cards.some((card) => card.releaseSetId === set.id && packCardAllowed(card, set)));
  const setPick = chooseWeighted(openSets, (set) => set.weight, rng);
  const inSet = setPick
    ? cards.filter((card) => card.releaseSetId === setPick.id && packCardAllowed(card, setPick))
    : cards;
  const byTier = {
    Common: inSet.filter((card) => rarityBucket(card) === "Common"),
    Uncommon: inSet.filter((card) => rarityBucket(card) === "Uncommon"),
    Rare: inSet.filter((card) => rarityBucket(card) === "Rare"),
  };
  const rarities = ["Common", "Uncommon", "Rare"].filter((tier) => byTier[tier].length);
  const rarityPick = setPick
    ? chooseWeighted(rarities, (tier) => setPick.rarities[tier], rng)
    : rarities[0];
  return choose((rarityPick && byTier[rarityPick]) || inSet, rng);
}

export const packSlots = Object.freeze([...PACK_SLOTS]);
