/** Max cards per side of a trade (bundle or choice). */
export const TRADE_SIDE_MAX = 3;

export const TRADE_SIDE_MODES = {
  AND: "and",
  OR: "or",
};

export const TRADE_MESSAGES_HE = {
  INVALID_TRADE: "לא הצלחנו לפרסם את ההצעה.",
  INVALID_SIDE: "בדקו את הקלפים בהצעה.",
  DUPLICATE_IN_SIDE: "אותו קלף לא יכול להופיע פעמיים באותו צד.",
  CROSS_SIDE: "קלף לא יכול להיות בשני הצדדים.",
  TOO_MANY: `עד ${TRADE_SIDE_MAX} קלפים בכל צד.`,
  EMPTY_SIDE: "צריך לפחות קלף אחד בכל צד.",
  NOT_OWNED: "חסרה עותק מיותר לאחד הקלפים שאתם מציעים.",
  SAME_CARD: "צריך שני קלפים שונים.",
  NEEDS_CHOICE: "בחרו איזה קלף נותנים ומקבלים.",
  INVALID_CHOICE: "הבחירה לא מתאימה להצעה.",
  ACCEPT_FAILED: "ההצעה כבר לא זמינה או שחסר לכם הקלף.",
  ACCEPT_OWNER_MISSING: "למציע כבר אין את הקלף שנבחר.",
  ACCEPT_ACCEPTER_MISSING: "אין לכם עותק מיותר של הקלף שנבחר.",
};

function cleanMode(mode) {
  return mode === TRADE_SIDE_MODES.OR ? TRADE_SIDE_MODES.OR : TRADE_SIDE_MODES.AND;
}

function cleanIds(cardIds) {
  if (!Array.isArray(cardIds)) return [];
  return cardIds.map((id) => String(id || "").trim()).filter(Boolean);
}

/** Normalize a stored or in-flight trade record (legacy single-card fields included). */
export function normalizeStoredTrade(trade) {
  if (!trade || typeof trade !== "object") return trade;
  const offeredCardIds = cleanIds(trade.offeredCardIds?.length ? trade.offeredCardIds : [trade.offeredCardId]);
  const wantedCardIds = cleanIds(trade.wantedCardIds?.length ? trade.wantedCardIds : [trade.wantedCardId]);
  trade.offeredMode = cleanMode(trade.offeredMode);
  trade.wantedMode = cleanMode(trade.wantedMode);
  trade.offeredCardIds = offeredCardIds.slice(0, TRADE_SIDE_MAX);
  trade.wantedCardIds = wantedCardIds.slice(0, TRADE_SIDE_MAX);
  trade.offeredCardId = trade.offeredCardIds[0] || trade.offeredCardId || null;
  trade.wantedCardId = trade.wantedCardIds[0] || trade.wantedCardId || null;
  return trade;
}

export function parseTradeSideInput(side, legacyCardId) {
  if (side && typeof side === "object") {
    return {
      mode: cleanMode(side.mode),
      cardIds: cleanIds(side.cardIds),
    };
  }
  const legacy = String(legacyCardId || "").trim();
  return { mode: TRADE_SIDE_MODES.AND, cardIds: legacy ? [legacy] : [] };
}

export function parseCreateTradeInput(body = {}) {
  const offered = parseTradeSideInput(body.offered, body.offeredCardId);
  const wanted = parseTradeSideInput(body.wanted, body.wantedCardId);
  return { offered, wanted };
}

export function validateTradeShape({ offered, wanted }) {
  for (const [label, side] of [["offered", offered], ["wanted", wanted]]) {
    if (!side?.cardIds?.length) return { ok: false, code: "EMPTY_SIDE", messageHe: TRADE_MESSAGES_HE.EMPTY_SIDE, field: label };
    if (side.cardIds.length > TRADE_SIDE_MAX) return { ok: false, code: "TOO_MANY", messageHe: TRADE_MESSAGES_HE.TOO_MANY, field: label };
    if (new Set(side.cardIds).size !== side.cardIds.length) {
      return { ok: false, code: "DUPLICATE_IN_SIDE", messageHe: TRADE_MESSAGES_HE.DUPLICATE_IN_SIDE, field: label };
    }
  }
  const overlap = offered.cardIds.find((id) => wanted.cardIds.includes(id));
  if (overlap) return { ok: false, code: "CROSS_SIDE", messageHe: TRADE_MESSAGES_HE.CROSS_SIDE };
  if (offered.cardIds.length === 1 && wanted.cardIds.length === 1 && offered.cardIds[0] === wanted.cardIds[0]) {
    return { ok: false, code: "SAME_CARD", messageHe: TRADE_MESSAGES_HE.SAME_CARD };
  }
  return { ok: true };
}

export function tradeRecordFromSides({ ownerToken, offered, wanted, createdAt, expiresAt, tradeId }) {
  const trade = normalizeStoredTrade({
    tradeId,
    ownerToken,
    offeredMode: offered.mode,
    wantedMode: wanted.mode,
    offeredCardIds: offered.cardIds,
    wantedCardIds: wanted.cardIds,
    offeredCardId: offered.cardIds[0],
    wantedCardId: wanted.cardIds[0],
    status: "open",
    createdAt,
    expiresAt,
    acceptedAt: null,
    acceptedBy: null,
    acceptedOfferedCardId: null,
    acceptedWantedCardId: null,
  });
  trade.wantedMode = wanted.mode;
  return trade;
}

export function offeredCardsOf(trade) {
  return normalizeStoredTrade(trade).offeredCardIds;
}

export function wantedCardsOf(trade) {
  return normalizeStoredTrade(trade).wantedCardIds;
}

export function isOpenTrade(trade, at) {
  if (trade?.status !== "open") return false;
  if (!at) return true;
  return Date.parse(trade.expiresAt || 0) > Date.parse(at);
}

/** How many open offers reserve a spare copy of cardId from this owner. */
export function reservedOfferCopies(trades, ownerToken, cardId, at) {
  let count = 0;
  for (const raw of trades || []) {
    const trade = normalizeStoredTrade(raw);
    if (!isOpenTrade(trade, at) || trade.ownerToken !== ownerToken) continue;
    if (offeredCardsOf(trade).includes(cardId)) count += 1;
  }
  return count;
}

export function ownerCanOfferCards(session, trades, ownerToken, cardIds, at, regularCopyCount) {
  for (const cardId of cardIds) {
    const owned = regularCopyCount(session, cardId);
    const reserved = reservedOfferCopies(trades, ownerToken, cardId, at);
    if (owned <= reserved) return { ok: false, cardId };
  }
  return { ok: true };
}

export function sideNeedsChoice(mode, cardIds) {
  return mode === TRADE_SIDE_MODES.OR && cardIds.length > 1;
}

export function resolveAcceptCards(trade, { offeredCardId = null, wantedCardId = null } = {}) {
  const normalized = normalizeStoredTrade(trade);
  const offeredPick = sideNeedsChoice(normalized.offeredMode, normalized.offeredCardIds)
    ? String(offeredCardId || "").trim()
    : normalized.offeredCardIds[0];
  const wantedPick = sideNeedsChoice(normalized.wantedMode, normalized.wantedCardIds)
    ? String(wantedCardId || "").trim()
    : normalized.wantedCardIds[0];
  if (!offeredPick || !wantedPick) {
    return { ok: false, code: "NEEDS_CHOICE", messageHe: TRADE_MESSAGES_HE.NEEDS_CHOICE };
  }
  if (!normalized.offeredCardIds.includes(offeredPick)) {
    return { ok: false, code: "INVALID_CHOICE", messageHe: TRADE_MESSAGES_HE.INVALID_CHOICE, field: "offered" };
  }
  if (!normalized.wantedCardIds.includes(wantedPick)) {
    return { ok: false, code: "INVALID_CHOICE", messageHe: TRADE_MESSAGES_HE.INVALID_CHOICE, field: "wanted" };
  }
  return { ok: true, offeredCardId: offeredPick, wantedCardId: wantedPick };
}

export function viewerHoldsWantedSide(inventory, trade, regularCopyCountFn, session) {
  const normalized = normalizeStoredTrade(trade);
  const ids = wantedCardsOf(normalized);
  if (normalized.wantedMode === TRADE_SIDE_MODES.OR) {
    return ids.some((cardId) => regularCopyCountFn(session || { inventory }, cardId) > 0);
  }
  return ids.every((cardId) => regularCopyCountFn(session || { inventory }, cardId) > 0);
}

export function ownerHasOfferedSide(ownerSession, trade, at, trades, regularCopyCountFn) {
  const normalized = normalizeStoredTrade(trade);
  const ids = offeredCardsOf(normalized);
  const checkOne = (cardId) => {
    const owned = regularCopyCountFn(ownerSession, cardId);
    const reserved = reservedOfferCopies(trades, normalized.ownerToken, cardId, at) - (isOpenTrade(normalized, at) && ids.includes(cardId) ? 1 : 0);
    return owned > Math.max(0, reserved);
  };
  if (normalized.offeredMode === TRADE_SIDE_MODES.OR) {
    return ids.some(checkOne);
  }
  return ids.every(checkOne);
}

export function canAcceptTrade(trade, { owner, accepter, trades, at, regularCopyCountFn, offeredCardId = null, wantedCardId = null }) {
  const normalized = normalizeStoredTrade(trade);
  if (!isOpenTrade(normalized, at) || normalized.ownerToken === accepter?.token) {
    return { ok: false, code: "ACCEPT_FAILED", messageHe: TRADE_MESSAGES_HE.ACCEPT_FAILED };
  }
  const resolved = resolveAcceptCards(normalized, { offeredCardId, wantedCardId });
  if (!resolved.ok) return resolved;
  const cardsToMoveOffered = normalized.offeredMode === TRADE_SIDE_MODES.AND
    ? normalized.offeredCardIds
    : [resolved.offeredCardId];
  const cardsToMoveWanted = normalized.wantedMode === TRADE_SIDE_MODES.AND
    ? normalized.wantedCardIds
    : [resolved.wantedCardId];
  for (const cardId of cardsToMoveOffered) {
    if (regularCopyCountFn(owner, cardId) < 1) {
      return { ok: false, code: "ACCEPT_OWNER_MISSING", messageHe: TRADE_MESSAGES_HE.ACCEPT_OWNER_MISSING, cardId };
    }
  }
  for (const cardId of cardsToMoveWanted) {
    const owned = regularCopyCountFn(accepter, cardId);
    const reserved = accepter?.token
      ? reservedOfferCopies(trades, accepter.token, cardId, at)
      : 0;
    if (owned <= reserved) {
      return { ok: false, code: "ACCEPT_ACCEPTER_MISSING", messageHe: TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING, cardId };
    }
  }
  return {
    ok: true,
    offeredCardIds: cardsToMoveOffered,
    wantedCardIds: cardsToMoveWanted,
    acceptedOfferedCardId: resolved.offeredCardId,
    acceptedWantedCardId: resolved.wantedCardId,
  };
}

/** Valid (receive, give) pairs for OR sides when accepting. */
export function listAcceptChoices(trade, owner, accepter, trades, at, regularCopyCountFn) {
  const normalized = normalizeStoredTrade(trade);
  const offeredOptions = normalized.offeredMode === TRADE_SIDE_MODES.OR
    ? normalized.offeredCardIds
    : [normalized.offeredCardIds[0]];
  const wantedOptions = normalized.wantedMode === TRADE_SIDE_MODES.OR
    ? normalized.wantedCardIds
    : [normalized.wantedCardIds[0]];
  const pairs = [];
  for (const offeredCardId of offeredOptions) {
    for (const wantedCardId of wantedOptions) {
      const verdict = canAcceptTrade(normalized, {
        owner,
        accepter,
        trades,
        at,
        regularCopyCountFn,
        offeredCardId,
        wantedCardId,
      });
      if (verdict.ok) pairs.push({ offeredCardId, wantedCardId });
    }
  }
  return pairs;
}

export function tradeNeedsAcceptChoices(trade) {
  const normalized = normalizeStoredTrade(trade);
  return sideNeedsChoice(normalized.offeredMode, normalized.offeredCardIds)
    || sideNeedsChoice(normalized.wantedMode, normalized.wantedCardIds);
}

export function publicTradeView(trade, { token, ownerSession, viewerSession, trades, at, regularCopyCountFn }) {
  const normalized = normalizeStoredTrade(trade);
  const { ownerToken, acceptedBy, qaLabel, qaExpect, ...rest } = normalized;
  const choices = tradeNeedsAcceptChoices(normalized) && viewerSession && ownerSession
    ? listAcceptChoices(normalized, ownerSession, viewerSession, trades, at, regularCopyCountFn)
    : [];
  const canAcceptSimple = canAcceptTrade(normalized, {
    owner: ownerSession,
    accepter: viewerSession,
    trades,
    at,
    regularCopyCountFn,
  }).ok;
  return {
    ...rest,
    ownerToken: undefined,
    acceptedBy: undefined,
    ownedByCurrent: ownerToken === token,
    acceptedByCurrent: acceptedBy === token,
    canAccept: normalized.status === "open"
      && ownerToken !== token
      && ownerSession
      && viewerSession
      && (canAcceptSimple || choices.length > 0),
    acceptChoices: choices.length ? choices : undefined,
    needsAcceptChoice: tradeNeedsAcceptChoices(normalized) || undefined,
  };
}

export function totalInventoryCopies(sessions) {
  const totals = {};
  for (const session of Object.values(sessions || {})) {
    for (const [cardId, copies] of Object.entries(session?.inventory || {})) {
      totals[cardId] = (totals[cardId] || 0) + Number(copies || 0);
    }
  }
  return totals;
}

export function assertInventoryConserved(before, after) {
  const left = totalInventoryCopies(before);
  const right = totalInventoryCopies(after);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] || 0) !== (right[key] || 0)) {
      throw new Error(`inventory mismatch for ${key}: ${left[key] || 0} vs ${right[key] || 0}`);
    }
  }
}
