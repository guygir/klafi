import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { catalogExtrasFromStudio, expandPublicCatalog } from "../server/public-catalog.js";
import { visiblePlayerCards } from "../server/visible-sets.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");

// Policy: every playable quote card must point to a real, checkable source and show a
// human-readable receipt label. Cards whose source is still being researched go here,
// one id per line with a short reason, so the gap stays visible in review instead of
// silently shipping "Source pending". Keep this list empty whenever possible.
const KNOWN_PENDING_SOURCE_IDS = Object.freeze([]);

async function playableCards() {
  const [cards, specials, studio, set5, set6, catalog] = await Promise.all([
    readFile(path.resolve(here, "../data/cards.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/specials-content.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/studio-content.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, "docs/intake/research/set5-wip-pool.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, "docs/intake/research/set6-wip-pool.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../public/catalog.json"), "utf8").then(JSON.parse),
  ]);
  const runtime = visiblePlayerCards(expandPublicCatalog(cards, specials, catalogExtrasFromStudio(studio, set5, set6)))
    .filter((card) => !card.eventOnly);
  const staticCards = catalog.cards.filter((card) => !card.eventOnly);
  return { runtime, staticCards };
}

function sourceProblems(card) {
  const problems = [];
  const url = String(card.walkout?.sourceUrl || "").trim();
  const label = String(card.walkout?.sourceLabel || "").trim();
  if (!url) problems.push("empty sourceUrl");
  else {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) problems.push(`non-http sourceUrl ${url}`);
    } catch {
      problems.push(`unparseable sourceUrl ${url}`);
    }
  }
  if (!label || /source pending/i.test(label)) problems.push("Source pending label");
  else if (/^https?:\/\//i.test(label)) problems.push("raw URL used as sourceLabel");
  if (/source pending/i.test(String(card.source || ""))) problems.push("Source pending top-level source");
  return problems;
}

test("every playable card carries a checkable source and a human label", async () => {
  const { runtime, staticCards } = await playableCards();
  assert.ok(runtime.length >= 68, `expected the full playable catalog, got ${runtime.length}`);
  for (const [name, cards] of [["runtime", runtime], ["catalog.json", staticCards]]) {
    const failures = cards
      .filter((card) => !KNOWN_PENDING_SOURCE_IDS.includes(card.id))
      .map((card) => [card.id, sourceProblems(card)])
      .filter(([, problems]) => problems.length)
      .map(([id, problems]) => `${id}: ${problems.join(", ")}`);
    assert.deepEqual(failures, [], `${name} playable cards with source gaps:\n${failures.join("\n")}`);
  }
});

test("known-pending source allowlist only names cards that still need it", async () => {
  const { runtime } = await playableCards();
  for (const id of KNOWN_PENDING_SOURCE_IDS) {
    const card = runtime.find((entry) => entry.id === id);
    assert.ok(card, `${id} is allowlisted but not a playable card`);
    assert.ok(sourceProblems(card).length, `${id} now has a source; remove it from KNOWN_PENDING_SOURCE_IDS`);
  }
});

test("static catalog.json receipts match the runtime catalog", async () => {
  const { runtime, staticCards } = await playableCards();
  const byId = new Map(staticCards.map((card) => [card.id, card]));
  for (const card of runtime) {
    const published = byId.get(card.id);
    assert.ok(published, `${card.id} missing from catalog.json`);
    assert.equal(published.walkout?.sourceUrl, card.walkout?.sourceUrl, `${card.id} sourceUrl drifted`);
    assert.equal(published.walkout?.sourceLabel, card.walkout?.sourceLabel, `${card.id} sourceLabel drifted`);
  }
});

test("research pools drop the sourcePending flag once a source is attached", async () => {
  for (const file of ["set5-wip-pool.json", "set6-wip-pool.json"]) {
    const pool = JSON.parse(await readFile(path.join(projectRoot, "docs/intake/research", file), "utf8"));
    const stale = pool.candidates
      .filter((candidate) => candidate.sourcePending && (candidate.sources || []).some(Boolean))
      .map((candidate) => candidate.n);
    assert.deepEqual(stale, [], `${file} candidates still flagged sourcePending: ${stale.join(", ")}`);
  }
});
