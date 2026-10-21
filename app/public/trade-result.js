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

function mergeMoved(primary, fallback) {
  return {
    receivedCardIds: primary.receivedCardIds.length ? primary.receivedCardIds : fallback.receivedCardIds,
    givenCardIds: primary.givenCardIds.length ? primary.givenCardIds : fallback.givenCardIds,
  };
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

/** Prefer explicit accept-payload arrays; fall back to the listed trade, then the pre-accept snapshot + pick. */
export function movedCardsFromAccept(result, pick = {}, snapshot = null) {
  const received = cleanIds(result?.receivedCardIds);
  const given = cleanIds(result?.givenCardIds);
  const explicit = { receivedCardIds: received, givenCardIds: given };
  if (explicit.receivedCardIds.length && explicit.givenCardIds.length) return explicit;
  const fromResult = mergeMoved(explicit, movedCardsFromTrade(result?.trade || result, pick));
  if (fromResult.receivedCardIds.length && fromResult.givenCardIds.length) return fromResult;
  return mergeMoved(fromResult, movedCardsFromTrade(snapshot, pick));
}

export function acceptMovedCardIds(verdict, { viewer = "accepter" } = {}) {
  const offered = cleanIds(verdict?.offeredCardIds);
  const wanted = cleanIds(verdict?.wantedCardIds);
  return viewer === "owner"
    ? { receivedCardIds: wanted, givenCardIds: offered }
    : { receivedCardIds: offered, givenCardIds: wanted };
}

function catalogHas(catalog, cardId) {
  if (!catalog || !cardId) return false;
  if (typeof catalog.has === "function") return catalog.has(cardId);
  if (typeof catalog.get === "function") return Boolean(catalog.get(cardId));
  return Boolean(catalog[cardId]);
}

/** One dialog side: hidden only when there are no ids. A missing catalog card is still a filled thumb. */
export function tradeNoticeSide(cardIds, catalog) {
  const ids = cleanIds(cardIds);
  return {
    hidden: ids.length === 0,
    empty: false,
    ids,
    thumbs: ids.map((cardId) => ({
      cardId,
      found: catalogHas(catalog, cardId),
    })),
  };
}

export function tradeNoticeSides(moved, catalog) {
  return {
    received: tradeNoticeSide(moved?.receivedCardIds, catalog),
    given: tradeNoticeSide(moved?.givenCardIds, catalog),
  };
}

/** True when every visible side has at least one thumb — never an empty קיבלתם/נתתם box. */
export function tradeNoticeSidesFilled(sides) {
  const visible = [sides?.received, sides?.given].filter((side) => side && !side.hidden);
  if (!visible.length) return false;
  return visible.every((side) => side.ids.length > 0 && side.thumbs.length === side.ids.length && !side.empty);
}

export function tradeNoticeFallbackThumb(cardId) {
  const id = String(cardId || "").trim();
  return `<div class="trade-thumb trade-thumb-pending" data-card-id="${id}"><span class="trade-thumb-frame"><span class="kalpi-card is-notice-fallback" aria-label="קלף">קלף</span></span></div>`;
}
