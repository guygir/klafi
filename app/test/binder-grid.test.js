import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { binderInventorySignature, binderSlotSignature, planBinderGrid } from "../public/binder-grid.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appJsPath = path.resolve(here, "../public/app.js");

function slot(mode, cardId, count, { recycle = false, concealed = false, extra = "" } = {}) {
  const sig = binderSlotSignature({ mode, cardId, count, recycle, concealed, extra });
  return { key: `${mode}:${cardId}`, sig };
}

test("an unchanged owned set and filter keeps every binder node", () => {
  const grid = [slot("owned", "A", 1), slot("missing", "B", 0), slot("owned", "C", 2)];
  const plan = planBinderGrid(grid, grid.map((item) => ({ ...item })));
  assert.equal(plan.unchanged, true);
  assert.deepEqual(plan.dropped, []);
  assert.equal(plan.order.every((step) => step.action === "keep" && !step.sigChanged), true);
});

test("a locally gained card is inserted and the cards already shown are kept", () => {
  const existing = [slot("owned", "A", 1), slot("owned", "C", 1)];
  const next = [slot("owned", "A", 1), slot("owned", "B", 1), slot("owned", "C", 1)];
  const plan = planBinderGrid(existing, next);
  assert.equal(plan.unchanged, false);
  assert.deepEqual(plan.order.map((step) => [step.key, step.action]), [
    ["owned:A", "keep"],
    ["owned:B", "create"],
    ["owned:C", "keep"],
  ]);
  assert.equal(plan.order[0].previousIndex, 0);
  assert.equal(plan.order[2].previousIndex, 1);
  assert.deepEqual(plan.dropped, []);
});

test("a count change keeps the card node and a last copy leaving drops it", () => {
  const existing = [slot("owned", "A", 2), slot("owned", "B", 1)];
  const next = [slot("owned", "A", 1), slot("missing", "B", 0)];
  const plan = planBinderGrid(existing, next);
  assert.equal(plan.order[0].action, "keep");
  assert.equal(plan.order[0].sigChanged, true);
  assert.equal(plan.order[1].action, "create");
  assert.deepEqual(plan.dropped, ["owned:B"]);
});

test("a sort change reorders kept nodes and does not create replacements", () => {
  const existing = [slot("owned", "A", 1), slot("owned", "B", 1)];
  const next = [slot("owned", "B", 1), slot("owned", "A", 1)];
  const plan = planBinderGrid(existing, next);
  assert.equal(plan.unchanged, false);
  assert.deepEqual(plan.dropped, []);
  assert.deepEqual(plan.order.map((step) => [step.key, step.action, step.previousIndex, step.sigChanged]), [
    ["owned:B", "keep", 1, false],
    ["owned:A", "keep", 0, false],
  ]);
});

test("inventory signature ignores key order and notices a gained or lost card", () => {
  const left = binderInventorySignature({ inventory: { B: 1, A: 2 }, numberedCopies: [] });
  const right = binderInventorySignature({ inventory: { A: 2, B: 1 }, numberedCopies: [] });
  assert.equal(left, right);
  const gained = binderInventorySignature({ inventory: { A: 2, B: 1, C: 1 }, numberedCopies: [] });
  assert.notEqual(gained, left);
  const lost = binderInventorySignature({ inventory: { A: 1, B: 1 }, numberedCopies: [] });
  assert.notEqual(lost, left);
  const numbered = binderInventorySignature({
    inventory: { A: 2, B: 1 },
    numberedCopies: [{ cardId: "A", numberedIndex: 4 }],
  });
  assert.notEqual(numbered, left);
});

test("the binder paints from the grid plan and inventory writes patch it in the same turn", async () => {
  const source = await readFile(appJsPath, "utf8");
  assert.match(source, /planBinderGrid/);
  assert.match(source, /binderInventorySignature/);
  const paintStart = source.indexOf("function paintBinderGrid(");
  const paintEnd = source.indexOf("function renderBinder(", paintStart);
  assert.ok(paintStart > 0 && paintEnd > paintStart);
  const paint = source.slice(paintStart, paintEnd);
  assert.match(paint, /planBinderGrid\(/);
  assert.match(paint, /action === "keep"/);
  assert.match(paint, /if \(ready && plan\.unchanged\) return/);
  assert.match(paint, /fragment\.appendChild\(node\)/);
  assert.match(paint, /if \(!ready\)/);
  assert.doesNotMatch(paint, /step\.action === "keep"[\s\S]{0,160}innerHTML/);
  const renderStart = source.indexOf("function renderBinder(");
  const renderEnd = source.indexOf("function syncBinderScrollCue(", renderStart);
  const render = source.slice(renderStart, renderEnd);
  assert.match(render, /paintBinderGrid\(/);
  assert.doesNotMatch(render, /binderGrid\.innerHTML\s*=\s*ordered/);
  const setStateStart = source.indexOf("function setServerState(");
  const setStateEnd = source.indexOf("function applyHomePayload(", setStateStart);
  assert.match(source.slice(setStateStart, setStateEnd), /syncBinderGridInventory\(/);
  const homeStart = source.indexOf("function applyHomePayload(");
  const homeEnd = source.indexOf("function rememberTodayBoards(", homeStart);
  const home = source.slice(homeStart, homeEnd);
  assert.match(home, /localStorage\.setItem\(HOME_CACHE_KEY/);
  assert.match(home, /syncBinderGridInventory\(/);
  assert.ok(home.indexOf("localStorage.setItem(HOME_CACHE_KEY") < home.indexOf("syncBinderGridInventory("));
});
