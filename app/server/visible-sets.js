import { collectionStars } from "./stars.js";

export const LIVE_RELEASE_SET_IDS = Object.freeze([
  "party-leaders",
  "party-slot-2",
  "decisions",
  "records",
  "set-5",
  "set-6",
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

export function collectionStarCount(inventory = {}, cardIndex = [], numberedByCard = {}) {
  return collectionStars(inventory, cardIndex, numberedByCard, { unknown: "skip" });
}
