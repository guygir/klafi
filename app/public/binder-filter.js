/**
 * Which release sets the binder treats as open.
 * The hidden ids stay with openBinderReleaseIds() in app.js (the dropdown helper).
 * This only applies that list. It does not decide which sets are held.
 */
export function binderOpenReleaseIds(releaseSets = [], catalog = [], liveIds = [], hiddenIds = []) {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds);
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds);
  return (releaseSets || [])
    .map((set) => set?.id)
    .filter((id) => id && live.has(id) && !hidden.has(id))
    .filter((id) => (catalog || []).some((card) => card.releaseSetId === id && !card.eventOnly));
}

/**
 * Set filter for one binder card.
 * ALL uses the open-set ids from openBinderReleaseIds(), not every live set.
 * SPECIALS, NUMBERED, and RELEASE: are unchanged.
 */
export function binderReleaseOk(card, filter, { openReleaseIds, numberedIds } = {}) {
  const open = openReleaseIds instanceof Set ? openReleaseIds : new Set(openReleaseIds || []);
  const releaseOk = filter === "ALL"
    ? open.has(card?.releaseSetId)
    : (filter === "SPECIALS" ? Boolean(card?.eventOnly)
      : filter === "NUMBERED" ? Boolean(numberedIds?.has(card?.id))
      : typeof filter === "string" && filter.startsWith("RELEASE:") && card?.releaseSetId === filter.slice(8));
  return releaseOk;
}
