import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../data");

test("every expanded card has embedded provenance and an explicit review status", async () => {
  const [cards, advocacy, sequences, studio] = await Promise.all([
    readFile(path.join(dataDir, "cards.json"), "utf8").then(JSON.parse),
    readFile(path.join(dataDir, "advocacy.json"), "utf8").then(JSON.parse),
    readFile(path.join(dataDir, "editorial-sequences.json"), "utf8").then(JSON.parse),
    readFile(path.join(dataDir, "studio-content.json"), "utf8").then(JSON.parse),
  ]);

  assert.ok(cards.length > 100);
  for (const card of cards) {
    assert.ok(card.walkout.text, `${card.id} needs a walkout hook`);
    assert.ok(card.walkout.context, `${card.id} needs context`);
    assert.ok(card.walkout.selectionRationale, `${card.id} needs a selection rationale`);
    assert.ok(card.walkout.sourceId, `${card.id} needs a stable source ID`);
    assert.doesNotThrow(() => new URL(card.walkout.sourceUrl));
    assert.ok(card.walkout.contentStatus);
    assert.ok(["orientation", "identity", "critical", "favorable"].includes(card.walkout.editorialRole));
    assert.ok(card.releaseSetId, `${card.id} needs a release set`);
    assert.ok(Number.isInteger(card.releaseOrder), `${card.id} needs release ordering`);
    assert.equal(typeof card.idleEligible, "boolean", `${card.id} needs idle eligibility`);
    assert.ok(card.binderGroup, `${card.id} needs a Binder group`);
  }
  const activeReleases = new Set(
    (studio.gameConfig?.releaseSets || [])
      .filter(({ runtimeState }) => runtimeState === "active")
      .map(({ id }) => id),
  );
  const leaders = cards.filter(({ releaseSetId }) => releaseSetId === "party-leaders");
  const slotTwo = cards.filter(({ releaseSetId }) => releaseSetId === "party-slot-2");
  const leadersOpen = activeReleases.has("party-leaders");
  const slotTwoOpen = activeReleases.has("party-slot-2");
  assert.equal(leaders.length, 14);
  assert.equal(slotTwo.length, 13);
  assert.equal(
    cards.filter(({ idleEligible }) => idleEligible).length,
    (leadersOpen ? leaders.length : 0) + (slotTwoOpen ? slotTwo.length : 0),
  );
  assert.ok(leaders.every(({ releaseState, idleEligible }) =>
    releaseState === (leadersOpen ? "active" : "held") && idleEligible === leadersOpen));
  assert.ok(slotTwo.every(({ releaseState, idleEligible }) =>
    releaseState === (slotTwoOpen ? "active" : "held") && idleEligible === slotTwoOpen));

  assert.equal(advocacy.editorialPolicy.rulesStayFixed, true);
  assert.equal(advocacy.editorialPolicy.oneProgramForEveryone, true);
  assert.equal(advocacy.editorialPolicy.realActivityOnly, true);
  assert.equal(advocacy.status, "configured");
  assert.equal(advocacy.sponsor, "Guy Girmonsky");
  assert.equal(advocacy.supportedFaction, "Current opposition");
  assert.equal(sequences.length, 3);
  assert.ok(sequences.some(({ publicationBlockedBy }) => publicationBlockedBy));
});
