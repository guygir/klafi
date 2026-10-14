import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = process.env.QA_BASE || "http://127.0.0.1:8799";
const outDocs = new URL(".", import.meta.url).pathname;
const outArtifacts = "/opt/cursor/artifacts/qa-enhanced-trades";
await mkdir(outDocs, { recursive: true });
await mkdir(outArtifacts, { recursive: true });

const FORMATIONS = [
  { key: "and-and", offeredMode: "and", wantedMode: "and", offeredCount: 2, wantedCount: 2 },
  { key: "and-or", offeredMode: "and", wantedMode: "or", offeredCount: 2, wantedCount: 2 },
  { key: "or-and", offeredMode: "or", wantedMode: "and", offeredCount: 2, wantedCount: 2 },
  { key: "or-or", offeredMode: "or", wantedMode: "or", offeredCount: 2, wantedCount: 2 },
];

async function shot(page, name) {
  const docsPath = path.join(outDocs, `${name}.png`);
  const artPath = path.join(outArtifacts, `${name}.png`);
  await page.screenshot({ path: docsPath, fullPage: true });
  await page.screenshot({ path: artPath, fullPage: true });
}

async function api(route, { token, method = "GET", body } = {}) {
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

async function unlock(token, ids) {
  for (const cardId of ids) {
    await api("/api/debug/unlock-card", { token, method: "POST", body: { cardId } });
  }
}

async function prepPage(page, token, { tips = "off" } = {}) {
  await page.evaluate(({ sessionToken, tipsPref }) => {
    localStorage.setItem("kalpi-alpha-session", sessionToken);
    localStorage.setItem("klafi:tips", tipsPref);
    if (tipsPref === "off") {
      localStorage.setItem("klafi:page-tips", JSON.stringify({
        growth: true, trade: true, "open-trades": true, binder: true, home: true,
      }));
    } else {
      localStorage.removeItem("klafi:page-tips");
    }
  }, { sessionToken: token, tipsPref: tips });
  await page.reload({ waitUntil: "networkidle" });
  await dismissChrome(page);
}

async function dismissChrome(page, { keepTips = false } = {}) {
  await page.evaluate((keep) => {
    document.querySelector("#claim-level")?.click();
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      if (keep && dialog.id === "klafi-tips") continue;
      dialog.close();
    }
    if (!keep) document.querySelector("#klafi-tips-skip")?.click();
  }, keepTips);
  await page.waitForTimeout(200);
}

async function openGrowthTab(page, tab) {
  await page.evaluate((name) => {
    document.querySelector('[data-nav="growth"]')?.click();
    document.querySelector(`#community-tab-${name}`)?.click();
  }, tab);
  await page.waitForTimeout(500);
}

async function setComposeFormation(page, formation, offered, wanted) {
  await page.evaluate((spec) => {
    document.querySelector(`[data-trade-side="offered"][data-trade-mode="${spec.offeredMode}"]`)?.click();
    document.querySelector(`[data-trade-side="wanted"][data-trade-mode="${spec.wantedMode}"]`)?.click();
    const addOffered = document.querySelector("#trade-offered-add");
    const addWanted = document.querySelector("#trade-wanted-add");
    while (document.querySelectorAll('select[data-trade-slot-side="offered"]').length < spec.offeredCount) {
      addOffered?.click();
    }
    while (document.querySelectorAll('select[data-trade-slot-side="wanted"]').length < spec.wantedCount) {
      addWanted?.click();
    }
  }, formation);
  for (const [index, card] of offered.entries()) {
    await page.locator(`select[data-trade-slot-set="offered"]`).nth(index).selectOption(`release:${card.releaseSetId}`);
    await page.locator(`select[data-trade-slot-side="offered"]`).nth(index).selectOption(card.id);
  }
  for (const [index, card] of wanted.entries()) {
    await page.locator(`select[data-trade-slot-set="wanted"]`).nth(index).selectOption(`release:${card.releaseSetId}`);
    await page.locator(`select[data-trade-slot-side="wanted"]`).nth(index).selectOption(card.id);
  }
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();
const catalog = (await api("/api/catalog")).body.cards
  .filter((card) => !card.eventOnly && card.releaseSetId === "party-leaders")
  .slice(0, 14);

for (const width of [390, 320]) {
  for (const formation of FORMATIONS) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      locale: "he-IL",
    });
    const page = await context.newPage();
    const owner = (await api("/api/session", { method: "POST" })).body.token;
    const accepter = (await api("/api/session", { method: "POST" })).body.token;
    const offered = catalog.slice(0, formation.offeredCount);
    const wanted = catalog.slice(2, 2 + formation.wantedCount);
    await unlock(owner, offered.map((card) => card.id));
    await unlock(accepter, wanted.map((card) => card.id));

    await page.goto(`${base}/?view=growth&tab=trade`);
    await prepPage(page, owner);
    await openGrowthTab(page, "trade");
    await page.locator("#trade-compose").waitFor({ state: "visible" });
    await setComposeFormation(page, formation, offered, wanted);
    await shot(page, `${width}-${formation.key}-compose`);

    const created = await api("/api/trades", {
      token: owner,
      method: "POST",
      body: {
        offered: { mode: formation.offeredMode, cardIds: offered.map((card) => card.id) },
        wanted: { mode: formation.wantedMode, cardIds: wanted.map((card) => card.id) },
      },
    });
    if (created.status !== 201) {
      throw new Error(`create ${formation.key} failed: ${created.status} ${JSON.stringify(created.body)}`);
    }

    await page.goto(`${base}/?view=growth&tab=open-trades`);
    await prepPage(page, accepter);
    await openGrowthTab(page, "open-trades");
    await dismissChrome(page);
    const offer = page.locator(`article.trade-offer[data-trade-id="${created.body.trade.tradeId}"]`);
    await offer.waitFor({ state: "visible" });
    await offer.scrollIntoViewIfNeeded();
    await shot(page, `${width}-${formation.key}-open-board`);

    const needsOr = formation.offeredMode === "or" || formation.wantedMode === "or";
    if (needsOr) {
      await dismissChrome(page);
      if (formation.offeredMode === "or") {
        await offer.locator('[data-trade-pick="offered"]:not([disabled])').first().click({ force: true });
      }
      if (formation.wantedMode === "or") {
        await offer.locator('[data-trade-pick="wanted"]:not([disabled])').first().click({ force: true });
      }
      await page.waitForTimeout(200);
      await shot(page, `${width}-${formation.key}-or-pick`);
    }

    await dismissChrome(page);
    const accept = offer.locator("[data-accept-trade]");
    await accept.waitFor({ state: "visible" });
    await accept.click({ force: true });
    await page.waitForTimeout(800);
    await shot(page, `${width}-${formation.key}-post-accept`);

    const listed = await api("/api/trades", { token: accepter });
    const row = (listed.body.trades || []).find((trade) => trade.tradeId === created.body.trade.tradeId);
    if (row?.status !== "accepted") {
      throw new Error(`accept ${formation.key} did not persist: ${JSON.stringify(row)}`);
    }
    await context.close();
  }

  const tipContext = await browser.newContext({ viewport: { width, height: 800 }, locale: "he-IL" });
  const tipPage = await tipContext.newPage();
  const tipToken = (await api("/api/session", { method: "POST" })).body.token;
  await tipPage.goto(`${base}/?view=growth`);
  await tipPage.evaluate((sessionToken) => {
    localStorage.setItem("kalpi-alpha-session", sessionToken);
    localStorage.setItem("klafi:tips", "on");
    localStorage.setItem("klafi:page-tips", JSON.stringify({
      home: true, pack: true, card: true, binder: true, achievements: true, dialog: true,
    }));
  }, tipToken);
  await tipPage.reload({ waitUntil: "networkidle" });
  await tipPage.evaluate(() => {
    for (const d of document.querySelectorAll("dialog[open]")) d.close();
    document.querySelector('[data-nav="growth"]')?.click();
  });
  await tipPage.waitForTimeout(800);
  const overlay = tipPage.locator("#klafi-tips");
  if (await overlay.isHidden()) {
    await tipPage.locator("#replay-tips").click();
    await tipPage.waitForTimeout(400);
  }
  for (let step = 1; step <= 5; step += 1) {
    await dismissChrome(tipPage, { keepTips: true });
    await overlay.waitFor({ state: "visible" });
    await shot(tipPage, `${width}-tutorial-growth-${step}`);
    if (step < 5) {
      await dismissChrome(tipPage, { keepTips: true });
      await tipPage.locator("#klafi-tips-next").click({ force: true });
      await tipPage.waitForTimeout(400);
    }
  }
  await tipContext.close();
}

await browser.close();
console.log("screenshots in", outArtifacts, "and", outDocs);
