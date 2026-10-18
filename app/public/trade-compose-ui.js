export const TRADE_SIDE_MAX = 3;

export function emptyTradeSide() {
  return { mode: "and", cardIds: [""], slotSets: [""] };
}

export function tradeModeHintHe(mode) {
  return mode === "or"
    ? "מספיק קלף אחד מהרשימה."
    : "צריך את כל הקלפים ברשימה.";
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

export function tradeComposeCardsInSet(cards, setKey) {
  if (!setKey) return [];
  const releaseId = String(setKey).replace(/^release:/, "");
  return (cards || []).filter((candidate) => (candidate.releaseSetId || "other") === releaseId);
}

export function sortTradeComposeOffered(cards, ownedCount, title) {
  return [...(cards || [])].sort((left, right) => {
    const countDiff = ownedCount(right) - ownedCount(left);
    if (countDiff) return countDiff;
    return String(title(left) || "").localeCompare(String(title(right) || ""), "he");
  });
}

export function sortTradeComposeWanted(cards, holderCount, title) {
  return [...(cards || [])].sort((left, right) => {
    const holderDiff = holderCount(right) - holderCount(left);
    if (holderDiff) return holderDiff;
    return String(title(left) || "").localeCompare(String(title(right) || ""), "he");
  });
}

export function orderTradeComposeSlotCards(cards, sideKey, { ownedCount, holderCount, title }) {
  return sideKey === "wanted"
    ? sortTradeComposeWanted(cards, holderCount, title)
    : sortTradeComposeOffered(cards, ownedCount, title);
}

/** Same visual count both dropdowns use: "15x", including "0x". */
export function tradeComposeCountTag(count) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  return `${Number.isFinite(n) ? n : 0}x`;
}

/** OR rails: first tap on an unhighlighted card only highlights. Second tap opens the viewer. AND never uses this. */
export function tradeOrChipTapOpensDialog(alreadyPicked) {
  return Boolean(alreadyPicked);
}
