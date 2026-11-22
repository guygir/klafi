import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");

test("open-all button exists in index.html and is wired in app.js with RTL Hebrew copy", async () => {
  const [html, js, css] = await Promise.all([
    readFile(path.join(publicDir, "index.html"), "utf8"),
    readFile(path.join(publicDir, "app.js"), "utf8"),
    readFile(path.join(publicDir, "styles.css"), "utf8"),
  ]);

  assert.match(html, /<button id="open-all-packs" class="secondary-action open-all-action" type="button" hidden>פתחו הכל<\/button>/);
  assert.match(css, /\.action-dock \.open-all-action/);
  assert.match(js, /openAllPacks: document\.querySelector\("#open-all-packs"\)/);
  assert.match(js, /elements\.openAllPacks\?\.addEventListener\("click", openAllIdleCards\)/);

  const home = js.slice(js.indexOf("function renderHome()"), js.indexOf("function shuffled("));
  assert.match(home, /const showAll = unseen >= 2;/);
  assert.match(home, /elements\.openAllPacks\.hidden = !showAll;/);
  assert.ok(home.includes("`פתחו הכל (${unseen})`"));

  const openAll = js.slice(js.indexOf("async function openAllIdleCards()"), js.indexOf("async function revealReferralPack("));
  assert.match(openAll, /await hydrateIdleQueue\(\)/);
  assert.match(openAll, /overlayPendingSeen/);
  assert.match(openAll, /await playGrantedPackReveal\(\{\s*cards: unopened/);
});

test("multi-card idle-return acknowledges each card as its walkout starts and re-renders consecutive duplicate cardIds", async () => {
  const js = await readFile(path.join(publicDir, "app.js"), "utf8");
  const ack = js.slice(js.indexOf("function acknowledgeRevealedPack(pack)"), js.indexOf("function revealInProgress()"));
  assert.match(ack, /const perCard = pack\.mode === "idle-return" && \(pack\.cards\?\.length \|\| 0\) > 1;/);
  assert.match(ack, /pack\.cards\[model\.currentCardIndex\]/);
  assert.match(ack, /pack\.acknowledgedIds/);

  const walkoutStage = js.slice(js.indexOf("function renderWalkoutStage()"), js.indexOf("function placeholderMark("));
  assert.match(walkoutStage, /elements\.ripStage\.dataset\.cardIndex !== String\(model\.currentCardIndex\)/);
});

test("streak calendar client maps all 12 Hebrew month names for aria labels", async () => {
  const js = await readFile(path.join(publicDir, "app.js"), "utf8");
  const paint = js.slice(js.indexOf("function paintStreakCalendar("), js.indexOf("function paintRedeemButton("));
  for (const monthName of ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני", "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"]) {
    assert.ok(paint.includes(monthName), `missing month name ${monthName}`);
  }
});
