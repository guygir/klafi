/** Cards that actually moved in an accept, for the result dialog and owner notice. */

function cleanIds(cardIds, fallback) {
  const list = Array.isArray(cardIds)
    ? cardIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (list.length) return list;
  const legacy = String(fallback || "").trim();
  return legacy ? [legacy] : [];
}

function orPick(mode, ids, acceptedId, pickId) {
  if (mode === "or") return cleanIds([acceptedId || pickId], ids[0]);
  return ids;
}

/** Accepter view: received = offered side that moved; given = wanted side that moved. */
export function movedCardsFromTrade(trade, { offeredCardId = null, wantedCardId = null } = {}) {
  const offered = cleanIds(trade?.offeredCardIds, trade?.offeredCardId);
  const wanted = cleanIds(trade?.wantedCardIds, trade?.wantedCardId);
  return {
    receivedCardIds: orPick(trade?.offeredMode, offered, trade?.acceptedOfferedCardId, offeredCardId),
    givenCardIds: orPick(trade?.wantedMode, wanted, trade?.acceptedWantedCardId, wantedCardId),
  };
}

/** Prefer explicit accept-payload arrays; fall back to the trade + pick. */
export function movedCardsFromAccept(result, pick = {}) {
  const received = cleanIds(result?.receivedCardIds);
  const given = cleanIds(result?.givenCardIds);
  if (received.length || given.length) return { receivedCardIds: received, givenCardIds: given };
  return movedCardsFromTrade(result?.trade || result, pick);
}

export function acceptMovedCardIds(verdict, { viewer = "accepter" } = {}) {
  const offered = cleanIds(verdict?.offeredCardIds);
  const wanted = cleanIds(verdict?.wantedCardIds);
  return viewer === "owner"
    ? { receivedCardIds: wanted, givenCardIds: offered }
    : { receivedCardIds: offered, givenCardIds: wanted };
}
