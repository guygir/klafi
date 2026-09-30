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
