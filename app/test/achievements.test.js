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

test("achievements.json: pages 8 / 8 / 8 rows (hard expands to one badge per pullable set)", () => {
  const byTier = Object.fromEntries(ACHIEVEMENT_TIERS.map((tier) => [tier, catalog.filter((item) => item.tier === tier).map(({ id }) => id)]));
  assert.deepEqual(byTier.simple, ["first-rip", "register-five", "source-check", "share-pull", "first-double", "idle-eight", "faction-pick", "own-name"]);
  assert.deepEqual(byTier.medium, ["collector-ten", "three-parties", "twenty-stars", "trade-match", "rank-three", "streak-seven", "league-member", "rare-three"]);
  assert.deepEqual(byTier.hard, ["set-complete", "commons-complete", "five-leaders", "fifty-stars", "trade-three", "numbered-first", "streak-thirty", "ten-copies"]);
  assert.equal(catalog.find(({ id }) => id === "rare-three").target, 3);
  assert.deepEqual(catalog.find(({ id }) => id === "ten-copies"), { id: "ten-copies", nameHe: "עשרה עותקים", descriptionHe: "אספו עשרה עותקים של אותו קלף.", rule: "duplicate", target: 10, tier: "hard" });
  for (const removed of ["favorite-first", "source-three", "event-first", "event-three", "binder-half", "set-chase", "league-top", "first-rare", "share-three", "streak-two"]) {
    assert.ok(!catalog.some(({ id }) => id === removed), `${removed} is not in the catalog`);
  }
  const measures = achievementMeasures(session(), allCards);
  for (const item of catalog) {
    assert.ok(item.rule in measures || ["bestSet", "setComplete"].includes(item.rule), `${item.id}: unknown rule ${item.rule}`);
  }
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
  assert.equal(achievementMeasures(session({ loginStreak: 3, bestLoginStreak: 9 }), CARDS).streak, 9);
  assert.equal(achievementMeasures(session({ loginStreak: 4 }), CARDS).streak, 4, "old sessions without a best use the current run");
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

test("server: state carries tiers + pages; a write stamps earnedAt and it survives the measure dropping", async (t) => {
  const { running, player } = await boot(t);
  const token = await player();
  const fresh = await api(running.base, "/api/state", { token });
  assert.deepEqual(fresh.body.achievementPages, [
    { tier: "simple", total: 8, earned: 0 },
    { tier: "medium", total: 8, earned: 0 },
    { tier: "hard", total: 10, earned: 0 },
  ]);
  const setBadges = fresh.body.achievements.filter(({ setId }) => setId);
  assert.deepEqual(setBadges.map(({ id }) => id), ["set-complete:party-leaders", "set-complete:party-slot-2", "set-complete:set-5"], "sets 1, 2 and 5 are the pullable ones");
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
  assert.equal(onDisk.filter(({ tier }) => tier === "medium").length, 8);
});

test("client: three open tabs, tier art, no unlock toast, copy + icon for every badge", async () => {
  const [html, javascript, css, tips] = await Promise.all(
    ["index.html", "app.js", "styles.css", "tips.js"].map((name) => readFile(path.join(appRoot, "public", name), "utf8")),
  );
  assert.match(html, /<div id="achievement-tiers" class="achievement-tiers" role="tablist" aria-label="עמודי ההישגים"><\/div>/);
  assert.doesNotMatch(html, /id="achievement-pager"|id="achievement-lock-note"/, "tabs replace the pager; no page locking");
  assert.match(javascript, /const ACHIEVEMENT_TIER_LABELS = Object\.freeze\(\{ simple: "הקלים", medium: "הבינוניים", hard: "הקשים" \}\)/);
  assert.match(javascript, /data-achievement-tier="\$\{item\.tier\}" aria-selected="\$\{active\}"/);
  assert.match(javascript, /badgeArtwork\(badge\.id, \{ tier, earned: badge\.earned, sheen: tier === "hard" && badge\.earned && takeBadgeSheen\(badge\.id\) \}\)/);
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
  assert.match(tips, /ring: "#achievement-tiers, #achievement-grid \.achievement-badge, #achievements-empty"/);
  assert.match(tips, /בשלושה עמודים: הקלים, הבינוניים והקשים\./);
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
