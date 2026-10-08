import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { regularCopyCount, regularInventory, regularInventoryOf, heldNumberedCopies } from "../server/numbered.js";
import { achievementMeasures, achievementState, expandAchievementCatalog, stampAchievements } from "../server/achievements.js";
import { grantedCopyCounts } from "../server/inventory-credit.js";
import { leagueMemberScore } from "../server/leagues.js";
import { plainCopyCount, spendPlainCopies } from "../server/recycle.js";
import { publicBinderView } from "../server/public-binder.js";
import { slimPublicState } from "../server/slim-state.js";
import { JsonStore, tallyCardHolders } from "../server/store.js";
import { collectionStarsFrom, regularInventoryFrom } from "../public/regular-copies.js";

// רגעים-like set: 3 cards; the player holds only the numbered copy of M6.
const cards = ["M1", "M2", "M6"].map((id) => ({ id, set: "MOM", releaseSetId: "set-5", idleEligible: true, rarity: id === "M6" ? "Rare" : "Common" }));
const numbered = { instanceId: "n6", cardId: "M6", numberedIndex: 2, numberedOf: 4, seenAt: "2026-10-01T00:00:00Z" };
function numberedOnlyPlayer() {
  return {
    inventory: { M1: 1, M2: 1, M6: 1 },
    instances: [
      { instanceId: "r1", cardId: "M1" },
      { instanceId: "r2", cardId: "M2" },
      numbered,
    ],
    unseenPulls: [],
  };
}
function numberedPlusRegular() {
  const s = numberedOnlyPlayer();
  s.inventory.M6 = 2;
  s.instances.push({ instanceId: "r6", cardId: "M6" });
  return s;
}

test("regular copies exclude held numbered copies", () => {
  assert.equal(regularCopyCount(numberedOnlyPlayer(), "M6"), 0);
  assert.deepEqual(regularInventoryOf(numberedOnlyPlayer()), { M1: 1, M2: 1 });
  assert.equal(regularCopyCount(numberedPlusRegular(), "M6"), 1);
  // A numbered copy still waiting in the warehouse is not in inventory, so it is not subtracted.
  const waiting = { inventory: { M6: 1 }, instances: [{ instanceId: "r6", cardId: "M6" }, { ...numbered, seenAt: null }], unseenPulls: ["n6"] };
  assert.equal(regularCopyCount(waiting, "M6"), 1);
  assert.deepEqual(heldNumberedCopies(waiting), []);
  // Slim sessions carry numberedByCard instead of instances.
  assert.deepEqual(regularInventory({ M6: 1, M1: 2 }, { M6: 1 }), { M1: 2 });
});

test("set badge and collection measures count regular copies only", () => {
  const releaseSets = [{ id: "set-5", nameHe: "רגעים" }];
  const catalog = expandAchievementCatalog([{ id: "set", rule: "setComplete", tier: "hard" }], cards, releaseSets);
  const setBadge = catalog.find((item) => item.setId === "set-5");
  assert.ok(setBadge, "set badge expanded");
  const only = numberedOnlyPlayer();
  const measures = achievementMeasures(only, cards);
  assert.equal(measures.setOwned["set-5"], 2);
  assert.equal(measures.unique, 2);
  assert.equal(measures.rare, 0);
  assert.equal(measures.ownedIds.has("M6"), false);
  const view = achievementState(only, cards, catalog).achievements.find((item) => item.id === setBadge.id);
  assert.equal(view.earned, false);
  assert.equal(view.progress, 2);
  assert.equal(view.target, 3);
  assert.deepEqual(stampAchievements(only, cards, catalog), []);
  const both = numberedPlusRegular();
  assert.equal(achievementMeasures(both, cards).setOwned["set-5"], 3);
  assert.equal(achievementMeasures(both, cards).duplicate, 1, "numbered + regular is not a duplicate");
  assert.deepEqual(stampAchievements(both, cards, catalog), [setBadge.id]);
});

test("pity / חדש / unowned pools treat numbered-only as not owned", () => {
  assert.equal(grantedCopyCounts(numberedOnlyPlayer()).M6, undefined);
  assert.equal(grantedCopyCounts(numberedPlusRegular()).M6, 1);
});

test("league, holders, public binder, slim home: regular unique counts", () => {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const score = leagueMemberScore(numberedOnlyPlayer(), byId);
  assert.equal(score.ownedUnique, 2);
  assert.equal(score.stars, 1 + 1 + 4, "stars: numbered copy still adds its 4 (intentional)");
  const tally = tallyCardHolders({ a: numberedOnlyPlayer(), b: numberedPlusRegular() });
  assert.equal(tally.holders.M6, 1);
  assert.equal(tally.numberedHolders.M6, 2);
  const binder = publicBinderView({ ...numberedOnlyPlayer(), displayName: "x" });
  assert.equal(binder.ownedUnique, 2);
  assert.equal(binder.numberedCopies.length, 1, "binder still shows the numbered copy");
  const slim = slimPublicState(
    { inventory: { M1: 1, M2: 1, M6: 1 }, numberedByCard: { M6: 1 }, numberedCopies: [numbered], unseenPulls: [] },
    { idleCardIds: ["M1", "M2", "M6"], cardIndex: cards, gameConfig: {} },
  );
  assert.equal(slim.ownedUnique, 2);
  assert.equal(slim.ownedUniqueAll, 2);
  assert.equal(slim.numberedCopies.length, 1, "slim home sends the held numbered copy so the client can subtract it");
});

test("recycle never spends a numbered copy", () => {
  const s = numberedPlusRegular();
  s.inventory.M6 = 3;
  s.instances.push({ instanceId: "r7", cardId: "M6" });
  assert.equal(plainCopyCount(s, "M6"), 2);
  assert.equal(spendPlainCopies(s, "M6", 3), false);
});

test("trades: numbered-only copy cannot be offered or move; numbered+regular trades the regular", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kalpi-numbered-trade-"));
  const store = new JsonStore(path.join(dir, "state.json"));
  await store.init();
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  const a = await store.createSession(now);
  const b = await store.createSession(now);
  await store.withSession(a, (s) => Object.assign(s, numberedOnlyPlayer()));
  await store.withSession(b, (s) => { s.inventory = { M2: 1 }; s.instances = [{ instanceId: "b2", cardId: "M2" }]; });
  assert.equal(await store.createTrade({ sessionToken: a, offeredCardId: "M6", wantedCardId: "M2", createdAt: now, expiresAt: later }), null);
  // A legacy open trade on the numbered-only copy cannot be accepted.
  store.state.trades.push({ tradeId: "legacy", ownerToken: a, offeredCardId: "M6", wantedCardId: "M2", status: "open", createdAt: now, expiresAt: later });
  assert.equal(await store.acceptTrade({ tradeId: "legacy", sessionToken: b, acceptedAt: now }), null);
  const listed = (await store.listTrades(b)).find((trade) => trade.tradeId === "legacy");
  assert.equal(listed.canAccept, false);
  assert.equal(store.getSession(a).instances.some((item) => item.instanceId === "n6"), true, "numbered copy stays");
  // With a regular copy too, the regular one moves and the numbered stays.
  await store.withSession(a, (s) => Object.assign(s, numberedPlusRegular()));
  store.state.trades = store.state.trades.filter((item) => item.tradeId !== "legacy");
  const trade = await store.createTrade({ sessionToken: a, offeredCardId: "M6", wantedCardId: "M2", createdAt: now, expiresAt: later });
  assert.ok(trade?.tradeId);
  assert.ok(await store.acceptTrade({ tradeId: trade.tradeId, sessionToken: b, acceptedAt: now }));
  const owner = store.getSession(a);
  assert.equal(owner.inventory.M6, 1);
  assert.equal(owner.instances.find((item) => item.cardId === "M6").instanceId, "n6");
  assert.equal(regularCopyCount(owner, "M6"), 0);
  const moved = store.getSession(b).instances.find((item) => item.cardId === "M6");
  assert.equal(moved.numberedIndex, undefined);
  await rm(dir, { recursive: true, force: true });
});

test("client regular-copies helpers mirror the server", () => {
  assert.deepEqual(regularInventoryFrom({ M1: 1, M6: 1 }, [numbered]), { M1: 1 });
  assert.deepEqual(regularInventoryFrom({ M6: 2 }, [numbered]), { M6: 1 });
  assert.deepEqual(regularInventoryFrom({ M6: 1 }, null), { M6: 1 });
  const byId = new Map(cards.map((card) => [card.id, card]));
  assert.equal(collectionStarsFrom({ M1: 1, M6: 1 }, [numbered], byId), 1 + 4);
  assert.equal(collectionStarsFrom({ M6: 2 }, [numbered], byId), 3 + 4);
});

test("client trade UI lists and previews regular copies only", async () => {
  const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(js, /function tradeWantLabel\(card\) \{\n[^\n]*\n\s+return `[^`]*\$\{plainOwnedCount\(card\)\}x`;/);
  assert.match(js, /const ownedCards = tradableCards\.filter\(\(candidate\) => plainOwnedCount\(candidate\) > 0\);/);
  assert.match(js, /binderCardMarkup\(card, \{ tradeCopies: true, warnLastCopy, plain: true, count: plainOwnedCount\(card\) \}\)/);
  assert.match(js, /binderProgress\(binderRegularInventory\(inventory\)\)/);
  assert.match(js, /function localAchievementMeasures\(\) \{\n\s+const inventory = myRegularInventory\(\);/);
});

test("numbered stamp scales with small previews and keeps its size on binder-sized cards", async () => {
  for (const name of ["styles.css", "theme-pack-v2.css"]) {
    const css = await readFile(new URL(`../public/${name}`, import.meta.url), "utf8");
    // A fixed 26px floor made the 2/4 stamp a quarter of a ~117px trade preview.
    assert.doesNotMatch(css, /clamp\(26px, 11\.4cqw, 36px\)/, name);
    assert.doesNotMatch(css, /clamp\(8px, 3\.6cqw, 12px\)/, name);
    assert.match(css, /width: clamp\(min\(26px, 15\.5cqw\), 11\.4cqw, 36px\);/, name);
    assert.match(css, /font: 800 clamp\(min\(8px, 4\.8cqw\), 3\.6cqw, 12px\)\/1/, name);
  }
});
