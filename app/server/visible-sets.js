export const LIVE_RELEASE_SET_IDS = Object.freeze([
  "party-leaders",
  "party-slot-2",
  "decisions",
  "records",
]);

export function isLiveReleaseSet(id) {
  return LIVE_RELEASE_SET_IDS.includes(id);
}

export function visiblePlayerCards(cards = []) {
  return cards.filter((card) => isLiveReleaseSet(card.releaseSetId));
}

export function visibleReleaseSets(sets = []) {
  return sets.filter((set) => isLiveReleaseSet(set.id));
}

export function cardIndexFromCatalog(cards = []) {
  return visiblePlayerCards(cards).map((card) => ({
    id: card.id,
    set: card.set,
    setNameHe: card.setNameHe || card.setName || card.set,
    rarity: card.rarity || "Common",
    releaseSetId: card.releaseSetId,
  }));
}

export function collectionStarCount(inventory = {}, cardIndex = []) {
  const byId = new Map(cardIndex.map((card) => [card.id, card]));
  return Object.keys(inventory).reduce((sum, cardId) => {
    const card = byId.get(cardId);
    if (!card) return sum;
    if (card.rarity === "Promotion") return sum + 5;
    if (card.rarity.startsWith("Rare")) return sum + 3;
    if (card.rarity.startsWith("Uncommon")) return sum + 2;
    return sum + 1;
  }, 0);
}
