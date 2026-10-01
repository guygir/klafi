import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyLoginStreak,
  jerusalemDay,
  moveOwnedCard,
  normalizeNumberedEvery,
  normalizeNumberedSets,
  previousJerusalemDay,
  stampEligible,
  stampFromGrant,
  grantCadenceToMinted,
  drawNumberedIndex,
  numberPoolFromStored,
  returnNumberedIndex,
  rollNumberedStamp,
  stampKey,
  stampMax,
  streakLabel,
  takeInstanceForCard,
} from "../server/numbered.js";
import { JsonStore, listNumberedPulls, tallyCardHolders } from "../server/store.js";

test("stamp eligibility is list-slot print runs plus numberedSets, idle only", () => {
  const set5 = { id: "SET5-01", set: "LIK", listSlot: 1, releaseSetId: "set-5" };
  const slotTwo = { id: "SET5-12", set: "DEM", listSlot: 2, releaseSetId: "set-5" };
  const leader = { id: "LIK-M01-Q01", set: "LIK", listSlot: 1, releaseSetId: "party-leaders" };
  assert.equal(stampMax(set5), 1);
  assert.equal(stampMax(slotTwo), 2);
  assert.equal(stampMax({ ...set5, listSlot: null }), 0);
  assert.equal(stampKey(set5), "SET5-01");
  assert.equal(stampEligible(set5, ["set-5"]), true);
  assert.equal(stampEligible(set5, []), false);
  assert.equal(stampEligible(set5, ["party-leaders"]), false);
  assert.equal(stampEligible({ ...set5, eventOnly: true }, ["set-5"]), false);
  assert.equal(stampFromGrant(set5, ["set-5"], "idle"), true);
  assert.equal(stampFromGrant(set5, ["set-5"], "quiz"), false);
  assert.equal(stampFromGrant(set5, ["set-5"], "debug-unlock"), false);
  assert.equal(stampFromGrant(set5, ["set-5"], "rank-2"), false);
  assert.equal(stampEligible(leader, ["set-5"]), false);
  assert.equal(stampEligible(leader, ["party-leaders"]), true);
  assert.equal(stampMax(leader), 1);
  assert.equal(stampKey(leader), "LIK:1");
  assert.deepEqual(normalizeNumberedSets(undefined), []);
  assert.deepEqual(normalizeNumberedSets(["set-5", "party-leaders"], ["set-5"]), ["set-5"]);
});

test("numbered stamps roll 1/N until the print run is gone", () => {
  assert.equal(normalizeNumberedEvery(undefined), 30);
  assert.equal(normalizeNumberedEvery(0), 30);
  assert.equal(normalizeNumberedEvery(30), 30);
  assert.equal(grantCadenceToMinted(0, 30), 0);
  assert.equal(grantCadenceToMinted(29, 30), 0);
  assert.equal(grantCadenceToMinted(30, 30), 1);
  assert.equal(grantCadenceToMinted(90, 30), 3);
  assert.equal(rollNumberedStamp(0, 1, 30, () => 0.99), null);
  assert.deepEqual(rollNumberedStamp(0, 1, 30, () => 0), { index: 1, of: 1 });
  assert.equal(rollNumberedStamp(1, 1, 30, () => 0), null);
  assert.deepEqual(rollNumberedStamp(0, 3, 25, () => 0), { index: 1, of: 3 });
  assert.deepEqual(rollNumberedStamp(2, 3, 25, () => 0), { index: 3, of: 3 });
  assert.equal(rollNumberedStamp(3, 3, 25, () => 0), null);
  assert.deepEqual(rollNumberedStamp(0, 2, 1, () => 0.99), { index: 1, of: 2 });
});

test("numbered print runs are a pool: a pull takes one number at random, and a return puts it back", () => {
  assert.deepEqual(numberPoolFromStored(2, 4), [3, 4]);
  assert.deepEqual(numberPoolFromStored([1, 4, 4, 9], 4), [1, 4]);
  const pool = numberPoolFromStored(0, 4);
  const first = drawNumberedIndex(pool, () => 0.99);
  assert.equal(first.index, 4);
  assert.deepEqual(first.pool, [1, 2, 3]);
  const second = drawNumberedIndex(first.pool, () => 0);
  assert.equal(second.index, 1);
  assert.deepEqual(returnNumberedIndex(second.pool, 4, 4), [2, 3, 4]);
  assert.deepEqual(returnNumberedIndex([2, 3, 4], 4, 4), [2, 3, 4]);
});

test("a legacy counter of 2 out of 4 can take 1 back, and the next pull can be 1/4 again", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kalpi-numbered-return-"));
  const store = new JsonStore(path.join(dir, "state.json"), { numberedRandom: () => 0 });
  await store.init();
  store.state.numberedIssued["SET5-06"] = 2;
  assert.deepEqual(await store.returnNumberedStamp("SET5-06", 1, 4), [1, 3, 4]);
  const again = await store.claimNumberedStamp("SET5-06", 4, 1);
  assert.equal(again.index, 1);
  assert.equal(again.of, 4);
  assert.deepEqual(store.state.numberedIssued["SET5-06"], [3, 4]);
  await rm(dir, { recursive: true, force: true });
});

test("file store keeps the remaining numbers, so a returned 1/4 can be drawn again", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kalpi-numbered-pool-"));
  const store = new JsonStore(path.join(dir, "state.json"), { numberedRandom: () => 0 });
  await store.init();
  const stamp = await store.claimNumberedStamp("SET5-06", 4, 1);
  assert.equal(stamp.index, 1);
  assert.deepEqual(store.state.numberedIssued["SET5-06"], [2, 3, 4]);
  assert.deepEqual(await store.returnNumberedStamp("SET5-06", 1, 4), [1, 2, 3, 4]);
  const again = await store.claimNumberedStamp("SET5-06", 4, 1);
  assert.equal(again.index, 1);
  await rm(dir, { recursive: true, force: true });
});

test("login streak counts Jerusalem days and resets after a gap", () => {
  const monday = Date.parse("2026-09-21T10:00:00+03:00");
  const session = {};
  assert.equal(applyLoginStreak(session, monday), true);
  assert.equal(session.loginDay, "2026-09-21");
  assert.equal(session.loginStreak, 1);
  assert.equal(applyLoginStreak(session, monday + 60 * 60 * 1000), false);
  assert.equal(session.loginStreak, 1);
  assert.equal(applyLoginStreak(session, monday + 24 * 60 * 60 * 1000), true);
  assert.equal(session.loginStreak, 2);
  assert.equal(applyLoginStreak(session, monday + 3 * 24 * 60 * 60 * 1000), true);
  assert.equal(session.loginStreak, 1);
  assert.equal(streakLabel(2), "");
  assert.equal(streakLabel(3), "רצף 3");
  assert.equal(previousJerusalemDay(monday), "2026-09-20");
  assert.equal(jerusalemDay(monday), "2026-09-21");
});

test("trades move the numbered instance instead of minting a new stamp", () => {
  const from = {
    inventory: { "SET5-01": 1 },
    instances: [{ instanceId: "a", cardId: "SET5-01", numberedIndex: 1, numberedOf: 1, finish: "Holo" }],
  };
  const to = { inventory: {}, instances: [] };
  const moved = moveOwnedCard(from, to, "SET5-01", {
    acquiredBy: "trade-accepted",
    pulledAt: "2026-09-21T12:00:00.000Z",
    finish: "Common",
    instanceId: "fresh",
  });
  assert.equal(moved.instanceId, "a");
  assert.equal(from.inventory["SET5-01"], undefined);
  assert.equal(to.inventory["SET5-01"], 1);
  assert.equal(to.instances[0].numberedIndex, 1);
  assert.equal(to.instances[0].numberedOf, 1);
  assert.equal(to.instances[0].acquiredBy, "trade-accepted");
  assert.equal(takeInstanceForCard(to, "SET5-01")?.instanceId, "a");
});

test("holder tally counts distinct live sessions, not extra copies", () => {
  const tally = tallyCardHolders({
    a: { inventory: { C1: 5 }, instances: [{ cardId: "C1", numberedIndex: 1 }] },
    b: { inventory: { C1: 2 }, instances: [] },
    empty: { inventory: {}, instances: [] },
  });
  assert.equal(tally.holders.C1, 2);
  assert.equal(tally.numberedHolders.C1, 1);
});

test("card holder summary attaches live numbered pulls without storing them on the snapshot", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kalpi-numbered-pulls-"));
  const store = new JsonStore(path.join(dir, "state.json"));
  await store.init();
  const token = await store.createSession(new Date().toISOString());
  await store.withSession(token, (session) => {
    session.displayName = "ג׳וזפין";
    session.inventory = { C1: 1 };
    session.instances = [{ cardId: "C1", numberedIndex: 3, numberedOf: 10 }];
  });
  const summary = await store.cardHolderSummary();
  assert.equal(summary.holders.C1, 1);
  assert.equal(summary.numberedHolders.C1, 1);
  assert.deepEqual(summary.numberedPulls, [
    { cardId: "C1", displayName: "ג׳וזפין", index: 3, of: 10, binderSlug: store.getSession(token).publicBinderSlug },
  ]);
  assert.equal(store.state.cardHolderSnapshot.numberedPulls, undefined);
  await rm(dir, { recursive: true, force: true });
});

test("numbered pulls keep the player name and stamp so the card dialog can link them", () => {
  const pulls = listNumberedPulls({
    a: {
      displayName: "ג׳וזפין",
      publicBinderSlug: "josephine",
      instances: [
        { cardId: "C1", numberedIndex: 2, numberedOf: 5 },
        { cardId: "C2", numberedIndex: 0 },
      ],
    },
    b: {
      displayName: "דני",
      instances: [{ cardId: "C1", numberedIndex: 1, numberedOf: 5 }],
    },
  });
  assert.deepEqual(pulls, [
    { cardId: "C1", displayName: "דני", index: 1, of: 5, binderSlug: null },
    { cardId: "C1", displayName: "ג׳וזפין", index: 2, of: 5, binderSlug: "josephine" },
  ]);
});
