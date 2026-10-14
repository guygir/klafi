import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = "http://127.0.0.1:8799";
const out = new URL(".", import.meta.url).pathname;
await mkdir(out, { recursive: true });

async function prepPage(page, token) {
  await page.evaluate((sessionToken) => {
    localStorage.setItem("kalpi-alpha-session", sessionToken);
    localStorage.setItem("klafi:tips", "off");
    localStorage.setItem("klafi:page-tips", JSON.stringify({ growth: true, trade: true, "open-trades": true, binder: true, home: true }));
  }, token);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.querySelector("#klafi-tips")?.remove();
    for (const d of document.querySelectorAll("dialog[open]")) d.close();
    document.querySelector('[data-nav="growth"]')?.click();
  });
  await page.waitForTimeout(1000);
}

const browser = await chromium.launch();
for (const width of [390, 320]) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  const a = (await (await fetch(`${base}/api/session`, { method: "POST" })).json()).token;
  const b = (await (await fetch(`${base}/api/session`, { method: "POST" })).json()).token;
  const cards = (await (await fetch(`${base}/api/catalog`)).json()).cards.filter((c) => !c.eventOnly && c.releaseSetId === "party-leaders").slice(0, 6);
  const unlock = async (token, ids) => {
    for (const id of ids) {
      await fetch(`${base}/api/debug/unlock-card`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ cardId: id }) });
    }
  };
  await unlock(a, cards.slice(0, 3).map((c) => c.id));
  await unlock(b, cards.slice(3, 6).map((c) => c.id));
  await page.goto(base);
  await prepPage(page, a);
  await page.evaluate(() => {
    document.querySelector("#community-tab-trade")?.click();
    document.querySelector("#trade-compose")?.scrollIntoView({ block: "start" });
  });
  const offeredId = cards[0].id;
  const wantedId = cards[3].id;
  await page.selectOption('select[data-trade-slot-set="offered"]', `release:${cards[0].releaseSetId}`);
  await page.selectOption('select[data-trade-slot-side="offered"]', offeredId);
  await page.selectOption('select[data-trade-slot-set="wanted"]', `release:${cards[3].releaseSetId}`);
  await page.selectOption('select[data-trade-slot-side="wanted"]', wantedId);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${width}-compose.png`, fullPage: true });
  await fetch(`${base}/api/trades`, {
    method: "POST",
    headers: { authorization: `Bearer ${a}`, "content-type": "application/json" },
    body: JSON.stringify({ offered: { mode: "and", cardIds: [cards[0].id, cards[1].id] }, wanted: { mode: "and", cardIds: [cards[3].id] } }),
  });
  await page.reload({ waitUntil: "networkidle" });
  await prepPage(page, a);
  await page.evaluate(() => {
    document.querySelector("#community-tab-trade")?.click();
    document.querySelector("#trade-compose")?.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${width}-active-bundle.png`, fullPage: true });
  await prepPage(page, b);
  await page.evaluate(() => document.querySelector("#community-tab-open-trades")?.click());
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${width}-open-trades.png`, fullPage: true });
  await context.close();
}
await browser.close();
console.log("screenshots in", out);
