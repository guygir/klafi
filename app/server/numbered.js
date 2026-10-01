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
  // Kept for old sessions. The flame and streak badges read the visit run.
  session.bestLoginStreak = Math.max(Number(session.bestLoginStreak) || 0, session.loginStreak);
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

export function grantCadenceToMinted(grants, every = DEFAULT_NUMBERED_EVERY) {
  const interval = normalizeNumberedEvery(every);
  const count = Math.max(0, Math.round(Number(grants) || 0));
  return Math.floor(count / interval);
}

export function rollNumberedStamp(minted, max, every = DEFAULT_NUMBERED_EVERY, random = Math.random) {
  const interval = normalizeNumberedEvery(every);
  const cap = Math.max(0, Math.round(Number(max) || 0));
  const have = Math.max(0, Math.round(Number(minted) || 0));
  if (!interval || !cap || have >= cap) return null;
  const roll = Number(typeof random === "function" ? random() : random);
  if (!Number.isFinite(roll) || roll >= 1 / interval) return null;
  return { index: have + 1, of: cap };
}

/** Numbers still available. A legacy issued count means 1..issued are already out. */
export function openNumberPool(issued, max) {
  const cap = Math.max(0, Math.round(Number(max) || 0));
  const have = Math.min(cap, Math.max(0, Math.round(Number(issued) || 0)));
  const pool = [];
  for (let n = have + 1; n <= cap; n += 1) pool.push(n);
  return pool;
}

export function normalizeNumberPool(value, max) {
  const cap = Math.max(0, Math.round(Number(max) || 0));
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const pool = [];
  for (const item of value) {
    const n = Math.round(Number(item));
    if (!Number.isInteger(n) || n < 1 || n > cap || seen.has(n)) continue;
    seen.add(n);
    pool.push(n);
  }
  pool.sort((left, right) => left - right);
  return pool;
}

export function numberPoolFromStored(stored, max) {
  const cap = Math.max(0, Math.round(Number(max) || 0));
  return normalizeNumberPool(stored, cap) || openNumberPool(stored, cap);
}

/** Removes one remaining number at random. The same random stream the chance roll uses stays deterministic in tests. */
export function drawNumberedIndex(pool, random = Math.random) {
  if (!pool?.length) return null;
  const roll = Number(typeof random === "function" ? random() : random);
  const unit = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0;
  const at = Math.min(pool.length - 1, Math.floor(unit * pool.length));
  return {
    index: pool[at],
    pool: pool.filter((_, index) => index !== at),
  };
}

export function returnNumberedIndex(pool, index, max) {
  const cap = Math.max(0, Math.round(Number(max) || 0));
  const n = Math.round(Number(index));
  const current = normalizeNumberPool(pool, cap) || [];
  if (!Number.isInteger(n) || n < 1 || n > cap || current.includes(n)) return current;
  return [...current, n].sort((left, right) => left - right);
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

export function regularCopyCount(session, cardId) {
  const inventory = Math.max(0, Number(session?.inventory?.[cardId] || 0));
  const numbered = (session?.instances || []).filter((item) => item?.cardId === cardId && Number(item.numberedIndex) > 0).length;
  return Math.max(0, inventory - numbered);
}

export function takeInstanceForCard(session, cardId) {
  const instances = session.instances || [];
  const pick = [...instances].reverse().find((item) => item.cardId === cardId && item.numberedIndex)
    || [...instances].reverse().find((item) => item.cardId === cardId);
  if (!pick) return null;
  session.instances = instances.filter((item) => item.instanceId !== pick.instanceId);
  return pick;
}

export function takePlainInstanceForCard(session, cardId) {
  const instances = session.instances || [];
  const pick = [...instances].reverse().find((item) => item.cardId === cardId && !(Number(item.numberedIndex) > 0));
  if (!pick) return null;
  session.instances = instances.filter((item) => item.instanceId !== pick.instanceId);
  return pick;
}

export function moveOwnedCard(from, to, cardId, { acquiredBy, pulledAt, finish, instanceId }) {
  if (regularCopyCount(from, cardId) < 1) return null;
  from.inventory[cardId] -= 1;
  if (!from.inventory[cardId]) delete from.inventory[cardId];
  const isNew = !to.inventory[cardId];
  to.inventory[cardId] = (to.inventory[cardId] ?? 0) + 1;
  const instance = takePlainInstanceForCard(from, cardId);
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
