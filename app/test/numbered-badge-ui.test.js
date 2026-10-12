import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8") + await readFile(new URL("../public/theme-pack-v2.css", import.meta.url), "utf8");

test("numbered badge count is drawn on the # everywhere the badge renders (minimum 1), no separate chip", () => {
  assert.match(app, /function badgeCountOf\(badge\) \{\n  return badge\?\.earned && badge\.id === "numbered-first" \? Math\.max\(1,/);
  assert.equal((app.match(/count: badgeCountOf\(badge\)/g) || []).length, 2, "binder medal row + achievements page");
  assert.match(app, /class="badge-count"/);
  assert.doesNotMatch(app, /achievement-count/);
});

test("race tabs: ממוספרים only for players with an opened numbered copy, three equal columns then", () => {
  assert.match(app, /button\.hidden = !inSection \|\| \(button\.dataset\.communityPage === "numbered" && !showNumbered\)/);
  assert.match(app, /if \(!showNumbered && model\.communityPage === "numbered"\) model\.communityPage = "collectors";/);
  assert.match(css, /#app\[data-density="airy-v2"\] #community-tabs\[data-community-section="race"\]\.has-numbered/);
});
