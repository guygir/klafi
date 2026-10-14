export const TRADE_SIDE_MAX = 3;

export function emptyTradeSide() {
  return { mode: "and", cardIds: [""], slotSets: [""] };
}

export function tradeModeHintHe(mode) {
  return mode === "or"
    ? "מספיק קלף אחד מהרשימה."
    : "צריך את כל הקלפים ברשימה.";
}

export function tradeModeToggleLabel(mode) {
  return mode === "or" ? "אחד (או)" : "כולם (וגם)";
}

/** Poster-side summary (offered = they give, wanted = they ask). */
export function tradeFormationSummary(trade) {
  const offered = trade?.offeredMode === "or" ? "or" : "and";
  const wanted = trade?.wantedMode === "or" ? "or" : "and";
  return `נותנים ${tradeModeToggleLabel(offered)} · מבקשים ${tradeModeToggleLabel(wanted)}`;
}

export function sideJoinLabel(mode, index) {
  if (index <= 0) return "";
  return mode === "or" ? "או" : "+";
}

export function offeredCardIds(trade) {
  if (!trade) return [];
  if (Array.isArray(trade.offeredCardIds) && trade.offeredCardIds.length) return trade.offeredCardIds;
  return trade.offeredCardId ? [trade.offeredCardId] : [];
}

export function sideNeedsPick(mode, cardIds) {
  return mode === "or" && (cardIds?.length || 0) > 1;
}
