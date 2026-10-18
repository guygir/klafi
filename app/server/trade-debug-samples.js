const OFFERED = [0, 1];
const WANTED = [2, 3, 4];

/** Debug board only: four 2↔3 offers covering AND/OR on each side. */
export const QA_TRADE_SAMPLES = [
  { id: "ok-2-3-and-and", offeredMode: "and", wantedMode: "and" },
  { id: "ok-2-3-and-or", offeredMode: "and", wantedMode: "or" },
  { id: "ok-2-3-or-and", offeredMode: "or", wantedMode: "and" },
  { id: "ok-2-3-or-or", offeredMode: "or", wantedMode: "or" },
].map((row) => ({
  ...row,
  offered: { mode: row.offeredMode, cardIdx: OFFERED },
  wanted: { mode: row.wantedMode, cardIdx: WANTED },
  grantRegularIdx: WANTED,
}));

/**
 * Auto-seed is a local debug board only. Production (NODE_ENV or Vercel) must never
 * seed even if KLAFI_QA_TRADE_SAMPLES=1 is set on the deployment.
 */
export function qaTradeSamplesAllowed({ debugRequest = false, env = process.env } = {}) {
  if (!debugRequest) return false;
  if (String(env?.KLAFI_QA_TRADE_SAMPLES || "") !== "1") return false;
  if (env?.NODE_ENV === "production") return false;
  if (env?.VERCEL_ENV === "production") return false;
  return true;
}

export function partyLeaderSampleIds(allCards) {
  return allCards
    .filter((card) => !card.eventOnly && card.releaseSetId === "party-leaders")
    .map((card) => card.id);
}

export function viewerGrantPlan(samples = QA_TRADE_SAMPLES) {
  const regular = new Set();
  for (const sample of samples) {
    for (const index of sample.grantRegularIdx || []) regular.add(index);
  }
  return { regular: [...regular], numbered: [] };
}

async function openTradeCount(store) {
  if (store.state?.trades) {
    return store.state.trades.filter((trade) => trade.status === "open").length;
  }
  if (store.pool) {
    const result = await store.pool.query("SELECT COUNT(*)::int AS n FROM kalpi_trades WHERE status = 'open'");
    return result.rows[0]?.n ?? 0;
  }
  return 0;
}

function keepQaIds() {
  return new Set(QA_TRADE_SAMPLES.map((sample) => sample.id));
}

function existingQaIds(store) {
  const ids = new Set();
  for (const trade of store.state?.trades || []) {
    if (trade.qaSampleId && trade.status === "open") ids.add(trade.qaSampleId);
  }
  return ids;
}

async function pruneRetiredQaSamples(store) {
  if (!store.state?.trades) return 0;
  const keep = keepQaIds();
  const before = store.state.trades.length;
  store.state.trades = store.state.trades.filter((trade) => !trade.qaSampleId || keep.has(trade.qaSampleId));
  const removed = before - store.state.trades.length;
  if (removed && store.persist) await store.persist();
  return removed;
}

async function grantPlainCopies(store, grantCard, cardsById, token, cardIds, pulledAt) {
  await store.withSession(token, async (session) => {
    for (const cardId of cardIds) {
      if ((session.inventory?.[cardId] ?? 0) > 0) continue;
      const card = cardsById.get(cardId);
      if (!card) continue;
      await grantCard(session, { cardId, finish: card.rarity || "Common" }, {
        acquiredBy: "debug-trade-samples",
        pulledAt,
        creditNow: true,
        warehouse: false,
      });
    }
  });
}

async function tagTrade(store, tradeId, sample, posterToken) {
  await store.withSession(posterToken, (session) => {
    session.displayName = "שחקן QA";
    const row = store.state?.trades?.find((trade) => trade.tradeId === tradeId);
    if (row) row.qaSampleId = sample.id;
  });
}

async function seedOne({ store, sample, ids, cardsById, now, grantCard, posterToken }) {
  const at = new Date(now()).toISOString();
  const expiresAt = new Date(now() + 86400000).toISOString();
  const offeredIds = sample.offered.cardIdx.map((index) => ids[index]).filter(Boolean);
  const wantedIds = sample.wanted.cardIdx.map((index) => ids[index]).filter(Boolean);
  if (offeredIds.length !== 2 || wantedIds.length !== 3) return null;
  await grantPlainCopies(store, grantCard, cardsById, posterToken, offeredIds, at);
  const created = await store.createTrade({
    sessionToken: posterToken,
    offered: { mode: sample.offered.mode, cardIds: offeredIds },
    wanted: { mode: sample.wanted.mode, cardIds: wantedIds },
    createdAt: at,
    expiresAt,
  });
  if (!created?.tradeId) return created || null;
  await tagTrade(store, created.tradeId, sample, posterToken);
  return created;
}

export async function ensureDebugTradeBoard({ store, allCards, cardsById, now, grantCard }) {
  const ids = partyLeaderSampleIds(allCards);
  if (ids.length < 5) return { seeded: 0, reason: "not_enough_cards" };

  if (!store.state?.trades && (await openTradeCount(store)) > 0) {
    return { seeded: 0, open: await openTradeCount(store), reason: "existing_open" };
  }

  await pruneRetiredQaSamples(store);
  const have = existingQaIds(store);
  let seeded = 0;
  for (const sample of QA_TRADE_SAMPLES) {
    if (have.has(sample.id)) continue;
    const poster = await store.createSession(new Date(now()).toISOString(), {});
    const created = await seedOne({ store, sample, ids, cardsById, now, grantCard, posterToken: poster });
    if (created?.tradeId) {
      have.add(sample.id);
      seeded += 1;
    }
  }

  return { seeded, open: await openTradeCount(store) };
}

export async function ensureDebugTradeViewerKit({ store, allCards, cardsById, now, grantCard, viewerToken }) {
  if (!viewerToken) return { granted: 0 };
  const ids = partyLeaderSampleIds(allCards);
  if (ids.length < 5) return { granted: 0, reason: "not_enough_cards" };
  const at = new Date(now()).toISOString();
  const regularIds = viewerGrantPlan().regular.map((index) => ids[index]).filter(Boolean);
  await grantPlainCopies(store, grantCard, cardsById, viewerToken, regularIds, at);
  return { granted: regularIds.length };
}
