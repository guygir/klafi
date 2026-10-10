/**
 * Binder display order. Inventory counts stay server truth.
 * acquiredAt is the earliest instance pulledAt for an owned card, or seenAt
 * when that instance has no pulledAt. Unowned cards are omitted: they have no date.
 */

export const BINDER_SORTS = Object.freeze(["slot", "name", "date-new", "date-old", "rarity", "copies"]);

export const BINDER_SORT_LABELS = Object.freeze({
  slot: "מספר בסדרה",
  name: "שם",
  "date-new": "חדש",
  "date-old": "ישן",
  rarity: "נדירות",
  copies: "כמות",
});

export function binderSortId(value) {
  if (value === "date" || value === "תאריך" || value === "חדש") return "date-new";
  if (value === "ישן") return "date-old";
  if (BINDER_SORTS.includes(value)) return value;
  const match = BINDER_SORTS.find((id) => BINDER_SORT_LABELS[id] === value);
  return match || "slot";
}

export function raritySortRank(rarity) {
  const value = String(rarity || "");
  if (value === "Promotion") return 3;
  if (value.startsWith("Rare")) return 0;
  if (value.startsWith("Uncommon")) return 1;
  return 2;
}

export function listSlotNumber(card) {
  const slot = Number(card?.listSlot);
  return Number.isInteger(slot) && slot > 0 ? slot : Number.POSITIVE_INFINITY;
}

function binderCardTitle(card) {
  return String(card?.titleHe || card?.hebrewTitle || card?.title || "");
}

/** Copies held. Missing keys and non-counts are 0 (a missing card). Never invent a count. */
export function binderHeldCount(card, inventory) {
  const count = Number(inventory?.[card?.id]);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return count;
}

/** First time each release set appears in the catalog array. */
export function releaseIndexFromCatalog(cards) {
  const index = new Map();
  for (const card of cards || []) {
    const id = card?.releaseSetId;
    if (id && !index.has(id)) index.set(id, index.size);
  }
  return index;
}

export function catalogIndex(cards) {
  const index = new Map();
  (cards || []).forEach((card, position) => {
    if (card?.id) index.set(card.id, position);
  });
  return index;
}

function releaseRank(card, releaseIndex) {
  const id = card?.releaseSetId;
  if (id && releaseIndex?.has(id)) return releaseIndex.get(id);
  return 1000;
}

/** List slot within the card's release set. Release sets stay in catalog order. */
export function compareSeriesNumber(left, right, ctx) {
  const release = releaseRank(left, ctx.releaseIndex) - releaseRank(right, ctx.releaseIndex);
  if (release) return release;
  const slot = listSlotNumber(left) - listSlotNumber(right);
  if (slot) return slot;
  return (ctx.catalogIndex.get(left.id) ?? 0) - (ctx.catalogIndex.get(right.id) ?? 0);
}

function acquiredTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Dated cards only. direction "desc" is newest first (חדש); "asc" is oldest first (ישן). No time sorts last either way. */
export function compareAcquired(leftId, rightId, acquiredAt = {}, direction = "desc") {
  const leftAt = acquiredTime(acquiredAt?.[leftId]);
  const rightAt = acquiredTime(acquiredAt?.[rightId]);
  if (leftAt == null && rightAt == null) return 0;
  if (leftAt == null) return 1;
  if (rightAt == null) return -1;
  return direction === "asc" ? leftAt - rightAt : rightAt - leftAt;
}

export function compareBinderCards(left, right, ctx) {
  const sort = ctx.sort || "slot";
  if (sort === "name") {
    const name = binderCardTitle(left).localeCompare(binderCardTitle(right), "he");
    if (name) return name;
  } else if (sort === "date-new" || sort === "date-old") {
    // חדש orders by the latest copy received; ישן by when the card was first acquired.
    const date = sort === "date-old"
      ? compareAcquired(left.id, right.id, ctx.acquiredAt, "asc")
      : compareAcquired(left.id, right.id, ctx.lastAcquiredAt || ctx.acquiredAt, "desc");
    if (date) return date;
  } else if (sort === "rarity") {
    const rarity = raritySortRank(left.rarity) - raritySortRank(right.rarity);
    if (rarity) return rarity;
  } else if (sort === "copies") {
    const copies = binderHeldCount(right, ctx.inventory) - binderHeldCount(left, ctx.inventory);
    if (copies) return copies;
  }
  return compareSeriesNumber(left, right, ctx);
}

/**
 * @param {Array} instances
 * @param {Record<string, number> | null} inventory when set, only owned counts (count > 0) keep a date
 */
export function acquiredAtByCard(instances = [], inventory = null) {
  const best = new Map();
  for (const item of instances || []) {
    const cardId = item?.cardId;
    if (!cardId) continue;
    if (inventory && !(Number(inventory[cardId]) > 0)) continue;
    const raw = item.pulledAt || item.seenAt || "";
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) continue;
    const prev = best.get(cardId);
    if (!prev || ms < prev.ms) best.set(cardId, { ms, raw });
  }
  const out = {};
  for (const [cardId, { raw }] of best) out[cardId] = raw;
  return out;
}

/**
 * חדש: when the player last received a copy of each owned card. A warehouse card counts from the
 * moment it is opened (seenAt), not when it landed in the warehouse (pulledAt); a copy still
 * waiting in the warehouse does not count; a traded/credited copy counts from its pulledAt.
 * unseenIds: instance ids still in the warehouse (server). Without them (client fallback for an
 * older payload), an unopened copy that is not a trade is treated as waiting.
 */
export function lastAcquiredAtByCard(instances = [], inventory = null, unseenIds = null) {
  const unseen = unseenIds ? new Set([...unseenIds].map(String)) : null;
  const best = new Map();
  for (const item of instances || []) {
    const cardId = item?.cardId;
    if (!cardId) continue;
    if (inventory && !(Number(inventory[cardId]) > 0)) continue;
    // Without the server's warehouse ids, only opened copies and traded copies (credited without
    // an open) are known to be held.
    if (unseen ? unseen.has(String(item.instanceId)) : (!item.seenAt && !String(item.acquiredBy || "").startsWith("trade"))) continue;
    const raw = item.seenAt || item.pulledAt || "";
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) continue;
    const prev = best.get(cardId);
    if (!prev || ms > prev) best.set(cardId, ms);
  }
  const out = {};
  for (const [cardId, ms] of best) out[cardId] = new Date(ms).toISOString();
  return out;
}

/** Per card, the later of several date maps (server, instances, local opens). */
export function latestDates(...maps) {
  const out = {};
  for (const map of maps) {
    for (const [cardId, raw] of Object.entries(map || {})) {
      const ms = Date.parse(raw);
      if (!Number.isFinite(ms)) continue;
      if (!(cardId in out) || ms > Date.parse(out[cardId])) out[cardId] = new Date(ms).toISOString();
    }
  }
  return out;
}

export function sortBinderCards(cards, { sort = "slot", catalog = cards, acquiredAt = {}, lastAcquiredAt = null, inventory = {} } = {}) {
  const ctx = {
    sort: binderSortId(sort),
    releaseIndex: releaseIndexFromCatalog(catalog),
    catalogIndex: catalogIndex(catalog),
    acquiredAt,
    lastAcquiredAt: lastAcquiredAt || acquiredAt,
    inventory,
  };
  return [...(cards || [])].sort((left, right) => compareBinderCards(left, right, ctx));
}
