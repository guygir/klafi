import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  movedCardsFromAccept,
  tradeNoticeFallbackThumb,
  tradeNoticeSides,
  tradeNoticeSidesFilled,
} from "../public/trade-result.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function paintDialog(moved, catalog) {
  const sides = tradeNoticeSides(moved, catalog);
  const receivedHtml = sides.received.hidden
    ? ""
    : sides.received.thumbs.map((thumb) => (
      catalog?.get?.(thumb.cardId)
        ? `<div class="trade-thumb" data-card-id="${thumb.cardId}">card</div>`
        : tradeNoticeFallbackThumb(thumb.cardId)
    )).join("");
  const givenHtml = sides.given.hidden
    ? ""
    : sides.given.thumbs.map((thumb) => (
      catalog?.get?.(thumb.cardId)
        ? `<div class="trade-thumb" data-card-id="${thumb.cardId}">card</div>`
        : tradeNoticeFallbackThumb(thumb.cardId)
    )).join("");
  return {
    sides,
    html: `<div class="trade-notice-cards">
      <div class="trade-side"${sides.received.hidden ? " hidden" : ""}><small>קיבלתם</small><div id="trade-notice-received">${receivedHtml}</div></div>
      <div class="trade-side"${sides.given.hidden ? " hidden" : ""}><small>נתתם</small><div id="trade-notice-given">${givenHtml}</div></div>
    </div>`,
  };
}

test("accepted-trade dialog never paints an empty קיבלתם/נתתם side", () => {
  const cases = [
    {
      name: "empty accept payload + pre-accept 1↔1 snapshot",
      result: { receivedCardIds: [], givenCardIds: [], trade: { offeredCardIds: [], wantedCardIds: [] } },
      pick: {},
      snapshot: { offeredCardId: "A", wantedCardId: "X" },
    },
    {
      name: "listed public trade with empty arrays + OR pick snapshot",
      result: { receivedCardIds: [], givenCardIds: [], trade: { ownerLabel: "שר לענייני דלית", offeredCardIds: [], wantedCardIds: [] } },
      pick: { offeredCardId: "B", wantedCardId: "Y" },
      snapshot: {
        offeredMode: "or",
        wantedMode: "or",
        offeredCardIds: ["A", "B"],
        wantedCardIds: ["X", "Y"],
      },
    },
    {
      name: "AND/AND ids present but catalog is still empty (slim first paint)",
      result: { receivedCardIds: ["A", "B"], givenCardIds: ["X", "Y", "Z"] },
      pick: {},
      snapshot: null,
    },
    {
      name: "explicit ids only",
      result: { receivedCardIds: ["A"], givenCardIds: ["X"] },
      pick: {},
      snapshot: null,
    },
  ];

  for (const fixture of cases) {
    const moved = movedCardsFromAccept(fixture.result, fixture.pick, fixture.snapshot);
    const painted = paintDialog(moved, new Map());
    assert.ok(tradeNoticeSidesFilled(painted.sides), fixture.name);
    assert.match(painted.html, /קיבלתם/);
    assert.match(painted.html, /נתתם/);
    assert.doesNotMatch(painted.html, /id="trade-notice-received"><\/div>/, `${fixture.name} received must not be an empty box`);
    assert.doesNotMatch(painted.html, /id="trade-notice-given"><\/div>/, `${fixture.name} given must not be an empty box`);
    assert.match(painted.html, /data-card-id="/);
  }
});

test("client accept path snapshots the trade and never paints empty markup for a missing catalog card", async () => {
  const javascript = await readFile(path.resolve(here, "../public/app.js"), "utf8");
  assert.match(javascript, /function snapshotTradeForAccept/);
  assert.match(javascript, /movedCardsFromAccept\(result, pick, snapshot\)/);
  assert.match(javascript, /refillMovedFromListedTrade/);
  assert.match(javascript, /tradeNoticeFallbackThumb\(cardId\)/);
  assert.match(javascript, /catalogReady\(\) && !model\.tradeNoticeCatalogWait/);
  assert.doesNotMatch(
    javascript,
    /return card \? `<div class="trade-thumb">\$\{tradeThumbMarkup\(card, \{ warnLastCopy \}\)\}<\/div>` : "";/,
  );
});
