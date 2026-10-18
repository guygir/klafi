import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("A is the default layout; B–E only via ?layout=X; the picker only with ?layout in the URL", () => {
  assert.doesNotMatch(html, /data-layout=/, "markup has no layout; app.js sets it");
  assert.match(app, /const LAYOUT_OPTIONS = \["A", "B", "C", "D", "E"\];/);
  assert.match(app, /const LAYOUT_DEFAULT = "A";/);
  assert.match(app, /return LAYOUT_OPTIONS\.includes\(value\) \? value : LAYOUT_DEFAULT;/, "?layout=off gives A");
  assert.match(app, /return LAYOUT_OPTIONS\.includes\(stored\) \? stored : LAYOUT_DEFAULT;/, "no stored key gives A");
  assert.match(app, /if \(new URLSearchParams\(location\.search\)\.has\("layout"\)\) document\.body\.append\(picker\);/);
});

test("the publish-trade button is centered on its own row", () => {
  assert.match(css, /\.trade-desk-head \{\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: center;/);
  assert.match(css, /\.trade-desk \.trade-desk-head h2 \{\n  flex: 1 1 100%;/);
  assert.match(css, /\.trade-publish-row \{[^}]*justify-content:\s*center/);
  assert.match(html, /class="trade-publish-row">\s*<button id="trade-create"/);
});

test("every layout rule is scoped to a data-layout value", () => {
  const block = css.slice(css.indexOf("/* ── QA layout options"));
  const selectors = block.replace(/\/\*[\s\S]*?\*\//g, "").match(/^[^{}@\n][^{}]*\{/gm) || [];
  for (const selector of selectors) {
    if (selector.includes(".layout-qa-picker")) continue;
    for (const part of selector.replace("{", "").split(",")) assert.match(part, /data-layout="[ABCDE]"/, part.trim());
  }
});

test("page and tucked state follow the view; C never tucks under a guide", () => {
  assert.match(app, /shell\.dataset\.page = name;\n  shell\.classList\.remove\("header-tucked"\);/);
  assert.match(app, /if \(tipsBusy\(\) \|\| top < 24\) layoutShell\.classList\.remove\("header-tucked"\);/);
  assert.match(css, /html:not\(:has\(#klafi-tips:not\(\[hidden\]\)\)\) #app\[data-layout="D"\]\[data-page="binder"\] #earned-badge-list/);
});

test("trades: A folds the header on the desk too, B keeps one scroller and an unstretched header", () => {
  const block = css.slice(css.indexOf("/* ── QA layout options"));
  // A: the desk shares the board's fold key and gets its own toggle (A only); the board fold only counts while its toggle shows.
  assert.match(app, /document\.querySelector\("#community-panel-trade"\)\?\.classList\.toggle\("is-chrome-collapsed", collapsed\)/);
  assert.match(app, /if \(layoutOption === "A"\) \{[\s\S]*?fold\.addEventListener\("click", toggleTradeBoardChrome\)/);
  assert.match(block, /:has\(#community-panel-trade\.is-chrome-collapsed:not\(\[hidden\]\)\) \.masthead/);
  assert.match(block, /#community-panel-open-trades\.is-chrome-collapsed:not\(\[hidden\]\) #trade-board-chrome-toggle:not\(\[hidden\]\)/);
  // B: 1fr + align-content:start (no stretched header on short pages), #main sized to content (nav clearance after the last row).
  assert.match(block, /grid-template-rows: auto auto 1fr;\n  align-content: start;/);
  assert.match(block, /#growth-view\.view\.active \{\n  height: auto;\n  min-height: auto;/);
  assert.match(block, /\.growth-grid > \.work-card\.trade-desk \{\n  max-height: none;\n  overflow: visible !important;/);
});

test("A folded trades hide the tabs, kicker and desk heading like the binder fold, but not during a guide", () => {
  const block = css.slice(css.indexOf("/* ── QA layout options"));
  assert.match(block, /html:not\(:has\(#klafi-tips:not\(\[hidden\]\)\)\) #app\[data-layout="A"\]\[data-page="growth"\]:has\(#community-panel-trade\.is-chrome-collapsed:not\(\[hidden\]\)\) #growth-view \.community-nav/);
  assert.match(block, /\.work-card\.is-chrome-collapsed:not\(\[hidden\]\) > \.work-kicker/);
  assert.match(block, /#community-panel-trade\.is-chrome-collapsed \.trade-desk-head > h2/);
});

test("E = B plus pinned sort/filter bars", () => {
  const block = css.slice(css.indexOf("/* ── QA layout options"));
  assert.match(block, /#app\[data-layout="E"\]\[data-page="growth"\] #main/, "E reuses B's single page scroller");
  assert.match(block, /#app\[data-layout="E"\]\[data-page="binder"\] #binder-filters,\n#app\[data-layout="E"\]\[data-page="growth"\] #trade-board-toolbar:not\(\[hidden\]\) \{\n  position: sticky;/);
});
