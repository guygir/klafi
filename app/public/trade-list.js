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

export function offersForTradeList(trades, inventory) {
  return (Array.isArray(trades) ? trades : []).filter((trade) => {
    if (!trade || trade.status !== "open") return false;
    if (trade.ownedByCurrent) return true;
    return holdsWantedCard(inventory, trade.wantedCardId);
  });
}

// Last server trade list per session token, for an instant Community paint on revisit.
// Display only: every create/accept/cancel still goes to the server, and the next server list
// replaces the cached one entirely (stale offers disappear).
export const TRADE_CACHE_KEY = "klafi:trades";

/** Cached trades for this token, without offers that expired since. Null when none or another token. */
export function readTradeCache(storage, token, now = Date.now()) {
  if (!token || !storage) return null;
  try {
    const cached = JSON.parse(storage.getItem(TRADE_CACHE_KEY) || "null");
    if (!cached || cached.token !== token || !Array.isArray(cached.trades)) return null;
    return cached.trades.filter((trade) => {
      if (!trade?.tradeId) return false;
      const until = Date.parse(trade.expiresAt);
      return !(trade.status === "open" && Number.isFinite(until) && until <= now);
    });
  } catch {
    return null;
  }
}

/** Stores a server trade list (never a predicted or locally edited one). */
export function writeTradeCache(storage, token, trades) {
  if (!token || !storage || !Array.isArray(trades)) return;
  try {
    storage.setItem(TRADE_CACHE_KEY, JSON.stringify({ token, trades: trades.slice(0, 200) }));
  } catch {
    /* A full storage only costs the instant first paint. */
  }
}
