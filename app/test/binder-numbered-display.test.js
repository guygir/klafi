import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { regularInventoryFrom } from "../public/regular-copies.js";
import { regularCopyCount } from "../server/numbered.js";
import { plainCopyCount } from "../server/recycle.js";
import { achievementMeasures } from "../server/achievements.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const numbered = { instanceId: "n", cardId: "M6", numberedIndex: 2, numberedOf: 4, seenAt: "2026-10-12T00:00:00Z" };
const player = () => ({ inventory: { M1: 1, M6: 1 }, instances: [{ instanceId: "r1", cardId: "M1" }, numbered], unseenPulls: [] });
const cards = ["M1", "M6"].map((id) => ({ id, set: "MOM", releaseSetId: "set-5", idleEligible: true, rarity: "Common" }));

test("binder: numbered-only card shown as owned in tiles/filters/set counts; header x/y and % stay regular-only", () => {
  assert.match(app, /function binderDisplayInventory\(inventory = binderInventory\(\)\) \{/);
  assert.match(app, /binderProgress\(binderRegularInventory\(inventory\)\)/);
  assert.match(app, /inventory: set === "NUMBERED" \? inventory : displayInventory,/);
  assert.match(app, /const slotInventory = numberedView \? inventory : displayInventory;/);
  // The tile is the numbered copy: # stamp, numbered dialog (no recycle, no trade of a regular copy).
  assert.match(app, /const numberedOnly = !numberedView && !\(regularInventory\[card\.id\] > 0\) && numberedIds\.has\(card\.id\)/);
  assert.match(app, /const canRecycle = !model\.dialogNumbered && canRecycleCard\(card\);/);
  assert.equal((app.match(/displayInventory/g) || []).length, 3, "display ownership is used only for presence and counts");
});

test("trades, recycle, set completion and badges stay regular-only", () => {
  assert.equal(regularCopyCount(player(), "M6"), 0, "trade/accept checks");
  assert.deepEqual(regularInventoryFrom({ M1: 1, M6: 1 }, [numbered]), { M1: 1 }, "client trade lists / trade search");
  assert.equal(plainCopyCount(player(), "M6"), 0, "recycle");
  const measures = achievementMeasures(player(), cards);
  assert.equal(measures.setOwned["set-5"], 1, "set completion");
  assert.equal(measures.ownedIds.has("M6"), false, "badges");
});

test("regular + opened numbered tile gets the gold # corner ribbon; numbered-only tiles do not", () => {
  assert.match(app, /extra: !numberedView && numberedIds\.has\(card\.id\) \? "numbered-too" : "",/);
  assert.match(app, /spec\.extra === "numbered-too" \? numberedRibbonMarkup\(card\.id\)/);
  assert.match(app, /class="binder-numbered-ribbon" data-open-numbered=/);
  // Ribbon tap opens the numbered copy and never the regular tile.
  assert.match(app, /const ribbon = event\.target\.closest\("\[data-open-numbered\]"\);\n  if \(ribbon\) \{\n    event\.preventDefault\(\);\n    event\.stopPropagation\(\);\n    openCardDialog\(ribbon\.dataset\.openNumbered, true\);/);
});

test("binder header: regular-only count copy and the gold numbered line", () => {
  assert.match(app, /קלפים רגילים במשחק/);
  assert.match(app, /count === 1 \? "1 ממוספר!" : `\$\{count\} ממוספרים!`/);
});
