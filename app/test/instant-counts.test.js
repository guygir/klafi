import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IDLE_FULL_COPY, idleCountdownCopy, predictedUnseenCount } from "../public/idle-countdown.js";
import { TRADE_CACHE_KEY, readTradeCache, writeTradeCache } from "../public/trade-list.js";
import { canOpenFromLastSettle } from "../public/state-sync.js";

const H = 60 * 60 * 1000;
const T0 = Date.parse("2026-10-09T09:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const slots = (first, n, interval = 3 * H) => Array.from({ length: n }, (_, i) => ({ instanceId: `p${i}`, availableAt: iso(first + i * interval) }));
function cachedState({ unseen = 2, prepared = slots(T0 + H, 6), nextIdleAt, cap = 8 } = {}) {
  return { unseenCount: unseen, idleCapacity: cap, idleIntervalMs: 3 * H, preparedPulls: prepared, nextIdleAt: nextIdleAt ?? prepared[0]?.availableAt ?? null };
}

test("prediction: cached count plus slots due since the cached state", () => {
  const state = cachedState();
  assert.equal(predictedUnseenCount(state, { now: T0 }), 2, "nothing due yet");
  assert.equal(predictedUnseenCount(state, { now: T0 + H }), 3, "first slot due exactly at its time");
  assert.equal(predictedUnseenCount(state, { now: T0 + 7 * H + 1 }), 5, "three slots (1h, 4h, 7h)");
});

test("prediction: respects the cap and never grows a full warehouse (restart rule)", () => {
  assert.equal(predictedUnseenCount(cachedState(), { now: T0 + 100 * H }), 8, "capped at 8");
  assert.equal(predictedUnseenCount(cachedState({ unseen: 7 }), { now: T0 + 100 * H }), 8);
  assert.equal(predictedUnseenCount(cachedState({ unseen: 8, prepared: [] , nextIdleAt: iso(T0 - 10 * H) }), { now: T0 + 100 * H }), 8, "full stays full");
  assert.equal(predictedUnseenCount(cachedState({ unseen: 9 }), { now: T0 }), 9, "a server count above the cap is shown as is");
  assert.equal(predictedUnseenCount(cachedState({ cap: 4 }), { now: T0 + 100 * H }), 4, "server capacity wins");
});

test("prediction: extrapolates past the last known slot, or from nextIdleAt alone", () => {
  const short = cachedState({ unseen: 0, prepared: slots(T0, 2) });
  assert.equal(predictedUnseenCount(short, { now: T0 + 9 * H }), 4, "0h, 3h known + 6h, 9h extrapolated");
  const onlyNext = { unseenCount: 1, idleIntervalMs: 3 * H, preparedPulls: [], nextIdleAt: iso(T0) };
  assert.equal(predictedUnseenCount(onlyNext, { now: T0 + 3 * H }), 3);
  assert.equal(predictedUnseenCount({ unseenCount: 2 }, { now: T0 }), 2, "no schedule: the server count");
  assert.equal(predictedUnseenCount({}, { idleQueueLength: 3, now: T0 }), 3);
  assert.equal(predictedUnseenCount(null, { now: T0 }), 0);
});

test("prediction is display only: the settle is still needed and a predicted-full warehouse still asks it", () => {
  const state = cachedState({ unseen: 7 });
  const now = T0 + 2 * H;
  const view = idleCountdownCopy({ serverState: state, now, predictedUnseen: predictedUnseenCount(state, { now }) });
  assert.equal(view.text, IDLE_FULL_COPY);
  assert.equal(view.unseen, 7, "the server count is unchanged");
  assert.equal(view.needsSettle, true, "settle still requested");
  const real = idleCountdownCopy({ serverState: { ...state, unseenCount: 8 }, now });
  assert.equal(real.needsSettle, false, "a server-full warehouse needs no settle (unchanged)");
  // After the server answers (slot granted, next slot in the future) the prediction equals the server.
  const settled = cachedState({ unseen: 8, prepared: slots(T0 + 4 * H, 0), nextIdleAt: iso(T0 + 5 * H) });
  assert.equal(predictedUnseenCount(settled, { now }), 8);
});

test("instant open still needs a real settle: no cached state stands in for one", () => {
  const decision = canOpenFromLastSettle({ lastSettle: null, cachedId: "p0", token: "t", now: T0 });
  assert.equal(decision.fast, false);
  assert.equal(decision.reason, "no-settle");
});

test("client: only the title reads the prediction; button, hint, cache and opening read the server", async () => {
  const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const home = js.slice(js.indexOf("function renderHome()"), js.indexOf("function shuffled("));
  assert.match(home, /const available = unseen > 0 \|\| due;/);
  assert.match(home, /const unseen = model\.serverState\?\.unseenCount \?\? model\.idleQueue\.length;/);
  assert.match(home, /elements\.openPack\.disabled = !available;/);
  assert.match(home, /elements\.homeTitle\.textContent = shownTitle;/);
  assert.match(home, /homeSettleHint\(\{ needsSettle: clock\.needsSettle/);
  assert.equal((js.match(/predictedUnseenCount\(/g) || []).length, 2, "title and countdown only");
  assert.match(home, /homeIdleReadyCopy\(\{ unseenCount: shownUnseen, available \}\)\.title/, "the prediction only builds the title");
  assert.doesNotMatch(js, /serverState[^;\n]*shownUnseen/);
  assert.doesNotMatch(js, /serverState\.unseenCount = predicted/);
  assert.match(js, /lastIdleSettle = applied === false \? null : \{/, "fast open path still records only real settles");
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}
const offer = (id, extra = {}) => ({ tradeId: id, status: "open", offeredCardId: "A", wantedCardId: "B", expiresAt: iso(T0 + 24 * H), ...extra });

test("trade cache: per token, expired offers dropped, replaced by the next server list", () => {
  const storage = memoryStorage();
  writeTradeCache(storage, "tok-a", [offer("1"), offer("2", { ownedByCurrent: true }), offer("old", { expiresAt: iso(T0 - 1) })]);
  assert.deepEqual(readTradeCache(storage, "tok-a", T0).map(({ tradeId }) => tradeId), ["1", "2"]);
  assert.equal(readTradeCache(storage, "tok-b", T0), null, "another session never sees it");
  assert.equal(readTradeCache(storage, null, T0), null);
  writeTradeCache(storage, "tok-a", [offer("3")]);
  assert.deepEqual(readTradeCache(storage, "tok-a", T0).map(({ tradeId }) => tradeId), ["3"], "server list replaces, stale offers gone");
  storage.setItem(TRADE_CACHE_KEY, "{bad json");
  assert.equal(readTradeCache(storage, "tok-a", T0), null);
  writeTradeCache(storage, "", [offer("x")]);
  assert.equal(storage.map.get(TRADE_CACHE_KEY), "{bad json", "no token, no write");
});

test("client: cached trades paint first, server lists replace them, actions stay on the server", async () => {
  const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const set = js.slice(js.indexOf("function setTrades("), js.indexOf("function hideTradeOffer("));
  assert.match(set, /model\.trades = withoutHiddenTrades\(list\);/);
  assert.match(set, /writeTradeCache\(localStorage, model\.token, list\)/);
  assert.match(set, /readTradeCache\(localStorage, model\.token\)/);
  assert.match(set, /if \(model\.tradesKnown \|\| !model\.token \|\| model\.tradesCacheToken === model\.token\) return;/);
  assert.match(js, /function renderGrowth\(\) \{\n\s+ensureTradeCache\(\);/);
  assert.match(js, /if \(Array\.isArray\(boot\.trades\)\) setTrades\(boot\.trades\);/, "a missing list never wipes the cache");
  // Accept buttons still require a current inventory; the server validates every action.
  assert.match(js, /const acceptInventory = currentTradeInventory\(\);/);
  assert.match(js, /request\(`\/api\/trades\/\$\{encodeURIComponent\(tradeId\)\}\/accept`, \{ method: "POST" \}\)/);
  // Switching session drops the other token's trades.
  assert.match(js, /model\.trades = \[\];\n\s+model\.tradesKnown = false;\n\s+model\.tradesFromCache = false;\n\s+model\.tradesCacheToken = null;/);
});
