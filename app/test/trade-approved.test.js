import assert from "node:assert/strict";
import test from "node:test";
import { tradeApprovedLines } from "../public/trade-approved.js";

test("accepted-trade popup names both sides of the swap", () => {
  const lines = tradeApprovedLines({
    otherName: "  דנה  ",
    receivedTitle: "בנימין נתניהו",
    givenTitle: "יאיר לפיד",
  });
  assert.equal(lines.title, "ההחלפה אושרה!");
  assert.equal(lines.who, "החלפתם עם דנה");
  assert.equal(lines.swap, "בנימין נתניהו תמורת יאיר לפיד");
  const fallback = tradeApprovedLines({});
  assert.equal(fallback.who, "החלפתם עם שחקן");
  assert.equal(fallback.swap, "קלף תמורת קלף");
});
