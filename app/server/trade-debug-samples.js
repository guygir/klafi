const W = [0, 1, 2];
const O = [3, 4, 5];

function modeHe(mode) {
  return mode === "or" ? "או" : "וגם";
}

function sample({
  id,
  expect,
  offeredMode,
  offeredIdx,
  wantedMode,
  wantedIdx,
  why = "",
  grantRegularIdx = null,
  grantNumberedIdx = [],
  stripOwner = false,
  fromViewer = false,
}) {
  const size = `${offeredIdx.length}↔${wantedIdx.length}`;
  const modes = `${modeHe(offeredMode)}/${modeHe(wantedMode)}`;
  const result = expect === "pass" ? "אמור להצליח" : `אמור להיכשל · ${why}`;
  return {
    id,
    expect,
    offered: { mode: offeredMode, cardIdx: offeredIdx },
    wanted: { mode: wantedMode, cardIdx: wantedIdx },
    grantRegularIdx: grantRegularIdx ?? (expect === "pass" ? wantedIdx : []),
    grantNumberedIdx,
    stripOwner,
    fromViewer,
    why,
    label: `${size} ${modes} · ${result}`,
  };
}

/** Full QA board: sizes, every AND/OR combo, uneven mixes, and accept-fail cases. */
export const QA_TRADE_SAMPLES = [
  sample({ id: "ok-1-1", expect: "pass", offeredMode: "and", offeredIdx: [O[0]], wantedMode: "and", wantedIdx: [W[0]] }),
  sample({ id: "ok-1-2-and", expect: "pass", offeredMode: "and", offeredIdx: [O[0]], wantedMode: "and", wantedIdx: [W[0], W[1]] }),
  sample({ id: "ok-2-1-and", expect: "pass", offeredMode: "and", offeredIdx: [O[0], O[1]], wantedMode: "and", wantedIdx: [W[0]] }),
  sample({ id: "ok-1-3-and", expect: "pass", offeredMode: "and", offeredIdx: [O[0]], wantedMode: "and", wantedIdx: W }),
  sample({ id: "ok-3-1-and", expect: "pass", offeredMode: "and", offeredIdx: O, wantedMode: "and", wantedIdx: [W[0]] }),
  sample({ id: "ok-2-2-and-and", expect: "pass", offeredMode: "and", offeredIdx: [O[0], O[1]], wantedMode: "and", wantedIdx: [W[0], W[1]] }),
  sample({ id: "ok-2-2-and-or", expect: "pass", offeredMode: "and", offeredIdx: [O[0], O[1]], wantedMode: "or", wantedIdx: [W[0], W[1]] }),
  sample({ id: "ok-2-2-or-and", expect: "pass", offeredMode: "or", offeredIdx: [O[0], O[1]], wantedMode: "and", wantedIdx: [W[0], W[1]] }),
  sample({ id: "ok-2-2-or-or", expect: "pass", offeredMode: "or", offeredIdx: [O[0], O[1]], wantedMode: "or", wantedIdx: [W[0], W[1]] }),
  sample({ id: "ok-3-3-and-and", expect: "pass", offeredMode: "and", offeredIdx: O, wantedMode: "and", wantedIdx: W }),
  sample({ id: "ok-3-3-and-or", expect: "pass", offeredMode: "and", offeredIdx: O, wantedMode: "or", wantedIdx: W }),
  sample({ id: "ok-3-3-or-and", expect: "pass", offeredMode: "or", offeredIdx: O, wantedMode: "and", wantedIdx: W }),
  sample({ id: "ok-3-3-or-or", expect: "pass", offeredMode: "or", offeredIdx: O, wantedMode: "or", wantedIdx: W }),
  sample({ id: "ok-1-3-and-or", expect: "pass", offeredMode: "and", offeredIdx: [O[0]], wantedMode: "or", wantedIdx: W }),
  sample({ id: "ok-1-3-or-and", expect: "pass", offeredMode: "or", offeredIdx: [O[0]], wantedMode: "and", wantedIdx: W }),
  sample({ id: "ok-1-3-or-or", expect: "pass", offeredMode: "or", offeredIdx: [O[0]], wantedMode: "or", wantedIdx: W }),
  sample({ id: "ok-3-1-and-or", expect: "pass", offeredMode: "and", offeredIdx: O, wantedMode: "or", wantedIdx: [W[0]] }),
  sample({ id: "ok-3-1-or-and", expect: "pass", offeredMode: "or", offeredIdx: O, wantedMode: "and", wantedIdx: [W[0]] }),
  sample({ id: "ok-3-1-or-or", expect: "pass", offeredMode: "or", offeredIdx: O, wantedMode: "or", wantedIdx: [W[0]] }),
  sample({ id: "ok-1-2-and-or", expect: "pass", offeredMode: "and", offeredIdx: [O[0]], wantedMode: "or", wantedIdx: [W[0], W[1]] }),
  sample({ id: "ok-2-1-or-and", expect: "pass", offeredMode: "or", offeredIdx: [O[0], O[1]], wantedMode: "and", wantedIdx: [W[0]] }),
  sample({
    id: "fail-and-missing",
    expect: "fail",
    offeredMode: "and",
    offeredIdx: [6],
    wantedMode: "and",
    wantedIdx: [9, 10],
    grantRegularIdx: [9],
    why: "חסר אחד מקלפי וגם",
  }),
  sample({
    id: "fail-or-none",
    expect: "fail",
    offeredMode: "and",
    offeredIdx: [7],
    wantedMode: "or",
    wantedIdx: [11, 12],
    why: "אין אף קלף מאו",
  }),
  sample({
    id: "fail-numbered",
    expect: "fail",
    offeredMode: "and",
    offeredIdx: [8],
    wantedMode: "and",
    wantedIdx: [13],
    grantNumberedIdx: [13],
    why: "יש רק עותק ממוספר",
  }),
  sample({
    id: "fail-reserved",
    expect: "fail",
    offeredMode: "and",
    offeredIdx: [O[1]],
    wantedMode: "and",
    wantedIdx: [9],
    grantRegularIdx: [9],
    why: "העותק שמור בהצעה שלכם",
  }),
  sample({
    id: "fail-reserved-mine",
    expect: "fail",
    offeredMode: "and",
    offeredIdx: [9],
    wantedMode: "and",
    wantedIdx: [6],
    grantRegularIdx: [9],
    fromViewer: true,
    why: "ההצעה שלכם שומרת את העותק",
  }),
  sample({
    id: "fail-owner-gone",
    expect: "fail",
    offeredMode: "and",
    offeredIdx: [O[2]],
    wantedMode: "and",
    wantedIdx: [W[0]],
    grantRegularIdx: [W[0]],
    stripOwner: true,
    why: "למציע כבר אין את הקלף",
  }),
];

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
  const numbered = new Set();
  for (const sample of samples) {
    for (const index of sample.grantRegularIdx || []) regular.add(index);
    for (const index of sample.grantNumberedIdx || []) numbered.add(index);
  }
  return { regular: [...regular], numbered: [...numbered] };
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

function existingQaIds(store) {
  const ids = new Set();
  for (const trade of store.state?.trades || []) {
    if (trade.qaSampleId) ids.add(trade.qaSampleId);
  }
  return ids;
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

async function grantNumberedOnly(store, grantCard, cardsById, token, cardId, pulledAt) {
  await store.withSession(token, async (session) => {
    const already = (session.instances || []).some((item) => item.cardId === cardId && Number(item.numberedIndex) > 0);
    if (already && (session.inventory?.[cardId] ?? 0) > 0) return;
    const card = cardsById.get(cardId);
    if (!card) return;
    await grantCard(session, { cardId, finish: card.rarity || "Common" }, {
      acquiredBy: "debug-trade-samples",
      pulledAt,
      creditNow: true,
      warehouse: false,
    });
    const instance = [...(session.instances || [])].reverse().find((item) => item.cardId === cardId);
    if (instance) {
      instance.numberedIndex = instance.numberedIndex || 1;
      instance.numberedOf = instance.numberedOf || 4;
      instance.seenAt = pulledAt;
    }
  });
}

async function stripOwnedCards(store, token, cardIds) {
  await store.withSession(token, (session) => {
    for (const cardId of cardIds) {
      if (session.inventory) delete session.inventory[cardId];
      session.instances = (session.instances || []).filter((item) => item.cardId !== cardId);
    }
  });
}

/** Remove regular copies so fail-cases stay fail, but keep numbered instances. */
async function forgetRegularCopies(store, token, cardIds) {
  await store.withSession(token, (session) => {
    for (const cardId of cardIds) {
      const numbered = (session.instances || []).filter((item) => item.cardId === cardId && Number(item.numberedIndex) > 0);
      session.instances = (session.instances || []).filter((item) => item.cardId !== cardId || Number(item.numberedIndex) > 0);
      if (numbered.length) session.inventory[cardId] = numbered.length;
      else if (session.inventory) delete session.inventory[cardId];
    }
  });
}

async function tagTrade(store, tradeId, sample, posterToken, { rename = true } = {}) {
  await store.withSession(posterToken, (session) => {
    if (rename) session.displayName = `QA ${sample.id}`;
    const row = store.state?.trades?.find((trade) => trade.tradeId === tradeId);
    if (row) {
      row.qaSampleId = sample.id;
      row.qaLabel = sample.label;
      row.qaExpect = sample.expect;
    }
  });
}

async function seedOne({ store, sample, ids, cardsById, now, grantCard, posterToken }) {
  const at = new Date(now()).toISOString();
  const expiresAt = new Date(now() + 86400000).toISOString();
  const offeredIds = sample.offered.cardIdx.map((index) => ids[index]).filter(Boolean);
  const wantedIds = sample.wanted.cardIdx.map((index) => ids[index]).filter(Boolean);
  if (offeredIds.length !== sample.offered.cardIdx.length || wantedIds.length !== sample.wanted.cardIdx.length) {
    return null;
  }
  await grantPlainCopies(store, grantCard, cardsById, posterToken, offeredIds, at);
  const created = await store.createTrade({
    sessionToken: posterToken,
    offered: { mode: sample.offered.mode, cardIds: offeredIds },
    wanted: { mode: sample.wanted.mode, cardIds: wantedIds },
    createdAt: at,
    expiresAt,
  });
  if (!created?.tradeId) return created || null;
  await tagTrade(store, created.tradeId, sample, posterToken, { rename: !sample.fromViewer });
  if (sample.stripOwner) await stripOwnedCards(store, posterToken, offeredIds);
  return created;
}

/**
 * Debug/loopback only: seed every QA formation (and fail cases) if missing.
 */
export async function ensureDebugTradeBoard({ store, allCards, cardsById, now, grantCard }) {
  const ids = partyLeaderSampleIds(allCards);
  if (ids.length < 14) return { seeded: 0, reason: "not_enough_cards" };

  if (!store.state?.trades && (await openTradeCount(store)) > 0) {
    return { seeded: 0, open: await openTradeCount(store), reason: "existing_open" };
  }

  const have = existingQaIds(store);
  let seeded = 0;
  for (const sample of QA_TRADE_SAMPLES) {
    if (sample.fromViewer || have.has(sample.id)) continue;
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
  if (ids.length < 14) return { granted: 0, reason: "not_enough_cards" };
  const at = new Date(now()).toISOString();
  const plan = viewerGrantPlan();
  const regularIds = plan.regular.map((index) => ids[index]).filter(Boolean);
  await grantPlainCopies(store, grantCard, cardsById, viewerToken, regularIds, at);
  for (const index of plan.numbered) {
    if (ids[index]) await grantNumberedOnly(store, grantCard, cardsById, viewerToken, ids[index], at);
  }
  const denyRegular = [10, 11, 12, 13].map((index) => ids[index]).filter(Boolean);
  await forgetRegularCopies(store, viewerToken, denyRegular);

  const reservedMine = QA_TRADE_SAMPLES.find((sample) => sample.fromViewer);
  const have = existingQaIds(store);
  if (reservedMine && !have.has(reservedMine.id)) {
    const created = await seedOne({
      store,
      sample: reservedMine,
      ids,
      cardsById,
      now,
      grantCard,
      posterToken: viewerToken,
    });
    if (created?.blocked) {
      /* viewer already has an open offer — reserved case is not applicable */
    }
  }

  return { granted: regularIds.length + plan.numbered.length };
}
