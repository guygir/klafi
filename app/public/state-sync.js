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
 * Fields only full state payloads carry (home, /api/state, /api/achievements); idle settle and open
 * responses never do. They are not card or pack counts, so they get per-field freshness: a payload
 * the revision check drops as stale may still fill them when nothing newer supplied them (a settle
 * that lands before home must not leave the achievements screen without the server list).
 * Inventory, unseen pulls and pack counts stay under isStaleState.
 */
export const LATE_STATE_FIELDS = Object.freeze(["achievements", "achievementPages"]);

/**
 * `next` with the late fields decided per field: `incoming`'s value wins when it is at least as new
 * as the payload that last supplied that field (or none did); otherwise `previous`'s value stays.
 * Returns { state, revisions, applied } (applied = field names taken from `incoming`).
 */
export function withLateFields(previous, next, incoming, fieldRevisions = {}) {
  const revision = stateRevision(incoming) ?? 0;
  const state = { ...(next || {}) };
  const revisions = { ...(fieldRevisions || {}) };
  const applied = [];
  for (const key of LATE_STATE_FIELDS) {
    const value = incoming?.[key];
    const usable = key === "achievements" ? Array.isArray(value) && value.length > 0 : value != null;
    if (usable && (revisions[key] == null || revision >= revisions[key])) {
      state[key] = value;
      revisions[key] = revision;
      applied.push(key);
    } else if (previous?.[key] != null) {
      state[key] = previous[key];
    }
  }
  return { state, revisions, applied };
}

function earliestIdleMs(state) {
  const times = [];
  for (const pull of state?.preparedPulls || []) {
    const at = Date.parse(pull?.availableAt);
    if (Number.isFinite(at)) times.push(at);
  }
  const scheduled = Date.parse(state?.nextIdleAt);
  if (Number.isFinite(scheduled)) times.push(scheduled);
  return times.length ? Math.min(...times) : null;
}

/**
 * A same-revision home or settle is not a newer write (a no-op settle does not
 * bump the revision). It must not paint an earlier, due clock over a clock the
 * client already moved forward. An older revision is left to isStaleState.
 * A higher revision replaces the clock.
 */
export function mergeIdleClock(previous, incoming, appliedRevision = stateRevision(previous)) {
  if (!incoming || typeof incoming !== "object") return incoming;
  const incomingRevision = stateRevision(incoming);
  const applied = Number(appliedRevision) || 0;
  if (incomingRevision == null || incomingRevision !== applied) return incoming;
  const previousAt = earliestIdleMs(previous);
  const incomingAt = earliestIdleMs(incoming);
  if (previousAt == null || incomingAt == null || previousAt <= incomingAt) return incoming;
  return {
    ...incoming,
    nextIdleAt: previous.nextIdleAt,
    preparedPulls: previous.preparedPulls || [],
  };
}

/** The instance the server still lists as an unseen pull. A cached id that is missing was already opened. */
export function confirmedIdleInstance(cards, cachedId) {
  const queue = (Array.isArray(cards) ? cards : []).filter((card) => card?.instanceId);
  if (!cachedId) return queue[0] || null;
  return queue.find((card) => card.instanceId === cachedId) || null;
}

/**
 * Ids /api/idle/seen actually accepted. A bare 200 with no accepted list confirms nothing.
 * Refused ids were in this batch and must not be treated as opened.
 */
export function seenAckDecision(payload, sentIds = []) {
  const sent = [...sentIds].map(String).filter(Boolean);
  const reported = Array.isArray(payload?.acceptedInstanceIds)
    ? payload.acceptedInstanceIds.map(String)
    : null;
  if (!reported) return { accepted: [], refused: [], confirmed: false };
  const allowed = new Set(reported);
  return {
    accepted: sent.filter((id) => allowed.has(id)),
    refused: sent.filter((id) => !allowed.has(id)),
    confirmed: true,
  };
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

/** How long a home settle may vouch for the next open without asking the server again. */
export const INSTANT_OPEN_WINDOW_MS = 90_000;

/**
 * Pure decision for opening a warehouse card: can the last applied /api/idle/settle answer
 * stand in for a fresh one? Conservative: any doubt returns { fast: false } (the old
 * "פותחים…" + settle flow runs). On fast, `card` is the confirmed instance to reveal.
 */
export function canOpenFromLastSettle({
  lastSettle = null,
  now = Date.now(),
  pendingSeen = [],
  cachedId = null,
  needsSettle = false,
  settleInFlight = false,
  token = null,
  revision = 0,
  queuedIds = null,
  windowMs = INSTANT_OPEN_WINDOW_MS,
} = {}) {
  const slow = (reason) => ({ fast: false, reason, card: null });
  if (!lastSettle || !lastSettle.payload) return slow("no-settle");
  if (settleInFlight) return slow("in-flight");
  if (needsSettle) return slow("clock-due");
  if (!cachedId) return slow("no-cached-card");
  if (!token || lastSettle.token !== token) return slow("token-changed");
  const age = now - Number(lastSettle.at);
  if (!Number.isFinite(age) || age < 0 || age > windowMs) return slow("stale");
  const { cards } = overlayPendingSeen(
    { state: lastSettle.payload.state || {}, cards: lastSettle.payload.cards || [] },
    pendingSeen,
  );
  const card = confirmedIdleInstance(cards, cachedId);
  if (!card) return slow((pendingSeen || []).includes(cachedId) ? "already-opened" : "not-in-settle");
  // A newer state applied since this settle (e.g. a seen ack) is fine only if the card is still queued locally.
  const settleRevision = Number(lastSettle.revision) || 0;
  if ((Number(revision) || 0) > settleRevision) {
    if (!Array.isArray(queuedIds) || !queuedIds.includes(cachedId)) return slow("newer-state");
  }
  return { fast: true, reason: "resolved", card };
}
