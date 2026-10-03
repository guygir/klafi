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

test("the binder tab shows the cached grid before it verifies the cards", async () => {
  const source = await readFile(appJsPath, "utf8");
  const queueStart = source.indexOf("function queueBinderGridCheck(");
  const queueEnd = source.indexOf("elements.navButtons.forEach", queueStart);
  assert.ok(queueStart > 0 && queueEnd > queueStart);
  const queue = source.slice(queueStart, queueEnd);
  assert.match(queue, /requestAnimationFrame\(/);
  assert.match(queue, /setTimeout\(/);
  assert.match(queue, /renderBinder\(\)/);
  assert.ok(queue.indexOf("requestAnimationFrame(") < queue.indexOf("setTimeout("));
  assert.ok(queue.indexOf("setTimeout(") < queue.indexOf("renderBinder()"));
  assert.doesNotMatch(queue, /queueMicrotask/);
  const navStart = source.indexOf("elements.navButtons.forEach", queueEnd - 1);
  const navEnd = source.indexOf("elements.binderFilters.addEventListener", navStart);
  const nav = source.slice(navStart, navEnd);
  const branchStart = nav.indexOf('button.dataset.nav === "binder"');
  assert.ok(branchStart > 0);
  const branch = nav.slice(branchStart, nav.indexOf("return;", branchStart));
  assert.match(branch, /showView\("binder"\)/);
  assert.match(branch, /queueBinderGridCheck\(\)/);
  assert.ok(branch.indexOf('showView("binder")') < branch.indexOf("queueBinderGridCheck()"));
  assert.doesNotMatch(branch, /renderBinder\(\)/);
  assert.doesNotMatch(branch, /binderGrid\.innerHTML/);
  const renderStart = source.indexOf("function renderBinder(");
  const renderEnd = source.indexOf("function syncBinderScrollCue(", renderStart);
  const render = source.slice(renderStart, renderEnd);
  const pending = render.slice(0, render.indexOf("const filterX"));
  assert.match(pending, /keepPaintedGrid/);
  assert.match(pending, /binderReady === "1"/);
  assert.ok(pending.indexOf("keepPaintedGrid") < pending.indexOf("renderPendingWells()"));
  assert.match(queue, /binderReady !== "1"/);
  assert.ok(queue.indexOf("renderBinder()") < queue.indexOf("fillBinderCardArt()"));
  assert.match(source, /data-binder-art/);
  assert.match(source, /deferArt: true/);
  const showStart = source.indexOf("function showView(");
  const showEnd = source.indexOf("function showError(", showStart);
  const show = source.slice(showStart, showEnd);
  const binderBranch = show.indexOf('name === "binder"');
  assert.ok(binderBranch > 0);
  assert.ok(show.indexOf("fitVisibleCardText(", binderBranch) > show.indexOf("return;", binderBranch));
  const navBranch = source.slice(source.indexOf('button.dataset.nav === "binder"'), source.indexOf("loadStaticCatalog().catch", source.indexOf('button.dataset.nav === "binder"')));
  assert.doesNotMatch(navBranch, /fillBinderCardArt\(/);
  assert.doesNotMatch(navBranch, /renderBinder\(/);
});
