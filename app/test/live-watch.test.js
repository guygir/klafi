import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "../server/app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

async function start(now = () => Date.parse("2026-09-22T15:00:00.000Z"), extra = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-watch-"));
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
    debugEnabled: false,
    now,
    ...extra,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    dataDir,
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("every API answer carries x-request-id, and 500s echo it", async (t) => {
  const running = await start();
  t.after(async () => {
    await running.close();
    await rm(running.dataDir, { recursive: true, force: true });
  });
  const health = await fetch(`${running.base}/api/health`);
  const requestId = health.headers.get("x-request-id");
  assert.equal(health.status, 200);
  assert.match(requestId, /^[0-9a-f-]{36}$/);

  const crashing = await start(() => {
    throw new Error("watch-drill");
  });
  t.after(async () => {
    await crashing.close();
    await rm(crashing.dataDir, { recursive: true, force: true });
  });
  const failed = await fetch(`${crashing.base}/api/home`);
  const body = await failed.json();
  assert.equal(failed.status, 500);
  assert.equal(body.error, "SERVER_ERROR");
  assert.equal(body.requestId, failed.headers.get("x-request-id"));
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
});

test("a missing set5 research file does not crash the fat handler", async (t) => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-docs-"));
  const running = await start(() => Date.parse("2026-09-22T15:00:00.000Z"), { docsDir });
  t.after(async () => {
    await running.close();
    await rm(running.dataDir, { recursive: true, force: true });
    await rm(docsDir, { recursive: true, force: true });
  });
  const health = await fetch(`${running.base}/api/health`);
  assert.equal(health.status, 200);
  const share = await fetch(`${running.base}/share/YSR-M01-Q01`);
  assert.equal(share.status, 200);
});

test("WhatsApp and Instagram crawlers get share titles and images", async (t) => {
  const running = await start();
  t.after(async () => {
    await running.close();
    await rm(running.dataDir, { recursive: true, force: true });
  });
  for (const userAgent of ["WhatsApp/2.24.0", "facebookexternalhit/1.1; Instagram 192.168.1.2"]) {
    const binder = await fetch(`${running.base}/share/binder`, { headers: { "user-agent": userAgent } });
    const html = await binder.text();
    assert.equal(binder.status, 200);
    assert.match(html, /og:title" content="קְלָפִי · האלבום המלא"/);
    assert.match(html, /design-assets\/hero-art-kalpi\.png/);
    const card = await fetch(`${running.base}/share/YSR-M01-Q01`, { headers: { "user-agent": userAgent } });
    const cardHtml = await card.text();
    assert.equal(card.status, 200);
    assert.match(cardHtml, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/design-assets\/hero-art-gadi-eisenkot-slot1\.png"/);
    assert.match(cardHtml, /card=YSR-M01-Q01/);
  }
});
