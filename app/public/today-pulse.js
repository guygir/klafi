export const TODAY_PULSE_MIN_USERS = 5;
export const TODAY_PULSE_MIN_PACKS = 8;
export const TODAY_PULSE_REFRESH_MS = 15 * 60 * 1000;
export const TODAY_PULSE_QUIET_COPY = "המחסן ממשיך לאסוף חבילות גם עכשיו";

export function jerusalemDayKey(ms = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(ms));
}

export function todayPulseCopy(pulse) {
  const packs = Number(pulse?.packs) || 0;
  const users = Number(pulse?.users) || 0;
  // Quiet-launch gate: never print a tiny crowd. Packs-granted (not cards opened)
  // so players who hit the 8-pack cap still count for the day.
  if (users >= TODAY_PULSE_MIN_USERS && packs >= TODAY_PULSE_MIN_PACKS) {
    return `היום ניתנו ${packs} חבילות ל־${users} שחקנים`;
  }
  return TODAY_PULSE_QUIET_COPY;
}

export function countTodayPulse(sessions, day = jerusalemDayKey()) {
  let packs = 0;
  const users = new Set();
  for (const [token, session] of Object.entries(sessions || {})) {
    let granted = 0;
    for (const instance of session?.instances || []) {
      if (instance?.acquiredBy !== "idle" || !instance.pulledAt) continue;
      const pulled = Date.parse(instance.pulledAt);
      if (!Number.isFinite(pulled)) continue;
      if (jerusalemDayKey(pulled) !== day) continue;
      granted += 1;
    }
    if (granted) {
      packs += granted;
      users.add(token);
    }
  }
  return { day, packs, users: users.size };
}

export function emptyTodayPulse(now = Date.now()) {
  return { day: jerusalemDayKey(now), packs: 0, users: 0 };
}
