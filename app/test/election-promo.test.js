import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cardFrameFor, presentCard, rarityMark, rarityNameHe } from "../public/card-face.js";
import { collectionStarsFrom } from "../public/regular-copies.js";
import { createKalpiApp } from "../server/app.js";
import { collectionStars } from "../server/stars.js";
import { generateIdlePull, generatePack } from "../server/pack-engine.js";
import { jerusalemDay } from "../server/numbered.js";
import { expandPublicCatalog, catalogExtrasFromStudio } from "../server/public-catalog.js";
import { DATE_PRIZES, publicStreakCalendar } from "../server/streak-calendar.js";
import { JsonStore } from "../server/store.js";
import { LIVE_RELEASE_SET_IDS } from "../server/visible-sets.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const PROMO_ID = "PROMO-ELECTION-0629-01";

function jerusalemNoon(iso) {
  for (const offset of ["+02:00", "+03:00"]) {
    const ms = Date.parse(`${iso}T12:00:00${offset}`);
    if (jerusalemDay(ms) === iso) return ms;
  }
  throw new Error(`no Jerusalem noon for ${iso}`);
}

function seeded(seed) {
  let state = seed >>> 0;
  return (max = 1) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * max);
  };
}

const promoCard = {
  id: PROMO_ID,
  set: "special-promo",
  setName: "אסים",
  setNameHe: "אסים",
  title: "בנימין נתניהו",
  titleHe: "בנימין נתניהו",
  subtitle: "",
  subtitleHe: "",
  type: "Promo",
  typeHe: "פרומו",
  rarity: "Promotion",
  pip: "#c4a35a",
  letters: "אס",
  displayCode: "אס-01",
  artKey: "hero-art-bibi-election-0629.jpg",
  walkout: {
    kind: "promo",
    text: "",
    speaker: "בנימין נתניהו",
    date: "2026-10-27",
    quoteStatus: "none",
    sourceUrl: "",
    sourceLabel: "",
  },
  eventOnly: true,
  packEligible: false,
  idleEligible: false,
  releaseSetId: "special-events",
  fullartFrame: true,
};

const promoInstance = { numberedIndex: 7, numberedOf: 10, finish: "Holo", forcedStamp: { index: 7, of: 10 } };

test("Promotion reads as five stars and פרומו, including the election card face", () => {
  assert.equal(rarityMark("Promotion"), "★★★★★");
  assert.equal(rarityNameHe("Promotion"), "פרומו");
  assert.equal(rarityMark("Rare"), "★★★");
  assert.equal(rarityNameHe("ממוספר"), "ממוספר");

  const face = presentCard(promoCard, promoInstance, {
    title: "בנימין נתניהו",
    setName: "אסים",
    code: "אס-01",
  });
  assert.equal(face.rarityMark, "★★★★★");
  assert.equal(face.rarityName, "פרומו");
  assert.match(face.finishClass, /\bholo\b/);
  assert.match(face.finishClass, /\bnumbered\b/);
  assert.equal(face.numberedTag, "7/10");
  assert.equal(face.quote, "");
  assert.equal(face.rawQuote, "");
  assert.equal(face.partyLabel, "אסים");
  assert.equal(face.partyLabel.includes("·"), false);
  assert.equal(face.partyLabel.includes("אס-"), false);
  assert.equal(face.frame, "fullart-v1");
  assert.equal(cardFrameFor(promoCard, LIVE_RELEASE_SET_IDS), "fullart-v1");
  assert.equal(cardFrameFor({ releaseSetId: "special-events" }, LIVE_RELEASE_SET_IDS), "tall-v2");

  const numberedRare = presentCard(
    { rarity: "Rare", type: "Quote", walkout: { text: "שלום", quoteStatus: "exact" } },
    { numberedIndex: 2, numberedOf: 10 },
    { title: "אחר", setName: "ליכוד", code: "מחל-01" },
  );
  assert.equal(numberedRare.rarityName, "ממוספר");
  assert.equal(numberedRare.rarityMark, "★★★★");
});

test("the built catalog card is the fixed election promo and stays out of ordinary pulls", async () => {
  const [cards, specials, studio, set5, set6, set7, set8, catalog] = await Promise.all([
    readFile(path.join(appRoot, "data/cards.json"), "utf8").then(JSON.parse),
    readFile(path.join(appRoot, "data/specials-content.json"), "utf8").then(JSON.parse),
    readFile(path.join(appRoot, "data/studio-content.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, "docs/intake/research/set5-wip-pool.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, "docs/intake/research/set6-wip-pool.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, "docs/intake/research/set7-wip-pool.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, "docs/intake/research/set8-wip-pool.json"), "utf8").then(JSON.parse),
    readFile(path.join(appRoot, "public/catalog.json"), "utf8").then(JSON.parse),
  ]);
  const extras = catalogExtrasFromStudio(studio, set5, set6, set7, set8);
  const expanded = expandPublicCatalog(cards, specials, extras);
  const built = expanded.find((card) => card.id === PROMO_ID);
  assert.ok(built);
  assert.equal(built.setNameHe, "אסים");
  assert.equal(built.letters, "אס");
  assert.equal(built.displayCode, "אס-01");
  assert.equal(built.walkout.kind, "promo");
  assert.equal(built.walkout.text, "");
  assert.equal(built.walkout.quoteStatus, "none");
  assert.equal(built.walkout.sourceUrl, "");
  assert.equal(built.fullartFrame, true);
  assert.equal(built.eventOnly, true);
  assert.equal(built.packEligible, false);
  assert.equal(built.idleEligible, false);
  assert.equal(built.releaseSetId, "special-events");
  assert.equal(catalog.cards.some((card) => card.id === PROMO_ID), true);
  assert.equal(catalog.allCards.some((card) => card.id === PROMO_ID), true);

  const idle = expanded.filter((card) => !card.eventOnly && card.idleEligible === true);
  assert.equal(idle.some((card) => card.id === PROMO_ID), false);
  const pack = studio.gameConfig.pack;
  const releaseSets = studio.gameConfig.releaseSets;
  for (let index = 0; index < 400; index += 1) {
    const pull = generateIdlePull({
      cards: [...idle, built],
      inventory: {},
      pack,
      releaseSets,
      now: jerusalemNoon("2026-10-20"),
      rng: seeded(index + 1),
    });
    assert.notEqual(pull.cardId, PROMO_ID);
  }
  for (let index = 0; index < 80; index += 1) {
    const pulls = generatePack({
      cards: [...cards, built],
      inventory: {},
      dryPacks: 0,
      packCount: index,
      rng: seeded(1000 + index),
    });
    assert.equal(pulls.some((pull) => pull.cardId === PROMO_ID), false);
  }
  const otherDates = Object.entries(DATE_PRIZES).filter(([date]) => date !== "2026-10-27");
  assert.equal(otherDates.some(([, reward]) => reward.cardId === PROMO_ID), false);
});

test("a numbered promo counts as five collection stars", () => {
  const cards = new Map([[PROMO_ID, promoCard]]);
  const numbered = [{ cardId: PROMO_ID, numberedIndex: 7, numberedOf: 10 }];
  assert.equal(collectionStars({ [PROMO_ID]: 1 }, cards, { [PROMO_ID]: 1 }), 5);
  assert.equal(collectionStarsFrom({ [PROMO_ID]: 1 }, numbered, cards), 5);
});

test("public election cell omits the stamp", () => {
  const calendar = publicStreakCalendar({
    visitDay: "2026-10-26",
    visitDates: ["2026-10-26"],
    visitStreak: 2,
  });
  const cell = calendar.days.find((item) => item.date === "2026-10-27");
  assert.equal(cell.election, true);
  assert.equal(cell.previewOpen, false);
  assert.deepEqual(cell.reward, {
    kind: "pack",
    label: "יום",
    sublabel: "הבחירות",
    cardId: PROMO_ID,
  });
});

async function start(dataDir, clock, { electionPreview = false } = {}) {
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
    electionPreview,
    now: () => clock.value,
    numberedRandom: () => 0,
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
  return { status: response.status, body: await response.json() };
}

test("election day grants one 7/10 promo to every player and refuses every other day", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-election-promo-"));
  const clock = { value: jerusalemNoon("2026-10-26") };
  const calls = [];
  const original = JsonStore.prototype.claimNumberedStamp;
  JsonStore.prototype.claimNumberedStamp = async function claimNumberedStamp(key, ...args) {
    calls.push(key);
    return original.call(this, key, ...args);
  };
  const running = await start(dataDir, clock);
  t.after(async () => {
    JsonStore.prototype.claimNumberedStamp = original;
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const early = await api(running.base, "/api/home");
  const earlyOpen = await api(running.base, "/api/streak/open", {
    token: early.body.token,
    method: "POST",
    body: { date: "2026-10-27" },
  });
  assert.equal(earlyOpen.body.already, true);
  assert.equal(earlyOpen.body.state.inventory[PROMO_ID], undefined);

  clock.value = jerusalemNoon("2026-10-27");
  const first = await api(running.base, "/api/home");
  const second = await api(running.base, "/api/home");
  assert.notEqual(first.body.token, second.body.token);
  const before = calls.length;

  async function openOnce(token) {
    return api(running.base, "/api/streak/open", {
      token,
      method: "POST",
      body: { date: "2026-10-27" },
    });
  }

  const opened = await openOnce(first.body.token);
  const again = await openOnce(second.body.token);
  for (const result of [opened, again]) {
    assert.equal(result.status, 200);
    assert.equal(result.body.mode, "streak-pack");
    assert.equal(result.body.cards.length, 1);
    const card = result.body.cards[0];
    assert.equal(card.cardId, PROMO_ID);
    assert.equal(card.numberedIndex, 7);
    assert.equal(card.numberedOf, 10);
    assert.equal(card.finish, "Holo");
    assert.equal(result.body.state.inventory[PROMO_ID], 1);
    const cell = result.body.state.streakCalendar.days.find((item) => item.date === "2026-10-27");
    assert.equal(cell.claimed, true);
    assert.equal(cell.opened, true);
  }
  const repeat = await openOnce(first.body.token);
  assert.equal(repeat.body.already, true);
  assert.equal(repeat.body.state.inventory[PROMO_ID], 1);
  assert.equal(calls.slice(before).includes(PROMO_ID), false);

  const stored = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  assert.equal(stored.sessions[first.body.token].visitDateClaims.includes("2026-10-27"), true);
  assert.equal(stored.sessions[second.body.token].visitDateClaims.includes("2026-10-27"), true);
  assert.equal(Object.hasOwn(stored.numberedIssued || {}, PROMO_ID), false);

  const recycle = await api(running.base, "/api/recycle", {
    token: first.body.token,
    method: "POST",
    body: { cardId: PROMO_ID },
  });
  assert.equal(recycle.status, 409);
  assert.equal(recycle.body.error, "PROMO_NOT_RECYCLABLE");
  const afterRecycle = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  assert.equal(Object.hasOwn(afterRecycle.numberedIssued || {}, PROMO_ID), false);
  assert.equal(afterRecycle.sessions[first.body.token].inventory[PROMO_ID], 1);

  clock.value = jerusalemNoon("2026-10-28");
  const late = await openOnce(first.body.token);
  assert.equal(late.body.already, true);
  const nextMorning = await api(running.base, "/api/home", { token: first.body.token });
  assert.equal(nextMorning.body.state.inventory[PROMO_ID], 1);
  assert.equal(nextMorning.body.state.streakCalendar.today, "2026-10-28");
  const still = await openOnce(first.body.token);
  assert.equal(still.body.already, true);

  clock.value = jerusalemNoon("2026-10-01");
  const other = await api(running.base, "/api/home");
  const otherOpen = await api(running.base, "/api/streak/open", {
    token: other.body.token,
    method: "POST",
    body: { date: "2026-10-01" },
  });
  assert.equal(otherOpen.body.mode, "streak-card");
  assert.notEqual(otherOpen.body.cards[0].cardId, PROMO_ID);
});

test("localhost can open the election cell before election day, once", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-election-preview-"));
  const clock = { value: jerusalemNoon("2026-10-25") };
  const running = await start(dataDir, clock, { electionPreview: true });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const home = await api(running.base, "/api/home");
  const cell = home.body.state.streakCalendar.days.find((item) => item.date === "2026-10-27");
  assert.equal(cell.previewOpen, true);
  assert.equal(cell.current, false);
  const opened = await api(running.base, "/api/streak/open", {
    token: home.body.token,
    method: "POST",
    body: { date: "2026-10-27" },
  });
  assert.equal(opened.body.mode, "streak-pack");
  assert.equal(opened.body.cards.length, 1);
  assert.equal(opened.body.cards[0].cardId, PROMO_ID);
  assert.equal(opened.body.cards[0].numberedIndex, 7);
  assert.equal(opened.body.cards[0].numberedOf, 10);
  assert.equal(opened.body.state.inventory[PROMO_ID], 1);
  assert.equal(opened.body.state.starCount, 5);
  const again = await api(running.base, "/api/streak/open", {
    token: home.body.token,
    method: "POST",
    body: { date: "2026-10-27" },
  });
  assert.equal(again.body.already, true);
  assert.equal(again.body.state.inventory[PROMO_ID], 1);
  const after = again.body.state.streakCalendar.days.find((item) => item.date === "2026-10-27");
  assert.equal(after.previewOpen, false);
  assert.equal(after.claimed, true);
});
