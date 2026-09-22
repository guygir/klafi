import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLoginStreak,
  jerusalemDay,
  moveOwnedCard,
  normalizeNumberedSets,
  previousJerusalemDay,
  stampEligible,
  stampFromGrant,
  stampKey,
  stampMax,
  streakLabel,
  takeInstanceForCard,
} from "../server/numbered.js";

test("stamp eligibility is set-5 print runs plus numberedSets, idle only", () => {
  const set5 = { id: "SET5-01", set: "LIK", listSlot: null, releaseSetId: "set-5" };
  const leader = { id: "LIK-M01-Q01", set: "LIK", listSlot: 1, releaseSetId: "party-leaders" };
  assert.equal(stampMax(set5), 3);
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
    instances: [{ instanceId: "a", cardId: "SET5-01", numberedIndex: 1, numberedOf: 3, finish: "Holo" }],
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
  assert.equal(to.instances[0].numberedOf, 3);
  assert.equal(to.instances[0].acquiredBy, "trade-accepted");
  assert.equal(takeInstanceForCard(to, "SET5-01")?.instanceId, "a");
});
