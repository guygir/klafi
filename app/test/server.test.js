import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp, DAY_MS, IDLE_BACKLOG_CAP, IDLE_INTERVAL_MS, RANK_TITLES, publicPartyRegister } from "../server/app.js";
import { createRuntimeHandler } from "../server/runtime.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

async function start(dataDir, clock, {
  debugEnabled = true,
  quizEnabled = false,
  databaseUrl = null,
  studioSecret = null,
  studioContentPath = path.join(appRoot, "data/studio-content.json"),
  cardsPath = path.join(appRoot, "data/cards.json"),
  specialsPath = path.join(appRoot, "data/specials-content.json"),
  presentationContentPath = path.join(appRoot, "data/presentation-content.json"),
} = {}) {
  const handler = await createKalpiApp({
    dataDir,
    publicDir: path.join(appRoot, "public"),
    cardsPath,
    advocacyPath: path.join(appRoot, "data/advocacy.json"),
    sourcesPath: path.join(appRoot, "data/sources.json"),
    sequencesPath: path.join(appRoot, "data/editorial-sequences.json"),
    samplesPath: path.join(appRoot, "data/editorial-samples.json"),
    demoPackPath: path.join(appRoot, "data/demo-pack.json"),
    studioContentPath,
    specialsPath,
    presentationContentPath,
    eventsPath: path.join(appRoot, "data/events.json"),
    achievementsPath: path.join(appRoot, "data/achievements.json"),
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled,
    quizEnabled,
    databaseUrl,
    studioSecret,
    now: () => clock.value,
    rng: () => 0,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    server,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function api(base, route, { token, method = "GET", body, studio, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(studio ? { "x-kalpi-studio": studio } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test("runtime factory builds the same Node handler Vercel uses", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const handler = await createRuntimeHandler({ loadDotEnv: false });
  process.env.NODE_ENV = previous;
  assert.equal(typeof handler, "function");
});

test("legitimate players are not blocked by a shared application rate bucket", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-unthrottled-test-"));
  const clock = { value: Date.parse("2026-09-17T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const sessions = await Promise.all(
    Array.from({ length: 25 }, () => api(running.base, "/api/session", { method: "POST" })),
  );
  assert.ok(sessions.every(({ status, body }) => status === 201 && body.token));
});

test("public party register keeps Hebrew names without opening Studio", () => {
  const fromStudio = publicPartyRegister({
    parties: [{
      id: "RZ",
      displayNameHe: "הציונות הדתית וזהות",
      displayNameEn: "RZ",
      requestedLetters: ["ט"],
      finalLetters: null,
      letterStatus: "protected",
      filingStatus: "submitted-pending-cec-review",
      asOfDate: "2026-09-09",
      pip: "#6B4A8B",
    }],
  });
  assert.equal(fromStudio[0].displayNameHe, "הציונות הדתית וזהות");
  assert.equal(fromStudio[0].filingStatus, "submitted-pending-cec-review");
  assert.equal(fromStudio[0].letterStatus, "protected");
  const fromCatalog = publicPartyRegister(null, [
    { set: "SYS", setNameHe: "יסודות" },
    { set: "RZ", setNameHe: "הציונות הדתית וזהות", setName: "Religious Zionism–Zehut", letters: "ט", pip: "#6B4A8B" },
  ]);
  assert.deepEqual(fromCatalog, [{
    id: "RZ",
    displayNameHe: "הציונות הדתית וזהות",
    displayNameEn: "Religious Zionism–Zehut",
    requestedLetters: ["ט"],
    pip: "#6B4A8B",
  }]);
});

test("idle settlement caps unseen cards and acknowledges reveals safely", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-idle-test-"));
  const clock = { value: Date.parse("2026-09-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const unauthorized = await api(running.base, "/api/idle/settle", { method: "POST" });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.error, "INVALID_SESSION");

  const created = await api(running.base, "/api/session", { method: "POST" });
  const token = created.body.token;
  const first = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  assert.equal(first.status, 200);
  assert.equal(first.body.newlySettledCount, 1);
  assert.equal(first.body.cards.length, 1);
  assert.equal(first.body.state.unseenCount, 1);
  assert.equal(first.body.state.idleCapacity, IDLE_BACKLOG_CAP);
  assert.equal(first.body.state.preparedPulls.length, IDLE_BACKLOG_CAP - 1);
  assert.equal(
    Date.parse(first.body.state.preparedPulls[0].availableAt),
    clock.value + IDLE_INTERVAL_MS,
  );
  assert.equal(first.body.state.instances, undefined);
  assert.equal(first.body.state.achievements, undefined);

  const replay = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  assert.equal(replay.body.newlySettledCount, 0);
  assert.equal(replay.body.cards[0].instanceId, first.body.cards[0].instanceId);
  assert.deepEqual(replay.body.state.preparedPulls, first.body.state.preparedPulls);

  clock.value += 30 * 60 * 60 * 1000;
  const capped = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  assert.equal(capped.body.cards.length, IDLE_BACKLOG_CAP);
  assert.equal(capped.body.newlySettledCount, IDLE_BACKLOG_CAP - 1);
  assert.equal(capped.body.state.preparedPulls.length, 0);
  assert.ok(Date.parse(capped.body.state.nextIdleAt) > clock.value);

  const seen = await api(running.base, "/api/idle/seen", {
    token,
    method: "POST",
    body: { instanceIds: capped.body.cards.map(({ instanceId }) => instanceId) },
  });
  assert.equal(seen.body.unseenCount, 0);

  const pendingRanks = [...seen.body.progression.pendingRewards];
  const rewardInstances = [];
  for (const rank of pendingRanks) {
    const headers = { "x-idempotency-key": `level-reward-${rank}` };
    const reward = await api(running.base, "/api/rewards/level", { token, method: "POST", headers });
    assert.equal(reward.status, 201);
    assert.equal(reward.body.rank, rank);
    const replay = await api(running.base, "/api/rewards/level", { token, method: "POST", headers });
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.body, reward.body);
    rewardInstances.push(...reward.body.cards);
  }
  const duplicateReward = await api(running.base, "/api/rewards/level", { token, method: "POST" });
  assert.equal(duplicateReward.status, 409);
  await api(running.base, "/api/idle/seen", {
    token,
    method: "POST",
    body: { instanceIds: rewardInstances.map(({ instanceId }) => instanceId) },
  });

  clock.value += IDLE_INTERVAL_MS;
  const next = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  assert.equal(next.body.newlySettledCount, 1);
  assert.equal(next.body.cards.length, 1);
});

test("prepared idle pulls ignore client card choices", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-prepared-authority-test-"));
  const clock = { value: Date.parse("2026-09-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const created = await api(running.base, "/api/session", { method: "POST" });
  const token = created.body.token;
  const initial = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  const scheduled = initial.body.state.preparedPulls[0];
  clock.value = Date.parse(scheduled.availableAt);

  const settled = await api(running.base, "/api/idle/settle", {
    token,
    method: "POST",
    body: { cardId: "SYS-C-01", instanceId: "client-chosen-instance" },
  });

  assert.equal(settled.body.newlySettledCount, 1);
  assert.equal(settled.body.cards.at(-1).instanceId, scheduled.instanceId);
  assert.equal(settled.body.cards.at(-1).cardId, scheduled.cardId);
  assert.notEqual(settled.body.cards.at(-1).instanceId, "client-chosen-instance");
});

test("correction reports persist once and remain reviewable", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-report-test-"));
  const clock = { value: Date.parse("2026-09-17T12:00:00.000Z") };
  const running = await start(dataDir, clock, { debugEnabled: false, studioSecret: "review-secret" });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const created = await api(running.base, "/api/session", { method: "POST" });
  const token = created.body.token;
  const catalog = await api(running.base, "/api/catalog");
  const report = {
    reportId: "report-retry-001",
    cardId: catalog.body.cards[0].id,
    category: "source",
    details: "הקישור למקור אינו נפתח.",
    pagePath: "/?view=binder",
  };
  const first = await api(running.base, "/api/reports", { token, method: "POST", body: report });
  const replay = await api(running.base, "/api/reports", { token, method: "POST", body: report });
  assert.equal(first.status, 202);
  assert.equal(first.body.replayed, false);
  assert.equal(replay.body.replayed, true);

  const hidden = await api(running.base, "/api/studio/reports");
  assert.equal(hidden.status, 404);
  const queue = await api(running.base, "/api/studio/reports", { studio: "review-secret" });
  assert.equal(queue.status, 200);
  assert.equal(queue.body.reports.length, 1);
  assert.equal(queue.body.reports[0].status, "open");

  const resolved = await api(running.base, `/api/studio/reports/${report.reportId}`, {
    studio: "review-secret",
    method: "POST",
    body: { status: "resolved", reviewerNote: "המקור תוקן ונבדק." },
  });
  assert.equal(resolved.status, 200);
  const reviewed = await api(running.base, "/api/studio/reports", { studio: "review-secret" });
  assert.equal(reviewed.body.reports[0].status, "resolved");
});

test("legacy sessions migrate into the capped idle queue without losing inventory", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-idle-migration-"));
  const clock = { value: Date.parse("2026-09-10T18:00:00.000Z") };
  const token = "legacy-session-token";
  await writeFile(path.join(dataDir, "state.json"), JSON.stringify({
    version: 4,
    sessions: {
      [token]: {
        displayName: "שחקן ותיק",
        createdAt: "2026-09-08T12:00:00.000Z",
        nextDailyAt: null,
        dryPacks: 0,
        packCount: 0,
        inventory: { "LIK-M01-Q01": 1 },
        instances: [],
        packs: [],
        eventCounts: {},
        factionId: null,
        tradeCount: 0,
        eventClaims: {},
        favorites: [],
        highestRank: 8,
      },
    },
    analytics: { events: [] },
    trades: [],
    factions: {},
  }));
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const settled = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  assert.equal(settled.status, 200);
  assert.equal(settled.body.cards.length, IDLE_BACKLOG_CAP);
  assert.ok(settled.body.state.inventory["LIK-M01-Q01"] >= 1);
  assert.equal(settled.body.state.progression.level, 8, "catalog changes never demote an earned rank");
  assert.ok(Date.parse(settled.body.state.nextIdleAt) > clock.value);
});

test("players can see and accept open trades from other collectors", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-trade-test-"));
  const clock = { value: Date.parse("2026-09-10T18:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const catalog = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly);
  const [offered, wanted] = catalog.slice(0, 2);
  const ownerToken = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepterToken = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await api(running.base, "/api/profile", {
    token: ownerToken,
    method: "POST",
    body: { displayName: "מציע בדיקה" },
  });
  await api(running.base, "/api/debug/unlock-card", {
    token: ownerToken,
    method: "POST",
    body: { cardId: offered.id },
  });
  await api(running.base, "/api/debug/unlock-card", {
    token: accepterToken,
    method: "POST",
    body: { cardId: wanted.id },
  });
  const created = await api(running.base, "/api/trades", {
    token: ownerToken,
    method: "POST",
    body: { offeredCardId: offered.id, wantedCardId: wanted.id },
  });
  assert.equal(Date.parse(created.body.trade.expiresAt) - Date.parse(created.body.trade.createdAt), 24 * 60 * 60 * 1000);
  const overReserved = await api(running.base, "/api/trades", {
    token: ownerToken,
    method: "POST",
    body: { offeredCardId: offered.id, wantedCardId: wanted.id },
  });
  assert.equal(overReserved.status, 400);
  const visible = await api(running.base, "/api/trades", { token: accepterToken });
  const offer = visible.body.trades.find(({ tradeId }) => tradeId === created.body.trade.tradeId);
  assert.equal(offer.ownerLabel, "מציע בדיקה");
  assert.equal(offer.ownedByCurrent, false);
  assert.equal(offer.canAccept, true);
  const accepted = await api(running.base, `/api/trades/${offer.tradeId}/accept`, {
    token: accepterToken,
    method: "POST",
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.state.inventory[offered.id], 1);
  const ownerState = await api(running.base, "/api/state", { token: ownerToken });
  assert.equal(ownerState.body.inventory[wanted.id], 1);
  assert.equal(ownerState.body.inventory[offered.id], undefined);
});

test("only one concurrent accepter can complete a trade", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-trade-race-test-"));
  const clock = { value: Date.parse("2026-09-10T18:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const [offered, wanted] = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly).slice(0, 2);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepterA = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepterB = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await api(running.base, "/api/debug/unlock-card", { token: owner, method: "POST", body: { cardId: offered.id } });
  await api(running.base, "/api/debug/unlock-card", { token: accepterA, method: "POST", body: { cardId: wanted.id } });
  await api(running.base, "/api/debug/unlock-card", { token: accepterB, method: "POST", body: { cardId: wanted.id } });
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: { offeredCardId: offered.id, wantedCardId: wanted.id },
  });
  const results = await Promise.all([accepterA, accepterB].map((token) =>
    api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, { token, method: "POST" })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const states = await Promise.all([owner, accepterA, accepterB].map((token) => api(running.base, "/api/state", { token })));
  assert.equal(states[0].body.inventory[wanted.id], 1);
  assert.equal(states.slice(1).filter(({ body }) => body.inventory[offered.id] === 1).length, 1);
  assert.equal(states.slice(1).filter(({ body }) => body.inventory[wanted.id] === 1).length, 1);
});

test("server owns sessions, idle pulls, inventory, and persistence", async (t) => {
  assert.equal(RANK_TITLES.length, 14);
  assert.equal(new Set(RANK_TITLES).size, 14);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-test-"));
  const clock = { value: Date.parse("2026-09-03T12:00:00.000Z") };
  let running = await start(dataDir, clock);
  t.after(async () => {
    if (running) await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const catalog = await api(running.base, "/api/catalog");
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.cards.length > 100);
  assert.equal(new Set(catalog.body.cards.filter(({ set, eventOnly }) => set !== "SYS" && !eventOnly).map(({ set }) => set)).size, 14);
  assert.ok(catalog.body.cards.every(({ titleHe, setNameHe, typeHe, displayCode }) => titleHe && setNameHe && typeHe && displayCode));
  const specials = await api(running.base, "/api/specials");
  assert.equal(specials.status, 200);
  assert.equal(specials.body.sets.length, 7);
  assert.ok(specials.body.cards.length >= 17);
  assert.ok(specials.body.sets.every(({ packEligible }) => packEligible === false));
  assert.ok(specials.body.cards.some(({ id }) => id === "REC-BEN-GVIR-LEGAL-01"));
  assert.ok(specials.body.cards.some(({ id }) => id === "MIN-REGEV-TRAVEL-01"));
  const presentation = await api(running.base, "/api/presentation/content");
  assert.equal(presentation.status, 200);
  assert.equal(presentation.body.deckId, "poc-response");
  const editorial = await api(running.base, "/api/editorial");
  assert.equal(editorial.status, 200);
  assert.equal(editorial.body.advocacy.editorialPolicy.realActivityOnly, true);
  assert.equal(editorial.body.samples[0].contentStatus, "draft-secondary-source");
  assert.equal(editorial.body.debugEnabled, true);

  const page = await fetch(`${running.base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /^text\/html/);
  const pageHtml = await page.text();
  assert.match(pageHtml, /פתיחת קלף/);
  assert.match(pageHtml, /קלף אחד בכל שלוש שעות/);
  const sharePage = await fetch(`${running.base}/share/LIK-M01-Q01`);
  assert.equal(sharePage.status, 200);
  assert.match(sharePage.headers.get("content-type"), /^text\/html/);
  const shareHtml = await sharePage.text();
  assert.match(shareHtml, /property="og:image"/);
  assert.match(shareHtml, /og:title" content="קְלָפִי · /);
  assert.match(shareHtml, /card=LIK-M01-Q01/);
  assert.equal((await fetch(`${running.base}/share/not-a-card`)).status, 404);
  const clientScript = await fetch(`${running.base}/app.js?v=test`);
  assert.match(clientScript.headers.get("cache-control"), /no-cache/);
  const stylesheet = await fetch(`${running.base}/styles.css?v=test`);
  assert.match(stylesheet.headers.get("cache-control"), /no-cache/);

  const heroArt = await fetch(`${running.base}/design-assets/hero-art-kalpi.png`);
  assert.equal(heroArt.status, 200);
  assert.equal(heroArt.headers.get("content-type"), "image/png");
  const likudSymbolArt = await fetch(`${running.base}/design-assets/hero-art-memchetlammed.png`);
  assert.equal(likudSymbolArt.status, 200);
  assert.equal(catalog.body.cards.find(({ id }) => id === "LIK-S-01").artKey, "hero-art-memchetlammed.png");
  const packVideoRange = await fetch(`${running.base}/design-assets/pack-rip-seedance-v01.mp4`, {
    headers: { range: "bytes=0-31" },
  });
  assert.equal(packVideoRange.status, 206);
  assert.equal(packVideoRange.headers.get("content-type"), "video/mp4");
  assert.equal(packVideoRange.headers.get("accept-ranges"), "bytes");
  assert.match(packVideoRange.headers.get("content-range"), /^bytes 0-31\/\d+$/);
  assert.equal((await packVideoRange.arrayBuffer()).byteLength, 32);

  const created = await api(running.base, "/api/session", { method: "POST" });
  assert.equal(created.status, 201);
  const token = created.body.token;
  const initialState = await api(running.base, "/api/state", { token });
  assert.match(initialState.body.displayName, /^שחקן /);
  assert.equal(initialState.body.starCount, 0);
  const renamed = await api(running.base, "/api/profile", {
    token,
    method: "POST",
    body: { displayName: "גיא בדיקה" },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.displayName, "גיא בדיקה");
  const invalidName = await api(running.base, "/api/profile", {
    token,
    method: "POST",
    body: { displayName: "<script>" },
  });
  assert.equal(invalidName.status, 400);

  const demo = await api(running.base, "/api/packs/demo", { token, method: "POST" });
  assert.equal(demo.status, 200);
  assert.equal(demo.body.mode, "demo");
  assert.equal(demo.body.cards.length, 6);
  assert.ok(demo.body.cards.every(({ cardId }) => catalog.body.cards.some(({ id }) => id === cardId)));
  const stateAfterDemo = await api(running.base, "/api/state", { token });
  assert.equal(stateAfterDemo.body.packCount, 0);
  assert.deepEqual(stateAfterDemo.body.inventory, {});
  assert.equal(stateAfterDemo.body.progression.level, 1);
  assert.equal(stateAfterDemo.body.progression.totalLevels, 5);
  assert.equal(stateAfterDemo.body.progression.rank, "אזרח סקרן");
  assert.equal(stateAfterDemo.body.progression.nextRank, "קורא כותרות");

  const bibiDemo = await api(running.base, "/api/packs/bibi-demo", { token, method: "POST" });
  assert.equal(bibiDemo.status, 201);
  assert.equal(bibiDemo.body.mode, "bibi-demo");
  assert.equal(bibiDemo.body.cards[0].cardId, "LIK-M01-Q01");
  assert.deepEqual(
    bibiDemo.body.cards.map(({ cardId }) => catalog.body.cards.find(({ id }) => id === cardId).rarity),
    ["Uncommon", "Uncommon", "Rare", "Common", "Common", "Uncommon"],
  );
  const stateAfterBibiDemo = await api(running.base, "/api/state", { token });
  assert.deepEqual(
    ["LIK-M01-Q01", "LIK-M01-Q02", "LIK-M01-Q03"].map((cardId) => stateAfterBibiDemo.body.inventory[cardId]),
    [1, 1, 1],
  );
  assert.equal(stateAfterBibiDemo.body.packCount, 0, "debug pack must not affect real pack activity");
  assert.ok(stateAfterBibiDemo.body.starCount >= 6);
  assert.equal(stateAfterBibiDemo.body.progression.rank, "אזרח סקרן");
  assert.equal(stateAfterBibiDemo.body.progression.nextRank, "קורא כותרות");

  const unauthorized = await api(running.base, "/api/state");
  assert.equal(unauthorized.status, 401);

  const faction = await api(running.base, "/api/faction", {
    token,
    method: "POST",
    body: { factionId: "LIK" },
  });
  assert.equal(faction.status, 200);
  assert.equal(faction.body.factionId, "LIK");

  const pull = await api(running.base, "/api/packs/daily", {
    token,
    method: "POST",
    body: { cards: ["FAKE-1/1"] },
  });
  assert.equal(pull.status, 201);
  assert.equal(pull.body.cards.length, 6);
  assert.ok(pull.body.cards.every(({ cardId }) => catalog.body.cards.some(({ id }) => id === cardId)));
  assert.ok(pull.body.cards.every(({ cardId }) => cardId !== "FAKE-1/1"));

  const ownedCardId = pull.body.cards[0].cardId;
  const tracked = await api(running.base, "/api/events", {
    token,
    method: "POST",
    body: { type: "back_completed", cardId: ownedCardId, count: 999999, factionValue: 999999 },
  });
  assert.equal(tracked.status, 201);

  const rejectedMetric = await api(running.base, "/api/events", {
    token,
    method: "POST",
    body: { type: "faction_total_override", count: 999999 },
  });
  assert.equal(rejectedMetric.status, 400);

  const notOwned = catalog.body.cards.find(({ id }) => !pull.body.cards.some(({ cardId }) => cardId === id));
  const rejectedShare = await api(running.base, "/api/events", {
    token,
    method: "POST",
    body: { type: "share_created", cardId: notOwned.id },
  });
  assert.equal(rejectedShare.status, 403);

  const stateAfterPull = await api(running.base, "/api/state", { token });
  const singleCopyCardId = Object.entries(stateAfterPull.body.inventory).find(([, count]) => count === 1)?.[0];
  assert.ok(singleCopyCardId);
  const rejectedGift = await api(running.base, "/api/events", {
    token,
    method: "POST",
    body: { type: "gift_preview_created", cardId: singleCopyCardId },
  });
  assert.equal(rejectedGift.status, 403);

  const tradeTarget = catalog.body.cards.find(({ id }) => !pull.body.cards.some(({ cardId }) => cardId === id));
  const tradeCreated = await api(running.base, "/api/trades", {
    token,
    method: "POST",
    body: { offeredCardId: ownedCardId, wantedCardId: tradeTarget.id },
  });
  assert.equal(tradeCreated.status, 201);
  assert.equal(tradeCreated.body.trade.status, "open");
  const tradeMatched = await api(running.base, `/api/trades/${tradeCreated.body.trade.tradeId}/simulate-accept`, {
    token,
    method: "POST",
  });
  assert.equal(tradeMatched.status, 200);
  assert.equal(tradeMatched.body.trade.status, "matched-demo");
  assert.equal(tradeMatched.body.state.inventory[tradeTarget.id], 1);
  assert.equal(tradeMatched.body.state.achievements.find(({ id }) => id === "trade-match").earned, true);

  const activity = await api(running.base, "/api/activity");
  assert.equal(activity.body.counts.pack_opened, 1);
  assert.equal(activity.body.counts.back_completed, 1);
  assert.equal(activity.body.counts.share_created, undefined);
  const leaderboards = await api(running.base, "/api/leaderboards", { token });
  assert.equal(leaderboards.status, 200);
  const community = await api(running.base, "/api/community", { token });
  assert.equal(community.status, 200);
  assert.equal(community.body.leaderboards.dailyChallenge.day, leaderboards.body.dailyChallenge.day);
  assert.ok(Array.isArray(community.body.trades.trades));
  assert.equal(community.body.activity.counts.pack_opened, 1);
  assert.equal(leaderboards.body.factions.find(({ partyId }) => partyId === "LIK").packs, 1);
  assert.equal(leaderboards.body.dailyChallenge.day, "2026-09-03");
  assert.equal(leaderboards.body.dailyChallenge.targetPartyNameHe, catalog.body.cards.find(({ set }) => set === leaderboards.body.dailyChallenge.targetPartyId)?.setNameHe);
  assert.match(leaderboards.body.dailyChallenge.targetPartyNameHe, /[א-ת]/);
  const currentChallengeEntry = leaderboards.body.dailyChallenge.leaders.find(({ current }) => current);
  assert.equal(currentChallengeEntry.label, "גיא בדיקה");
  const expectedChallengeCards = pull.body.cards
    .filter(({ cardId }) => catalog.body.cards.find(({ id }) => id === cardId)?.set === leaderboards.body.dailyChallenge.targetPartyId)
    .length;
  assert.equal(currentChallengeEntry.cards, expectedChallengeCards);

  const blocked = await api(running.base, "/api/packs/daily", { token, method: "POST" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, "PACK_NOT_READY");

  const state = await api(running.base, "/api/state", { token });
  assert.equal(state.status, 200);
  assert.equal(state.body.packAvailable, false);
  assert.equal(Object.values(state.body.inventory).reduce((sum, count) => sum + count, 0), 12);
  assert.equal(state.body.progression.unique, 0, "future release cards do not advance active progression");

  const reset = await api(running.base, "/api/debug/reset-pack", { token, method: "POST" });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.packAvailable, true);
  assert.equal(reset.body.nextDailyAt, null);

  const secondUser = await api(running.base, "/api/session", { method: "POST" });
  const secondState = await api(running.base, "/api/state", { token: secondUser.body.token });
  assert.deepEqual(secondState.body.inventory, {});

  await running.close();
  running = null;
  running = await start(dataDir, clock);
  const restored = await api(running.base, "/api/state", { token });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.packCount, 1);
  assert.equal(restored.body.displayName, "גיא בדיקה");

  clock.value += DAY_MS;
  const tomorrow = await api(running.base, "/api/packs/daily", { token, method: "POST" });
  assert.equal(tomorrow.status, 201);
  const tomorrowBoards = await api(running.base, "/api/leaderboards", { token });
  assert.notEqual(tomorrowBoards.body.dailyChallenge.targetPartyId, leaderboards.body.dailyChallenge.targetPartyId);
});

test("active event grants one persistent Special card per day", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-event-test-"));
  const clock = { value: Date.parse("2026-09-10T09:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const created = await api(running.base, "/api/session", { method: "POST" });
  const token = created.body.token;
  const events = await api(running.base, "/api/events", { token });
  const active = events.body.events.find(({ active }) => active);
  assert.equal(active.id, "aces-launch-2026");
  assert.equal(active.cards.length, 2);
  const pulled = await api(running.base, `/api/events/${active.id}/pull`, { token, method: "POST" });
  assert.equal(pulled.status, 201);
  assert.equal(pulled.body.cards.length, 1);
  assert.equal(pulled.body.cards[0].finish, "Promotion");
  const blocked = await api(running.base, `/api/events/${active.id}/pull`, { token, method: "POST" });
  assert.equal(blocked.status, 409);
  const state = await api(running.base, "/api/state", { token });
  assert.equal(state.body.inventory[pulled.body.cards[0].cardId], 1);
  clock.value += DAY_MS;
  const tomorrow = await api(running.base, `/api/events/${active.id}/pull`, { token, method: "POST" });
  assert.equal(tomorrow.status, 201);
});

test("local debug unlock grants one selected Binder card idempotently", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-unlock-test-"));
  const clock = { value: Date.parse("2026-09-10T09:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const created = await api(running.base, "/api/session", { method: "POST" });
  const token = created.body.token;
  const cardId = "REC-BEN-GVIR-LEGAL-01";
  const unlocked = await api(running.base, "/api/debug/unlock-card", {
    token,
    method: "POST",
    body: { cardId },
  });
  assert.equal(unlocked.status, 200);
  assert.equal(unlocked.body.inventory[cardId], 1);
  assert.equal(unlocked.body.instances.find(({ cardId: id }) => id === cardId).acquiredBy, "debug-unlock");
  const repeated = await api(running.base, "/api/debug/unlock-card", {
    token,
    method: "POST",
    body: { cardId },
  });
  assert.equal(repeated.body.inventory[cardId], 1);
});

test("favorites persist per player and require card ownership", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-favorites-test-"));
  const clock = { value: Date.parse("2026-09-10T09:00:00.000Z") };
  let running = await start(dataDir, clock);
  t.after(async () => {
    if (running) await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const first = await api(running.base, "/api/session", { method: "POST" });
  const second = await api(running.base, "/api/session", { method: "POST" });
  const cardId = "REC-BEN-GVIR-LEGAL-01";
  const blocked = await api(running.base, "/api/favorites", {
    token: first.body.token,
    method: "POST",
    body: { cardId, favorite: true },
  });
  assert.equal(blocked.status, 409);
  await api(running.base, "/api/debug/unlock-card", {
    token: first.body.token,
    method: "POST",
    body: { cardId },
  });
  const favorited = await api(running.base, "/api/favorites", {
    token: first.body.token,
    method: "POST",
    body: { cardId, favorite: true },
  });
  assert.deepEqual(favorited.body.favorites, [cardId]);
  assert.deepEqual((await api(running.base, "/api/state", { token: second.body.token })).body.favorites, []);

  await running.close();
  running = await start(dataDir, clock);
  assert.deepEqual((await api(running.base, "/api/state", { token: first.body.token })).body.favorites, [cardId]);
});

test("Studio reads publicly and saves one card atomically only in debug mode", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-studio-test-"));
  const studioContentPath = path.join(dataDir, "studio-content.json");
  const cardsPath = path.join(dataDir, "cards.json");
  const specialsPath = path.join(dataDir, "specials-content.json");
  const presentationContentPath = path.join(dataDir, "presentation-content.json");
  await copyFile(path.join(appRoot, "data/studio-content.json"), studioContentPath);
  await copyFile(path.join(appRoot, "data/cards.json"), cardsPath);
  await copyFile(path.join(appRoot, "data/specials-content.json"), specialsPath);
  await copyFile(path.join(appRoot, "data/presentation-content.json"), presentationContentPath);
  const clock = { value: Date.parse("2026-09-09T12:00:00.000Z") };
  let running = await start(dataDir, clock, { studioContentPath, cardsPath, specialsPath, presentationContentPath });
  t.after(async () => {
    if (running) await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const content = await api(running.base, "/api/studio/content");
  assert.equal(content.status, 200);
  assert.equal(content.body.parties.length, 14);
  assert.equal(content.body.members.length, 51);
  const catalog = await api(running.base, "/api/catalog");
  const targetRuntime = catalog.body.cards.find(({ type }) => type === "Quote");
  const targetMember = content.body.members.find(({ quoteSlots }) => quoteSlots.some(({ id }) => id === targetRuntime.id));
  const target = targetMember.quoteSlots.find(({ id }) => id === targetRuntime.id);
  const created = await api(running.base, "/api/session", { method: "POST" });
  const changedQuote = `${target.quote.displayText} בדיקת פרסום`;
  const changedArt = "test-runtime-art.png";
  const saved = await api(running.base, "/api/studio/content", {
    token: created.body.token,
    method: "POST",
    body: {
      memberId: targetMember.id,
      cardId: target.id,
      patch: {
        quote: { displayText: changedQuote },
        art: { artKey: changedArt },
        editorial: { flavor: "test symbolic prop" },
      },
      memberPatch: { identityReference: { status: "test-reviewed" } },
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.card.editorial.flavor, "test symbolic prop");
  assert.equal(saved.body.identityReference.status, "test-reviewed");
  assert.equal(saved.body.runtimeCard.walkout.text, changedQuote);
  assert.equal(saved.body.runtimeCard.artKey, changedArt);
  assert.equal(saved.body.runtimeCard.displayCode, targetMember.slot === 1 ? "ראש-01" : "משנה-01");

  const liveCatalog = await api(running.base, "/api/catalog");
  const liveCard = liveCatalog.body.cards.find(({ id }) => id === target.id);
  assert.equal(liveCard.walkout.text, changedQuote);
  assert.equal(liveCard.artKey, changedArt);
  const studioOnDisk = JSON.parse(await readFile(studioContentPath, "utf8"));
  const memberOnDisk = studioOnDisk.members.find(({ id }) => id === targetMember.id);
  assert.equal(memberOnDisk.quoteSlots.find(({ id }) => id === target.id).quote.displayText, changedQuote);
  const cardsOnDisk = JSON.parse(await readFile(cardsPath, "utf8"));
  assert.equal(cardsOnDisk.find(({ id }) => id === target.id).artKey, changedArt);

  const changedRecord = "15 כתבי אישום · בדיקת Studio";
  const savedSpecial = await api(running.base, "/api/studio/specials", {
    token: created.body.token,
    method: "POST",
    body: {
      cardId: "REC-BEN-GVIR-LEGAL-01",
      patch: { displayText: changedRecord, contentStatus: "approved" },
    },
  });
  assert.equal(savedSpecial.status, 200);
  assert.equal(savedSpecial.body.runtimeCard.walkout.kind, "fact");
  assert.equal(savedSpecial.body.runtimeCard.walkout.text, changedRecord);
  assert.equal(
    JSON.parse(await readFile(specialsPath, "utf8")).cards.find(({ id }) => id === "REC-BEN-GVIR-LEGAL-01").displayText,
    changedRecord,
  );
  const savedPresentation = await api(running.base, "/api/presentation/content", {
    token: created.body.token,
    method: "POST",
    body: { fields: { "s01-t001": "כותרת מצגת לבדיקה" } },
  });
  assert.equal(savedPresentation.status, 200);
  assert.equal(savedPresentation.body.fields["s01-t001"], "כותרת מצגת לבדיקה");

  await running.close();
  running = await start(dataDir, clock, { studioContentPath, cardsPath, specialsPath, presentationContentPath });
  const restartedCatalog = await api(running.base, "/api/catalog");
  assert.equal(restartedCatalog.body.cards.find(({ id }) => id === target.id).walkout.text, changedQuote);
  assert.equal(restartedCatalog.body.cards.find(({ id }) => id === "REC-BEN-GVIR-LEGAL-01").walkout.text, changedRecord);
  assert.equal((await api(running.base, "/api/presentation/content")).body.fields["s01-t001"], "כותרת מצגת לבדיקה");
});

test("Studio reveal timing is global, validated, and survives restart", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-config-test-"));
  const studioContentPath = path.join(dataDir, "studio-content.json");
  await copyFile(path.join(appRoot, "data/studio-content.json"), studioContentPath);
  const clock = { value: Date.parse("2026-09-09T12:00:00.000Z") };
  let running = await start(dataDir, clock, { studioContentPath });
  t.after(async () => {
    if (running) await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const initial = await api(running.base, "/api/game-config");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.visual.theme, "pack-v2");
  const created = await api(running.base, "/api/session", { method: "POST" });
  const timing = { quote: 75, party: 640, name: 510, portrait: 890 };
  const visual = { theme: "classic-v1", cardFrame: "classic-v1", density: "compact-v1", quoteReveal: "fade-v1" };
  const saved = await api(running.base, "/api/studio/config", {
    token: created.body.token,
    method: "POST",
    body: { revealTiming: timing, visual },
  });
  assert.deepEqual(saved.body.revealTiming, timing);
  assert.deepEqual(saved.body.visual, visual);
  assert.deepEqual((await api(running.base, "/api/game-config")).body.revealTiming, timing);

  await running.close();
  running = await start(dataDir, clock, { studioContentPath });
  const persisted = (await api(running.base, "/api/game-config")).body;
  assert.deepEqual(persisted.revealTiming, timing);
  assert.deepEqual(persisted.visual, visual);
});

test("Studio mutation endpoint is hidden when debug mode is disabled", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-studio-prod-test-"));
  const studioContentPath = path.join(dataDir, "studio-content.json");
  await copyFile(path.join(appRoot, "data/studio-content.json"), studioContentPath);
  const running = await start(dataDir, { value: Date.parse("2026-09-09T12:00:00.000Z") }, {
    debugEnabled: false,
    studioContentPath,
  });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const created = await api(running.base, "/api/session", { method: "POST" });
  assert.equal((await api(running.base, "/api/studio/content")).status, 404);
  assert.equal((await api(running.base, "/api/presentation/content")).status, 404);
  const boot = await api(running.base, "/api/bootstrap", { token: created.body.token });
  assert.equal(boot.status, 200);
  assert.equal(boot.body.studioContent, null);
  assert.equal(boot.body.gameConfig.parties.find(({ id }) => id === "RZ").displayNameHe, "הציונות הדתית וזהות");
  assert.equal(boot.body.gameConfig.pack.sets.find(({ id }) => id === "party-leaders").weight, 70);
  assert.deepEqual(boot.body.gameConfig.pack.current.sets.map(({ id }) => id), []);
  assert.ok(boot.body.catalog.cards.length);
  assert.ok(boot.body.idleReturn.state);
  const publicConfig = await api(running.base, "/api/game-config");
  assert.equal(publicConfig.status, 200);
  const rz = publicConfig.body.parties.find(({ id }) => id === "RZ");
  assert.equal(rz.displayNameHe, "הציונות הדתית וזהות");
  const publicBoards = await api(running.base, "/api/leaderboards", { token: created.body.token });
  assert.match(publicBoards.body.dailyChallenge.targetPartyNameHe, /[א-ת]/);
  assert.notEqual(publicBoards.body.dailyChallenge.targetPartyNameHe, publicBoards.body.dailyChallenge.targetPartyId);
  assert.equal((await fetch(`${running.base}/project-docs/presentation/poc-response/index.html`)).status, 404);
  const health = await fetch(`${running.base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  const response = await api(running.base, "/api/studio/content", {
    token: created.body.token,
    method: "POST",
    body: { memberId: "YSR-M01", cardId: "YSR-M01-Q01", patch: { review: { contentStatus: "approved" } } },
  });
  assert.equal(response.status, 404);
  const configResponse = await api(running.base, "/api/studio/config", {
    token: created.body.token,
    method: "POST",
    body: { revealTiming: { quote: 1, party: 2, name: 3, portrait: 4 } },
  });
  assert.equal(configResponse.status, 404);
  const specialResponse = await api(running.base, "/api/studio/specials", {
    token: created.body.token,
    method: "POST",
    body: { cardId: "REC-BEN-GVIR-LEGAL-01", patch: { displayText: "blocked" } },
  });
  assert.equal(specialResponse.status, 404);
  const unlockResponse = await api(running.base, "/api/debug/unlock-card", {
    token: created.body.token,
    method: "POST",
    body: { cardId: "REC-BEN-GVIR-LEGAL-01" },
  });
  assert.equal(unlockResponse.status, 404);
  const presentationResponse = await api(running.base, "/api/presentation/content", {
    token: created.body.token,
    method: "POST",
    body: { fields: { "s01-t001": "blocked" } },
  });
  assert.equal(presentationResponse.status, 404);
});

test("home route creates a guest session without the full catalog", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-home-route-"));
  const running = await start(dataDir, { value: Date.parse("2026-09-15T12:00:00.000Z") }, { debugEnabled: false });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const home = await api(running.base, "/api/home");
  assert.equal(home.status, 200);
  assert.match(home.body.token, /^[0-9a-f-]{36}$/i);
  assert.ok(home.body.state.displayName);
  assert.equal(home.body.state.progression.rank, "אזרח סקרן");
  assert.equal(home.body.catalog, undefined);
  assert.equal(typeof home.body.state.inventory, "object");
  const again = await api(running.base, "/api/home", { token: home.body.token });
  assert.equal(again.body.token, home.body.token);
  const warm = await api(running.base, "/api/warm");
  assert.deepEqual(warm, { status: 200, body: { status: "ready" } });
});

test("bootstrap creates a guest session in one request", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-boot-session-"));
  const running = await start(dataDir, { value: Date.parse("2026-09-15T12:00:00.000Z") }, { debugEnabled: false });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const boot = await api(running.base, "/api/bootstrap");
  assert.equal(boot.status, 200);
  assert.match(boot.body.token, /^[0-9a-f-]{36}$/i);
  assert.ok(boot.body.idleReturn.state.displayName);
  assert.equal(boot.body.studioContent, null);
  const again = await api(running.base, "/api/bootstrap", { token: boot.body.token });
  assert.equal(again.body.token, boot.body.token);
  assert.equal(again.body.idleReturn.state.displayName, boot.body.idleReturn.state.displayName);
});

test("production Studio opens with STUDIO_SECRET for unlock and set calendar", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-studio-secret-"));
  const studioContentPath = path.join(dataDir, "studio-content.json");
  await copyFile(path.join(appRoot, "data/studio-content.json"), studioContentPath);
  const running = await start(dataDir, { value: Date.parse("2026-09-15T12:00:00.000Z") }, {
    debugEnabled: false,
    studioSecret: "ops-test-secret",
    studioContentPath,
  });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const boot = await api(running.base, "/api/bootstrap", { studio: "ops-test-secret" });
  assert.equal(boot.status, 200);
  assert.equal(boot.body.studioContent.studioEnabled, true);
  const token = boot.body.token;
  const denied = await api(running.base, "/api/studio/config", {
    token,
    method: "POST",
    body: { revealTiming: { quote: 1, party: 2, name: 3, portrait: 4 } },
  });
  assert.equal(denied.status, 404);
  const saved = await api(running.base, "/api/studio/config", {
    token,
    studio: "ops-test-secret",
    method: "POST",
    body: {
      revealTiming: { quote: 80, party: 0, name: 600, portrait: 400 },
      releaseSets: [{ id: "party-slot-2", runtimeState: "active", runtimeAvailableFrom: "2026-09-15T00:00:00.000Z" }],
      pack: {
        sets: [
          { id: "party-leaders", weight: 70, rarities: { Common: 70, Uncommon: 25, Rare: 5 } },
          { id: "party-slot-2", weight: 30, rarities: { Common: 80, Uncommon: 15, Rare: 5 } },
        ],
      },
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.releaseSets.find(({ id }) => id === "party-slot-2").runtimeState, "active");
  assert.deepEqual(saved.body.pack.current.sets.map(({ id, percent }) => [id, percent]), [
    ["party-leaders", 70],
    ["party-slot-2", 30],
  ]);
  assert.equal(saved.body.pack.sets.find(({ id }) => id === "party-slot-2").rarities.Common, 80);
  const cardId = boot.body.catalog.cards.find(({ idleEligible }) => idleEligible).id;
  const unlocked = await api(running.base, "/api/debug/unlock-card", {
    token,
    studio: "ops-test-secret",
    method: "POST",
    body: { cardId },
  });
  assert.equal(unlocked.status, 200);
  assert.equal(unlocked.body.inventory[cardId], 1);
});

test("quiz routes stay closed unless explicitly enabled", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-quiz-off-"));
  const clock = { value: Date.parse("2026-09-15T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const token = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const quiz = await api(running.base, "/api/quiz", { token });
  const state = await api(running.base, "/api/state", { token });
  assert.equal(quiz.status, 404);
  assert.equal(quiz.body.error, "QUIZ_DISABLED");
  assert.equal(state.body.quizAvailable, false);
});

test("owned-card quiz grants one extra pack per Jerusalem day", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-quiz-test-"));
  const clock = { value: Date.parse("2026-09-15T12:00:00.000Z") };
  const running = await start(dataDir, clock, { quizEnabled: true });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const token = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const empty = await api(running.base, "/api/quiz", { token });
  assert.equal(empty.body.available, false);
  const cardId = (await api(running.base, "/api/catalog")).body.cards.find(({ idleEligible }) => idleEligible).id;
  await api(running.base, "/api/debug/unlock-card", { token, method: "POST", body: { cardId } });
  const quiz = await api(running.base, "/api/quiz", { token });
  assert.equal(quiz.status, 200);
  assert.equal(quiz.body.available, true);
  assert.equal(quiz.body.questions.length, 2);
  assert.equal(quiz.body.source, "owned-card");
  assert.match(quiz.body.questions[0].prompt, /מקום|עוסק/);
  assert.equal(quiz.body.questions[1].prompt, "באיזו רשימה?");
  const stored = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  const answers = stored.sessions[token].currentQuiz.answers;
  const wrong = await api(running.base, "/api/quiz/answer", {
    token,
    method: "POST",
    body: { quizId: quiz.body.quizId, answers: { role: "לא", list: "לא" } },
  });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.body.correct, false);
  const retry = await api(running.base, "/api/quiz", { token });
  const storedRetry = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  const win = await api(running.base, "/api/quiz/answer", {
    token,
    method: "POST",
    body: { quizId: retry.body.quizId, answers: storedRetry.sessions[token].currentQuiz.answers },
  });
  assert.equal(win.status, 201);
  assert.equal(win.body.correct, true);
  assert.equal(win.body.cards.length, 1);
  assert.equal(win.body.state.quizWonToday, true);
  const again = await api(running.base, "/api/quiz", { token });
  assert.equal(again.body.available, false);
  assert.equal(again.body.wonToday, true);
  assert.ok(answers.role && answers.list);
});

test("postgres store keeps a session after a second process boots", async (t) => {
  const databaseUrl = process.env.KALPI_TEST_DATABASE_URL
    || "postgresql://kalpi:change-me@127.0.0.1:5432/kalpi_test";
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    await pool.end().catch(() => {});
    if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(error.code)) {
      t.skip("Postgres is not available");
      return;
    }
    throw error;
  }
  try {
    await pool.query(`
      DROP TABLE IF EXISTS
        kalpi_studio_config,
        kalpi_idempotency,
        kalpi_reports,
        kalpi_events,
        kalpi_trades,
        kalpi_packs,
        kalpi_instances,
        kalpi_inventory,
        kalpi_factions,
        kalpi_sessions,
        kalpi_runtime_state,
        kalpi_schema_migrations
      CASCADE
    `);
  } finally {
    await pool.end();
  }
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-pg-test-"));
  const clock = { value: Date.parse("2026-09-15T12:00:00.000Z") };
  const first = await start(dataDir, clock, { databaseUrl });
  const created = await api(first.base, "/api/session", { method: "POST" });
  const token = created.body.token;
  const health = await api(first.base, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.backend, "postgres");
  const idleCards = (await api(first.base, "/api/catalog")).body.cards.filter(({ idleEligible }) => idleEligible);
  const cardId = idleCards[0].id;
  const secondCardId = idleCards[1].id;
  const secondCreated = await api(first.base, "/api/session", { method: "POST" });
  const secondToken = secondCreated.body.token;
  const [firstUnlock, secondUnlock] = await Promise.all([
    api(first.base, "/api/debug/unlock-card", { token, method: "POST", body: { cardId } }),
    api(first.base, "/api/debug/unlock-card", { token: secondToken, method: "POST", body: { cardId: secondCardId } }),
  ]);
  assert.equal(firstUnlock.status, 200);
  assert.equal(secondUnlock.status, 200);
  const recorded = await api(first.base, "/api/events", {
    token,
    method: "POST",
    body: { type: "source_opened", cardId },
  });
  assert.equal(recorded.status, 201);
  const bulkSessions = await Promise.all(
    Array.from({ length: 12 }, () => api(first.base, "/api/session", { method: "POST" })),
  );
  const bulkPulls = await Promise.all(
    bulkSessions.map(({ body }) => api(first.base, "/api/idle/settle", {
      token: body.token,
      method: "POST",
    })),
  );
  assert.deepEqual(bulkPulls.map(({ status }) => status), Array(12).fill(200));
  assert.equal(bulkPulls.reduce((total, { body }) => total + body.newlySettledCount, 0), 12);
  await first.close();
  const second = await start(dataDir, clock, { databaseUrl });
  t.after(async () => {
    await second.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const state = await api(second.base, "/api/state", { token });
  assert.equal(state.status, 200);
  assert.ok(state.body.displayName);
  assert.equal(state.body.inventory[cardId], 1);
  assert.equal(state.body.achievements.find(({ id }) => id === "source-check").earned, true);
  assert.equal(state.body.quizAvailable, false);
  const restoredSecond = await api(second.base, "/api/state", { token: secondToken });
  assert.equal(restoredSecond.status, 200);
  assert.equal(restoredSecond.body.inventory[secondCardId], 1);
});
