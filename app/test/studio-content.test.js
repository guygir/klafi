import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildMemberWeavePrompt, buildWeavePrompt, cardFilename } from "../public/prompt-builder.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const studio = JSON.parse(await readFile(path.join(appRoot, "data/studio-content.json"), "utf8"));
const runtimeCards = JSON.parse(await readFile(path.join(appRoot, "data/cards.json"), "utf8"));
const specials = JSON.parse(await readFile(path.join(appRoot, "data/specials-content.json"), "utf8"));
const archive = JSON.parse(await readFile(path.join(projectRoot, "docs/intake/research/quote-archive-41.json"), "utf8"));

test("expanded Studio has the canonical 14-party, 51-person roster", () => {
  assert.equal(studio.parties.length, 14);
  assert.equal(studio.members.length, 51);
  assert.equal(new Set(studio.parties.map(({ id }) => id)).size, 14);
  assert.equal(new Set(studio.members.map(({ id }) => id)).size, 51);

  const partyIds = new Set(studio.parties.map(({ id }) => id));
  for (const party of studio.parties) {
    assert.ok(party.requestedLetters.length >= 1);
    assert.match(party.letterStatus, /^(requested|disputed|protected)$/);
    assert.equal(party.finalLetters, null);
  }
  for (const member of studio.members) {
    assert.ok(partyIds.has(member.partyId));
    assert.ok(member.identityReference.url.startsWith("http"));
    assert.ok(member.identityReference.license);
    assert.equal(member.quoteSlots.length, 3);
    assert.deepEqual(member.quoteSlots.map(({ rarity }) => rarity), ["Common", "Uncommon", "Rare"]);
  }
});

test("card IDs are unique and sparse quote slots remain explicit", () => {
  const cards = studio.members.flatMap(({ quoteSlots }) => quoteSlots);
  assert.equal(new Set(cards.map(({ id }) => id)).size, 153);
  for (const member of studio.members) {
    const populated = member.quoteSlots.filter((card) => card.quote.displayText.trim());
    if (populated.length > 0 && populated.length < 3) {
      assert.equal(populated.length, 1);
      assert.equal(populated[0].rarity, "Rare");
      assert.equal(member.quoteSlots[0].publicationState, "blank");
      assert.equal(member.quoteSlots[1].publicationState, "blank");
    }
  }
});

test("populated quotes retain provenance, classification and prompt inputs", () => {
  const allowedStatuses = new Set(["exact", "shortened", "attributed-paraphrase"]);
  let populated = 0;
  for (const member of studio.members) {
    const party = studio.parties.find(({ id }) => id === member.partyId);
    for (const card of member.quoteSlots) {
      if (!card.quote.displayText.trim()) continue;
      populated += 1;
      assert.ok(card.quote.sourceUrl.startsWith("http"));
      assert.ok(allowedStatuses.has(card.quote.status));
      assert.ok(card.editorial.scene);
      assert.equal(card.editorial.flavorDisclosure, "editorial-symbolism-not-evidence");
      const prompt = buildWeavePrompt({ party, member, card });
      assert.match(prompt, new RegExp(card.id));
      assert.match(prompt, /symbolic framing, not documentary evidence/i);
      assert.match(prompt, new RegExp(cardFilename(party, member, card).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
  assert.ok(populated >= 1);
});

test("member prompt requests three separate quote-specific images", () => {
  const member = studio.members.find(({ id }) => id === "LIK-M01");
  const party = studio.parties.find(({ id }) => id === member.partyId);
  const prompt = buildMemberWeavePrompt({ party, member });

  assert.match(prompt, /Generate exactly THREE separate vertical 3:4 portrait images/);
  assert.match(prompt, /Do not combine them into a triptych/);
  assert.match(prompt, /hero-art-naama-lazimi\.jpg/);
  for (const [index, card] of member.quoteSlots.entries()) {
    assert.match(prompt, new RegExp(`IMAGE 0${index + 1}`));
    assert.match(prompt, new RegExp(card.id));
    assert.match(prompt, new RegExp(card.quote.displayText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(prompt, new RegExp(cardFilename(party, member, card).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Netanyahu triplet retains the approved quotes and generated portraits", () => {
  const netanyahu = studio.members.find(({ id }) => id === "LIK-M01");
  assert.deepEqual(
    netanyahu.quoteSlots.map(({ art }) => art.artKey),
    [
      "hero-art-benjamin-netanyahu-01.png",
      "hero-art-benjamin-netanyahu-02.png",
      "hero-art-benjamin-netanyahu-03.png",
    ],
  );
  assert.match(netanyahu.quoteSlots[0].quote.displayText, /לא יהיה כלום כי אין כלום/);
  assert.match(netanyahu.quoteSlots[1].quote.displayText, /המצביעים הערבים נעים בכמויות אדירות לקלפי/);
  assert.match(netanyahu.quoteSlots[2].quote.displayText, /לתמוך בחיזוק החמאס ובהעברת כסף לחמאס/);
  assert.equal(netanyahu.quoteSlots[2].quote.status, "attributed-paraphrase");
});

test("Miri Regev card one uses the reviewed hotel-corridor portrait", () => {
  const regev = studio.members.find(({ id }) => id === "LIK-M05");
  const card = regev.quoteSlots.find(({ id }) => id === "LIK-M05-Q01");
  assert.equal(card.art.artKey, "hero-art-miri-regev-01.jpg");
  assert.equal(runtimeCards.find(({ id }) => id === card.id).artKey, card.art.artKey);
});

test("the public archive import retains all discovery and upstream URLs", () => {
  assert.equal(archive.recordCount, 41);
  assert.equal(archive.records.length, 41);
  for (const record of archive.records) {
    assert.ok(record.archiveUrl.startsWith("https://thebigbookofquotes.com/quote/"));
    assert.ok(record.originalSourceUrl.startsWith("http"));
    assert.equal(record.evidenceStatus, "discovery-only");
  }
});

test("runtime catalog omits blank slots and keeps all party card families dynamic", () => {
  const runtimeIds = new Set(runtimeCards.map(({ id }) => id));
  const blankIds = studio.members.flatMap(({ quoteSlots }) => quoteSlots)
    .filter((card) => !card.quote.displayText.trim())
    .map(({ id }) => id);
  assert.ok(blankIds.length > 0);
  assert.ok(blankIds.every((id) => !runtimeIds.has(id)));
  for (const party of studio.parties) {
    assert.equal(runtimeCards.filter((card) => card.set === party.id && card.type === "Symbol").length, 1);
    assert.equal(runtimeCards.filter((card) => card.set === party.id && card.type === "Platform").length, 2);
  }
  assert.ok(runtimeCards.filter(({ rarity }) => rarity.startsWith("Common")).length >= 3);
  assert.ok(runtimeCards.filter(({ rarity }) => rarity.startsWith("Uncommon")).length >= 2);
  assert.ok(runtimeCards.filter(({ rarity }) => rarity.startsWith("Rare")).length >= 1);
  for (const card of runtimeCards) {
    assert.ok(card.titleHe);
    assert.ok(card.setNameHe);
    assert.ok(card.typeHe);
    assert.match(card.displayCode, /[\u0590-\u05ff]/);
  }
  assert.equal(runtimeCards.find(({ id }) => id === "SYS-C-01").displayCode, "יסוד-01");
  assert.equal(runtimeCards.find(({ set, type }) => set === "YSR" && type === "Symbol").displayCode, "דרך-01");
  assert.equal(runtimeCards.find(({ id }) => id === "LIK-P-01").displayCode, "מחל-02");
  assert.equal(runtimeCards.find(({ id }) => id === "LIK-M01-Q01").displayCode, "מחל-04");
  assert.equal(runtimeCards.find(({ id }) => id === "LIK-M01-Q03").displayCode, "מחל-06");
  for (const party of studio.parties) {
    const codes = runtimeCards.filter(({ set }) => set === party.id).map(({ displayCode }) => displayCode);
    assert.equal(new Set(codes).size, codes.length, `${party.id} display codes must be unique`);
  }
  assert.equal(runtimeCards.find(({ id }) => id === "LIK-S-01").artKey, "hero-art-memchetlammed.png");
});

test("Specials remain sourced showcase cards outside daily pack odds", () => {
  assert.equal(specials.sets.length, 6);
  assert.ok(specials.sets.every(({ packEligible }) => packEligible === false));
  const setIds = new Set(specials.sets.map(({ id }) => id));
  for (const card of specials.cards) {
    assert.ok(setIds.has(card.setId));
    assert.equal(card.mark, "P");
    assert.equal(card.rarity, "Promotion");
    assert.ok(card.sourceUrl.startsWith("http"));
    assert.ok(!runtimeCards.some(({ id }) => id === card.id));
  }
  assert.ok(specials.cards.some(({ id }) => id === "PRE-OREN-HAZAN-01"));
  assert.ok(specials.cards.some(({ id }) => id === "MOU-YINON-MAGAL-01"));
  assert.ok(specials.cards.some(({ setId }) => setId === "satire-imitations"));
  assert.ok(specials.cards.some(({ setId }) => setId === "legendary-aces"));
  assert.equal(specials.cards.filter(({ setId }) => setId === "records").length, 5);
  assert.equal(specials.cards.filter(({ setId }) => setId === "current-ministers").length, 3);
  assert.ok(specials.cards.filter(({ setId }) => ["records", "current-ministers"].includes(setId))
    .every(({ quoteStatus, contentStatus }) => quoteStatus === "fact-record" && contentStatus === "approved"));
});
