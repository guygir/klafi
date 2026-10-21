import { randomUUID } from "node:crypto";
import { parseCardIds } from "../public/trade-result.js";

const TRADE_NOTICE_CAP = 20;

export function publicTradeNotices(session) {
  return (Array.isArray(session?.pendingTradeNotices) ? session.pendingTradeNotices : [])
    .map((notice) => {
      const receivedCardIds = parseCardIds(notice?.receivedCardIds, notice?.receivedCardId);
      const givenCardIds = parseCardIds(notice?.givenCardIds, notice?.givenCardId);
      return {
        id: String(notice?.id || ""),
        tradeId: String(notice?.tradeId || ""),
        receivedCardId: receivedCardIds[0] || String(notice?.receivedCardId || ""),
        givenCardId: givenCardIds[0] || String(notice?.givenCardId || ""),
        receivedCardIds,
        givenCardIds,
        acceptedAt: notice?.acceptedAt || null,
        accepterName: String(notice?.accepterName || "").trim() || "שחקן",
        ownerName: String(notice?.ownerName || "").trim() || "שחקן",
      };
    })
    .filter((notice) => notice.id && (notice.receivedCardId || notice.givenCardId || notice.receivedCardIds.length || notice.givenCardIds.length));
}

export function enqueueAcceptedTradeNotice(owner, trade, {
  acceptedAt,
  accepterName,
  ownerName,
  receivedCardIds = null,
  givenCardIds = null,
} = {}) {
  try {
    if (!owner || !trade) return null;
    owner.pendingTradeNotices = Array.isArray(owner.pendingTradeNotices) ? owner.pendingTradeNotices : [];
    const received = parseCardIds(receivedCardIds, trade.acceptedWantedCardId || trade.wantedCardId);
    const given = parseCardIds(givenCardIds, trade.acceptedOfferedCardId || trade.offeredCardId);
    const notice = {
      id: randomUUID(),
      tradeId: trade.tradeId,
      receivedCardId: received[0] || "",
      givenCardId: given[0] || "",
      receivedCardIds: received,
      givenCardIds: given,
      acceptedAt: acceptedAt || null,
      accepterName: String(accepterName || "").trim() || "שחקן",
      ownerName: String(ownerName || owner.displayName || "").trim() || "שחקן",
    };
    owner.pendingTradeNotices.push(notice);
    if (owner.pendingTradeNotices.length > TRADE_NOTICE_CAP) {
      owner.pendingTradeNotices = owner.pendingTradeNotices.slice(-TRADE_NOTICE_CAP);
    }
    return notice;
  } catch {
    return null;
  }
}

export function ackTradeNotices(session, ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "")).filter(Boolean));
  if (!wanted.size) return session?.pendingTradeNotices || [];
  session.pendingTradeNotices = (Array.isArray(session?.pendingTradeNotices) ? session.pendingTradeNotices : [])
    .filter((notice) => !wanted.has(String(notice.id)));
  return session.pendingTradeNotices;
}
