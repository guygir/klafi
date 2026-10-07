import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createArtPreloader } from "../public/card-art.js";

function fakeEnv() {
  const images = [];
  const timers = [];
  return {
    images, timers,
    makeImage() { const img = { decode: () => Promise.resolve() }; images.push(img); return img; },
    setTimer(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimer() {},
  };
}
const tick = () => new Promise((r) => setImmediate(r));

test("cached art resolves instantly without waiting", async () => {
  const env = fakeEnv(); const art = createArtPreloader(env);
  const p = art.preload("/a.png"); env.images[0].onload(); await p;
  assert.equal(art.isReady("/a.png"), true);
  assert.deepEqual(await art.ready(["/a.png"]), { status: "ready", waited: false });
  assert.equal(env.timers.length, 0);
  assert.equal(env.images.length, 1, "no second request");
});
test("slow art waits for load + decode", async () => {
  const env = fakeEnv(); const art = createArtPreloader(env);
  let decoded = false;
  const gate = art.ready(["/b.png"], { timeoutMs: 2500 });
  env.images[0].decode = () => new Promise((r) => setTimeout(() => { decoded = true; r(); }, 5));
  let settled = false; gate.then(() => { settled = true; });
  await tick(); assert.equal(settled, false);
  env.images[0].onload();
  const result = await gate;
  assert.equal(decoded, true);
  assert.equal(result.status, "loaded");
  assert.equal(env.timers[0].ms, 2500);
});
test("timeout proceeds even if the image never loads", async () => {
  const env = fakeEnv(); const art = createArtPreloader(env);
  const gate = art.ready(["/c.png"], { timeoutMs: 2500 });
  await tick(); env.timers[0].fn();
  assert.equal((await gate).status, "timeout");
});
test("image error does not block and can retry later", async () => {
  const env = fakeEnv(); const art = createArtPreloader(env);
  const gate = art.ready(["/d.png"]);
  env.images[0].onerror();
  assert.equal((await gate).status, "loaded");
  art.preload("/d.png");
  assert.equal(env.images.length, 2, "errored url is retried");
});
test("decode rejection still counts as loaded; empty url list is ready", async () => {
  const env = fakeEnv(); const art = createArtPreloader(env);
  const gate = art.ready(["/e.png", null]);
  env.images[0].decode = () => Promise.reject(new Error("EncodingError"));
  env.images[0].onload();
  assert.equal((await gate).status, "loaded");
  assert.equal((await art.ready([])).status, "ready");
});
test("every rip path gates the reveal on card art", async () => {
  const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const open = js.slice(js.indexOf("async function openIdleReturnOnce"), js.indexOf("const STUDIO_DEBUG_LABEL"));
  const gateAt = open.indexOf("await cardArtGate([selected])");
  assert.ok(gateAt > 0 && gateAt < open.indexOf("playHomePackRip()"), "idle open waits for art before the rip");
  assert.match(open, /if \(!cardArtReady\(\[selected\]\)\) \{\n\s+elements\.openPack\.textContent = "פותחים…";/);
  const rips = js.split("playHomePackRip()").length - 2; // minus the definition
  const gates = (js.match(/await cardArtGate\(/g) || []).length;
  assert.equal(gates, rips, "one art gate per rip call site");
  assert.match(js, /if \(url\) cardArt\.preload\(url\);/, "home prefetch shares the gate cache");
});
test("gate preloads at high priority; binder bulk art waits for warehouse art", async () => {
  const env = fakeEnv(); const art = createArtPreloader(env);
  art.ready(["/f.png"]);
  assert.equal(env.images[0].fetchPriority, "high");
  const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(js, /warehouseArtFirst\(\)\.finally\(\(\) => queueBinderArt\(cards\)\)/);
});
test("boot warmup loads waiting cards' art before the bulk playable art", async () => {
  const js = await readFile(new URL("../public/boot-warmup.js", import.meta.url), "utf8");
  const fn = js.slice(js.indexOf("async function prefetchPlayableArt"));
  assert.ok(fn.indexOf('artImage(card, "high")') < fn.indexOf("if (!waitingIds.has(card.id)) artImage(card)"));
  assert.match(fn, /await Promise\.race\(\[waitFor, new Promise\(\(resolve\) => setTimeout\(resolve,/, "the bulk wait is capped");
  assert.match(js, /window\.__kalpiWarmup\.releaseArt = /);
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /warehouseArtFirst\(\)\.finally\(\(\) => window\.__kalpiWarmup\?\.releaseArt\?\.\(\)\)/);
});
