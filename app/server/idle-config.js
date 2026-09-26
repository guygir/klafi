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
 * Rule (Guy, #64): opening a card while the warehouse is at the cap restarts the timed-pack clock at
 * a fresh interval from the open, with no instant payout for time that passed while full. The
 * schedule kept ticking while full (the slot after the one that filled the warehouse stays at its
 * original time), so leaving the cap re-bases every prepared slot: the first lands exactly
 * intervalMs after currentMs and the rest keep their spacing. This applies whether the next slot
 * was already overdue (8 -> 7 -> 8) or still in the future (the 2h15m-instead-of-3h report).
 * Returns true when the schedule moved.
 */
export function resumeIdleClockAfterCap(session, currentMs, intervalMs = IDLE_INTERVAL_MS) {
  const prepared = (session.preparedPulls || []).filter((pull) => Number.isFinite(Date.parse(pull?.availableAt)));
  const scheduled = Date.parse(session.nextIdleAt);
  const times = prepared.map((pull) => Date.parse(pull.availableAt));
  if (Number.isFinite(scheduled)) times.push(scheduled);
  const target = currentMs + intervalMs;
  if (!times.length) {
    session.nextIdleAt = new Date(target).toISOString();
    return true;
  }
  const earliest = Math.min(...times);
  const shift = target - earliest;
  if (shift === 0) return false;
  for (const pull of prepared) pull.availableAt = new Date(Date.parse(pull.availableAt) + shift).toISOString();
  session.nextIdleAt = new Date((Number.isFinite(scheduled) ? scheduled : earliest) + shift).toISOString();
  return true;
}
