import assert from "node:assert/strict";
import test from "node:test";
import {
  ackTradeNotices,
  enqueueAcceptedTradeNotice,
  publicTradeNotices,
} from "../server/trade-notices.js";

test("accepted-trade notices stay public-safe and can be acknowledged", () => {
  const owner = { displayName: "מציע", pendingTradeNotices: [] };
  const trade = { tradeId: "trade-1", offeredCardId: "OFF-1", wantedCardId: "WANT-1" };
  const notice = enqueueAcceptedTradeNotice(owner, trade, {
    acceptedAt: "2026-09-27T18:00:00.000Z",
    accepterName: "  מקבל  ",
    ownerName: "  מציע  ",
  });
  assert.equal(notice.receivedCardId, "WANT-1");
  assert.equal(notice.givenCardId, "OFF-1");
  assert.equal(owner.pendingTradeNotices.length, 1);
  const published = publicTradeNotices(owner);
  assert.equal(published.length, 1);
  assert.equal(published[0].accepterName, "מקבל");
  assert.equal(published[0].ownerName, "מציע");
  assert.equal(published[0].id, notice.id);
  assert.ok(!Object.hasOwn(published[0], "ownerToken"));
  ackTradeNotices(owner, notice.id);
  assert.deepEqual(publicTradeNotices(owner), []);
});

test("owner notices keep every card that moved on an AND/OR accept", () => {
  const owner = { displayName: "שיר", pendingTradeNotices: [] };
  const trade = {
    tradeId: "bundle",
    offeredCardId: "A",
    wantedCardId: "X",
    acceptedOfferedCardId: "B",
    acceptedWantedCardId: "X",
  };
  const notice = enqueueAcceptedTradeNotice(owner, trade, {
    acceptedAt: "2026-10-10T12:00:00.000Z",
    accepterName: "גיא",
    receivedCardIds: ["X", "Y"],
    givenCardIds: ["B"],
  });
  assert.deepEqual(notice.receivedCardIds, ["X", "Y"]);
  assert.deepEqual(notice.givenCardIds, ["B"]);
  const published = publicTradeNotices(owner);
  assert.deepEqual(published[0].receivedCardIds, ["X", "Y"]);
  assert.deepEqual(published[0].givenCardIds, ["B"]);
});
