export function jerusalemDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(ms));
}

export function previousJerusalemDay(ms) {
  const today = jerusalemDay(ms);
  const noon = Date.parse(`${today}T12:00:00+03:00`);
  return jerusalemDay(Number.isFinite(noon) ? noon - 24 * 60 * 60 * 1000 : ms - 24 * 60 * 60 * 1000);
}

export function applyLoginStreak(session, nowMs) {
  // Pack-open days only. Callers stamp this when a player opens a granted pack.
  const today = jerusalemDay(nowMs);
  if (session.loginDay === today) return false;
  session.loginStreak = session.loginDay === previousJerusalemDay(nowMs)
    ? Math.max(1, Number(session.loginStreak) || 0) + 1
    : 1;
  session.loginDay = today;
  return true;
}

export function streakLabel(streak) {
  const count = Math.max(0, Math.round(Number(streak) || 0));
  return count >= 3 ? `רצף ${count}` : "";
}

export const DEFAULT_NUMBERED_EVERY = 30;

export function normalizeNumberedSets(value, releaseIds = []) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(releaseIds);
  return [...new Set(value.map(String))].filter((id) => !allowed.size || allowed.has(id));
}

export function normalizeNumberedEvery(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_NUMBERED_EVERY;
  return Math.min(1000, n);
}

export function stampFromGrantCount(grants, max, every = DEFAULT_NUMBERED_EVERY) {
  const interval = normalizeNumberedEvery(every);
  const cap = Math.max(0, Math.round(Number(max) || 0));
  const count = Math.max(0, Math.round(Number(grants) || 0));
  if (!interval || !cap || count < interval || count % interval !== 0) return null;
  const index = count / interval;
  if (index > cap) return null;
  return { index, of: cap };
}

export function stampMax(card) {
  const slot = Number(card?.listSlot);
  return Number.isInteger(slot) && slot > 0 ? slot : 0;
}

export function stampEligible(card, numberedSets = []) {
  return Boolean(
    card
    && stampMax(card) > 0
    && Array.isArray(numberedSets)
    && numberedSets.includes(card.releaseSetId)
    && !card.eventOnly,
  );
}

export function stampFromGrant(card, numberedSets, acquiredBy) {
  return acquiredBy === "idle" && stampEligible(card, numberedSets);
}

export function stampKey(card) {
  if (card?.releaseSetId === "set-5") return String(card.id);
  return `${card.set}:${Number(card.listSlot)}`;
}

export function numberedCopies(instances = []) {
  return (instances || []).filter((item) => Number(item?.numberedIndex) > 0);
}

export function takeInstanceForCard(session, cardId) {
  const instances = session.instances || [];
  const pick = [...instances].reverse().find((item) => item.cardId === cardId && item.numberedIndex)
    || [...instances].reverse().find((item) => item.cardId === cardId);
  if (!pick) return null;
  session.instances = instances.filter((item) => item.instanceId !== pick.instanceId);
  return pick;
}

export function moveOwnedCard(from, to, cardId, { acquiredBy, pulledAt, finish, instanceId }) {
  from.inventory[cardId] -= 1;
  if (!from.inventory[cardId]) delete from.inventory[cardId];
  const isNew = !to.inventory[cardId];
  to.inventory[cardId] = (to.inventory[cardId] ?? 0) + 1;
  const instance = takeInstanceForCard(from, cardId);
  to.instances.push(instance
    ? {
      ...instance,
      isNew,
      acquiredBy,
      pulledAt,
      seenAt: null,
    }
    : {
      instanceId,
      cardId,
      finish,
      pulledAt,
      isNew,
      acquiredBy,
      seenAt: null,
    });
  return instance;
}
