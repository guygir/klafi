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
  streakLabel,
  takeInstanceForCard,
} from "../server/numbered.js";

test("stamp eligibility is list-slot plus numberedSets only", () => {
  const card = { set: "LIK", listSlot: 1, releaseSetId: "party-leaders" };
  assert.equal(stampEligible(card, ["party-leaders"]), true);
  assert.equal(stampEligible(card, []), false);
  assert.equal(stampEligible({ ...card, listSlot: null }, ["party-leaders"]), false);
  assert.equal(stampEligible({ ...card, eventOnly: true }, ["party-leaders"]), false);
  assert.equal(stampFromGrant(card, ["party-leaders"], "idle"), true);
  assert.equal(stampFromGrant(card, ["party-leaders"], "quiz"), false);
  assert.equal(stampFromGrant(card, ["party-leaders"], "debug-unlock"), false);
  assert.equal(stampFromGrant(card, ["party-leaders"], "rank-2"), false);
  assert.equal(stampKey(card), "LIK:1");
  assert.deepEqual(normalizeNumberedSets(undefined), []);
  assert.deepEqual(normalizeNumberedSets(["party-leaders", "set-5"], ["party-leaders"]), ["party-leaders"]);
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
    inventory: { "LIK-M01-Q01": 1 },
    instances: [{ instanceId: "a", cardId: "LIK-M01-Q01", numberedIndex: 1, numberedOf: 1, finish: "Holo" }],
  };
  const to = { inventory: {}, instances: [] };
  const moved = moveOwnedCard(from, to, "LIK-M01-Q01", {
    acquiredBy: "trade-accepted",
    pulledAt: "2026-09-21T12:00:00.000Z",
    finish: "Common",
    instanceId: "fresh",
  });
  assert.equal(moved.instanceId, "a");
  assert.equal(from.inventory["LIK-M01-Q01"], undefined);
  assert.equal(to.inventory["LIK-M01-Q01"], 1);
  assert.equal(to.instances[0].numberedIndex, 1);
  assert.equal(to.instances[0].acquiredBy, "trade-accepted");
  assert.equal(takeInstanceForCard(to, "LIK-M01-Q01")?.instanceId, "a");
});
