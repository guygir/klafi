import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "../server/app.js";
import { collectionStarCount } from "../server/achievements.js";
import { referralStarGate } from "../server/referral.js";
import { collectionStarCount as indexStarCount } from "../server/visible-sets.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

function marker(code) {
  return `referral-${code}`;
}

function referralPacks(state, code) {
  return (state.instances || []).filter((item) => item.acquiredBy === marker(code));
}

async function start(dataDir, clock, studioContentPath = path.join(appRoot, "data/studio-content.json"), databaseUrl = null) {
  const handler = await createKalpiApp({
    dataDir,
    publicDir: path.join(appRoot, "public"),
    cardsPath: path.join(appRoot, "data/cards.json"),
    advocacyPath: path.join(appRoot, "data/advocacy.json"),
    sourcesPath: path.join(appRoot, "data/sources.json"),
    sequencesPath: path.join(appRoot, "data/editorial-sequences.json"),
    samplesPath: path.join(appRoot, "data/editorial-samples.json"),
    demoPackPath: path.join(appRoot, "data/demo-pack.json"),
    studioContentPath,
    specialsPath: path.join(appRoot, "data/specials-content.json"),
    presentationContentPath: path.join(appRoot, "data/presentation-content.json"),
    eventsPath: path.join(appRoot, "data/events.json"),
    achievementsPath: path.join(appRoot, "data/achievements.json"),
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled: true,
    quizEnabled: false,
    databaseUrl,
    studioSecret: null,
    now: () => clock.value,
    numberedRandom: () => 0.99,
    rng: () => 0,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
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
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

test("a numbered copy is worth four stars, and a plain copy of the same card still counts once", () => {
  const cards = [{ id: "rare-card", rarity: "Rare" }];
  const numberedOnly = {
    inventory: { "rare-card": 1 },
    instances: [{ instanceId: "n", cardId: "rare-card", numberedIndex: 4 }],
    unseenPulls: [],
  };
  const both = {
    inventory: { "rare-card": 2 },
    instances: [
      { instanceId: "n", cardId: "rare-card", numberedIndex: 4 },
      { instanceId: "p", cardId: "rare-card" },
    ],
    unseenPulls: [],
  };
  const twoNumbered = {
    inventory: { "rare-card": 2 },
    instances: [
      { instanceId: "n1", cardId: "rare-card", numberedIndex: 4 },
      { instanceId: "n2", cardId: "rare-card", numberedIndex: 5 },
    ],
    unseenPulls: [],
  };
  const twoPlain = {
    inventory: { "rare-card": 2 },
    instances: [
      { instanceId: "p1", cardId: "rare-card" },
      { instanceId: "p2", cardId: "rare-card" },
    ],
    unseenPulls: [],
  };
  const waiting = {
    inventory: {},
    instances: [{ instanceId: "n", cardId: "rare-card", numberedIndex: 4 }],
    unseenPulls: ["n"],
  };
  assert.equal(collectionStarCount(numberedOnly, cards), 4);
  assert.equal(collectionStarCount(both, cards), 7);
  assert.equal(collectionStarCount(twoNumbered, cards), 4);
  assert.equal(collectionStarCount(twoPlain, cards), 3);
  assert.equal(collectionStarCount(waiting, cards), 0);
  assert.equal(indexStarCount({ "rare-card": 2 }, cards, { "rare-card": 1 }), 7);
  assert.equal(referralStarGate({}), 15);
  assert.equal(referralStarGate({ referral: { stars: 15 } }), 15);
  assert.equal(referralStarGate({ referral: { stars: 2 } }), 2);
});

test("referral pack is paid once to the inviter at 15 collection stars", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-referral-"));
  const clock = { value: Date.parse("2026-10-04T12:00:00+03:00") };
  const running = await start(dataDir, clock);
  try {
    const config = await api(running.base, "/api/game-config");
    assert.equal(config.body.referral.stars, 15);

    const inviter = await api(running.base, "/api/session", { method: "POST", body: {} });
    const inviterState = await api(running.base, "/api/state", { token: inviter.body.token });
    const code = inviterState.body.referralCode;
    assert.match(code, /^[A-Z0-9]{8}$/);
    assert.equal(inviterState.body.invitedBy, undefined);

    const created = await api(running.base, `/api/home?invite=${code}`);
    const inviteeToken = created.body.token;
    assert.notEqual(inviteeToken, inviter.body.token);
    assert.equal(created.body.state.starCount, 0);
    assert.equal(created.body.state.invitedBy, undefined);
    assert.equal(referralPacks(inviterState.body, created.body.state.referralCode).length, 0);

    const catalog = await api(running.base, "/api/catalog");
    const cards = catalog.body.cards;

    const settled = await api(running.base, "/api/idle/settle", { token: inviteeToken, method: "POST" });
    assert.ok(settled.body.cards.length > 0);
    const warehoused = await api(running.base, "/api/state", { token: inviteeToken });
    assert.equal(warehoused.body.starCount, 0);
    let inviterNow = await api(running.base, "/api/state", { token: inviter.body.token });
    assert.equal(referralPacks(inviterNow.body, warehoused.body.referralCode).length, 0);

    const seen = await api(running.base, "/api/idle/seen", {
      token: inviteeToken,
      method: "POST",
      body: { instanceIds: settled.body.cards.map((card) => card.instanceId) },
    });
    assert.ok(seen.body.starCount > 0);
    assert.ok(seen.body.starCount < 15);
    inviterNow = await api(running.base, "/api/state", { token: inviter.body.token });
    assert.equal(referralPacks(inviterNow.body, seen.body.referralCode).length, 0);
    const tooSoon = await api(running.base, "/api/referrals/claim", {
      token: inviter.body.token,
      method: "POST",
      body: { code: seen.body.referralCode },
    });
    assert.equal(tooSoon.status, 409);
    assert.equal(tooSoon.body.error, "REFERRAL_NOT_READY");

    const opened = await api(running.base, "/api/events", {
      token: inviteeToken,
      method: "POST",
      body: { type: "referral_opened", referralCode: code },
    });
    assert.equal(opened.status, 201);
    const invented = await api(running.base, "/api/events", {
      token: inviteeToken,
      method: "POST",
      body: { type: "referral_prize", referralCode: code },
    });
    assert.equal(invented.status, 400);
    const debugPull = await api(running.base, "/api/studio/debug-pull", {
      method: "POST",
      body: { rarity: 3 },
    });
    assert.equal(debugPull.status, 200);
    const afterNoise = await api(running.base, "/api/state", { token: inviteeToken });
    assert.equal(afterNoise.body.starCount, seen.body.starCount);
    inviterNow = await api(running.base, "/api/state", { token: inviter.body.token });
    assert.equal(referralPacks(inviterNow.body, afterNoise.body.referralCode).length, 0);

    let state = afterNoise.body;
    const owned = new Set(Object.keys(state.inventory || {}));
    for (const card of cards) {
      if (state.starCount >= 15) break;
      if (owned.has(card.id)) continue;
      const unlocked = await api(running.base, "/api/debug/unlock-card", {
        token: inviteeToken,
        method: "POST",
        body: { cardId: card.id },
      });
      assert.equal(unlocked.status, 200);
      owned.add(card.id);
      if (unlocked.body.starCount < 15) {
        inviterNow = await api(running.base, "/api/state", { token: inviter.body.token });
        assert.equal(referralPacks(inviterNow.body, state.referralCode).length, 0);
      }
      state = unlocked.body;
    }
    assert.ok(state.starCount >= 15);
    const list = await api(running.base, "/api/referrals", { token: inviter.body.token });
    assert.equal(list.status, 200);
    assert.equal(JSON.stringify(list.body).includes(inviteeToken), false);
    const ready = list.body.referrals.find((item) => item.code === state.referralCode);
    assert.equal(ready.ready, true);
    assert.equal(ready.claimed, false);
    assert.ok(ready.stars >= 15);
    inviterNow = await api(running.base, "/api/state", { token: inviter.body.token });
    const unseenBefore = inviterNow.body.unseenCount;
    assert.equal(referralPacks(inviterNow.body, state.referralCode).length, 0);

    const claimed = await api(running.base, "/api/referrals/claim", {
      token: inviter.body.token,
      method: "POST",
      body: { code: state.referralCode },
    });
    assert.equal(claimed.status, 200);
    const paid = referralPacks(claimed.body.state, state.referralCode);
    assert.equal(paid.length, 1);
    assert.ok(paid[0].seenAt);
    assert.equal(claimed.body.state.unseenCount, unseenBefore);
    assert.equal(claimed.body.state.lastPack.mode, "referral");
    assert.equal(paid[0].cardId, claimed.body.state.lastPack.cards[0].cardId);
    const claimedRow = claimed.body.referrals.find((item) => item.code === state.referralCode);
    assert.equal(claimedRow.claimed, true);
    assert.equal(claimedRow.ready, false);
    const inviteeAfter = await api(running.base, "/api/state", { token: inviteeToken });
    assert.equal(referralPacks(inviteeAfter.body, state.referralCode).length, 0);

    const repeatClaim = await api(running.base, "/api/referrals/claim", {
      token: inviter.body.token,
      method: "POST",
      body: { code: state.referralCode },
    });
    assert.equal(repeatClaim.status, 409);
    assert.equal(repeatClaim.body.error, "REFERRAL_CLAIMED");

    const extra = cards.find((card) => !owned.has(card.id));
    const again = await api(running.base, "/api/debug/unlock-card", {
      token: inviteeToken,
      method: "POST",
      body: { cardId: extra.id },
    });
    assert.ok(again.body.starCount > 15);
    inviterNow = await api(running.base, "/api/state", { token: inviter.body.token });
    assert.equal(referralPacks(inviterNow.body, state.referralCode).length, 1);

    const stranger = await api(running.base, "/api/session", { method: "POST", body: {} });
    const stolen = await api(running.base, "/api/referrals/claim", {
      token: stranger.body.token,
      method: "POST",
      body: { code: state.referralCode },
    });
    assert.equal(stolen.status, 404);
    const late = await api(running.base, `/api/home?invite=${code}`, { token: stranger.body.token });
    assert.equal(late.body.token, stranger.body.token);
    const lateCard = cards.find((card) => card.rarity === "Rare");
    let lateState = late.body.state;
    const lateOwned = new Set(Object.keys(lateState.inventory || {}));
    for (const card of cards) {
      if (lateState.starCount >= 15) break;
      if (lateOwned.has(card.id)) continue;
      const unlocked = await api(running.base, "/api/debug/unlock-card", {
        token: stranger.body.token,
        method: "POST",
        body: { cardId: card.id },
      });
      lateOwned.add(card.id);
      lateState = unlocked.body;
    }
    assert.ok(lateState.starCount >= 15);
    const lateList = await api(running.base, "/api/referrals", { token: inviter.body.token });
    assert.equal(lateList.body.referrals.some((item) => item.code === lateState.referralCode), false);
    const lateClaim = await api(running.base, "/api/referrals/claim", {
      token: inviter.body.token,
      method: "POST",
      body: { code: lateState.referralCode },
    });
    assert.equal(lateClaim.status, 404);
    inviterNow = await api(running.base, "/api/state", { token: inviter.body.token });
    assert.equal(referralPacks(inviterNow.body, state.referralCode).length, 1);
    assert.equal(referralPacks(inviterNow.body, lateState.referralCode).length, 0);
    assert.equal(lateCard.rarity.startsWith("Rare"), true);
  } finally {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("a referral link on first entrance uses the configured star gate", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-referral-gate-"));
  const studio = JSON.parse(await readFile(path.join(appRoot, "data/studio-content.json"), "utf8"));
  studio.gameConfig.referral = { stars: 1 };
  const studioPath = path.join(dataDir, "studio.json");
  await writeFile(studioPath, JSON.stringify(studio));
  const clock = { value: Date.parse("2026-10-04T12:00:00+03:00") };
  const running = await start(dataDir, clock, studioPath);
  try {
    const inviter = await api(running.base, "/api/home");
    const code = inviter.body.state.referralCode;
    const created = await api(running.base, "/api/session", { method: "POST", body: { invite: code.toLowerCase() } });
    const before = await api(running.base, "/api/state", { token: inviter.body.token });
    assert.equal(referralPacks(before.body, (await api(running.base, "/api/state", { token: created.body.token })).body.referralCode).length, 0);
    const catalog = await api(running.base, "/api/catalog");
    const commons = catalog.body.cards.filter((item) => item.rarity === "Common");
    const card = commons[0];
    const secondCard = commons[1];
    const unlocked = await api(running.base, "/api/debug/unlock-card", {
      token: created.body.token,
      method: "POST",
      body: { cardId: card.id },
    });
    assert.equal(unlocked.body.starCount, 1);
    const invitee = await api(running.base, "/api/state", { token: created.body.token });
    const renamed = await api(running.base, "/api/profile", {
      token: created.body.token,
      method: "POST",
      body: { displayName: "נועה" },
    });
    assert.equal(renamed.status, 200);
    const named = await api(running.base, "/api/referrals", { token: inviter.body.token });
    assert.equal(named.body.referrals.find((item) => item.code === invitee.body.referralCode).name, "נועה");
    const beforeClaim = await api(running.base, "/api/state", { token: inviter.body.token });
    assert.equal(referralPacks(beforeClaim.body, invitee.body.referralCode).length, 0);
    const claimed = await api(running.base, "/api/referrals/claim", {
      token: inviter.body.token,
      method: "POST",
      body: { code: invitee.body.referralCode },
    });
    assert.equal(claimed.status, 200);
    assert.equal(referralPacks(claimed.body.state, invitee.body.referralCode).length, 1);
    assert.equal(referralPacks(invitee.body, invitee.body.referralCode).length, 0);
    const second = await api(running.base, "/api/session", {
      method: "POST",
      body: { invite: code },
    });
    const secondUnlocked = await api(running.base, "/api/debug/unlock-card", {
      token: second.body.token,
      method: "POST",
      body: { cardId: secondCard.id },
    });
    assert.equal(secondUnlocked.body.starCount, 1);
    const both = await api(running.base, "/api/referrals", { token: inviter.body.token });
    assert.equal(both.body.referrals.length, 2);
    assert.equal(both.body.referrals.find((item) => item.code === invitee.body.referralCode).claimed, true);
    const pending = both.body.referrals.find((item) => item.code === secondUnlocked.body.referralCode);
    assert.equal(pending.ready, true);
    assert.equal(pending.claimed, false);
    const repeat = await api(running.base, "/api/referrals/claim", {
      token: inviter.body.token,
      method: "POST",
      body: { code: invitee.body.referralCode },
    });
    assert.equal(repeat.status, 409);
    const still = await api(running.base, "/api/state", { token: inviter.body.token });
    assert.equal(referralPacks(still.body, invitee.body.referralCode).length, 1);
    assert.equal(referralPacks(still.body, secondUnlocked.body.referralCode).length, 0);
  } finally {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
