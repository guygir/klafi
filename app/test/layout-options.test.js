import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("PR #161 compact header layouts are not shipped", () => {
  assert.doesNotMatch(app, /LAYOUT_OPTIONS/);
  assert.doesNotMatch(app, /LAYOUT_DEFAULT/);
  assert.doesNotMatch(app, /klafi-layout/);
  assert.doesNotMatch(app, /layout-qa-picker/);
  assert.doesNotMatch(app, /shell\.dataset\.page = name/);
  assert.doesNotMatch(css, /data-layout="[ABCDE]"/);
  assert.doesNotMatch(html, /data-layout=/);
});

test("the publish-trade button is centered on its own row", () => {
  assert.match(css, /\.trade-publish-row \{[^}]*justify-content:\s*center/);
  assert.match(html, /class="trade-publish-row">\s*<button id="trade-create"/);
});

test("fold-menu stays on compose and the open-trades board", () => {
  assert.match(html, /id="trade-desk-chrome-toggle"[^>]*>↑ קיפול התפריט ↑/);
  assert.match(html, /id="trade-board-chrome-toggle"[^>]*aria-label="קיפול התפריט"/);
  assert.match(app, /document\.getElementById\("trade-desk-chrome-toggle"\)\?\.addEventListener\("click", toggleTradeBoardChrome\)/);
});
