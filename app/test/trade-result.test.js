import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptMovedCardIds,
  movedCardsFromAccept,
  movedCardsFromTrade,
  tradeNoticeFallbackThumb,
  tradeNoticeSide,
  tradeNoticeSides,
  tradeNoticeSidesFilled,
} from "../public/trade-result.js";

test("moved cards: OR shows the chosen copy, AND shows every copy, empty arrays fall back", () => {
  assert.deepEqual(movedCardsFromTrade({
    offeredMode: "or",
    wantedMode: "or",
    offeredCardIds: ["A", "B", "C"],
    wantedCardIds: ["X", "Y", "Z"],
    acceptedOfferedCardId: "B",
    acceptedWantedCardId: "Y",
    offeredCardId: "A",
    wantedCardId: "X",
  }), { receivedCardIds: ["B"], givenCardIds: ["Y"] });

  assert.deepEqual(movedCardsFromTrade({
    offeredMode: "and",
    wantedMode: "and",
    offeredCardIds: ["A", "B", "C"],
    wantedCardIds: ["X", "Y"],
  }), { receivedCardIds: ["A", "B", "C"], givenCardIds: ["X", "Y"] });

  assert.deepEqual(movedCardsFromTrade({
    offeredMode: "and",
    wantedMode: "or",
    offeredCardIds: ["A", "B"],
    wantedCardIds: ["X", "Y", "Z"],
    acceptedWantedCardId: "Z",
  }), { receivedCardIds: ["A", "B"], givenCardIds: ["Z"] });

  assert.deepEqual(movedCardsFromTrade({
    offeredMode: "or",
    wantedMode: "and",
    offeredCardIds: ["A", "B", "C"],
    wantedCardIds: ["X", "Y"],
    acceptedOfferedCardId: "C",
  }), { receivedCardIds: ["C"], givenCardIds: ["X", "Y"] });

  assert.deepEqual(movedCardsFromTrade({
    offeredCardId: "A",
    wantedCardId: "X",
  }), { receivedCardIds: ["A"], givenCardIds: ["X"] });

  assert.deepEqual(movedCardsFromTrade({
    offeredMode: "and",
    wantedMode: "and",
    offeredCardIds: [],
    wantedCardIds: [],
    offeredCardId: "A",
    wantedCardId: "X",
  }), { receivedCardIds: ["A"], givenCardIds: ["X"] }, "empty arrays must not hide the legacy ids");

  assert.deepEqual(movedCardsFromTrade({
    offeredMode: "or",
    wantedMode: "or",
    offeredCardIds: ["A", "B"],
    wantedCardIds: ["X", "Y"],
  }, { offeredCardId: "B", wantedCardId: "X" }), { receivedCardIds: ["B"], givenCardIds: ["X"] });
});

test("accept payload arrays win over a listed trade that is missing or legacy-only", () => {
  assert.deepEqual(movedCardsFromAccept({
    receivedCardIds: ["B"],
    givenCardIds: ["Y"],
    trade: { offeredMode: "or", offeredCardId: "A", wantedCardId: "X" },
  }), { receivedCardIds: ["B"], givenCardIds: ["Y"] });

  assert.deepEqual(movedCardsFromAccept({
    trade: undefined,
  }), { receivedCardIds: [], givenCardIds: [] });

  assert.deepEqual(movedCardsFromAccept({
    receivedCardIds: [],
    givenCardIds: [],
    trade: {
      offeredMode: "or",
      wantedMode: "and",
      offeredCardIds: ["A", "B", "C"],
      wantedCardIds: ["X", "Y"],
      acceptedOfferedCardId: "C",
    },
  }), { receivedCardIds: ["C"], givenCardIds: ["X", "Y"] });

  assert.deepEqual(acceptMovedCardIds({
    offeredCardIds: ["B"],
    wantedCardIds: ["X", "Y"],
  }), { receivedCardIds: ["B"], givenCardIds: ["X", "Y"] });
  assert.deepEqual(acceptMovedCardIds({
    offeredCardIds: ["B"],
    wantedCardIds: ["X", "Y"],
  }, { viewer: "owner" }), { receivedCardIds: ["X", "Y"], givenCardIds: ["B"] });
});

test("accept dialog derives moved cards from the pre-accept snapshot when the payload is empty", () => {
  const snapshot = {
    offeredMode: "or",
    wantedMode: "and",
    offeredCardIds: ["A", "B", "C"],
    wantedCardIds: ["X", "Y"],
    offeredCardId: "A",
    wantedCardId: "X",
  };
  assert.deepEqual(movedCardsFromAccept({
    receivedCardIds: [],
    givenCardIds: [],
    trade: { offeredCardIds: [], wantedCardIds: [], ownerLabel: "שר לענייני דלית" },
  }, { offeredCardId: "C" }, snapshot), { receivedCardIds: ["C"], givenCardIds: ["X", "Y"] });

  assert.deepEqual(movedCardsFromAccept({
    receivedCardIds: [],
    givenCardIds: [],
    trade: { offeredCardIds: [], wantedCardIds: [] },
  }, {}, {
    offeredCardId: "LEGACY-OFFER",
    wantedCardId: "LEGACY-WANT",
    offeredCardIds: [],
    wantedCardIds: [],
  }), { receivedCardIds: ["LEGACY-OFFER"], givenCardIds: ["LEGACY-WANT"] });
});

test("dialog sides never render empty: missing catalog still fills a fallback thumb", () => {
  const emptyCatalog = new Map();
  const sides = tradeNoticeSides({ receivedCardIds: ["A"], givenCardIds: ["X"] }, emptyCatalog);
  assert.equal(sides.received.hidden, false);
  assert.equal(sides.given.hidden, false);
  assert.equal(sides.received.empty, false);
  assert.equal(sides.given.empty, false);
  assert.equal(sides.received.thumbs.length, 1);
  assert.equal(sides.given.thumbs.length, 1);
  assert.equal(sides.received.thumbs[0].found, false);
  assert.ok(tradeNoticeSidesFilled(sides));
  assert.match(tradeNoticeFallbackThumb("A"), /trade-thumb-pending/);
  assert.match(tradeNoticeFallbackThumb("A"), /data-card-id="A"/);

  const hidden = tradeNoticeSide([], emptyCatalog);
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.empty, false);
  assert.deepEqual(hidden.thumbs, []);
});
