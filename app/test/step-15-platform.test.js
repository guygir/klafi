import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "../server/app.js";
import { LEAGUE_MAX, normalizeLeagueCode } from "../server/leagues.js";
import { qrModules, qrSvg } from "../server/qr-svg.js";
import { openSpecialWindow } from "../server/special-window.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

async function start(dataDir, clock, { eventsPath = path.join(appRoot, "data/events.json") } = {}) {
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
    eventsPath,
    achievementsPath: path.join(appRoot, "data/achievements.json"),
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled: true,
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

async function api(base, route, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("specials Today window is absent outside Studio dates and present while open", () => {
  const events = [{
    id: "aces-launch-2026",
    nameHe: "אירוע האסים",
    status: "active",
    opensAt: "2026-09-09T00:00:00+03:00",
    closesAt: "2026-09-30T23:59:59+03:00",
    timezone: "Asia/Jerusalem",
  }];
  assert.equal(openSpecialWindow(events, Date.parse("2026-09-03T12:00:00.000Z")), null);
  const open = openSpecialWindow(events, Date.parse("2026-09-22T12:00:00.000Z"), {
    eventClaims: { "aces-launch-2026": { "2026-09-22": "LEG-RABIN-LAST-SPEECH-1995" } },
  });
  assert.equal(open.id, "aces-launch-2026");
  assert.equal(open.claimedToday, true);
  assert.equal(openSpecialWindow([{ ...events[0], status: "blocked" }], Date.parse("2026-09-22T12:00:00.000Z")), null);
});

test("invite codes stay short", () => {
  assert.equal(normalizeLeagueCode("k7t-3m2"), "K7T3M2");
  assert.equal(normalizeLeagueCode("123e4567-e89b-12d3-a456-426614174000"), null);
});

test("paper QR keeps finder squares and encodes the join URL", () => {
  const url = "https://klafi.vercel.app/?league=K7T3M2";
  const modules = qrModules(url);
  const size = modules.length;
  assert.ok(size >= 21);
  const finder = (row, col) => {
    assert.equal(modules[row][col], true);
    assert.equal(modules[row + 6][col + 6], true);
    assert.equal(modules[row + 1][col + 1], false);
    assert.equal(modules[row + 3][col + 3], true);
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  assert.match(qrSvg(url), /<svg /);
  assert.match(qrSvg(url), /קוד QR/);
});

test("rooms use a short code, paper QR, shared stars, and stop at 32", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-leagues-"));
  const clock = { value: Date.parse("2026-09-22T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const owner = await api(running.base, "/api/session", { method: "POST" });
  const created = await api(running.base, "/api/leagues", {
    token: owner.body.token,
    method: "POST",
    body: { name: "ליגת החברים" },
  });
  assert.equal(created.status, 201);
  assert.match(created.body.league.code, /^[A-Z2-9]{6}$/);
  assert.equal(created.body.league.memberCount, 1);
  assert.equal(created.body.league.seasonLabel, undefined, "leagues have no seasons: no month stamp");
  assert.match(created.body.league.joinUrl, /\?league=/);
  assert.match(created.body.league.qrSvg, /<svg /);
  assert.equal(created.body.league.members[0].factionId, undefined);
  assert.equal(typeof created.body.league.members[0].stars, "number");

  const guest = await api(running.base, "/api/session", { method: "POST" });
  const joined = await api(running.base, "/api/leagues/join", {
    token: guest.body.token,
    method: "POST",
    body: { code: created.body.league.code.toLowerCase() },
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.league.memberCount, 2);

  const listed = await api(running.base, "/api/leagues", { token: guest.body.token });
  assert.equal(listed.body.leagues[0].code, created.body.league.code);

  // Names are capped at 20 characters (truncated, not rejected); whitespace is collapsed first.
  // One league per player, so each name case opens its room from a fresh session.
  const fresh = async () => (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const long = await api(running.base, "/api/leagues", {
    token: await fresh(),
    method: "POST",
    body: { name: "  ליגת   החברים של הרחוב הארוך מאוד  " },
  });
  assert.equal(long.status, 201);
  assert.equal(long.body.league.name, "ליגת החברים של הרחוב");
  assert.equal(Array.from(long.body.league.name).length, 20);
  const exact = await api(running.base, "/api/leagues", { token: await fresh(), method: "POST", body: { name: "12345678901234567890" } });
  assert.equal(exact.body.league.name, "12345678901234567890");
  // A cut that lands on a space does not leave a trailing space.
  const spaced = await api(running.base, "/api/leagues", { token: await fresh(), method: "POST", body: { name: "אבגדהוזחטיקלמנסעפצק שלום" } });
  assert.equal(spaced.body.league.name, "אבגדהוזחטיקלמנסעפצק");

  const extras = [];
  for (let index = 0; index < LEAGUE_MAX - 2; index += 1) {
    extras.push(api(running.base, "/api/session", { method: "POST" }));
  }
  const extraSessions = await Promise.all(extras);
  await Promise.all(extraSessions.map((session) => api(running.base, "/api/leagues/join", {
    token: session.body.token,
    method: "POST",
    body: { code: created.body.league.code },
  })));
  const overflow = await api(running.base, "/api/session", { method: "POST" });
  const full = await api(running.base, "/api/leagues/join", {
    token: overflow.body.token,
    method: "POST",
    body: { code: created.body.league.code },
  });
  assert.equal(full.status, 409);
  assert.equal(full.body.error, "LEAGUE_FULL");
});

test("shipped card events stay closed until Studio opens one; only the launch-week pull is live", async () => {
  const events = JSON.parse(await readFile(path.join(appRoot, "data/events.json"), "utf8"));
  assert.ok(events.events.length > 0);
  const active = events.events.filter((event) => event.status !== "blocked");
  assert.deepEqual(active.map(({ id }) => id), ["launch-week-2026"]);
  assert.equal(active[0].reward, "pull");
  assert.ok(events.events.filter(({ reward }) => reward !== "pull").every((event) => event.status === "blocked"));
  assert.equal(openSpecialWindow(events.events, Date.parse("2026-09-22T12:00:00.000Z")), null);
});

test("community exposes the open Specials window and PWA files stay static", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-specials-window-"));
  const shipped = JSON.parse(await readFile(path.join(appRoot, "data/events.json"), "utf8"));
  const eventsPath = path.join(dataDir, "events-active.json");
  await writeFile(eventsPath, JSON.stringify({
    ...shipped,
    events: shipped.events.map((event) => (
      event.id === "aces-launch-2026" ? { ...event, status: "active" } : event
    )),
  }));
  const clock = { value: Date.parse("2026-09-22T12:00:00.000Z") };
  const running = await start(dataDir, clock, { eventsPath });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const created = await api(running.base, "/api/session", { method: "POST" });
  const community = await api(running.base, "/api/community", { token: created.body.token });
  assert.equal(community.body.specialWindow.id, "aces-launch-2026");
  assert.equal(community.body.specialWindow.claimedToday, false);

  const pulled = await api(running.base, `/api/events/${community.body.specialWindow.id}/pull`, {
    token: created.body.token,
    method: "POST",
  });
  assert.equal(pulled.status, 201);
  const after = await api(running.base, "/api/community", { token: created.body.token });
  assert.equal(after.body.specialWindow.claimedToday, true);

  const manifest = await fetch(`${running.base}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  assert.match(await manifest.text(), /"theme_color": "#1f4f4a"/);
  const worker = await fetch(`${running.base}/sw.js`);
  assert.equal(worker.status, 200);
  const workerText = await worker.text();
  assert.match(workerText, /הקלף מוכן לאיסוף/);
  assert.doesNotMatch(workerText, /addEventListener\("fetch"/);
});
