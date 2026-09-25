export function jerusalemDayKey(now, timeZone = "Asia/Jerusalem") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(now));
}

export function isSpecialsWindowOpen(event, now) {
  if (!event || event.status === "blocked") return false;
  const opens = Date.parse(event.opensAt);
  const closes = Date.parse(event.closesAt);
  return Number.isFinite(opens) && Number.isFinite(closes) && opens <= now && now <= closes;
}

/** What an event hands out: "card" (a Special card, the original mechanism) or "pull" (one ready pack). */
export function eventReward(event) {
  return event?.reward === "pull" ? "pull" : "card";
}

/** "daily" events can be claimed once per Israel day; "once" events once per player, ever. */
export function eventClaimMode(event) {
  return event?.claim === "once" ? "once" : "daily";
}

/** The key under session.eventClaims[event.id] that marks this claim ("once" or the Israel day). */
export function eventClaimKey(event, now) {
  return eventClaimMode(event) === "once" ? "once" : jerusalemDayKey(now, event?.timezone || "Asia/Jerusalem");
}

export function isEventClaimed(event, eventClaims, now) {
  return Boolean(eventClaims?.[event?.id]?.[eventClaimKey(event, now)]);
}

export function openSpecialWindow(events = [], now = Date.now(), session = null) {
  const current = Number(now);
  const claims = session?.eventClaims;
  // A once-per-player event the player already claimed is over for them: skip it entirely.
  const active = (events || []).find((event) => isSpecialsWindowOpen(event, current)
    && !(eventClaimMode(event) === "once" && isEventClaimed(event, claims, current)));
  if (!active) return null;
  return {
    id: active.id,
    nameHe: active.nameHe,
    descriptionHe: active.descriptionHe || "",
    tickerHe: active.tickerHe || "",
    reward: eventReward(active),
    claim: eventClaimMode(active),
    opensAt: active.opensAt,
    closesAt: active.closesAt,
    claimedToday: isEventClaimed(active, claims, current),
  };
}
