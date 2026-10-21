import assert from "node:assert/strict";
import test from "node:test";
import { acceptMovedCardIds, movedCardsFromAccept, movedCardsFromTrade } from "../public/trade-result.js";

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
