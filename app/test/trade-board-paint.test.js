import assert from "node:assert/strict";
import test from "node:test";
import { tradeBoardPaintMatches, tradeBoardPaintSignature } from "../public/trade-list.js";

test("trade board paint signature is stable for the same rows and filters", () => {
  const rows = [["t1", "open", true, false, "and", "and", "A", "B", "null", "null", false]];
  const a = tradeBoardPaintSignature({ offered: "", wanted: "", page: 0, empty: false, emptyKind: "none", rows });
  const b = tradeBoardPaintSignature({ offered: "", wanted: "", page: 0, empty: false, emptyKind: "none", rows: structuredClone(rows) });
  assert.equal(a, b);
  const changed = tradeBoardPaintSignature({ offered: "", wanted: "", page: 0, empty: false, emptyKind: "none", rows: [["t1", "open", false, false, "and", "and", "A", "B", "null", "null", false]] });
  assert.notEqual(a, changed);
});

test("tradeBoardPaintMatches skips a wipe when the board already shows the same signature", () => {
  const signature = tradeBoardPaintSignature({
    offered: "",
    wanted: "",
    page: 0,
    empty: false,
    emptyKind: "none",
    rows: [["t1", "open", true, false, "and", "or", "A,C", "B", "null", "{\"wantedCardId\":\"B\"}", false]],
  });
  let wiped = false;
  const board = {
    dataset: { paintSig: signature },
    querySelector(sel) {
      assert.match(sel, /trade-offer/);
      return { className: "trade-offer" };
    },
    set innerHTML(_value) { wiped = true; },
  };
  assert.equal(tradeBoardPaintMatches(board, signature), true);
  if (!tradeBoardPaintMatches(board, signature)) board.innerHTML = "boom";
  assert.equal(wiped, false);

  board.dataset.paintSig = "stale";
  assert.equal(tradeBoardPaintMatches(board, signature), false);
});
