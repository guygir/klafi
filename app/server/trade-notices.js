import { randomUUID } from "node:crypto";

const TRADE_NOTICE_CAP = 20;

export function publicTradeNotices(session) {
  return (Array.isArray(session?.pendingTradeNotices) ? session.pendingTradeNotices : [])
    .map((notice) => ({
      id: String(notice?.id || ""),
      tradeId: String(notice?.tradeId || ""),
      receivedCardId: String(notice?.receivedCardId || ""),
      givenCardId: String(notice?.givenCardId || ""),
      receivedCardIds: Array.isArray(notice?.receivedCardIds) ? notice.receivedCardIds.map(String) : [],
      givenCardIds: Array.isArray(notice?.givenCardIds) ? notice.givenCardIds.map(String) : [],
      acceptedAt: notice?.acceptedAt || null,
      accepterName: String(notice?.accepterName || "").trim() || "שחקן",
      ownerName: String(notice?.ownerName || "").trim() || "שחקן",
    }))
    .filter((notice) => notice.id && (notice.receivedCardId || notice.receivedCardIds.length));
}

export function enqueueAcceptedTradeNotice(owner, trade, {
  acceptedAt,
  accepterName,
  ownerName,
  receivedCardIds = null,
  givenCardIds = null,
} = {}) {
  if (!owner || !trade) return null;
  owner.pendingTradeNotices = Array.isArray(owner.pendingTradeNotices) ? owner.pendingTradeNotices : [];
  const received = Array.isArray(receivedCardIds) && receivedCardIds.length
    ? receivedCardIds.map(String)
    : [String(trade.acceptedWantedCardId || trade.wantedCardId || "")].filter(Boolean);
  const given = Array.isArray(givenCardIds) && givenCardIds.length
    ? givenCardIds.map(String)
    : [String(trade.acceptedOfferedCardId || trade.offeredCardId || "")].filter(Boolean);
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
}

export function ackTradeNotices(session, ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "")).filter(Boolean));
  if (!wanted.size) return session?.pendingTradeNotices || [];
  session.pendingTradeNotices = (Array.isArray(session?.pendingTradeNotices) ? session.pendingTradeNotices : [])
    .filter((notice) => !wanted.has(String(notice.id)));
  return session.pendingTradeNotices;
}
