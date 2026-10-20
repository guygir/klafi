/**
 * How many numbered copies a card has. Shared by the server (serial pool cap) and the client
 * (binder print run, popup ribbon, holder line). A set listed in the per-rarity table uses that
 * table (a 0 or missing rarity means no numbered copies); any other set keeps the party-list
 * place (`listSlot`), which is how set 5 has always worked.
 */
export const DEFAULT_NUMBERED_COPIES_BY_RARITY = Object.freeze({
  "set-7": Object.freeze({ Common: 0, Uncommon: 2, Rare: 1 }),
  "set-8": Object.freeze({ Common: 0, Uncommon: 2, Rare: 1 }),
});

const RARITIES = ["Common", "Uncommon", "Rare"];

export function normalizeNumberedCopiesByRarity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_NUMBERED_COPIES_BY_RARITY };
  const out = {};
  for (const [setId, table] of Object.entries(value)) {
    if (!/^[a-z0-9-]{2,40}$/.test(setId) || !table || typeof table !== "object" || Array.isArray(table)) continue;
    const row = {};
    for (const rarity of RARITIES) {
      const n = Math.round(Number(table[rarity]));
      row[rarity] = Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 0;
    }
    out[setId] = row;
  }
  return out;
}

export function numberedCopiesFor(card, byRarity = DEFAULT_NUMBERED_COPIES_BY_RARITY) {
  if (!card) return 0;
  const table = byRarity?.[card.releaseSetId];
  if (table && typeof table === "object") {
    const n = Math.round(Number(table[card.rarity]));
    return Number.isInteger(n) && n > 0 ? n : 0;
  }
  const slot = Number(card.listSlot);
  return Number.isInteger(slot) && slot > 0 ? slot : 0;
}
