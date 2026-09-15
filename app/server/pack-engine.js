import { randomInt } from "node:crypto";

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
  rng = randomInt,
}) {
  if (!cards.length) throw new Error("No idle-eligible cards available");
  let pool = cards;
  if (duplicateStreak >= pityAfter) {
    const unowned = cards.filter((card) => !inventory[card.id]);
    if (unowned.length) pool = unowned;
  }
  const card = choose(pool, rng);
  return {
    cardId: card.id,
    finish: rarityTier(card),
  };
}

export const packSlots = Object.freeze([...PACK_SLOTS]);
