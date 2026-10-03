import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { binderOpenReleaseIds, binderReleaseOk } from "../public/binder-filter.js";
import { LIVE_RELEASE_SET_IDS } from "../server/visible-sets.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(end > start, `${nextName} follows ${name}`);
  return source.slice(start, end);
}

test("all-cards binder list hides held release sets and keeps an open set", async () => {
  const [catalogFile, studioFile, client] = await Promise.all([
    readFile(path.join(appRoot, "public/catalog.json"), "utf8").then(JSON.parse),
    readFile(path.join(appRoot, "data/studio-content.json"), "utf8").then(JSON.parse),
    readFile(path.join(appRoot, "public/app.js"), "utf8"),
  ]);
  const cards = catalogFile.cards;
  const releaseSets = studioFile.gameConfig?.releaseSets || [];
  const heldIds = releaseSets
    .filter((set) => set.runtimeState === "held" && LIVE_RELEASE_SET_IDS.includes(set.id))
    .map((set) => set.id)
    .sort();
  assert.deepEqual(heldIds, ["decisions", "records"]);

  const hiddenMatch = /const hidden = new Set\((\[[^\]]*\])\)/.exec(client);
  assert.ok(hiddenMatch, "openBinderReleaseIds keeps the hidden-set list");
  assert.deepEqual(JSON.parse(hiddenMatch[1]).sort(), heldIds);

  const openIds = binderOpenReleaseIds(releaseSets, cards, LIVE_RELEASE_SET_IDS, heldIds);
  assert.ok(openIds.includes("party-leaders"));
  assert.ok(openIds.includes("party-slot-2"));
  assert.ok(openIds.includes("set-5"));
  for (const id of heldIds) assert.equal(openIds.includes(id), false);

  const playerCards = cards.filter((card) => LIVE_RELEASE_SET_IDS.includes(card.releaseSetId));
  const all = playerCards.filter((card) => binderReleaseOk(card, "ALL", { openReleaseIds: openIds }));
  assert.ok(all.some((card) => card.releaseSetId === "party-leaders"), "an open set stays in the all-cards list");
  assert.ok(all.some((card) => card.releaseSetId === "set-5"));
  assert.equal(all.some((card) => heldIds.includes(card.releaseSetId)), false, "held sets stay out of the all-cards list");

  const recordsCard = playerCards.find((card) => card.id === "REC-YAIR-GOLAN-SERVICE-01");
  const decisionsCard = playerCards.find((card) => card.releaseSetId === "decisions");
  const openCard = playerCards.find((card) => card.releaseSetId === "party-leaders");
  assert.ok(recordsCard && decisionsCard && openCard);
  assert.equal(binderReleaseOk(recordsCard, "ALL", { openReleaseIds: openIds }), false);
  assert.equal(binderReleaseOk(decisionsCard, "ALL", { openReleaseIds: openIds }), false);
  assert.equal(binderReleaseOk(recordsCard, "SPECIALS", { openReleaseIds: openIds }), true);
  assert.equal(binderReleaseOk(openCard, "ALL", { openReleaseIds: openIds }), true);
  assert.equal(binderReleaseOk(openCard, "RELEASE:party-leaders", { openReleaseIds: openIds }), true);
  assert.equal(binderReleaseOk(recordsCard, "RELEASE:records", { openReleaseIds: openIds }), true);
  assert.equal(binderReleaseOk(openCard, "NUMBERED", { openReleaseIds: openIds, numberedIds: new Set([openCard.id]) }), true);
  assert.equal(binderReleaseOk(openCard, "NUMBERED", { openReleaseIds: openIds, numberedIds: new Set() }), false);

  const renderBinder = functionBody(client, "renderBinder", "syncBinderScrollCue");
  const showcase = functionBody(client, "renderShowcaseBinder", "plainOwnedCount");
  const wired = /binderReleaseOk\(card, model\.binderFilter, \{\s*openReleaseIds: releaseOrder/;
  assert.match(renderBinder, /const releaseOrder = openBinderReleaseIds\(\)/);
  assert.match(renderBinder, wired);
  assert.match(showcase, /const releaseOrder = openBinderReleaseIds\(\)/);
  assert.match(showcase, wired);
  assert.doesNotMatch(renderBinder, /binderFilter === "ALL"\s*(?:\|\||\? true)/);
});
