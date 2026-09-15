import assert from "node:assert/strict";
import test from "node:test";
import { generateIdlePull, generatePack, packSlots, rarityTier } from "../server/pack-engine.js";

const cards = [
  { id: "SYS-C-01", set: "SYS", rarity: "Common" },
  { id: "A-C-01", set: "AAA", rarity: "Common" },
  { id: "A-C-02", set: "AAA", rarity: "Common" },
  { id: "B-C-01", set: "BBB", rarity: "Common" },
  { id: "A-U-01", set: "AAA", rarity: "Uncommon" },
  { id: "A-U-02", set: "AAA", rarity: "Uncommon" },
  { id: "B-U-01", set: "BBB", rarity: "Uncommon" },
  { id: "A-R-01", set: "AAA", rarity: "Rare" },
  { id: "B-R-01", set: "BBB", rarity: "Rare" },
];

test("pack preserves the printed 3C / 2U / 1R composition", () => {
  const pulls = generatePack({
    cards,
    inventory: {},
    dryPacks: 0,
    packCount: 0,
    rng: () => 0,
  });

  assert.equal(pulls.length, 6);
  assert.deepEqual(
    pulls.map((pull) => rarityTier(cards.find((card) => card.id === pull.cardId))),
    packSlots,
  );
  assert.equal(pulls[0].cardId, "SYS-C-01", "every other pack starts with system literacy");
  assert.equal(new Set(pulls.map(({ cardId }) => cardId)).size, 6);
  assert.ok(pulls.every(({ finish }) => finish !== "Holo"), "PoC packs do not generate Holo finishes");
});

test("pity replaces a duplicate with an unowned card after three dry packs", () => {
  const inventory = Object.fromEntries(cards.map((card) => [card.id, 1]));
  delete inventory["B-R-01"];

  const pulls = generatePack({
    cards,
    inventory,
    dryPacks: 3,
    packCount: 1,
    rng: () => 0,
  });

  assert.ok(pulls.some(({ cardId }) => cardId === "B-R-01"));
  assert.deepEqual(
    pulls.map((pull) => rarityTier(cards.find((card) => card.id === pull.cardId))),
    packSlots,
  );
});

test("single-card idle pity prefers an unowned active card", () => {
  const inventory = Object.fromEntries(cards.slice(0, -1).map((card) => [card.id, 1]));
  const regular = generateIdlePull({ cards, inventory, duplicateStreak: 0, rng: () => 0 });
  assert.equal(regular.cardId, cards[0].id);
  const pity = generateIdlePull({ cards, inventory, duplicateStreak: 4, rng: () => 0 });
  assert.equal(pity.cardId, cards.at(-1).id);
});
