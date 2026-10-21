/** Cards that actually moved in an accept. One function for every side combo. */

/** Arrays, JSON strings, and leftover single ids all become a clean id list. */
export function parseCardIds(cardIds, fallback) {
  let value = cardIds;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) value = [];
    else if (text.startsWith("[") || text.startsWith("{")) {
      try { value = JSON.parse(text); } catch { value = [text]; }
    } else {
      value = [text];
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    value = Object.values(value);
  }
  const list = Array.isArray(value)
    ? value.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (list.length) return list;
  const legacy = String(fallback || "").trim();
  return legacy ? [legacy] : [];
}

const cleanIds = parseCardIds;

function mergeMoved(primary, fallback) {
  return {
    receivedCardIds: primary.receivedCardIds.length ? primary.receivedCardIds : fallback.receivedCardIds,
    givenCardIds: primary.givenCardIds.length ? primary.givenCardIds : fallback.givenCardIds,
  };
}

/**
 * Cards that move on one trade side. 1-card OR and 1-card AND are the same:
 * the mode flag is ignored. OR with many cards uses the pick; AND with many
 * uses every id. A side that has ids never returns empty.
 */
export function cardsMovedOnSide(side = {}, pickId = null) {
  const ids = cleanIds(side.cardIds, side.cardId);
  if (ids.length <= 1) return ids;
  if (side.mode !== "or") return ids;
  const chosen = String(side.acceptedCardId || pickId || "").trim();
  if (chosen) return [chosen];
  return [ids[0]];
}

function sideFromTrade(trade, which) {
  if (which === "offered") {
    return {
      mode: trade?.offeredMode,
      cardIds: trade?.offeredCardIds,
      cardId: trade?.offeredCardId,
      acceptedCardId: trade?.acceptedOfferedCardId,
    };
  }
  return {
    mode: trade?.wantedMode,
    cardIds: trade?.wantedCardIds,
    cardId: trade?.wantedCardId,
    acceptedCardId: trade?.acceptedWantedCardId,
  };
}

/** Cards that moved. Accepter received the offered side; owner received the wanted side. */
export function movedCardsFromTrade(trade, { offeredCardId = null, wantedCardId = null, viewer = "accepter" } = {}) {
  const received = cardsMovedOnSide(sideFromTrade(trade, "offered"), offeredCardId);
  const given = cardsMovedOnSide(sideFromTrade(trade, "wanted"), wantedCardId);
  return viewer === "owner"
    ? { receivedCardIds: given, givenCardIds: received }
    : { receivedCardIds: received, givenCardIds: given };
}

/** Prefer explicit accept-payload arrays; else the same cardsMovedOnSide math on the trade / snapshot. */
export function movedCardsFromAccept(result, pick = {}, snapshot = null) {
  const explicit = acceptDialogCards(result);
  if (explicit.receivedCardIds.length && explicit.givenCardIds.length) return explicit;
  const fromResult = mergeMoved(explicit, movedCardsFromTrade(result?.trade || result, pick));
  if (fromResult.receivedCardIds.length && fromResult.givenCardIds.length) return fromResult;
  return mergeMoved(fromResult, movedCardsFromTrade(snapshot, pick));
}

/**
 * Verdict or accept payload → dialog ids. One mapping for store, handler, and client.
 * Prefer explicit received/given (already the cards that moved). Otherwise the
 * verdict's offered/wanted lists are the moved ids from cardsMovedOnSide.
 */
export function acceptDialogCards(source, { viewer = "accepter" } = {}) {
  try {
    const explicitReceived = cleanIds(source?.receivedCardIds, source?.receivedCardId);
    const explicitGiven = cleanIds(source?.givenCardIds, source?.givenCardId);
    const offered = cleanIds(source?.offeredCardIds);
    const wanted = cleanIds(source?.wantedCardIds);
    const fromVerdict = viewer === "owner"
      ? { receivedCardIds: wanted, givenCardIds: offered }
      : { receivedCardIds: offered, givenCardIds: wanted };
    return {
      receivedCardIds: explicitReceived.length ? explicitReceived : fromVerdict.receivedCardIds,
      givenCardIds: explicitGiven.length ? explicitGiven : fromVerdict.givenCardIds,
    };
  } catch {
    return { receivedCardIds: [], givenCardIds: [] };
  }
}

/** Creator-side notice: owner received the wanted cards and gave the offered cards. */
export function movedCardsFromNotice(notice, trade = null) {
  const explicit = acceptDialogCards(notice, { viewer: "owner" });
  if (explicit.receivedCardIds.length && explicit.givenCardIds.length) return explicit;
  return mergeMoved(explicit, movedCardsFromTrade(trade, { viewer: "owner" }));
}

export const acceptMovedCardIds = acceptDialogCards;

function catalogHas(catalog, cardId) {
  try {
    if (!catalog || !cardId) return false;
    if (typeof catalog.has === "function") return catalog.has(cardId);
    if (typeof catalog.get === "function") return Boolean(catalog.get(cardId));
    return Boolean(catalog[cardId]);
  } catch {
    return false;
  }
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
