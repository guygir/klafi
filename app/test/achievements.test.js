import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "../server/app.js";
import {
  ACHIEVEMENT_TIERS,
  achievementMeasures,
  achievementPages,
  achievementProgress,
  achievementState,
  bestLoginStreak,
  expandAchievementCatalog,
  hasCustomProfile,
  leagueAchievementMeasures,
  normalizeAchievementDefinition,
  pendingAchievementStamps,
  pullableSets,
  stampAchievements,
} from "../server/achievements.js";
import { applyLoginStreak } from "../server/numbered.js";
import { binderBadgeOrder } from "../public/badge-order.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const catalog = JSON.parse(await readFile(path.join(appRoot, "data/achievements.json"), "utf8")).achievements;
const cardData = JSON.parse(await readFile(path.join(appRoot, "data/cards.json"), "utf8"));
const allCards = Array.isArray(cardData) ? cardData : cardData.cards;

function session(overrides = {}) {
  return {
    displayName: "שחקן 1a2b",
    avatarId: "kid-boy",
    inventory: {},
    instances: [],
    eventCounts: {},
    eventClaims: {},
    favorites: [],
    factionId: null,
    tradeCount: 0,
    highestRank: 1,
    idlePullCount: 0,
    loginStreak: 0,
    ...overrides,
  };
}

const CARDS = [
  { id: "c1", set: "A", rarity: "Common", idleEligible: true },
  { id: "r1", set: "A", rarity: "Rare", idleEligible: true },
  { id: "r2", set: "B", rarity: "Rare Holo", idleEligible: true },
];

test("achievements.json: pages 11 / 11 / 8 rows (hard expands to one badge per pullable set)", () => {
  const byTier = Object.fromEntries(ACHIEVEMENT_TIERS.map((tier) => [tier, catalog.filter((item) => item.tier === tier).map(({ id }) => id)]));
  assert.deepEqual(byTier.simple, ["first-rip", "register-five", "source-check", "share-pull", "first-double", "idle-eight", "faction-pick", "own-name", "warehouse-full", "see-nothing", "shearit-haplata"]);
  const shearit = catalog.find(({ id }) => id === "shearit-haplata");
  assert.equal(shearit.target, 5);
  assert.deepEqual(shearit.cardIds, ["SET6-01", "SET6-03", "SET6-09", "SET6-14", "SET6-18"]);
  assert.equal(byTier.simple.length, 11);
  assert.equal(byTier.medium.length, 11);
  assert.equal(byTier.hard.length, 8);
  assert.deepEqual(byTier.medium, ["collector-ten", "three-parties", "twenty-stars", "trade-match", "rank-three", "streak-seven", "league-member", "rare-three", "regevist", "streak-prize-skip", "recycle-card"]);
  assert.deepEqual(byTier.hard, ["set-complete", "commons-complete", "five-leaders", "fifty-stars", "trade-three", "numbered-first", "streak-thirty", "ten-copies"]);
  assert.equal(catalog.find(({ id }) => id === "rare-three").target, 3);
  assert.equal(catalog.find(({ id }) => id === "streak-seven").nameHe, "שבוע רצוף");
  assert.equal(catalog.find(({ id }) => id === "streak-seven").descriptionHe, "בקרו שבעה ימים ברצף.");
  assert.equal(catalog.find(({ id }) => id === "streak-thirty").nameHe, "חודש רצוף");
  assert.equal(catalog.find(({ id }) => id === "streak-thirty").descriptionHe, "בקרו שלושים ימים ברצף.");
  assert.deepEqual(catalog.find(({ id }) => id === "ten-copies"), { id: "ten-copies", nameHe: "עשרה עותקים", descriptionHe: "אספו עשרה עותקים של אותו קלף.", rule: "duplicate", target: 10, tier: "hard" });
  for (const removed of ["favorite-first", "source-three", "event-first", "event-three", "binder-half", "set-chase", "league-top", "first-rare", "share-three", "streak-two"]) {
    assert.ok(!catalog.some(({ id }) => id === removed), `${removed} is not in the catalog`);
  }
  const measures = achievementMeasures(session(), allCards);
  for (const item of catalog) {
    assert.ok(item.rule in measures || ["bestSet", "setComplete", "ownCards"].includes(item.rule), `${item.id}: unknown rule ${item.rule}`);
  }
  assert.equal(catalog.find(({ id }) => id === "numbered-first").hidden, true);
  assert.equal(catalog.find(({ id }) => id === "warehouse-full").hidden, true);
  assert.equal(catalog.find(({ id }) => id === "see-nothing").hidden, true);
  assert.equal(catalog.find(({ id }) => id === "see-nothing").nameHe, "לא רואה כלום");
  assert.equal(achievementMeasures(session({ eventCounts: { binder_one_column: 1 } }), allCards).binderOne, 1);
  assert.equal(achievementProgress(catalog.find(({ id }) => id === "see-nothing"), { binderOne: 1 }).name, "לא רואה כלום");
  assert.equal(catalog.find(({ id }) => id === "streak-prize-skip").hidden, true);
  assert.equal(catalog.find(({ id }) => id === "recycle-card").hidden, true);
  assert.equal(catalog.find(({ id }) => id === "recycle-card").tier, "medium");
  assert.equal(catalog.find(({ id }) => id === "recycle-card").nameHe, "שומר על איכות הסביבה");
  assert.equal(achievementMeasures(session({ eventCounts: { card_recycled: 1 } }), allCards).recycle, 1);
  assert.equal(achievementProgress(catalog.find(({ id }) => id === "recycle-card"), { recycle: 1 }).name, "שומר על איכות הסביבה");
  const secret = achievementProgress(catalog.find(({ id }) => id === "warehouse-full"), measures);
  assert.equal(secret.earned, false);
  assert.equal(secret.name, "?");
  assert.equal(secret.description, "שחקו עוד כדי לגלות...");
  const revealed = achievementProgress(catalog.find(({ id }) => id === "warehouse-full"), { warehouseFull: 1 });
  assert.equal(revealed.name, "עד אפס מקום");
  assert.equal(achievementMeasures(session({ unseenPulls: Array(8).fill("x") }), allCards).warehouseFull, 1);
});

test("set badges: one per pullable release set, named from the release sets, in release order", () => {
  const cards = [
    { id: "a1", releaseSetId: "party-leaders", idleEligible: true },
    { id: "a2", releaseSetId: "party-leaders", idleEligible: true },
    { id: "b1", releaseSetId: "set-5", idleEligible: true },
    { id: "h1", releaseSetId: "decisions", idleEligible: false },
    { id: "e1", releaseSetId: "set-5", idleEligible: true, eventOnly: true },
  ];
  const releaseSets = [{ id: "set-5", nameHe: "רגעים", order: 5 }, { id: "party-leaders", nameHe: "מנהיגי המפלגות", order: 1 }, { id: "decisions", nameHe: "החלטות", order: 3 }];
  assert.deepEqual(pullableSets(cards, releaseSets), [
    { id: "party-leaders", total: 2, nameHe: "מנהיגי המפלגות" },
    { id: "set-5", total: 1, nameHe: "רגעים" },
  ]);
  const expanded = expandAchievementCatalog([{ id: "set-complete", rule: "setComplete", target: 0, tier: "hard" }, { id: "x", rule: "unique", target: 1 }], cards, releaseSets);
  assert.deepEqual(expanded.map(({ id }) => id), ["set-complete:party-leaders", "set-complete:set-5", "x"]);
  assert.equal(expanded[0].target, 2);
  assert.equal(expanded[0].nameHe, "סדרת מנהיגי המפלגות מלאה");
  const half = achievementProgress(expanded[0], achievementMeasures(session({ inventory: { a1: 1, e1: 1 } }), cards));
  assert.deepEqual([half.earned, half.progress, half.target, half.setId], [false, 1, 2, "party-leaders"]);
  const full = achievementProgress(expanded[0], achievementMeasures(session({ inventory: { a1: 1, a2: 4 } }), cards));
  assert.equal(full.earned, true);
});

test("new measures read existing session data", () => {
  assert.equal(achievementMeasures(session({ visitStreak: 3, bestVisitStreak: 9, loginStreak: 40, bestLoginStreak: 40 }), CARDS).streak, 9);
  assert.equal(achievementMeasures(session({ visitStreak: 4 }), CARDS).streak, 4, "old sessions without a best use the current visit run");
  assert.equal(achievementMeasures(session({ loginStreak: 12, bestLoginStreak: 20 }), CARDS).streak, 0, "the pack-open streak is not the badge");
  assert.equal(achievementMeasures(session({ factionId: "A" }), CARDS).faction, 1);
  assert.equal(achievementMeasures(session(), CARDS).faction, 0);
  assert.equal(hasCustomProfile(session()), false, "default «שחקן xxxx» + kid-boy is not custom");
  assert.equal(hasCustomProfile(session({ displayName: "גיא" })), true);
  assert.equal(hasCustomProfile(session({ avatarId: "grandma" })), true);
  assert.equal(achievementMeasures(session({ inventory: { c1: 1, r1: 1, r2: 2 } }), CARDS).rare, 2);
  assert.equal(achievementMeasures(session({ instances: [{ numberedIndex: 3 }, { numberedIndex: null }, {}] }), CARDS).numbered, 1);
  assert.equal(achievementMeasures(session(), CARDS).league, 0, "the league badge needs the league room's data");
  assert.equal(achievementMeasures(session(), CARDS, { league: 1 }).league, 1);
  assert.equal(achievementMeasures(session({ inventory: { c1: 10 } }), CARDS).duplicate, 10);
});

test("league measure: in a league with at least one other player", () => {
  const room = (count) => ({ memberCount: count, members: Array.from({ length: count }, (_, index) => ({ rank: index + 1, current: index === 0 })) });
  assert.deepEqual(leagueAchievementMeasures(room(1)), { league: 0 });
  assert.deepEqual(leagueAchievementMeasures(room(2)), { league: 1 });
  assert.deepEqual(leagueAchievementMeasures(null), { league: 0 });
});

test("pack-open streak keeps its best run through a reset", () => {
  const player = session();
  const day = (iso) => Date.parse(`${iso}T09:00:00Z`);
  applyLoginStreak(player, day("2026-09-01"));
  applyLoginStreak(player, day("2026-09-02"));
  applyLoginStreak(player, day("2026-09-03"));
  assert.equal(player.loginStreak, 3);
  applyLoginStreak(player, day("2026-09-07"));
  assert.equal(player.loginStreak, 1);
  assert.equal(player.bestLoginStreak, 3);
  assert.equal(bestLoginStreak(player), 3);
});

test("earned stays earned: a stamp wins over a measure that dropped", () => {
  const definition = { id: "faction-pick", rule: "faction", target: 1, tier: "simple" };
  const player = session({ factionId: "A" });
  assert.deepEqual(stampAchievements(player, CARDS, [definition], Date.parse("2026-09-26T08:00:00Z")), ["faction-pick"]);
  assert.equal(player.achievementsEarned["faction-pick"], "2026-09-26T08:00:00.000Z");
  assert.deepEqual(stampAchievements(player, CARDS, [definition], Date.now()), [], "stamps once");
  player.factionId = null;
  const shown = achievementProgress(definition, achievementMeasures(player, CARDS), player.achievementsEarned["faction-pick"]);
  assert.equal(shown.earned, true);
  assert.equal(shown.progress, shown.target);
  assert.equal(shown.earnedAt, "2026-09-26T08:00:00.000Z");
  const league = { id: "league-member", rule: "league", target: 1, tier: "medium" };
  assert.deepEqual(pendingAchievementStamps(player, CARDS, [league]), []);
  assert.deepEqual(pendingAchievementStamps(player, CARDS, [league], { league: 1 }), ["league-member"]);
});

test("pages: every page is open; counts per tier", () => {
  const list = [{ tier: "simple", earned: true }, { tier: "simple", earned: false }, { tier: "hard", earned: false }];
  assert.deepEqual(achievementPages(list), [{ tier: "simple", total: 2, earned: 1 }, { tier: "hard", total: 1, earned: 0 }]);
  const state = achievementState(session({ idlePullCount: 1 }), allCards, catalog);
  assert.equal(state.achievements.find(({ id }) => id === "first-rip").earned, true);
  assert.ok(state.achievements.every((badge) => !("locked" in badge)), "no page locking");
});

test("easy tab fraction is unlocked badges on that row over easy badges that exist", async () => {
  const javascript = await readFile(path.join(appRoot, "public/app.js"), "utf8");
  const helpers = javascript.slice(javascript.indexOf("const ACHIEVEMENT_TIER_ORDER"), javascript.indexOf("function hebrewBadge("));
  const counter = javascript.slice(javascript.indexOf("function achievementPageList("), javascript.indexOf("function visibleEarnedBadges("));
  assert.doesNotMatch(counter, /achievementPages/, "the fraction counts the row, not the stored page summary");
  assert.match(javascript, /<small>\$\{item\.earned\}\/\$\{item\.total\}<\/small>/);
  const achievementPageList = new Function(`${helpers}\n${counter}\nreturn achievementPageList;`)();
  const row = [
    ...Array.from({ length: 8 }, (_, index) => ({ id: `easy-${index}`, tier: "simple", earned: true })),
    { id: "easy-hidden", tier: "simple", earned: false, hidden: true },
    { id: "medium-one", tier: "medium", earned: true },
  ];
  const storedSummary = { tier: "simple", total: 9, earned: 6 };
  const easy = achievementPageList(row).find(({ tier }) => tier === "simple");
  assert.deepEqual(easy, { tier: "simple", total: 9, earned: 8 });
  assert.notEqual(easy.earned, storedSummary.earned);
  const measures = javascript.slice(javascript.indexOf("function localAchievementMeasures"), javascript.indexOf("function localAchievementList"));
  assert.doesNotMatch(measures, /activity/);
  assert.match(measures, /sources: Number\(model\.serverState\?\.eventCounts\?\.source_opened\) \|\| 0/);
  assert.match(measures, /shares: Number\(model\.serverState\?\.eventCounts\?\.share_created\) \|\| 0/);
});

test("tier: missing or unknown is simple; Studio rows keep their tier", () => {
  assert.equal(normalizeAchievementDefinition({ id: "x", rule: "unique", target: 3 }).tier, "simple");
  assert.equal(normalizeAchievementDefinition({ id: "x", rule: "unique", tier: "legendary" }).tier, "simple");
  assert.equal(normalizeAchievementDefinition({ id: "x", rule: "unique", tier: "hard" }).tier, "hard");
});

async function start(dataDir, achievementsPath, clock) {
  const handler = await createKalpiApp({
    dataDir,
    publicDir: path.join(appRoot, "public"),
    cardsPath: path.join(appRoot, "data/cards.json"),
    advocacyPath: path.join(appRoot, "data/advocacy.json"),
    sourcesPath: path.join(appRoot, "data/sources.json"),
    sequencesPath: path.join(appRoot, "data/editorial-sequences.json"),
    samplesPath: path.join(appRoot, "data/editorial-samples.json"),
    demoPackPath: path.join(appRoot, "data/demo-pack.json"),
    studioContentPath: path.join(appRoot, "data/studio-content.json"),
    specialsPath: path.join(appRoot, "data/specials-content.json"),
    presentationContentPath: path.join(appRoot, "data/presentation-content.json"),
    eventsPath: path.join(appRoot, "data/events.json"),
    achievementsPath,
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled: true,
    now: () => clock.value,
    rng: () => 0,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function api(base, route, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

async function boot(t) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-achievements-"));
  const achievementsPath = path.join(dataDir, "achievements.json");
  await copyFile(path.join(appRoot, "data/achievements.json"), achievementsPath);
  const clock = { value: Date.parse("2026-09-20T09:00:00.000Z") };
  const running = await start(dataDir, achievementsPath, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const player = async () => (await api(running.base, "/api/session", { method: "POST" })).body.token;
  return { running, achievementsPath, player };
}

test("server: source and share badges count this session, not another player's events", async (t) => {
  const { running, player } = await boot(t);
  const [mine, other] = [await player(), await player()];
  const cardId = allCards.find((card) => card.idleEligible && !card.eventOnly).id;
  await api(running.base, "/api/debug/unlock-card", { token: mine, method: "POST", body: { cardId } });
  const theirs = await api(running.base, "/api/events", { token: other, method: "POST", body: { type: "source_opened", cardId } });
  assert.equal(theirs.status, 201);
  const shared = await api(running.base, "/api/events", { token: mine, method: "POST", body: { type: "share_created", cardId } });
  assert.equal(shared.status, 201);
  const state = await api(running.base, "/api/state", { token: mine });
  assert.deepEqual(state.body.eventCounts, { source_opened: 0, share_created: 1 });
  assert.equal(state.body.achievements.find(({ id }) => id === "source-check").earned, false);
  assert.equal(state.body.achievements.find(({ id }) => id === "share-pull").earned, true);
});

test("server: state carries tiers + pages; a write stamps earnedAt and it survives the measure dropping", async (t) => {
  const { running, player } = await boot(t);
  const token = await player();
  const fresh = await api(running.base, "/api/state", { token });
  assert.deepEqual(fresh.body.achievementPages, [
    { tier: "simple", total: 11, earned: 0 },
    { tier: "medium", total: 11, earned: 0 },
    { tier: "hard", total: 11, earned: 0 },
  ]);
  const setBadges = fresh.body.achievements.filter(({ setId }) => setId);
  assert.deepEqual(setBadges.map(({ id }) => id), ["set-complete:party-leaders", "set-complete:party-slot-2", "set-complete:set-5", "set-complete:set-6"], "sets 1, 2, 5 and 6 are the pullable ones");
  assert.ok(setBadges.every(({ tier, target }) => tier === "hard" && target > 1));
  const revision = fresh.body.revision;
  const again = await api(running.base, "/api/state", { token });
  assert.equal(again.body.revision, revision, "reads never write");

  const party = allCards.find(({ set }) => set && set !== "SYS").set;
  const picked = await api(running.base, "/api/faction", { token, method: "POST", body: { factionId: party } });
  const badge = picked.body.achievements.find(({ id }) => id === "faction-pick");
  assert.equal(badge.earned, true);
  assert.ok(badge.earnedAt, "the faction write stamped the badge");
  const cleared = await api(running.base, "/api/faction", { token, method: "POST", body: { factionId: null } });
  assert.equal(cleared.body.factionId, null);
  const kept = cleared.body.achievements.find(({ id }) => id === "faction-pick");
  assert.equal(kept.earned, true, "clearing the party does not un-earn it");
  assert.equal(kept.earnedAt, badge.earnedAt);
});

test("server: the league room stamps «חבר בליגה»; leaving the league keeps it", async (t) => {
  const { running, player } = await boot(t);
  const [host, friend] = [await player(), await player()];
  const created = await api(running.base, "/api/leagues", { token: host, method: "POST", body: { name: "בדיקה" } });
  assert.equal(created.body.league.earnedAchievements, undefined, "alone in a league is not yet a league");
  await api(running.base, "/api/leagues/join", { token: friend, method: "POST", body: { code: created.body.league.code } });
  const room = await api(running.base, "/api/leagues", { token: host });
  assert.deepEqual(room.body.leagues[0].earnedAchievements, ["league-member"]);
  const again = await api(running.base, "/api/leagues", { token: host });
  assert.equal(again.body.leagues[0].earnedAchievements, undefined, "stamped once");
  await api(running.base, "/api/leagues/leave", { token: host, method: "POST", body: { code: created.body.league.code } });
  const state = await api(running.base, "/api/state", { token: host });
  const badge = state.body.achievements.find(({ id }) => id === "league-member");
  assert.equal(badge.earned, true, "earned stays earned after leaving");
  assert.ok(badge.earnedAt);
});

test("server: completing a pullable set earns its badge", async (t) => {
  const { running, player } = await boot(t);
  const token = await player();
  const state = await api(running.base, "/api/state", { token });
  const target = state.body.achievements.find(({ id }) => id === "set-complete:party-leaders").target;
  const game = await api(running.base, "/api/game-config", { token });
  assert.ok(game.body.achievements.some(({ id, rule }) => id === "set-complete" && rule === "setComplete"), "Studio edits the raw row");
  const leaders = allCards.filter((card) => card.releaseSetId === "party-leaders" && !card.eventOnly).map(({ id }) => id);
  for (const cardId of leaders) await api(running.base, "/api/debug/unlock-card", { token, method: "POST", body: { cardId } });
  const after = await api(running.base, "/api/state", { token });
  const badge = after.body.achievements.find(({ id }) => id === "set-complete:party-leaders");
  assert.equal(badge.progress, target);
  assert.equal(badge.earned, true);
  assert.ok(badge.earnedAt, "stamped by the unlock write");
});

test("server: Studio save keeps each badge's tier (missing = simple)", async (t) => {
  const { running, achievementsPath, player } = await boot(t);
  const token = await player();
  const edited = catalog.map((item, index) => (index === 0 ? { ...item, tier: undefined } : item));
  const saved = await api(running.base, "/api/studio/achievements", { token, method: "POST", body: { achievements: edited } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.achievements[0].tier, "simple");
  assert.equal(saved.body.achievements.find(({ id }) => id === "ten-copies").tier, "hard");
  const onDisk = JSON.parse(await readFile(achievementsPath, "utf8")).achievements;
  assert.deepEqual(onDisk.map(({ tier }) => tier), saved.body.achievements.map(({ tier }) => tier));
  assert.equal(onDisk.filter(({ tier }) => tier === "medium").length, 11);
});

test("client: three open tabs, tier art, no unlock toast, copy + icon for every badge", async () => {
  const [html, javascript, css, tips] = await Promise.all(
    ["index.html", "app.js", "styles.css", "tips.js"].map((name) => readFile(path.join(appRoot, "public", name), "utf8")),
  );
  assert.match(html, /<div id="achievement-tiers" class="achievement-tiers" role="tablist" aria-label="עמודי ההישגים"><\/div>/);
  assert.doesNotMatch(html, /id="achievement-pager"|id="achievement-lock-note"/, "tabs replace the pager; no page locking");
  assert.match(javascript, /const ACHIEVEMENT_TIER_LABELS = Object\.freeze\(\{ simple: "הקלים", medium: "הבינוניים", hard: "הקשים" \}\)/);
  assert.match(javascript, /data-achievement-tier="\$\{item\.tier\}" aria-selected="\$\{active\}"/);
  assert.match(javascript, /badgeArtwork\(badge\.id, \{ tier, earned: badge\.earned && !secret, sheen: tier === "hard" && badge\.earned && takeBadgeSheen\(badge\.id\), secret \}\)/);
  assert.match(javascript, /Number\(Boolean\(left\.hidden\)\) - Number\(Boolean\(right\.hidden\)\)/);
  assert.match(javascript, /שחקו עוד כדי לגלות\.\.\./);
  assert.match(javascript, /<svg class="badge-artwork badge-tier-\$\{style\}"/);
  assert.match(javascript, /class="badge-seal-dot"/);
  assert.match(javascript, /style="fill:url\(#\$\{key\}-foil\)"/);
  assert.match(javascript, /function badgeTierStarCount\(tier\) \{\s*return tier === "hard" \? 3 : tier === "medium" \? 2 : 1;/);
  assert.match(javascript, /class="badge-tier-stars" data-tier-stars="\$\{count\}"/);
  assert.match(javascript, /\$\{badgeTierStarRow\(tier, \{ style, foilKey: key \}\)\}/);
  assert.match(javascript, /class="badge-tier-star-back"/);
  assert.match(css, /\.badge-artwork\.badge-tier-simple \.badge-tier-star \{ fill: var\(--ink\)/);
  assert.match(css, /\.badge-artwork\.badge-tier-medium \.badge-tier-star-back \{ fill: var\(--ink\)/);
  assert.match(css, /\.badge-artwork\.badge-tier-medium \.badge-tier-star \{ fill: var\(--foil\)/);
  assert.match(css, /\.badge-artwork\.badge-tier-hard \.badge-tier-star \{ stroke: #6a5424/);
  assert.match(css, /\.badge-artwork\.badge-tier-unearned \.badge-tier-star \{ fill: none; stroke: #8f918b/);
  assert.doesNotMatch(javascript, /announceNewAchievements|הישג חדש:|הישגים חדשים/, "no achievement-unlock toast");
  assert.doesNotMatch(javascript, /tier-lock|page-locked|badge-tier-locked/);
  assert.match(javascript, /return \{ name: short \? `סדרת \$\{short\} מלאה` : badge\.name, description: badge\.description \};/);
  assert.match(javascript, /String\(id\)\.startsWith\("set-complete:"\)/, "set badges share one icon");
  assert.match(javascript, /tier: row\.querySelector\('\[data-ach-field="tier"\]'\)\?\.value \|\| "simple"/, "Studio save sends the tier");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.badge-artwork \.badge-sheen \{ animation: none; opacity: 0; \}/);
  assert.match(css, /\.badge-artwork \.badge-sheen \{[^}]*animation: badge-sheen 1\.3s ease-out 0\.35s 1 both/, "the sheen runs once");
  assert.match(css, /\.badge-tier-unearned \.badge-field \{ fill: none; stroke: #8f918b/);
  assert.match(tips, /ring: "#achievement-tiers"/);
  assert.match(tips, /ring: "#achievement-grid, #achievements-empty"/);
  assert.match(tips, /שלושה עמודים של הישגים אפשריים: הקלים, הבינוניים והקשים/);
  assert.match(javascript, /"streak-seven": \["שבוע רצוף", "בקרו שבעה ימים ברצף\."\]/);
  assert.match(javascript, /"streak-thirty": \["חודש רצוף", "בקרו שלושים ימים ברצף\."\]/);
  assert.doesNotMatch(javascript, /פתחו קלפים שבעה/);
  assert.doesNotMatch(javascript, /פתחו קלפים שלושים/);
  assert.match(css, /\.achievement-tiers button \{\s*display: inline-flex;\s*flex-flow: row nowrap;\s*align-items: center;/);
  assert.match(css, /\.achievement-tiers button small \{\s*font: 600 12px\/1 ui-monospace/);
  const art = javascript.slice(javascript.indexOf("function badgeArtwork("), javascript.indexOf("const ACHIEVEMENT_RULES"));
  const copy = javascript.slice(javascript.indexOf("const BADGE_COPY = {"), javascript.indexOf("function hebrewBadge("));
  for (const { id, rule } of catalog) {
    assert.ok(javascript.includes(`["${rule}", "`), `${rule} is selectable in Studio`);
    if (rule === "setComplete") continue;
    assert.ok(art.includes(`"${id}": '`), `${id} has an icon`);
    assert.ok(copy.includes(`"${id}": ["`), `${id} has Hebrew copy`);
  }
});

test("binder strip: earned only, hard > medium > simple, newest first within a tier", () => {
  const badges = [
    { id: "s-old", tier: "simple", earned: true, earnedAt: "2026-09-01T10:00:00Z" },
    { id: "m-none", tier: "medium", earned: false },
    { id: "h-old", tier: "hard", earned: true, earnedAt: "2026-09-02T10:00:00Z" },
    { id: "s-new", tier: "simple", earned: true, earnedAt: "2026-09-20T10:00:00Z" },
    { id: "m-new", tier: "medium", earned: true, earnedAt: "2026-09-25T10:00:00Z" },
    { id: "h-new", tier: "hard", earned: true, earnedAt: "2026-09-24T10:00:00Z" },
    { id: "s-live", tier: "simple", earned: true, earnedAt: null },
    { id: "untiered", earned: true, earnedAt: "2026-09-26T10:00:00Z" },
  ];
  assert.deepEqual(binderBadgeOrder(badges).map(({ id }) => id), ["h-new", "h-old", "m-new", "untiered", "s-new", "s-old", "s-live"]);
  assert.deepEqual(binderBadgeOrder([]), []);
});

test("רגביסט unlocks only when all three Miri Regev set-6 cards are owned", () => {
  const badge = catalog.find(({ id }) => id === "regevist");
  assert.equal(badge.nameHe, "רגביסט");
  assert.equal(badge.tier, "medium");
  assert.equal(badge.rule, "ownCards");
  assert.deepEqual(badge.cardIds, ["SET6-02", "SET6-05", "SET6-06"]);
  const cards = badge.cardIds.map((id) => ({ id, rarity: "Common", idleEligible: true, releaseSetId: "set-6" }));
  const two = achievementProgress(badge, achievementMeasures(session({ inventory: { "SET6-02": 1, "SET6-05": 1 } }), cards));
  assert.equal(two.earned, false);
  assert.equal(two.progress, 2);
  const three = achievementProgress(badge, achievementMeasures(session({ inventory: { "SET6-02": 1, "SET6-05": 1, "SET6-06": 1 } }), cards));
  assert.equal(three.earned, true);
  assert.equal(three.name, "רגביסט");
  assert.equal(three.progress, 3);
});
