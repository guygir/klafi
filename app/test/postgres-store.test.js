import assert from "node:assert/strict";
import test from "node:test";
import { sessionDeltas } from "../server/postgres-store.js";

function instance(id, overrides = {}) {
  return {
    instanceId: id,
    cardId: `card-${id}`,
    finish: "Common",
    pulledAt: "2026-09-16T18:00:00.000Z",
    isNew: true,
    acquiredBy: "idle",
    seenAt: null,
    ...overrides,
  };
}

function pack(id, cards = []) {
  return {
    packId: id,
    mode: "idle",
    pulledAt: "2026-09-16T18:00:00.000Z",
    nextDailyAt: null,
    cards,
  };
}

test("session deltas touch only changed player-card rows and append-only records", () => {
  const firstInstance = instance("one");
  const previous = {
    inventory: { "card-one": 1, "card-removed": 1 },
    instances: [firstInstance],
    packs: [pack("pack-one", [firstInstance])],
  };
  const seenInstance = { ...firstInstance, seenAt: "2026-09-16T18:01:00.000Z" };
  const secondInstance = instance("two");
  const next = {
    inventory: { "card-one": 2, "card-two": 1 },
    instances: [seenInstance, secondInstance],
    packs: [previous.packs[0], pack("pack-two", [secondInstance])],
  };

  assert.deepEqual(sessionDeltas(previous, next), {
    inventoryUpserts: [
      { cardId: "card-one", copies: 2 },
      { cardId: "card-two", copies: 1 },
    ],
    inventoryDeletes: ["card-removed"],
    instanceUpserts: [seenInstance, secondInstance],
    instanceDeletes: [],
    packUpserts: [next.packs[1]],
    packDeletes: [],
  });
});

test("session deltas delete records trimmed beyond persistence caps", () => {
  const previousInstances = Array.from({ length: 500 }, (_, index) => instance(String(index)));
  const previousPacks = Array.from({ length: 100 }, (_, index) => pack(String(index)));
  const nextInstance = instance("new");
  const nextPack = pack("new", [nextInstance]);

  const deltas = sessionDeltas(
    { inventory: {}, instances: previousInstances, packs: previousPacks },
    {
      inventory: {},
      instances: [...previousInstances, nextInstance],
      packs: [...previousPacks, nextPack],
    },
  );

  assert.deepEqual(deltas.instanceDeletes, ["0"]);
  assert.deepEqual(deltas.instanceUpserts, [nextInstance]);
  assert.deepEqual(deltas.packDeletes, ["0"]);
  assert.deepEqual(deltas.packUpserts, [nextPack]);
});
