import assert from "node:assert/strict";
import test from "node:test";
import { offersForTradeList } from "../public/trade-list.js";

test("an offer is omitted when the viewer does not hold the wanted card, and his own offer is kept", () => {
  const trades = [
    {
      tradeId: "theirs",
      status: "open",
      ownedByCurrent: false,
      offeredCardId: "offered",
      wantedCardId: "must-give",
    },
    {
      tradeId: "mine",
      status: "open",
      ownedByCurrent: true,
      offeredCardId: "mine-offered",
      wantedCardId: "mine-wanted",
    },
  ];

  const withoutWanted = offersForTradeList(trades, { "mine-offered": 1 });
  assert.deepEqual(withoutWanted.map((trade) => trade.tradeId), ["mine"]);

  const withWanted = offersForTradeList(trades, { "must-give": 1, "mine-offered": 1 });
  assert.deepEqual(withWanted.map((trade) => trade.tradeId), ["theirs", "mine"]);
});
