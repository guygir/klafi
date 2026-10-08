/** Three plain copies of one card, spent without touching a numbered stamp. */
import { regularCopyCount } from "./numbered.js";

export const RECYCLE_COPIES = 3;

function heldInstances(session, cardId) {
  const unseen = new Set(session.unseenPulls || []);
  return (session.instances || []).filter((item) =>
    item?.cardId === cardId && !unseen.has(item.instanceId));
}

export function numberedHeldCount(session, cardId) {
  return heldInstances(session, cardId).filter((item) => Number(item.numberedIndex) > 0).length;
}

/** Inventory copies that are not a stamped print. Unseen warehouse copies are not held. */
export function plainCopyCount(session, cardId) {
  return regularCopyCount(session, cardId);
}

/**
 * Drop `count` plain copies. Stamped instances stay. Returns false when the plain
 * remainder is short, and then changes nothing.
 */
export function spendPlainCopies(session, cardId, count = RECYCLE_COPIES) {
  const needed = Math.round(Number(count) || 0);
  if (needed < 1 || plainCopyCount(session, cardId) < needed) return false;
  const plain = heldInstances(session, cardId).filter((item) => !(Number(item.numberedIndex) > 0));
  const drop = new Set(plain.slice(0, needed).map((item) => item.instanceId));
  if (drop.size) {
    session.instances = (session.instances || []).filter((item) => !drop.has(item.instanceId));
  }
  const next = (Number(session.inventory?.[cardId]) || 0) - needed;
  if (next > 0) session.inventory[cardId] = next;
  else delete session.inventory[cardId];
  return true;
}
