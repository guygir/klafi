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
