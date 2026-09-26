// Client/server state ordering. The server is authoritative; these helpers only decide which
// server payload is newest and hide cards the player has already opened while the seen ack is in
// flight. Nothing here invents state: every number still comes from a server payload.

/** Server write counter carried as `state.revision`; missing (old server / cache) means unknown. */
export function stateRevision(state) {
  const revision = Number(state?.revision);
  return Number.isFinite(revision) && revision >= 0 ? revision : null;
}

/**
 * True when `incoming` was computed before a state the client already applied. Responses can land
 * out of order (a settle sent before an open can arrive after the open's seen ack), so an older
 * revision must never overwrite a newer one. Equal revisions are the same server data.
 */
export function isStaleState(incoming, appliedRevision = 0) {
  const revision = stateRevision(incoming);
  return revision != null && revision < (Number(appliedRevision) || 0);
}

/**
 * Cards the player already opened stay hidden until the server confirms the seen ack. A payload
 * computed before the ack still lists them as ready; drop them from the queue and from the count
 * so the ready count never jumps back up after an open.
 */
export function overlayPendingSeen({ state, cards } = {}, pendingIds = []) {
  const pending = new Set((pendingIds || []).filter(Boolean));
  if (!pending.size || !state) return { state, cards };
  let stillReady = 0;
  let nextCards = cards;
  if (Array.isArray(cards)) {
    stillReady = cards.filter(({ instanceId }) => pending.has(instanceId)).length;
    nextCards = cards.filter(({ instanceId }) => !pending.has(instanceId));
  } else if (Array.isArray(state.instances)) {
    stillReady = state.instances.filter(({ instanceId, seenAt }) => pending.has(instanceId) && !seenAt).length;
  }
  if (!stillReady || typeof state.unseenCount !== "number") return { state, cards: nextCards };
  return { state: { ...state, unseenCount: Math.max(0, state.unseenCount - stillReady) }, cards: nextCards };
}

// /api/community (slim) carries the race day/party but no leaders; only /api/leaderboards counts
// them. Never let the slim board wipe the leaders of the same day (the "0 on the race" snapshot).
export function keepDailyRaceLeaders(previous, incoming) {
  const before = previous?.dailyChallenge;
  const next = incoming?.dailyChallenge;
  if (!before?.leaders?.length || next?.leaders?.length || (next?.day && next.day !== before.day)) return incoming;
  return { ...incoming, dailyChallenge: { ...next, ...before, leaders: before.leaders } };
}

// The race board hides other players on 0 (the server already does); the player's own row stays.
// Applied on every board write so cached/merged leaders never bring zeros back.
export function hideZeroRaceEntries(boards) {
  const leaders = boards?.dailyChallenge?.leaders;
  if (!Array.isArray(leaders)) return boards;
  const visible = leaders.filter((entry) => entry?.current || Number(entry?.cards) > 0);
  if (visible.length === leaders.length) return boards;
  return { ...boards, dailyChallenge: { ...boards.dailyChallenge, leaders: visible } };
}

export function mergeLeaderboards(previous, incoming) {
  if (!incoming) return incoming ?? null;
  return hideZeroRaceEntries(keepDailyRaceLeaders(previous, incoming));
}
