/** Collection stars. One plain copy adds its rarity once. One numbered copy adds four, except a promo, which keeps its rarity (5). */

export const NUMBERED_STARS = 4;

export function rarityStars(card) {
  if (card?.rarity === "Promotion") return 5;
  if (card?.rarity?.startsWith("Rare")) return 3;
  if (card?.rarity?.startsWith("Uncommon")) return 2;
  return 1;
}

/** Numbered copies are worth four stars. A promo keeps the five stars printed on the card. */
export function numberedStarValue(card) {
  if (card?.rarity === "Promotion") return rarityStars(card);
  return NUMBERED_STARS;
}

/** Seen numbered copies, once the warehouse has been opened. A waiting pull does not count. */
export function numberedHeldByCard(session) {
  if (session?.numberedByCard && typeof session.numberedByCard === "object" && !Array.isArray(session.numberedByCard)) {
    return session.numberedByCard;
  }
  const unseen = new Set(session?.unseenPulls || []);
  const counts = {};
  for (const item of session?.instances || []) {
    if (!(Number(item?.numberedIndex) > 0) || !item?.cardId || unseen.has(item.instanceId)) continue;
    counts[item.cardId] = (counts[item.cardId] || 0) + 1;
  }
  return counts;
}

export function collectionStars(inventory = {}, cards = [], numberedByCard = {}, { unknown = "one" } = {}) {
  const byId = cards instanceof Map ? cards : new Map((cards || []).map((card) => [card.id, card]));
  let sum = 0;
  for (const [cardId, copies] of Object.entries(inventory || {})) {
    const owned = Number(copies) || 0;
    if (owned <= 0) continue;
    const numbered = Math.min(owned, Math.max(0, Math.round(Number(numberedByCard?.[cardId]) || 0)));
    const plain = owned - numbered;
    const card = byId.get(cardId);
    if (!card) {
      if (unknown === "skip") continue;
      if (plain > 0) sum += 1;
      if (numbered > 0) sum += NUMBERED_STARS;
      continue;
    }
    if (plain > 0) sum += rarityStars(card);
    if (numbered > 0) sum += numberedStarValue(card);
  }
  return sum;
}
