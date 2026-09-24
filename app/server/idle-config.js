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
