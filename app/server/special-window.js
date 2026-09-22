export function jerusalemDayKey(now, timeZone = "Asia/Jerusalem") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(now));
}

export function isSpecialsWindowOpen(event, now) {
  if (!event || event.status === "blocked") return false;
  const opens = Date.parse(event.opensAt);
  const closes = Date.parse(event.closesAt);
  return Number.isFinite(opens) && Number.isFinite(closes) && opens <= now && now <= closes;
}

export function openSpecialWindow(events = [], now = Date.now(), session = null) {
  const current = Number(now);
  const active = (events || []).find((event) => isSpecialsWindowOpen(event, current));
  if (!active) return null;
  const dayKey = jerusalemDayKey(current, active.timezone || "Asia/Jerusalem");
  return {
    id: active.id,
    nameHe: active.nameHe,
    descriptionHe: active.descriptionHe || "",
    opensAt: active.opensAt,
    closesAt: active.closesAt,
    claimedToday: Boolean(session?.eventClaims?.[active.id]?.[dayKey]),
  };
}
