/**
 * Guy's rule, client side: a numbered copy is not a regular copy. Regular copies are the owned
 * inventory minus the numbered copies the player holds (server sends only opened ones in
 * numberedCopies). Owned / missing / x-of-y / set progress / trades / recycle all read this.
 */
export function regularInventoryFrom(inventory = {}, numberedCopies = []) {
  const numbered = {};
  for (const item of Array.isArray(numberedCopies) ? numberedCopies : []) {
    if (!(Number(item?.numberedIndex) > 0) || !item?.cardId) continue;
    numbered[item.cardId] = (numbered[item.cardId] || 0) + 1;
  }
  const regular = {};
  for (const [cardId, copies] of Object.entries(inventory || {})) {
    const owned = Math.max(0, Math.round(Number(copies) || 0));
    const left = owned - Math.min(owned, numbered[cardId] || 0);
    if (left > 0) regular[cardId] = left;
  }
  return regular;
}

/** Collection stars, same rule as the server: one regular copy adds its rarity, one numbered copy adds 4. */
export function collectionStarsFrom(inventory = {}, numberedCopies = [], cardsById = new Map()) {
  const regular = regularInventoryFrom(inventory, numberedCopies);
  const numberedIds = new Set((numberedCopies || []).filter((item) => Number(item?.numberedIndex) > 0 && (Number(inventory?.[item.cardId]) || 0) > 0).map((item) => item.cardId));
  let sum = 0;
  for (const cardId of new Set([...Object.keys(regular), ...numberedIds])) {
    const card = cardsById.get(cardId);
    if (regular[cardId]) {
      const rarity = String(card?.rarity || "");
      sum += rarity === "Promotion" ? 5 : rarity.startsWith("Rare") ? 3 : rarity.startsWith("Uncommon") ? 2 : 1;
    }
    if (numberedIds.has(cardId)) sum += 4;
  }
  return sum;
}
