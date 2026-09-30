import assert from "node:assert/strict";
import test from "node:test";
import {
  BINDER_SORT_LABELS,
  BINDER_SORTS,
  binderHeldCount,
  binderSortId,
  sortBinderCards,
} from "../public/binder-order.js";

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

test("כמות is higher held counts first, then מספר בסדרה, and a missing card is 0", () => {
  assert.equal(BINDER_SORT_LABELS.copies, "כמות");
  assert.equal(binderSortId("copies"), "copies");
  assert.equal(binderSortId("כמות"), "copies");
  assert.ok(BINDER_SORTS.includes("copies"));

  const catalog = [
    card("zero-late", { titleHe: "חסר מאוחר", releaseSetId: leaders, listSlot: 4 }),
    card("two-b", { titleHe: "שניים ב", releaseSetId: leaders, listSlot: 3 }),
    card("five", { titleHe: "חמש", releaseSetId: deputies, listSlot: 9 }),
    card("four", { titleHe: "ארבע", releaseSetId: deputies, listSlot: 1 }),
    card("one", { titleHe: "אחת", releaseSetId: leaders, listSlot: 8 }),
    card("three", { titleHe: "שלוש", releaseSetId: leaders, listSlot: 5 }),
    card("two-a", { titleHe: "שניים א", releaseSetId: leaders, listSlot: 1 }),
    card("missing", { titleHe: "בלי מפתח", releaseSetId: leaders, listSlot: 2 }),
    card("explicit-zero", { titleHe: "אפס", releaseSetId: leaders, listSlot: 6 }),
  ];
  const inventory = {
    five: 5,
    four: 4,
    three: 3,
    "two-a": 2,
    "two-b": 2,
    one: 1,
    "explicit-zero": 0,
  };

  assert.equal(binderHeldCount(catalog.find((item) => item.id === "missing"), inventory), 0);
  assert.equal(binderHeldCount(catalog.find((item) => item.id === "explicit-zero"), inventory), 0);
  assert.equal(binderHeldCount(catalog.find((item) => item.id === "four"), inventory), 4);

  const sorted = sortBinderCards(catalog, { sort: "copies", catalog, inventory });
  assert.deepEqual(sorted.map((item) => item.id), [
    "five",
    "four",
    "three",
    "two-a",
    "two-b",
    "one",
    "missing",
    "zero-late",
    "explicit-zero",
  ]);
});

test("כמות with no inventory does not invent counts and stays on מספר בסדרה", () => {
  const catalog = [
    card("a2", { titleHe: "א", releaseSetId: leaders, listSlot: 2 }),
    card("a1", { titleHe: "א", releaseSetId: leaders, listSlot: 1 }),
    card("b", { titleHe: "ב", releaseSetId: deputies, listSlot: 1 }),
  ];
  const sorted = sortBinderCards(catalog, { sort: "כמות", catalog, inventory: {} });
  assert.deepEqual(sorted.map((item) => item.id), ["a1", "a2", "b"]);
});
