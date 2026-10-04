import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { catalogExtrasFromStudio, expandPublicCatalog } from "../server/public-catalog.js";
import { slimPublicState } from "../server/slim-state.js";
import { LIVE_RELEASE_SET_IDS, visiblePlayerCards } from "../server/visible-sets.js";
import { emptyCommunity, slimDailyChallenge } from "../server/slim-community.js";
import { liveDeployAssetNames } from "../../scripts/live-deploy-assets.mjs";
import { cardPullOdds, rarityOrderReport } from "../server/pack-config.js";
import { IDLE_BACKLOG_CAP, IDLE_INTERVAL_MS, IDLE_STARTER_READY } from "../server/idle-config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");
const projectRoot = path.resolve(here, "../..");

async function loadCatalogSources() {
  const [cards, specials, studio, set5, set6] = await Promise.all([
    readFile(path.resolve(here, "../data/cards.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/specials-content.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/studio-content.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, "docs/intake/research/set5-wip-pool.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, "docs/intake/research/set6-wip-pool.json"), "utf8").then(JSON.parse),
  ]);
  return { cards, specials, studio, set5, set6, extras: catalogExtrasFromStudio(studio, set5, set6) };
}

test("static catalog.json matches the public card expansion", async () => {
  const [{ cards, specials, extras }, catalog] = await Promise.all([
    loadCatalogSources(),
    readFile(path.join(publicDir, "catalog.json"), "utf8").then(JSON.parse),
  ]);
  const expanded = expandPublicCatalog(cards, specials, extras);
  const visible = visiblePlayerCards(expanded);
  assert.equal(catalog.cards.length, visible.length);
  assert.deepEqual([...new Set(catalog.cards.map(({ releaseSetId }) => releaseSetId))].sort(), [...LIVE_RELEASE_SET_IDS].sort());
  assert.ok(catalog.cards.every(({ releaseSetId }) => LIVE_RELEASE_SET_IDS.includes(releaseSetId)));
  assert.ok(catalog.cards.some(({ idleEligible }) => idleEligible));
  assert.ok(catalog.cards.some(({ eventOnly }) => eventOnly));
  assert.ok(!catalog.cards.some(({ releaseSetId }) => releaseSetId === "editorial-backlog"));
  assert.ok(!catalog.cards.some(({ releaseSetId }) => String(releaseSetId).startsWith("party-position")));
});

test("live walkout quotes stay on the published wording", async () => {
  const catalog = JSON.parse(await readFile(path.join(publicDir, "catalog.json"), "utf8"));
  const pins = {
    "SET5-16": "לא צדקה אלא צדק; לא רחמים אלא הכרה.",
    "BW-M02-Q01": "כל אחת מנהיגה בחלקת האלוהים שלה.",
    "AMH-M01-Q01": "הפתרון בעזה הוא אחד: הגירה",
    "SET5-10": "אתה רמטכ״ל מבולבל, אתה כפוף לראש הממשלה ולדרג המדיני.*",
    "SET5-05": "אנחנו חיים בתקופה של נס*",
  };
  for (const [id, text] of Object.entries(pins)) {
    const card = catalog.cards.find((entry) => entry.id === id);
    assert.ok(card, `missing ${id}`);
    assert.equal(card.walkout?.text, text, `${id} quote was rewritten`);
  }
});

test("slim home state includes inventory for binder reads", () => {
  const state = slimPublicState({
    displayName: "שחקן",
    avatarId: "kid-boy",
    createdAt: "2026-09-16T00:00:00.000Z",
    highestRank: 1,
    nextIdleAt: null,
    inventory: { "LIK-M01-Q01": 2 },
    unseenPulls: [],
    pendingRankRewards: [],
    favorites: ["LIK-M01-Q01"],
  }, {
    idleCardIds: ["LIK-M01-Q01"],
    totals: { idleEligible: 14 },
    gameConfig: { progression: { rankNames: ["אזרח סקרן", "קורא כותרות"] } },
  });
  assert.equal(state.inventory["LIK-M01-Q01"], 2);
  assert.deepEqual(state.favorites, ["LIK-M01-Q01"]);
  assert.equal(state.ownedUnique, 1);
  assert.equal(state.idleStarterReady, IDLE_STARTER_READY);
  assert.equal(state.idleCapacity, IDLE_BACKLOG_CAP);
  assert.equal(state.starCount, 0);
  assert.equal(state.factionId, null);
  assert.deepEqual(state.pendingTradeNotices, []);
  assert.equal(state.visitStreak, 0);
  assert.deepEqual(state.eventCounts, { source_opened: 0, share_created: 0 });
  assert.equal(state.streakCalendar.day, 0);
  assert.equal(state.streakCalendar.showPopup, false);
  assert.equal(state.streakCalendar.days.length, 35);
});

test("slim home state keeps a selected faction on the player", () => {
  const state = slimPublicState({
    displayName: "שחקן",
    avatarId: "kid-boy",
    createdAt: "2026-09-16T00:00:00.000Z",
    highestRank: 1,
    nextIdleAt: null,
    inventory: { "LIK-M01-Q01": 1 },
    unseenPulls: [],
    pendingRankRewards: [],
    favorites: [],
    factionId: "LIK",
  }, {
    idleCardIds: ["LIK-M01-Q01"],
    totals: { idleEligible: 14 },
    gameConfig: { progression: { rankNames: ["אזרח סקרן", "קורא כותרות"] } },
  });
  assert.equal(state.factionId, "LIK");
});

test("slim home counts stars from the visible card index", () => {
  const state = slimPublicState({
    displayName: "שחקן",
    avatarId: "kid-boy",
    createdAt: "2026-09-16T00:00:00.000Z",
    highestRank: 1,
    nextIdleAt: null,
    inventory: { "LIK-M01-Q01": 2, "DEC-01": 1 },
    unseenPulls: [],
    pendingRankRewards: [],
    favorites: [],
  }, {
    idleCardIds: ["LIK-M01-Q01"],
    cardIndex: [
      { id: "LIK-M01-Q01", rarity: "Common", set: "LIK" },
      { id: "DEC-01", rarity: "Rare", set: "special-decisions" },
    ],
    totals: { idleEligible: 14 },
    gameConfig: { progression: { rankNames: ["אזרח סקרן", "קורא כותרות"] } },
  });
  assert.equal(state.starCount, 4);
});

test("player shell only publishes the live release sets", async () => {
  const shell = JSON.parse(await readFile(path.join(publicDir, "shell.json"), "utf8"));
  assert.deepEqual((shell.gameConfig.releaseSets || []).map(({ id }) => id), [...LIVE_RELEASE_SET_IDS]);
  assert.deepEqual((shell.gameConfig.pack?.sets || []).map(({ id }) => id), [...LIVE_RELEASE_SET_IDS]);
  assert.ok(shell.gameConfig.pack?.current);
  assert.equal(shell.gameConfig.idle.starterReady, IDLE_STARTER_READY);
  assert.equal(shell.gameConfig.idle.capacity, IDLE_BACKLOG_CAP);
  assert.equal(shell.gameConfig.idle.intervalMs, IDLE_INTERVAL_MS);
  assert.ok(shell.cardIndex?.length);
  assert.ok(shell.cardIndex.every(({ releaseSetId }) => LIVE_RELEASE_SET_IDS.includes(releaseSetId)));
  assert.equal(shell.totals.collectible, shell.cardIndex.length);
});

test("Vercel copies live card art including Set 5", async () => {
  const [catalog, avatars, set5] = await Promise.all([
    readFile(path.join(publicDir, "catalog.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/avatars.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../../docs/intake/research/set5-wip-pool.json"), "utf8").then(JSON.parse),
  ]);
  const names = liveDeployAssetNames({ catalog, avatars });
  assert.ok(names.includes("hero-art-gadi-eisenkot-slot1.png"));
  assert.ok(names.includes("pack-wrapper-klafi.png"));
  assert.ok(names.includes("ballot-letter-lik.png"));
  assert.ok(names.includes("ballot-letter-dem.png"));
  assert.ok(names.includes("ballot-letter-ysr.png"));
  assert.ok(names.includes("ballot-letter-bw.png"));
  assert.ok(names.includes("ballot-letter-rse.png"));
  assert.ok(names.includes("ballot-paper.png"));
  assert.ok(!names.includes("pack-rip-seedance-v01.mp4"));
  let set5Bytes = 0;
  let liveBytes = 0;
  for (const candidate of set5.candidates) {
    assert.ok(names.includes(candidate.art.artKey), candidate.art.artKey);
    assert.match(candidate.art.artKey, /\.jpg$/);
    const file = path.resolve(here, "../../docs/design/assets", candidate.art.artKey);
    set5Bytes += (await stat(file)).size;
  }
  for (const name of names) {
    const file = path.resolve(here, "../../docs/design/assets", name);
    const size = (await stat(file)).size;
    liveBytes += size;
    if (name.endsWith(".mp4") || name === "hero-art-kalpi.png" || name === "pack-wrapper-klafi.png") continue;
    assert.ok(size < 700 * 1024, `${name} is still too heavy for the Hobby copy (${size})`);
  }
  assert.ok(set5Bytes < 8 * 1024 * 1024, `Set 5 live JPEGs should stay well under Hobby headroom (${set5Bytes})`);
  assert.ok(liveBytes < 50 * 1024 * 1024, `live Vercel art should stay slim (${liveBytes})`);
});

test("public sets use flat 70/22/8 and set 5 is twice each other open set", async () => {
  const [catalog, studio] = await Promise.all([
    readFile(path.join(publicDir, "catalog.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/studio-content.json"), "utf8").then(JSON.parse),
  ]);
  const byId = new Map(studio.gameConfig.pack.sets.map((set) => [set.id, set]));
  assert.equal(byId.get("party-leaders").weight, 17);
  assert.equal(byId.get("party-slot-2").weight, 18);
  assert.equal(byId.get("set-5").weight, 35);
  assert.equal(byId.get("set-6").weight, 30);
  assert.equal(byId.get("decisions").weight, 0);
  assert.equal(byId.get("records").weight, 0);
  for (const id of ["party-leaders", "party-slot-2", "set-5", "set-6"]) {
    assert.deepEqual(byId.get(id).rarities, { Common: 70, Uncommon: 22, Rare: 8 });
  }
  const odds = cardPullOdds({
    pack: studio.gameConfig.pack,
    releaseSets: studio.gameConfig.releaseSets,
    cards: catalog.cards,
    now: Date.parse("2026-09-20T12:00:00.000Z"),
  });
  const report = rarityOrderReport(odds);
  assert.equal(report.holds, true, JSON.stringify(report));
  const set5 = odds.find((row) => row.releaseSetId === "set-5" && row.rarity === "Common");
  const leaders = odds.find((row) => row.releaseSetId === "party-leaders" && row.rarity === "Common");
  assert.ok(set5.probability > leaders.probability);
});

test("current live pack keeps any specific Rare harder than any specific Common", async () => {
  const [catalog, studio] = await Promise.all([
    readFile(path.join(publicDir, "catalog.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/studio-content.json"), "utf8").then(JSON.parse),
  ]);
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  const odds = cardPullOdds({
    pack: studio.gameConfig.pack,
    releaseSets: studio.gameConfig.releaseSets,
    cards: catalog.cards,
    now,
  });
  const openIds = [...new Set(odds.map((row) => row.releaseSetId))];
  assert.ok(openIds.includes("party-leaders"));
  assert.ok(openIds.includes("party-slot-2"));
  assert.ok(openIds.includes("set-5"));
  for (const setId of openIds) {
    const report = rarityOrderReport(odds.filter((row) => row.releaseSetId === setId));
    assert.equal(report.holds, true, setId);
    assert.ok(report.easiestRare > report.hardestCommon, setId);
  }
});

test("slim community payload stays off the fat catalog", () => {
  const payload = emptyCommunity({
    gameConfig: { parties: [{ id: "LIK", displayNameHe: "הליכוד" }] },
  }, Date.parse("2026-09-18T12:00:00+03:00"));
  assert.deepEqual(payload.trades, { trades: [], simulated: false });
  assert.equal(payload.leaderboards.collectors.length, 0);
  assert.equal(payload.activity.participatingSessions, 0);
  const challenge = slimDailyChallenge({
    gameConfig: { parties: [{ id: "LIK", displayNameHe: "הליכוד" }, { id: "YSR", displayNameHe: "יש עתיד" }] },
  }, Date.parse("2026-09-18T12:00:00+03:00"));
  assert.equal(challenge.targetPartyId, null);
  assert.equal(challenge.targetPartyNameHe, null);
  assert.deepEqual(challenge.leaders, []);
  const saved = slimDailyChallenge({
    gameConfig: { parties: [{ id: "LIK", displayNameHe: "הליכוד" }, { id: "YSR", displayNameHe: "יש עתיד" }] },
  }, Date.parse("2026-09-18T12:00:00+03:00"), "YSR");
  assert.equal(saved.targetPartyId, "YSR");
  assert.equal(saved.targetPartyNameHe, "יש עתיד");
  assert.deepEqual(saved.leaders, []);
});


test("Sets 3 and 4 ship complete art-backed catalogs with their collectible rarities", async () => {
  const { cards, specials, extras } = await loadCatalogSources();
  const expanded = expandPublicCatalog(cards, specials, extras);
  const decisions = expanded.filter(({ releaseSetId }) => releaseSetId === "decisions");
  const records = expanded.filter(({ releaseSetId }) => releaseSetId === "records");
  assert.equal(decisions.length, 9);
  assert.equal(records.length, 10);
  assert.ok([...decisions, ...records].every(({ artKey }) => artKey));
  assert.deepEqual(
    Object.fromEntries(["Common", "Uncommon", "Rare"].map((rarity) => [rarity, decisions.filter((card) => card.rarity === rarity).length])),
    { Common: 4, Uncommon: 3, Rare: 2 },
  );
});


test("Set 5 ships as live Quote cards with party pips and pull rarities", async () => {
  const [{ extras, set5, cards, specials }, catalog] = await Promise.all([
    loadCatalogSources(),
    readFile(path.join(publicDir, "catalog.json"), "utf8").then(JSON.parse),
  ]);
  const live = catalog.cards.filter(({ releaseSetId }) => releaseSetId === "set-5");
  assert.equal(live.length, 23);
  assert.deepEqual(live.map(({ displayCode }) => displayCode),
    Array.from({ length: 23 }, (_, index) => `רגע-${String(index + 1).padStart(2, "0")}`));
  assert.ok(live.every(({ type, typeHe, walkout, pip }) =>
    type === "Quote" && typeHe === "ציטוט" && walkout?.kind === "quote" && pip && pip !== "#c4a35a"));
  assert.ok(live.every(({ eventOnly, packEligible }) => eventOnly !== true && packEligible !== false));
  const counts = { Common: 0, Uncommon: 0, Rare: 0 };
  for (const candidate of set5.candidates) {
    const card = live.find((item) => item.artKey === candidate.art.artKey);
    assert.ok(card, candidate.art.artKey);
    assert.equal(card.rarity, candidate.rarity);
    counts[candidate.rarity] += 1;
  }
  assert.deepEqual(counts, { Common: 12, Uncommon: 7, Rare: 4 });
  assert.equal(live.find(({ id }) => id === "SET5-22").rarity, "Rare");
  assert.equal(live.find(({ id }) => id === "SET5-20").set, "LIK");
  const netanyahu = expandPublicCatalog(cards, specials, extras).find(({ id }) => id === "SET5-01");
  assert.equal(netanyahu?.listSlot, 1);
  assert.equal(netanyahu?.subtitleHe, "מקום 1");
  assert.equal(extras.set5.candidates.length, 23);
  await Promise.all(live.map(({ artKey }) =>
    readFile(path.resolve(here, "../../docs/design/assets", artKey))));
});

test("Set 6 ships as live Quote cards with Likud codes and 10/5/3 rarities", async () => {
  const [{ set6 }, catalog] = await Promise.all([
    loadCatalogSources(),
    readFile(path.join(publicDir, "catalog.json"), "utf8").then(JSON.parse),
  ]);
  const live = catalog.cards.filter(({ releaseSetId }) => releaseSetId === "set-6");
  assert.equal(live.length, 18);
  assert.equal(set6.candidates.length, 18);
  assert.deepEqual(live.map(({ displayCode }) => displayCode),
    Array.from({ length: 18 }, (_, index) => `ליכוד-${String(index + 1).padStart(2, "0")}`));
  assert.equal(live.at(-1).displayCode, "ליכוד-18");
  const counts = { Common: 0, Uncommon: 0, Rare: 0 };
  for (const card of live) counts[card.rarity] += 1;
  assert.deepEqual(counts, { Common: 10, Uncommon: 5, Rare: 3 });
  const hadar = live.find(({ id }) => id === "SET6-18");
  assert.equal(hadar.titleHe, "הדר מוכתר");
  assert.equal(hadar.rarity, "Uncommon");
  assert.equal(hadar.subtitleHe, "לא ממוקמת");
  assert.equal(live.find(({ id }) => id === "SET6-09").subtitleHe, "לא ממוקמת");
  assert.equal(live.find(({ id }) => id === "SET6-01").subtitleHe, "לא ממוקם");
  assert.equal(hadar.setNameHe, "הליכוד");
  assert.equal(hadar.listSlot, null);
  assert.equal(hadar.walkout.text, "למי תהיה פה דירה בישראל? … היא על שמי, אבל של אבא שלי.");
  assert.equal(live.find(({ id }) => id === "SET6-11").rarity, "Common");
  const rares = live.filter(({ rarity }) => rarity === "Rare").map(({ titleHe }) => titleHe).sort();
  assert.deepEqual(rares, ["ישראל כץ", "מירי רגב", "שלמה קרעי"]);
  await readFile(path.resolve(here, "../../docs/design/assets", hadar.artKey));
});

test("Sets 1 and 2 ship complete art-backed catalogs", async () => {
  const { cards, specials, extras } = await loadCatalogSources();
  const expanded = expandPublicCatalog(cards, specials, extras);
  const leaders = expanded.filter(({ releaseSetId }) => releaseSetId === "party-leaders");
  const numberTwos = expanded.filter(({ releaseSetId }) => releaseSetId === "party-slot-2");
  assert.equal(leaders.length, 14);
  assert.equal(numberTwos.length, 13);
  assert.deepEqual(leaders.map(({ displayCode }) => displayCode),
    Array.from({ length: 14 }, (_, index) => `ראש-${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(numberTwos.map(({ displayCode }) => displayCode),
    Array.from({ length: 13 }, (_, index) => `משנה-${String(index + 1).padStart(2, "0")}`));
  assert.ok([...leaders, ...numberTwos].every(({ artKey }) => artKey));
  await Promise.all([...leaders, ...numberTwos].map(({ artKey }) =>
    readFile(path.resolve(here, "../../docs/design/assets", artKey))));
});

test("party movers keep the current ballot list and a לשעבר receipt", async () => {
  const { cards, specials, extras, studio } = await loadCatalogSources();
  const expanded = expandPublicCatalog(cards, specials, extras);
  const gotliv = expanded.filter((card) => card.titleHe === "טלי גוטליב");
  const benShitrit = expanded.filter((card) => card.titleHe === "רפי בן שטרית");
  const segalovitz = expanded.filter((card) => card.titleHe === "יואב סגלוביץ");
  const ginzburg = expanded.filter((card) => card.titleHe === "איתן גינצבורג" || card.titleHe === "איתן גינזבורג");
  const gafni = expanded.find(({ id }) => id === "REC-GAFNI-LONGEVITY-2026-01");

  assert.equal(studio.members.find(({ id }) => id === "OTZ-M02")?.membershipNote, "ליכוד לשעבר");
  assert.ok(gotliv.length >= 2);
  assert.ok(gotliv.every((card) => card.set === "OTZ" && card.membershipNote === "ליכוד לשעבר"));
  assert.ok(gotliv.some(({ id }) => id === "OTZ-M02-Q01"));
  assert.ok(gotliv.some(({ id }) => id === "SET5-07"));

  assert.ok(benShitrit.every((card) => card.set === "YB" && card.membershipNote === "ליכוד לשעבר"));
  assert.ok(segalovitz.every((card) => card.set === "RAM" && card.membershipNote === "יש עתיד לשעבר"));
  assert.ok(ginzburg.every((card) => card.set === "BYD" && card.membershipNote === "המחנה הממלכתי לשעבר"));

  assert.equal(gafni?.releaseSetId, "records");
  assert.equal(gafni?.idleEligible, false);
  assert.equal(gafni?.packEligible, false);
  assert.ok(!gafni?.membershipNote);
  assert.match(gafni?.subtitleHe || gafni?.subtitle || "", /38/);
});
