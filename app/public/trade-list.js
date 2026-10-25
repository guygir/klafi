/**
 * Which open offers the trade list shows.
 * The server still owns the trade. This only decides what the viewer can see:
 * his own open offer, and another player's offer only when he holds the card
 * they want (the card he would have to give). Hidden offers are removed before
 * this runs, and stay removed.
 */

export function holdsWantedCard(inventory, cardId) {
  if (!cardId) return false;
  return Number(inventory?.[cardId] || 0) > 0;
}

export function wantedCardIds(trade) {
  if (!trade) return [];
  if (Array.isArray(trade.wantedCardIds) && trade.wantedCardIds.length) return trade.wantedCardIds;
  return trade.wantedCardId ? [trade.wantedCardId] : [];
}

export function holdsWantedSide(inventory, trade) {
  const ids = wantedCardIds(trade);
  if (!ids.length) return false;
  const mode = trade?.wantedMode === "or" ? "or" : "and";
  if (mode === "or") return ids.some((cardId) => holdsWantedCard(inventory, cardId));
  return ids.every((cardId) => holdsWantedCard(inventory, cardId));
}

export function offersForTradeList(trades, inventory, { showUnholdable = false } = {}) {
  return (Array.isArray(trades) ? trades : []).filter((trade) => {
    if (!trade || trade.status !== "open") return false;
    if (trade.ownedByCurrent) return true;
    if (showUnholdable) return true;
    return holdsWantedSide(inventory, trade);
  });
}

// Last server trade list per session token, for an instant Community paint on revisit.
// Display only: every create/accept/cancel still goes to the server, and the next server list
// replaces the cached one entirely (stale offers disappear).
export const TRADE_CACHE_KEY = "klafi:trades";
export const TRADE_CACHE_VERSION = 2;

function tradeCacheHasSides(trade) {
  return Array.isArray(trade?.offeredCardIds) && trade.offeredCardIds.length > 0
    && Array.isArray(trade?.wantedCardIds) && trade.wantedCardIds.length > 0;
}

function withTradeSides(trade) {
  if (!trade || typeof trade !== "object") return trade;
  const offeredCardIds = Array.isArray(trade.offeredCardIds) && trade.offeredCardIds.length
    ? trade.offeredCardIds
    : (trade.offeredCardId ? [trade.offeredCardId] : []);
  const wantedCardIds = Array.isArray(trade.wantedCardIds) && trade.wantedCardIds.length
    ? trade.wantedCardIds
    : (trade.wantedCardId ? [trade.wantedCardId] : []);
  return {
    ...trade,
    offeredCardIds,
    wantedCardIds,
    offeredCardId: offeredCardIds[0] || trade.offeredCardId || null,
    wantedCardId: wantedCardIds[0] || trade.wantedCardId || null,
  };
}

/** Cached trades for this token, without offers that expired since. Null when none or another token. */
export function readTradeCache(storage, token, now = Date.now()) {
  if (!token || !storage) return null;
  try {
    const cached = JSON.parse(storage.getItem(TRADE_CACHE_KEY) || "null");
    if (!cached || cached.token !== token || !Array.isArray(cached.trades)) return null;
    const ready = cached.trades.filter((trade) => {
      if (!trade?.tradeId || !tradeCacheHasSides(trade)) return false;
      const until = Date.parse(trade.expiresAt);
      return !(trade.status === "open" && Number.isFinite(until) && until <= now);
    });
    return ready.length ? ready : null;
  } catch {
    return null;
  }
}

/** Stores a server trade list (never a predicted or locally edited one). */
export function writeTradeCache(storage, token, trades) {
  if (!token || !storage || !Array.isArray(trades)) return;
  try {
    storage.setItem(TRADE_CACHE_KEY, JSON.stringify({
      version: TRADE_CACHE_VERSION,
      token,
      trades: trades.slice(0, 200).map(withTradeSides),
    }));
  } catch {
    /* A full storage only costs the instant first paint. */
  }
}


/** Stable paint key for the open-trades board. Same key → keep the DOM (no img flash). */
export function tradeBoardPaintSignature({ offered, wanted, page, empty, emptyKind, rows }) {
  return JSON.stringify({ offered, wanted, page, empty, emptyKind, rows });
}

export function tradeBoardPaintMatches(board, signature) {
  return Boolean(
    board
    && board.dataset?.paintSig === signature
    && typeof board.querySelector === "function"
    && board.querySelector(".trade-offer, .work-note")
  );
}
