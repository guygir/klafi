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
  });
  assert.equal(notice.receivedCardId, "WANT-1");
  assert.equal(notice.givenCardId, "OFF-1");
  assert.equal(owner.pendingTradeNotices.length, 1);
  const published = publicTradeNotices(owner);
  assert.equal(published.length, 1);
  assert.equal(published[0].accepterName, "מקבל");
  assert.equal(published[0].id, notice.id);
  assert.ok(!Object.hasOwn(published[0], "ownerToken"));
  ackTradeNotices(owner, notice.id);
  assert.deepEqual(publicTradeNotices(owner), []);
});
