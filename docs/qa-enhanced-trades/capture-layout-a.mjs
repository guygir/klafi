import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = process.env.QA_BASE || "http://127.0.0.1:8799";
const out = "/opt/cursor/artifacts/layout-a";
await mkdir(out, { recursive: true });

const FORMATIONS = [
  { key: "1-1", offeredMode: "and", wantedMode: "and", offeredCount: 1, wantedCount: 1 },
  { key: "and-and", offeredMode: "and", wantedMode: "and", offeredCount: 2, wantedCount: 2 },
  { key: "and-or", offeredMode: "and", wantedMode: "or", offeredCount: 2, wantedCount: 2 },
  { key: "or-and", offeredMode: "or", wantedMode: "and", offeredCount: 2, wantedCount: 2 },
  { key: "or-or", offeredMode: "or", wantedMode: "or", offeredCount: 2, wantedCount: 2 },
];

async function api(route, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function unlock(token, ids) {
  for (const cardId of ids) {
    const result = await api("/api/debug/unlock-card", { token, method: "POST", body: { cardId } });
    if (result.status !== 200) throw new Error(`unlock ${cardId} ${result.status} ${JSON.stringify(result.body)}`);
  }
}

async function dismissChrome(page) {
  await page.evaluate(() => {
    document.querySelector("#claim-level")?.click();
    document.querySelector("#klafi-tips-skip")?.click();
    const tips = document.querySelector("#klafi-tips");
    if (tips) {
      tips.hidden = true;
      tips.setAttribute("aria-hidden", "true");
    }
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      if (dialog.id === "card-dialog") continue;
      dialog.close();
    }
  });
}

async function prepPage(page, token) {
  await page.evaluate((sessionToken) => {
    localStorage.setItem("kalpi-alpha-session", sessionToken);
    localStorage.setItem("klafi:tips", "off");
    localStorage.setItem("klafi:page-tips", JSON.stringify({
      growth: true, trade: true, "open-trades": true, binder: true, home: true,
      card: true, dialog: true, pack: true, achievements: true,
    }));
    localStorage.setItem("kalpi-trade-chrome", "0");
  }, token);
  await page.reload({ waitUntil: "networkidle" });
  await dismissChrome(page);
}

async function showOffer(page, tradeId) {
  for (let step = 0; step < 8; step += 1) {
    const offer = page.locator(`article.trade-offer[data-trade-id="${tradeId}"]`);
    if (await offer.count()) {
      await offer.scrollIntoViewIfNeeded();
      return offer;
    }
    const next = page.locator('[data-page-target="trades"]:not([disabled])').last();
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(250);
  }
  throw new Error(`offer ${tradeId} not listed`);
}

async function openBoard(page) {
  await page.evaluate(() => {
    document.querySelector('[data-nav="growth"]')?.click();
    document.querySelector("#community-tab-open-trades")?.click();
  });
  await page.waitForTimeout(400);
  await dismissChrome(page);
  const toggle = page.locator("#trade-board-chrome-toggle");
  if (await toggle.isVisible()) {
    const expanded = await toggle.getAttribute("aria-expanded");
    if (expanded === "true") await toggle.click();
  }
}

async function closeCardDialog(page) {
  await page.evaluate(() => {
    const tips = document.querySelector("#klafi-tips");
    if (tips) {
      tips.hidden = true;
      tips.setAttribute("aria-hidden", "true");
    }
    const dialog = document.querySelector("#card-dialog");
    if (dialog?.open) dialog.close();
  });
  await page.locator("#card-dialog:not([open])").waitFor({ state: "attached", timeout: 3000 });
}

async function shot(page, name) {
  const dest = path.join(out, `${name}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(dest);
}

const catalog = (await api("/api/catalog")).body.cards
  .filter((card) => !card.eventOnly && card.releaseSetId === "party-leaders");
if (catalog.length < 12) throw new Error("need party-leaders catalog");

const cleaner = (await api("/api/session", { method: "POST" })).body.token;
await api("/api/debug/clear-open-trades", { token: cleaner, method: "POST" });

const browser = await chromium.launch({ channel: "chrome" });

async function seedTrade(formation, offered, wanted) {
  const owner = (await api("/api/session", { method: "POST" })).body.token;
  const accepter = (await api("/api/session", { method: "POST" })).body.token;
  await unlock(owner, offered.map((card) => card.id));
  await unlock(accepter, wanted.map((card) => card.id));
  const created = await api("/api/trades", {
    token: owner,
    method: "POST",
    body: {
      offered: { mode: formation.offeredMode, cardIds: offered.map((card) => card.id) },
      wanted: { mode: formation.wantedMode, cardIds: wanted.map((card) => card.id) },
    },
  });
  if (created.status !== 201) {
    throw new Error(`create ${formation.key} ${created.status} ${JSON.stringify(created.body)}`);
  }
  return { owner, accepter, trade: created.body.trade, offered, wanted };
}

const boardOwners = [];
const boardAccepter = (await api("/api/session", { method: "POST" })).body.token;
const boardCases = [
  { key: "1-1", offeredMode: "and", wantedMode: "and", offered: catalog.slice(0, 1), wanted: catalog.slice(6, 7) },
  { key: "2-2", offeredMode: "and", wantedMode: "and", offered: catalog.slice(1, 3), wanted: catalog.slice(7, 9) },
  { key: "3-3", offeredMode: "and", wantedMode: "and", offered: catalog.slice(3, 6), wanted: catalog.slice(9, 12) },
  { key: "1-3-or", offeredMode: "and", wantedMode: "or", offered: catalog.slice(0, 1), wanted: catalog.slice(6, 9) },
];
for (const row of boardCases) {
  const owner = (await api("/api/session", { method: "POST" })).body.token;
  await unlock(owner, row.offered.map((card) => card.id));
  await unlock(boardAccepter, row.wanted.map((card) => card.id));
  const created = await api("/api/trades", {
    token: owner,
    method: "POST",
    body: {
      offered: { mode: row.offeredMode, cardIds: row.offered.map((card) => card.id) },
      wanted: { mode: row.wantedMode, cardIds: row.wanted.map((card) => card.id) },
    },
  });
  if (created.status !== 201) throw new Error(`board seed ${row.key} ${created.status} ${JSON.stringify(created.body)}`);
  boardOwners.push({ ...row, trade: created.body.trade });
}

for (const vp of [
  { w: 375, h: 635, tag: "375x635" },
  { w: 390, h: 664, tag: "390x664" },
  { w: 320, h: 635, tag: "320" },
]) {
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: "he-IL", deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${base}/?view=growth&tab=open-trades`);
  await prepPage(page, boardAccepter);
  await openBoard(page);
  await page.locator("article.trade-offer").first().waitFor({ state: "visible" });
  await shot(page, `board-${vp.tag}`);
  await context.close();
}

const highlight = boardOwners.find((row) => row.key === "1-3-or");
{
  const context = await browser.newContext({ viewport: { width: 375, height: 635 }, locale: "he-IL", deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${base}/?view=growth&tab=open-trades`);
  await prepPage(page, boardAccepter);
  await openBoard(page);
  const offer = await showOffer(page, highlight.trade.tradeId);
  const accept = offer.locator("[data-accept-trade]");
  if (!(await accept.isDisabled())) throw new Error("OR accept should start disabled");
  await page.evaluate((tradeId) => {
    const row = document.querySelector(`article.trade-offer[data-trade-id="${tradeId}"]`);
    row?.querySelectorAll('[data-trade-pick="wanted"]')[1]?.click();
  }, highlight.trade.tradeId);
  await page.locator("#card-dialog").waitFor({ state: "visible" });
  await shot(page, "popup-open");
  await closeCardDialog(page);
  await page.locator(`article.trade-offer[data-trade-id="${highlight.trade.tradeId}"] .trade-thumb.is-picked`).waitFor({ state: "visible" });
  await shot(page, "or-highlight");
  if (await accept.isDisabled()) throw new Error("OR accept stayed disabled after highlight");
  await closeCardDialog(page);
  await page.evaluate((id) => document.querySelector(`[data-accept-trade="${id}"]`)?.click(), highlight.trade.tradeId);
  await page.waitForTimeout(400);
  const notice = page.locator("#trade-notice-dialog");
  try { await notice.waitFor({ state: "visible", timeout: 2500 }); } catch { /* notice may already have closed */ }
  await shot(page, "post-accept");
  const listed = await api("/api/trades", { token: boardAccepter });
  const row = (listed.body.trades || []).find((trade) => trade.tradeId === highlight.trade.tradeId);
  if (row?.status !== "accepted") throw new Error(`board OR accept failed: ${JSON.stringify(row)}`);
  await context.close();
}

for (const formation of FORMATIONS) {
  const offered = catalog.slice(0, formation.offeredCount);
  const wanted = catalog.slice(6, 6 + formation.wantedCount);
  const seeded = await seedTrade(formation, offered, wanted);
  const context = await browser.newContext({ viewport: { width: 375, height: 635 }, locale: "he-IL", deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${base}/?view=growth&tab=open-trades`);
  await prepPage(page, seeded.accepter);
  await openBoard(page);
  const offer = await showOffer(page, seeded.trade.tradeId);

  const andCard = offer.locator("[data-trade-choice-card]:not([data-trade-pick]):not(.is-concealed)").first();
  if (await andCard.count()) {
    await page.evaluate((tradeId) => {
      document.querySelector(`article.trade-offer[data-trade-id="${tradeId}"] [data-trade-choice-card]:not([data-trade-pick]):not(.is-concealed)`)?.click();
    }, seeded.trade.tradeId);
    await page.locator("#card-dialog").waitFor({ state: "visible" });
    if (await offer.locator(".trade-thumb.is-picked").count()) {
      throw new Error(`${formation.key}: AND tap highlighted`);
    }
    await closeCardDialog(page);
  }

  const needsOr = formation.offeredMode === "or" || formation.wantedMode === "or";
  if (needsOr) {
    const accept = offer.locator("[data-accept-trade]");
    if (!(await accept.isDisabled())) throw new Error(`${formation.key}: accept enabled before OR pick`);
    if (formation.offeredMode === "or") {
      await page.evaluate((tradeId) => {
        document.querySelector(`article.trade-offer[data-trade-id="${tradeId}"] [data-trade-pick="offered"]`)?.click();
      }, seeded.trade.tradeId);
      await page.locator("#card-dialog").waitFor({ state: "visible" });
      await closeCardDialog(page);
    }
    if (formation.wantedMode === "or") {
      await page.evaluate((tradeId) => {
        document.querySelector(`article.trade-offer[data-trade-id="${tradeId}"] [data-trade-pick="wanted"]`)?.click();
      }, seeded.trade.tradeId);
      await page.locator("#card-dialog").waitFor({ state: "visible" });
      await closeCardDialog(page);
    }
    await offer.locator(".trade-thumb.is-picked").first().waitFor({ state: "visible" });
    if (await accept.isDisabled()) throw new Error(`${formation.key}: accept disabled after OR highlight`);
    await shot(page, `qa-${formation.key}-highlight`);
  }

  await closeCardDialog(page);
  await page.evaluate((id) => document.querySelector(`[data-accept-trade="${id}"]`)?.click(), seeded.trade.tradeId);
  await page.waitForTimeout(800);
  const listed = await api("/api/trades", { token: seeded.accepter });
  const row = (listed.body.trades || []).find((trade) => trade.tradeId === seeded.trade.tradeId);
  if (row?.status !== "accepted") {
    throw new Error(`accept ${formation.key} failed: ${JSON.stringify(row)}`);
  }
  console.log("accepted", formation.key);
  await context.close();
}

await browser.close();
console.log("layout-a screenshots in", out);
