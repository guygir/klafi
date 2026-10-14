const SAMPLES = [
  { offered: { mode: "and", cardIdx: [0, 1] }, wanted: { mode: "and", cardIdx: [6, 7] } },
  { offered: { mode: "and", cardIdx: [2, 3] }, wanted: { mode: "or", cardIdx: [6, 7] } },
  { offered: { mode: "or", cardIdx: [4, 5] }, wanted: { mode: "and", cardIdx: [8, 9] } },
  { offered: { mode: "or", cardIdx: [10, 11] }, wanted: { mode: "or", cardIdx: [8, 9] } },
];

export function partyLeaderSampleIds(allCards) {
  return allCards
    .filter((card) => !card.eventOnly && card.releaseSetId === "party-leaders")
    .slice(0, 14)
    .map((card) => card.id);
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

/**
 * Debug/loopback only: four 2↔2 open offers (all AND/OR combos) and accept cards on the viewer.
 */
export async function ensureDebugTradeBoard({ store, allCards, cardsById, now, grantCard }) {
  const ids = partyLeaderSampleIds(allCards);
  if (ids.length < 12) return { seeded: 0, reason: "not_enough_cards" };

  const at = new Date(now()).toISOString();
  const expiresAt = new Date(now() + 86400000).toISOString();
  let seeded = 0;

  if ((await openTradeCount(store)) === 0) {
    for (const sample of SAMPLES) {
      const poster = await store.createSession(at, {});
      const offeredIds = sample.offered.cardIdx.map((i) => ids[i]);
      const wantedIds = sample.wanted.cardIdx.map((i) => ids[i]);
      await grantPlainCopies(store, grantCard, cardsById, poster, offeredIds, at);
      const created = await store.createTrade({
        sessionToken: poster,
        offered: { mode: sample.offered.mode, cardIds: offeredIds },
        wanted: { mode: sample.wanted.mode, cardIds: wantedIds },
        createdAt: at,
        expiresAt,
      });
      if (created?.tradeId) seeded += 1;
    }
  }

  return { seeded, open: await openTradeCount(store) };
}

export async function ensureDebugTradeViewerKit({ store, allCards, cardsById, now, grantCard, viewerToken }) {
  if (!viewerToken) return { granted: 0 };
  const ids = partyLeaderSampleIds(allCards);
  const acceptIds = [ids[6], ids[7], ids[8], ids[9]].filter(Boolean);
  const at = new Date(now()).toISOString();
  await grantPlainCopies(store, grantCard, cardsById, viewerToken, acceptIds, at);
  return { granted: acceptIds.length };
}
