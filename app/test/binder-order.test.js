import assert from "node:assert/strict";
import test from "node:test";
import {
  acquiredAtByCard,
  sortBinderCards,
} from "../public/binder-order.js";
import { publicBinderView } from "../server/public-binder.js";

const leaders = "party-leaders";
const deputies = "party-slot-2";

function card(id, extra) {
  return {
    id,
    titleHe: extra.titleHe,
    releaseSetId: extra.releaseSetId,
    listSlot: extra.listSlot,
    rarity: extra.rarity || "Common",
  };
}

test("number within set is list slot inside catalog release order, not the catalog array", () => {
  const catalog = [
    card("YSR-1", { titleHe: "גדי", releaseSetId: leaders, listSlot: 1 }),
    card("YSR-2", { titleHe: "יורם", releaseSetId: deputies, listSlot: 2 }),
    card("LIK-1", { titleHe: "בנימין", releaseSetId: leaders, listSlot: 1 }),
  ];
  const sorted = sortBinderCards(catalog, { sort: "slot", catalog });
  assert.deepEqual(sorted.map((item) => item.id), ["YSR-1", "LIK-1", "YSR-2"]);
});

test("name uses Hebrew localeCompare, then number within set", () => {
  const catalog = [
    card("B", { titleHe: "בנימין", releaseSetId: leaders, listSlot: 1 }),
    card("A2", { titleHe: "אביגדור", releaseSetId: deputies, listSlot: 2 }),
    card("A1", { titleHe: "אביגדור", releaseSetId: leaders, listSlot: 1 }),
  ];
  const sorted = sortBinderCards(catalog, { sort: "name", catalog });
  assert.deepEqual(sorted.map((item) => item.id), ["A1", "A2", "B"]);
});

test("חדש is newest first, ישן is oldest first, and a card with no server time sorts last", () => {
  const catalog = [
    card("old", { titleHe: "ישן", releaseSetId: leaders, listSlot: 1 }),
    card("new", { titleHe: "חדש", releaseSetId: leaders, listSlot: 2 }),
    card("none", { titleHe: "בלי", releaseSetId: leaders, listSlot: 3 }),
  ];
  const acquiredAt = {
    old: "2020-01-01T00:00:00.000Z",
    new: "2024-06-01T00:00:00.000Z",
  };
  assert.deepEqual(
    sortBinderCards(catalog, { sort: "date-new", catalog, acquiredAt }).map((item) => item.id),
    ["new", "old", "none"],
  );
  assert.deepEqual(
    sortBinderCards(catalog, { sort: "date", catalog, acquiredAt }).map((item) => item.id),
    ["new", "old", "none"],
  );
  assert.deepEqual(
    sortBinderCards(catalog, { sort: "date-old", catalog, acquiredAt }).map((item) => item.id),
    ["old", "new", "none"],
  );
});

test("rarity is Rare, Uncommon, Common, then Promotion, with series ties", () => {
  const catalog = [
    card("promo", { titleHe: "מיוחד", releaseSetId: leaders, listSlot: 1, rarity: "Promotion" }),
    card("common-2", { titleHe: "נפוץ", releaseSetId: leaders, listSlot: 2, rarity: "Common" }),
    card("rare", { titleHe: "נדיר", releaseSetId: deputies, listSlot: 5, rarity: "Rare" }),
    card("uncommon", { titleHe: "לא", releaseSetId: leaders, listSlot: 4, rarity: "Uncommon" }),
    card("common-1", { titleHe: "נפוץ", releaseSetId: leaders, listSlot: 1, rarity: "Common" }),
  ];
  const sorted = sortBinderCards(catalog, { sort: "rarity", catalog });
  assert.deepEqual(sorted.map((item) => item.id), [
    "rare",
    "uncommon",
    "common-1",
    "common-2",
    "promo",
  ]);
});

test("unowned has no date: earliest pulledAt, else seenAt, and missing cards are omitted", () => {
  const inventory = { OWN: 2, SEEN: 1, EMPTY: 0 };
  const acquiredAt = acquiredAtByCard([
    { cardId: "OWN", pulledAt: "2024-05-02T00:00:00.000Z", seenAt: "2020-01-01T00:00:00.000Z" },
    { cardId: "OWN", seenAt: "2024-04-01T00:00:00.000Z" },
    { cardId: "SEEN", seenAt: "2023-03-03T00:00:00.000Z" },
    { cardId: "EMPTY", pulledAt: "2024-01-01T00:00:00.000Z" },
    { cardId: "GHOST", pulledAt: "2024-01-01T00:00:00.000Z" },
    { cardId: "BLANK", pulledAt: "", seenAt: "" },
  ], inventory);
  assert.equal(acquiredAt.OWN, "2024-04-01T00:00:00.000Z");
  assert.equal(acquiredAt.SEEN, "2023-03-03T00:00:00.000Z");
  assert.equal(acquiredAt.EMPTY, undefined);
  assert.equal(acquiredAt.GHOST, undefined);
  assert.equal(acquiredAt.BLANK, undefined);
  assert.equal(Object.hasOwn(acquiredAt, "UNOWNED"), false);

  const view = publicBinderView({
    displayName: "בודק",
    inventory: { OWN: 1, EMPTY: 0 },
    instances: [
      { cardId: "OWN", pulledAt: "2024-08-02T00:00:00.000Z", seenAt: "2024-08-01T00:00:00.000Z" },
      { cardId: "OWN", pulledAt: "2024-07-01T00:00:00.000Z" },
      { cardId: "EMPTY", pulledAt: "2024-01-01T00:00:00.000Z" },
      { cardId: "UNOWNED", seenAt: "2022-01-01T00:00:00.000Z" },
    ],
  });
  assert.equal(view.acquiredAt.OWN, "2024-07-01T00:00:00.000Z");
  assert.equal(view.acquiredAt.EMPTY, undefined);
  assert.equal(view.acquiredAt.UNOWNED, undefined);
  assert.equal(Object.hasOwn(view.acquiredAt, "UNOWNED"), false);
});
