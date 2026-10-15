import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("layout options are opt-in: no data-layout by default, only ?layout= / klafi-layout set it", () => {
  assert.doesNotMatch(html, /data-layout=/, "production markup has no layout option");
  assert.match(app, /const LAYOUT_OPTIONS = \["A", "B", "C", "D"\];/);
  assert.match(app, /if \(layoutOption && layoutShell\) \{\n  layoutShell\.dataset\.layout = layoutOption;/);
  assert.match(app, /else storage\.removeItem\(LAYOUT_KEY\);/, "?layout=off clears the stored option");
});

test("every layout rule is scoped to a data-layout value", () => {
  const block = css.slice(css.indexOf("/* ── QA layout options"));
  const selectors = block.replace(/\/\*[\s\S]*?\*\//g, "").match(/^[^{}@\n][^{}]*\{/gm) || [];
  for (const selector of selectors) {
    if (selector.includes(".layout-qa-picker")) continue;
    for (const part of selector.replace("{", "").split(",")) assert.match(part, /data-layout="[ABCD]"/, part.trim());
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
