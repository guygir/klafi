export const IDLE_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const IDLE_BACKLOG_CAP = 8;
export const IDLE_STARTER_READY = 3;

export function publicIdleConfig() {
  return {
    intervalMs: IDLE_INTERVAL_MS,
    capacity: IDLE_BACKLOG_CAP,
    starterReady: IDLE_STARTER_READY,
  };
}

export function isIdleColdStart(session) {
  return (session.idlePullCount || 0) === 0
    && !(session.unseenPulls || []).length
    && !(session.preparedPulls || []).length
    && !session.nextIdleAt;
}

export function applyIdleStarterReady(preparedPulls, currentMs, scheduleAt) {
  const dueCount = preparedPulls.filter((pull) => Date.parse(pull.availableAt) <= currentMs).length;
  if (dueCount >= IDLE_STARTER_READY) return scheduleAt;
  const ready = Math.min(IDLE_STARTER_READY, preparedPulls.length);
  for (let i = 0; i < ready; i += 1) {
    preparedPulls[i].availableAt = new Date(currentMs).toISOString();
  }
  let nextAt = currentMs + IDLE_INTERVAL_MS;
  for (let i = ready; i < preparedPulls.length; i += 1) {
    preparedPulls[i].availableAt = new Date(nextAt).toISOString();
    nextAt += IDLE_INTERVAL_MS;
  }
  return nextAt;
}

/**
 * The idle clock is paused while the warehouse is full: a settle at the cap restarts it from now
 * (see settleIdleSession). But if no settle ran while full, the slot that came due during the pause
 * would be granted the moment the player opens one, so 8 -> 7 jumps straight back to 8. Opening a
 * card is what resumes collection ("open a card so collection resumes"), so when a seen ack takes
 * the warehouse below the cap, any slot that came due while full restarts one interval from now.
 * Slots still in the future are left alone. Returns true when the schedule moved.
 */
export function resumeIdleClockAfterCap(session, currentMs, intervalMs = IDLE_INTERVAL_MS) {
  const prepared = (session.preparedPulls || []).filter((pull) => Number.isFinite(Date.parse(pull?.availableAt)));
  const scheduled = Date.parse(session.nextIdleAt);
  const times = prepared.map((pull) => Date.parse(pull.availableAt));
  if (Number.isFinite(scheduled)) times.push(scheduled);
  if (!times.length) {
    session.nextIdleAt = new Date(currentMs + intervalMs).toISOString();
    return true;
  }
  const earliest = Math.min(...times);
  if (earliest > currentMs) return false;
  const shift = currentMs + intervalMs - earliest;
  for (const pull of prepared) pull.availableAt = new Date(Date.parse(pull.availableAt) + shift).toISOString();
  session.nextIdleAt = new Date((Number.isFinite(scheduled) ? scheduled : earliest) + shift).toISOString();
  return true;
}
