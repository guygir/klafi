import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTOR_BOARD_SIZE, takeCollectorBoard } from "../server/collector-board.js";

test("collector board keeps the top 10 and the current player's rank of everyone", () => {
  assert.equal(COLLECTOR_BOARD_SIZE, 10);
  const all = Array.from({ length: 14 }, (_, index) => ({
    label: `p${index + 1}`,
    current: index === 12,
    rank: index + 1,
    stars: 20 - index,
  }));
  const board = takeCollectorBoard(all);
  assert.equal(board.collectors.length, 10);
  assert.equal(board.collectorCount, 14);
  assert.equal(board.yourCollectorRank, 13);
  assert.equal(board.collectors.at(-1).label, "p13");
  assert.equal(takeCollectorBoard(all.slice(0, 4)).collectors.length, 4);
  assert.equal(takeCollectorBoard(all.slice(0, 4)).yourCollectorRank, null);
});
