import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp, IDLE_BACKLOG_CAP, IDLE_INTERVAL_MS, IDLE_STARTER_READY } from "../server/app.js";
import { eventClaimKey, isEventClaimed, openSpecialWindow } from "../server/special-window.js";
import { JsonStore } from "../server/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const LAUNCH_ID = "launch-week-2026";
const LAUNCH_TICKER = "שבוע השקה! מפרגנים לשחקנים הראשונים - בחבילה נוספת. לחצו כאן!";
const INSIDE = Date.parse("2026-09-26T12:00:00+03:00");
const CLOSES = Date.parse("2026-10-05T00:00:00+03:00");

async function start(dataDir, clock, { databaseUrl = null } = {}) {
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
    achievementsPath: path.join(appRoot, "data/achievements.json"),
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled: false,
    databaseUrl,
    now: () => clock.value,
    rng: () => 0,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function api(base, route, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

async function boot(t, clockValue = INSIDE) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-launch-event-"));
  const clock = { value: clockValue };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const created = await api(running.base, "/api/session", { method: "POST" });
  const token = created.body.token;
  const settled = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  return { running, clock, token, settled, dataDir };
}

const claim = (running, token) => api(running.base, `/api/events/${LAUNCH_ID}/pull`, { token, method: "POST" });

test("launch week is configured server-side: once-per-player pull reward until the end of Sunday Oct 4 (Israel)", async () => {
  const shipped = JSON.parse(await readFile(path.join(appRoot, "data/events.json"), "utf8"));
  const launch = shipped.events.find(({ id }) => id === LAUNCH_ID);
  assert.equal(launch.status, "active");
  assert.equal(launch.reward, "pull");
  assert.equal(launch.claim, "once");
  assert.equal(launch.tickerHe, LAUNCH_TICKER);
  assert.equal(launch.timezone, "Asia/Jerusalem");
  assert.equal(Date.parse(launch.closesAt), Date.parse("2026-10-04T21:00:00.000Z"));
  assert.ok(Date.parse(launch.opensAt) <= Date.parse("2026-09-25T18:00:00+03:00"));
  assert.equal(openSpecialWindow(shipped.events, INSIDE).id, LAUNCH_ID);
  assert.equal(openSpecialWindow(shipped.events, CLOSES + 1), null);
  const claimed = { eventClaims: { [LAUNCH_ID]: { once: { instanceId: "x" } } } };
  assert.equal(eventClaimKey(launch, INSIDE), "once");
  assert.equal(isEventClaimed(launch, claimed.eventClaims, INSIDE + 3 * 86_400_000), true);
  assert.equal(openSpecialWindow(shipped.events, INSIDE, claimed), null);
});

test("launch pull grants one ready pull, persists the claim, and hides the window for that player", async (t) => {
  const { running, clock, token, settled, dataDir } = await boot(t);
  assert.equal(settled.body.state.unseenCount, IDLE_STARTER_READY);
  const community = await api(running.base, "/api/community", { token });
  assert.equal(community.body.specialWindow.id, LAUNCH_ID);
  assert.equal(community.body.specialWindow.reward, "pull");
  assert.equal(community.body.specialWindow.tickerHe, LAUNCH_TICKER);
  assert.equal(community.body.specialWindow.claimedToday, false);

  const granted = await claim(running, token);
  assert.equal(granted.status, 201);
  assert.equal(granted.body.readyCount, IDLE_STARTER_READY + 1);
  assert.equal(granted.body.state.unseenCount, IDLE_STARTER_READY + 1);
  assert.equal(granted.body.cards.length, IDLE_STARTER_READY + 1);
  assert.equal(granted.body.granted.acquiredBy, "event-pull");
  assert.equal(granted.body.cards.at(-1).instanceId, granted.body.granted.instanceId);
  assert.equal(granted.body.specialWindow, null);
  assert.equal(granted.body.capacity, IDLE_BACKLOG_CAP);

  const after = await api(running.base, "/api/community", { token });
  assert.equal(after.body.specialWindow, null);
  const events = await api(running.base, "/api/events", { token });
  assert.equal(events.body.events.find(({ id }) => id === LAUNCH_ID).claimedToday, true);
  const state = await api(running.base, "/api/state", { token });
  assert.equal(state.body.unseenCount, IDLE_STARTER_READY + 1);

  // Survives a process restart on the same store.
  const restarted = await start(dataDir, clock);
  t.after(() => restarted.close());
  assert.equal((await api(restarted.base, "/api/community", { token })).body.specialWindow, null);
  assert.equal((await claim(restarted, token)).body.error, "EVENT_ALREADY_CLAIMED");

  // Another player still sees it: the claim is per player.
  const other = await api(running.base, "/api/session", { method: "POST" });
  const otherCommunity = await api(running.base, "/api/community", { token: other.body.token });
  assert.equal(otherCommunity.body.specialWindow.id, LAUNCH_ID);
});

test("launch pull: a second claim is rejected, even on a later day", async (t) => {
  const { running, clock, token } = await boot(t);
  assert.equal((await claim(running, token)).status, 201);
  const again = await claim(running, token);
  assert.equal(again.status, 409);
  assert.equal(again.body.error, "EVENT_ALREADY_CLAIMED");
  assert.equal(again.body.readyCount, IDLE_STARTER_READY + 1);
  clock.value += 86_400_000;
  const tomorrow = await claim(running, token);
  assert.equal(tomorrow.status, 409);
  assert.equal(tomorrow.body.error, "EVENT_ALREADY_CLAIMED");
});

test("launch pull at the ready-pull cap is declined without marking it claimed, then succeeds below the cap", async (t) => {
  const { running, clock, token } = await boot(t);
  clock.value += IDLE_BACKLOG_CAP * IDLE_INTERVAL_MS;
  const full = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  assert.equal(full.body.state.unseenCount, IDLE_BACKLOG_CAP);

  const capped = await claim(running, token);
  assert.equal(capped.status, 409);
  assert.equal(capped.body.error, "PULL_CAP_REACHED");
  assert.equal(capped.body.capacity, IDLE_BACKLOG_CAP);
  assert.equal(capped.body.readyCount, IDLE_BACKLOG_CAP);
  assert.equal(capped.body.specialWindow.id, LAUNCH_ID, "the line stays for a capped player");
  const stillOpen = await api(running.base, "/api/community", { token });
  assert.equal(stillOpen.body.specialWindow.id, LAUNCH_ID);
  assert.equal(stillOpen.body.specialWindow.claimedToday, false);

  const opened = await api(running.base, "/api/idle/seen", {
    token,
    method: "POST",
    body: { instanceIds: [full.body.cards[0].instanceId] },
  });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.unseenCount, IDLE_BACKLOG_CAP - 1);

  const granted = await claim(running, token);
  assert.equal(granted.status, 201);
  assert.equal(granted.body.readyCount, IDLE_BACKLOG_CAP);
  assert.equal(granted.body.specialWindow, null);
});

test("launch pull outside the window is rejected and not offered", async (t) => {
  for (const when of [Date.parse("2026-09-24T23:59:00+03:00"), CLOSES + 1]) {
    const { running, token } = await boot(t, when);
    const community = await api(running.base, "/api/community", { token });
    assert.equal(community.body.specialWindow, null);
    const rejected = await claim(running, token);
    assert.equal(rejected.status, 404);
    assert.equal(rejected.body.error, "EVENT_NOT_ACTIVE");
    const state = await api(running.base, "/api/state", { token });
    assert.equal(state.body.unseenCount, IDLE_STARTER_READY);
  }
});

test("launch pull on the Postgres store: grant, cap decline, and claim persist across a second process", async (t) => {
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
  await pool.end();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-launch-pg-"));
  const clock = { value: INSIDE };
  const first = await start(dataDir, clock, { databaseUrl });
  t.after(async () => {
    await first.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const token = (await api(first.base, "/api/session", { method: "POST" })).body.token;
  await api(first.base, "/api/idle/settle", { token, method: "POST" });
  clock.value += IDLE_BACKLOG_CAP * IDLE_INTERVAL_MS;
  const full = await api(first.base, "/api/idle/settle", { token, method: "POST" });
  assert.equal((await claim(first, token)).body.error, "PULL_CAP_REACHED");
  await api(first.base, "/api/idle/seen", { token, method: "POST", body: { instanceIds: [full.body.cards[0].instanceId] } });
  assert.equal((await claim(first, token)).status, 201);
  const second = await start(dataDir, clock, { databaseUrl });
  t.after(() => second.close());
  assert.equal((await api(second.base, "/api/community", { token })).body.specialWindow, null);
  assert.equal((await claim(second, token)).body.error, "EVENT_ALREADY_CLAIMED");
});

test("launch pull settles and claims in ONE session transaction; a repeat claim takes none", async (t) => {
  const { running, clock, token } = await boot(t);
  const original = JsonStore.prototype.withSession;
  let transactions = 0;
  JsonStore.prototype.withSession = function counted(...args) {
    transactions += 1;
    return original.apply(this, args);
  };
  t.after(() => { JsonStore.prototype.withSession = original; });
  clock.value += IDLE_INTERVAL_MS; // one idle pull is due: the claim must settle it in the same transaction
  const granted = await claim(running, token);
  assert.equal(granted.status, 201);
  assert.equal(granted.body.readyCount, IDLE_STARTER_READY + 2, "due pull settled + event pull");
  assert.equal(transactions, 1);
  transactions = 0;
  const again = await claim(running, token);
  assert.equal(again.body.error, "EVENT_ALREADY_CLAIMED");
  assert.equal(transactions, 0);
});

test("launch pull: a pull that became due since the client last looked counts toward the cap", async (t) => {
  const { running, clock, token } = await boot(t);
  clock.value += (IDLE_BACKLOG_CAP - IDLE_STARTER_READY - 1) * IDLE_INTERVAL_MS;
  const seven = await api(running.base, "/api/idle/settle", { token, method: "POST" });
  assert.equal(seven.body.state.unseenCount, IDLE_BACKLOG_CAP - 1);
  clock.value += IDLE_INTERVAL_MS; // the client still thinks 7; the server settles to 8 first
  const capped = await claim(running, token);
  assert.equal(capped.status, 409);
  assert.equal(capped.body.error, "PULL_CAP_REACHED");
  assert.equal(capped.body.readyCount, IDLE_BACKLOG_CAP);
  assert.equal(capped.body.specialWindow.id, LAUNCH_ID);
});
