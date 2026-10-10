import { randomBytes } from "node:crypto";
import { acquiredAtByCard, lastAcquiredAtByCard } from "../public/binder-order.js";
import { heldNumberedCopies, regularInventory } from "./numbered.js";
import { numberedHeldByCard } from "./stars.js";

export function newPublicBinderSlug() {
  return randomBytes(6).toString("hex");
}

export function normalizePublicBinderSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{8,32}$/.test(slug) ? slug : "";
}

export function ensurePublicBinderSlug(session) {
  if (!session) return "";
  const existing = normalizePublicBinderSlug(session.publicBinderSlug);
  if (existing) {
    session.publicBinderSlug = existing;
    return existing;
  }
  session.publicBinderSlug = newPublicBinderSlug();
  return session.publicBinderSlug;
}

export function publicBinderView(session) {
  if (!session) return null;
  const inventory = {};
  for (const [cardId, copies] of Object.entries(session.inventory || {})) {
    const count = Number(copies);
    if (count > 0) inventory[cardId] = count;
  }
  return {
    slug: session.publicBinderSlug || "",
    displayName: session.displayName || "שחקן קְלָפִי",
    avatarId: session.avatarId || "kid-boy",
    factionId: session.factionId || null,
    inventory,
    acquiredAt: acquiredAtByCard(session.instances, inventory),
    lastAcquiredAt: lastAcquiredAtByCard(session.instances, inventory, session.unseenPulls || []),
    numberedCopies: heldNumberedCopies(session)
      .map((item) => ({
        cardId: item.cardId,
        numberedIndex: item.numberedIndex,
        numberedOf: item.numberedOf || null,
      })),
    ownedUnique: Object.keys(regularInventory(inventory, numberedHeldByCard(session))).length,
  };
}
