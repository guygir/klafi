export const IDLE_FULL_COPY = "המחסן מלא. פתחו קלף כדי שהאיסוף יתחיל שוב.";

export function timeUntil(iso, now = Date.now()) {
  if (!iso) return 0;
  return Math.max(0, Date.parse(iso) - now);
}

export function nextCollectionRemaining(serverState, now = Date.now()) {
  const upcoming = (serverState?.preparedPulls || [])
    .map((pull) => timeUntil(pull.availableAt, now))
    .filter((ms) => ms > 0)
    .sort((left, right) => left - right);
  if (upcoming[0]) return upcoming[0];
  return timeUntil(serverState?.nextIdleAt, now);
}

export function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function idleCountdownCopy({ serverState, idleQueueLength = 0, now = Date.now() } = {}) {
  const remaining = nextCollectionRemaining(serverState, now);
  const unseen = serverState?.unseenCount ?? idleQueueLength;
  const cap = serverState?.idleCapacity ?? 8;
  const full = unseen >= cap;
  if (full) {
    return {
      remaining,
      unseen,
      cap,
      full: true,
      text: IDLE_FULL_COPY,
      hidden: false,
      isClock: false,
      isFull: true,
    };
  }
  if (!remaining) {
    return {
      remaining,
      unseen,
      cap,
      full: false,
      text: "",
      hidden: true,
      isClock: false,
      isFull: false,
    };
  }
  return {
    remaining,
    unseen,
    cap,
    full: false,
    text: `הבא בעוד ${formatCountdown(remaining)}`,
    hidden: false,
    isClock: true,
    isFull: false,
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
