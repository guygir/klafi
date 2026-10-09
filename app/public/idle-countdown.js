export const IDLE_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const IDLE_BACKLOG_CAP = 8;
export const IDLE_FULL_COPY = "אין מקום לאגור עוד חבילות. אתם לא יודעים שהנדל״ן יקר פה?";
export const HOME_SETTLE_HINT = "(רגע, אני טוען… אולי מגיע לכם עוד?)";

export function timeUntil(iso, now = Date.now()) {
  if (!iso) return 0;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - now);
}

export function parseIdleTime(iso) {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
}

function knownIdleTimes(serverState) {
  const times = [];
  for (const pull of serverState?.preparedPulls || []) {
    const at = parseIdleTime(pull?.availableAt);
    if (at != null) times.push(at);
  }
  const scheduled = parseIdleTime(serverState?.nextIdleAt);
  if (scheduled != null) times.push(scheduled);
  return times.sort((left, right) => left - right);
}

export function idleIntervalMs(serverState) {
  const configured = Number(serverState?.idleIntervalMs);
  return configured > 0 ? configured : IDLE_INTERVAL_MS;
}

export function nextCollectionAt(serverState, now = Date.now(), intervalMs = idleIntervalMs(serverState)) {
  const times = knownIdleTimes(serverState);
  const future = times.filter((at) => at > now);
  if (future[0]) return future[0];
  const latest = times.at(-1);
  if (latest != null) {
    let slot = latest;
    while (slot <= now) slot += intervalMs;
    return slot;
  }
  return now + intervalMs;
}

export function nextCollectionRemaining(serverState, now = Date.now(), intervalMs = idleIntervalMs(serverState)) {
  return Math.max(0, nextCollectionAt(serverState, now, intervalMs) - now);
}

export function idleScheduleIsDue(serverState, now = Date.now()) {
  const times = knownIdleTimes(serverState);
  if (!times.length) return true;
  return times.some((at) => at <= now);
}

export function formatCountdown(milliseconds) {
  const seconds = Math.max(1, Math.ceil(Math.max(0, milliseconds) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

/**
 * Display-only count of waiting cards: the last server count plus the timed slots that came due
 * since that state, up to the cap. Mirrors the server settle (server/app.js settleIdleSession):
 * prepared slots grant in time order while the warehouse is below the cap; past the last known
 * slot, slots continue every interval. A full warehouse accrues nothing (its clock restarts only
 * when a card is opened, resumeIdleClockAfterCap), so a full count stays as it is.
 * Never stored and never used to open: the open button, the settle hint and the instant-open
 * fast path still read the server count and a real settle.
 */
export function predictedUnseenCount(serverState, { idleQueueLength = 0, now = Date.now() } = {}) {
  const unseen = Math.max(0, Number(serverState?.unseenCount ?? idleQueueLength) || 0);
  const cap = Number(serverState?.idleCapacity) > 0 ? Number(serverState.idleCapacity) : IDLE_BACKLOG_CAP;
  if (unseen >= cap) return unseen;
  const intervalMs = idleIntervalMs(serverState);
  const prepared = (serverState?.preparedPulls || [])
    .map((pull) => parseIdleTime(pull?.availableAt))
    .filter((at) => at != null)
    .sort((left, right) => left - right);
  const scheduled = parseIdleTime(serverState?.nextIdleAt);
  const times = prepared.length ? prepared : scheduled != null ? [scheduled] : [];
  let count = unseen;
  for (const at of times) {
    if (count >= cap || at > now) return Math.min(cap, count);
    count += 1;
  }
  const last = times.at(-1);
  if (last == null) return count;
  for (let at = last + intervalMs; at <= now && count < cap; at += intervalMs) count += 1;
  return Math.min(cap, count);
}

export function idleCountdownCopy({ serverState, idleQueueLength = 0, now = Date.now(), predictedUnseen = null } = {}) {
  const intervalMs = idleIntervalMs(serverState);
  const remaining = nextCollectionRemaining(serverState, now, intervalMs);
  const unseen = serverState?.unseenCount ?? idleQueueLength;
  const cap = serverState?.idleCapacity ?? IDLE_BACKLOG_CAP;
  const full = unseen >= cap;
  const needsSettle = !full && idleScheduleIsDue(serverState, now);
  // A predicted full warehouse shows the full copy, but the settle is still needed and asked for.
  const shownFull = full || (Number(predictedUnseen) || 0) >= cap;
  if (shownFull) {
    return {
      remaining: 0,
      unseen,
      cap,
      full: true,
      text: IDLE_FULL_COPY,
      hidden: false,
      isClock: false,
      isFull: true,
      needsSettle,
    };
  }
  const clockRemaining = remaining > 0 ? remaining : intervalMs;
  return {
    remaining: clockRemaining,
    unseen,
    cap,
    full: false,
    text: `הבא בעוד ${formatCountdown(clockRemaining)}`,
    hidden: false,
    isClock: true,
    isFull: false,
    needsSettle,
  };
}

/** The settle hint is only for a due warehouse that is still being asked. Failure and a full warehouse clear it. */
export function homeSettleHint({ needsSettle = false, suppressed = false } = {}) {
  if (suppressed || !needsSettle) return "";
  return HOME_SETTLE_HINT;
}

export function homeIdleReadyCopy({ unseenCount = 0, available = unseenCount > 0, awaitingSettle = false } = {}) {
  return {
    title: unseenCount > 0
      ? unseenCount === 1 ? "יש לכם קלף שמחכה." : `יש לכם ${unseenCount} קלפים שמחכים.`
      : "הקלף הבא בדרך.",
    lede: available ? "כל פעם פותחים קלף אחד." : "כל שלוש שעות נאסף קלף אחד לבד.",
    action: available ? "פתיחת קלף" : "ממשיכים לאסוף",
    settleHint: awaitingSettle ? HOME_SETTLE_HINT : "",
  };
}

export function applyIdleCountdown(el, view) {
  if (!el) return view;
  el.textContent = view.text;
  el.hidden = view.hidden;
  el.classList.toggle("is-clock", view.isClock);
  el.classList.toggle("is-full", view.isFull);
  return view;
}

/**
 * Display-only mirror of the server's resumeIdleClockAfterCap (server/idle-config.js): when an
 * open takes the warehouse below the cap, the clock restarts at a fresh interval from now, whether
 * the next slot was overdue or still in the future. Used for the instant local count until the
 * seen ack's server state replaces it.
 */
export function resumeClockAfterCap(serverState, now = Date.now()) {
  if (!serverState) return serverState;
  const intervalMs = idleIntervalMs(serverState);
  const times = knownIdleTimes(serverState);
  const shift = times.length ? now + intervalMs - times[0] : 0;
  const move = (iso) => new Date(parseIdleTime(iso) + shift).toISOString();
  const scheduled = parseIdleTime(serverState.nextIdleAt);
  return {
    ...serverState,
    preparedPulls: (serverState.preparedPulls || []).map((pull) => (parseIdleTime(pull?.availableAt) == null ? pull : { ...pull, availableAt: move(pull.availableAt) })),
    nextIdleAt: times.length && scheduled != null ? move(serverState.nextIdleAt) : new Date(now + intervalMs).toISOString(),
  };
}
