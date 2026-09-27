import { randomUUID } from "node:crypto";

const TRADE_NOTICE_CAP = 20;

export function publicTradeNotices(session) {
  return (Array.isArray(session?.pendingTradeNotices) ? session.pendingTradeNotices : [])
    .map((notice) => ({
      id: String(notice?.id || ""),
      tradeId: String(notice?.tradeId || ""),
      receivedCardId: String(notice?.receivedCardId || ""),
      givenCardId: String(notice?.givenCardId || ""),
      acceptedAt: notice?.acceptedAt || null,
      accepterName: String(notice?.accepterName || "").trim() || "שחקן",
    }))
    .filter((notice) => notice.id && notice.receivedCardId);
}

export function enqueueAcceptedTradeNotice(owner, trade, { acceptedAt, accepterName } = {}) {
  if (!owner || !trade) return null;
  owner.pendingTradeNotices = Array.isArray(owner.pendingTradeNotices) ? owner.pendingTradeNotices : [];
  const notice = {
    id: randomUUID(),
    tradeId: trade.tradeId,
    receivedCardId: trade.wantedCardId,
    givenCardId: trade.offeredCardId,
    acceptedAt: acceptedAt || null,
    accepterName: String(accepterName || "").trim() || "שחקן",
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
