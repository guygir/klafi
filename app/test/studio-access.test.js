import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "../server/app.js";
import {
  DEFAULT_STUDIO_USER_HASHES,
  parseStudioUserIds,
  studioIdentityHash,
  studioSecretPathEnabled,
  studioUserAllowed,
} from "../server/studio-access.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

async function start(dataDir, options = {}) {
  const handler = await createKalpiApp({
    dataDir,
    publicDir: path.join(appRoot, "public"),
    cardsPath: path.join(appRoot, "data/cards.json"),
    advocacyPath: path.join(appRoot, "data/advocacy.json"),
    demoPackPath: path.join(appRoot, "data/demo-pack.json"),
    studioContentPath: path.join(appRoot, "data/studio-content.json"),
    specialsPath: path.join(appRoot, "data/specials-content.json"),
    eventsPath: path.join(appRoot, "data/events.json"),
    achievementsPath: path.join(appRoot, "data/achievements.json"),
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled: false,
    now: () => Date.parse("2026-10-06T08:00:00.000Z"),
    rng: () => 0,
    ...options,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function api(base, route, { token, method = "GET", body, studio } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(studio ? { "x-kalpi-studio": studio } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

/** Create two real sessions, then reopen the same store with `owner` allowlisted. */
async function withOwner(t, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-studio-access-"));
  const first = await start(dataDir, { studioSecret: null });
  const owner = (await api(first.base, "/api/session", { method: "POST" })).body.token;
  const other = (await api(first.base, "/api/session", { method: "POST" })).body.token;
  await first.close();
  const running = await start(dataDir, { studioUserIds: owner, ...options });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { running, owner, other };
}

const STUDIO_READS = [
  ["GET", "/api/studio/content"],
  ["GET", "/api/studio/reports"],
  ["POST", "/api/studio/debug-pull", { rarity: 1 }],
];

test("studio allowlist: the allowlisted identity gets Studio without a secret, everyone else gets 404", async (t) => {
  const { running, owner, other } = await withOwner(t, { studioSecret: "local-secret", studioSecretEnabled: false });
  for (const [method, route, body] of STUDIO_READS) {
    assert.equal((await api(running.base, route, { method, body, token: owner })).status, 200, `${route} owner`);
    assert.equal((await api(running.base, route, { method, body, token: other })).status, 404, `${route} other`);
    assert.equal((await api(running.base, route, { method, body })).status, 404, `${route} anonymous`);
  }
  // Writes are gated the same way (invalid body so nothing is saved either way).
  const write = await api(running.base, "/api/studio/config", { method: "POST", body: { revealTiming: "x" }, token: other });
  assert.equal(write.status, 404);
  const ownerWrite = await api(running.base, "/api/studio/config", { method: "POST", body: { revealTiming: "x" }, token: owner });
  assert.equal(ownerWrite.status, 400, "owner reaches validation");

  const ownerHome = await api(running.base, "/api/home", { token: owner });
  const otherHome = await api(running.base, "/api/home", { token: other });
  assert.equal(ownerHome.body.studio, true);
  assert.equal("studio" in otherHome.body, false);
  const ownerBoot = await api(running.base, "/api/bootstrap", { token: owner });
  const otherBoot = await api(running.base, "/api/bootstrap", { token: other });
  assert.equal(ownerBoot.body.studioContent?.studioEnabled, true);
  assert.equal(otherBoot.body.studioContent, null);
});

test("studio allowlist: on production the secret alone no longer opens Studio", async (t) => {
  const { running, other } = await withOwner(t, { studioSecret: "prod-secret", studioSecretEnabled: false });
  for (const [method, route, body] of STUDIO_READS) {
    assert.equal((await api(running.base, route, { method, body, studio: "prod-secret" })).status, 404, `${route} secret only`);
    assert.equal((await api(running.base, route, { method, body, studio: "prod-secret", token: other })).status, 404, `${route} secret + other`);
  }
  assert.equal(studioSecretPathEnabled({ NODE_ENV: "production" }), false);
  assert.equal(studioSecretPathEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
  assert.equal(studioSecretPathEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(studioSecretPathEnabled({ NODE_ENV: "test" }), true);
});

test("studio allowlist: outside production the secret still works for local tooling", async (t) => {
  const { running } = await withOwner(t, { studioSecret: "dev-secret", studioSecretEnabled: true });
  assert.equal((await api(running.base, "/api/studio/content", { studio: "dev-secret" })).status, 200);
  assert.equal((await api(running.base, "/api/studio/content", { studio: "wrong" })).status, 404);
});

test("studio allowlist: an allowlisted id that is not a live session is refused", async (t) => {
  const ghost = "00000000-0000-4000-8000-000000000000";
  const { running } = await withOwner(t, { studioUserIds: [ghost], studioSecretEnabled: false });
  assert.equal((await api(running.base, "/api/studio/content", { token: ghost })).status, 404);
});

test("studio allowlist parsing: default, raw ids, and sha256 digests", () => {
  assert.deepEqual(parseStudioUserIds(undefined), [...DEFAULT_STUDIO_USER_HASHES]);
  assert.deepEqual(parseStudioUserIds("  "), [...DEFAULT_STUDIO_USER_HASHES]);
  const raw = "11111111-2222-4333-8444-555555555555";
  const digest = studioIdentityHash(raw);
  assert.deepEqual(parseStudioUserIds(`${raw}, sha256:${"a".repeat(64)}`), [digest, "a".repeat(64)]);
  assert.equal(studioUserAllowed(raw, parseStudioUserIds(`sha256:${digest}`)), true);
  assert.equal(studioUserAllowed(raw.toUpperCase(), [digest]), true);
  assert.equal(studioUserAllowed("someone-else", [digest]), false);
  assert.equal(studioUserAllowed(null, [digest]), false);
  assert.equal(DEFAULT_STUDIO_USER_HASHES.length, 1);
  assert.match(DEFAULT_STUDIO_USER_HASHES[0], /^[0-9a-f]{64}$/);
});

test("studio debug pull: an optional cardId pulls exactly that catalog card and saves nothing", async (t) => {
  const { running, owner, other } = await withOwner(t, { studioSecretEnabled: false });
  const catalog = (await api(running.base, "/api/catalog")).body.cards;
  const chosen = catalog.find((card) => card.releaseSetId === "set-6") || catalog.at(-1);
  const stateBefore = await api(running.base, "/api/state", { token: owner });

  const pulled = await api(running.base, "/api/studio/debug-pull", {
    method: "POST",
    body: { rarity: 1, cardId: chosen.id },
    token: owner,
  });
  assert.equal(pulled.status, 200);
  assert.equal(pulled.body.mode, "studio-debug");
  assert.equal(pulled.body.debug, true);
  assert.equal(pulled.body.cardId, chosen.id);
  assert.equal(pulled.body.cards.length, 1);
  const [instance] = pulled.body.cards;
  assert.equal(instance.cardId, chosen.id, "rarity is ignored when a card is chosen");
  assert.equal(instance.acquiredBy, "studio-debug");
  assert.equal(instance.isNew, false);
  assert.equal(instance.seenAt, null);
  assert.match(instance.instanceId, /^studio-debug-/);

  for (const card of catalog.slice(0, 5)) {
    const each = await api(running.base, "/api/studio/debug-pull", { method: "POST", body: { cardId: card.id }, token: owner });
    assert.equal(each.status, 200, card.id);
    assert.equal(each.body.cards[0].cardId, card.id);
  }

  const unknown = await api(running.base, "/api/studio/debug-pull", { method: "POST", body: { cardId: "NOPE-404" }, token: owner });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, "UNKNOWN_CARD");

  for (const token of [other, undefined]) {
    const denied = await api(running.base, "/api/studio/debug-pull", { method: "POST", body: { cardId: chosen.id }, token });
    assert.equal(denied.status, 404, token ? "non-allowlisted" : "anonymous");
  }

  const random = await api(running.base, "/api/studio/debug-pull", { method: "POST", body: { rarity: 2 }, token: owner });
  assert.equal(random.status, 200, "no cardId keeps the rarity pull");
  assert.equal(random.body.rarity, 2);
  assert.equal("cardId" in random.body, false);
  assert.equal(random.body.cards[0].finish, "Uncommon");
  const blank = await api(running.base, "/api/studio/debug-pull", { method: "POST", body: { rarity: 3, cardId: "" }, token: owner });
  assert.equal(blank.status, 200, "an empty cardId falls back to the rarity pull");
  assert.equal(blank.body.cards[0].finish, "Rare");

  const stateAfter = await api(running.base, "/api/state", { token: owner });
  assert.deepEqual(stateAfter.body.inventory, stateBefore.body.inventory, "inventory unchanged");
  assert.deepEqual(stateAfter.body, stateBefore.body, "player state untouched");
  assert.ok(!stateAfter.body.instances?.some(({ acquiredBy }) => acquiredBy === "studio-debug"));
});
