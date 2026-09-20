export const DEFAULT_RARITIES = Object.freeze({
  Common: 70,
  Uncommon: 25,
  Rare: 5,
});

export const DEFAULT_PACK_SETS = Object.freeze([
  { id: "party-leaders", weight: 70, includeEventCards: false, rarities: { ...DEFAULT_RARITIES } },
  { id: "party-slot-2", weight: 20, includeEventCards: false, rarities: { ...DEFAULT_RARITIES } },
  { id: "decisions", weight: 5, includeEventCards: false, rarities: { Common: 60, Uncommon: 30, Rare: 10 } },
  { id: "records", weight: 5, includeEventCards: false, rarities: { Common: 60, Uncommon: 30, Rare: 10 } },
]);

const RARITY_TIERS = Object.freeze(["Common", "Uncommon", "Rare"]);

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function rarityBucket(card) {
  const rarity = String(card?.rarity || "");
  if (rarity.startsWith("Rare")) return "Rare";
  if (rarity.startsWith("Uncommon")) return "Uncommon";
  if (rarity.startsWith("Common")) return "Common";
  return null;
}

export function normalizeRarities(value = {}, fallback = DEFAULT_RARITIES) {
  return {
    Common: clampInt(value.Common, 0, 1000, fallback.Common),
    Uncommon: clampInt(value.Uncommon, 0, 1000, fallback.Uncommon),
    Rare: clampInt(value.Rare, 0, 1000, fallback.Rare),
  };
}

function validRarities(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return RARITY_TIERS.every((tier) =>
    value[tier] === undefined
    || (Number.isInteger(value[tier]) && value[tier] >= 0 && value[tier] <= 1000));
}

export function normalizePackConfig(value = {}) {
  const incoming = new Map((Array.isArray(value.sets) ? value.sets : []).map((set) => [set.id, set]));
  return {
    pityAfter: clampInt(value.pityAfter, 1, 20, 4),
    sets: DEFAULT_PACK_SETS.map((defaults) => {
      const patch = incoming.get(defaults.id) || {};
      return {
        id: defaults.id,
        weight: clampInt(patch.weight, 0, 1000, defaults.weight),
        includeEventCards: patch.includeEventCards === undefined
          ? defaults.includeEventCards
          : Boolean(patch.includeEventCards),
        rarities: normalizeRarities(patch.rarities, defaults.rarities),
      };
    }),
  };
}

export function validPackConfig(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.pityAfter !== undefined) {
    const n = Number(value.pityAfter);
    if (!Number.isInteger(n) || n < 1 || n > 20) return false;
  }
  if (value.sets === undefined) return true;
  if (!Array.isArray(value.sets) || value.sets.length > 20) return false;
  return value.sets.every((item) =>
    item
    && typeof item === "object"
    && typeof item.id === "string"
    && item.id.length > 0
    && item.id.length <= 80
    && (item.weight === undefined || (Number.isInteger(item.weight) && item.weight >= 0 && item.weight <= 1000))
    && (item.includeEventCards === undefined || typeof item.includeEventCards === "boolean")
    && (item.rarities === undefined || validRarities(item.rarities)));
}

export function mergePackConfig(current, patch) {
  const base = normalizePackConfig(current);
  if (!patch || typeof patch !== "object") return base;
  const incoming = new Map((Array.isArray(patch.sets) ? patch.sets : []).map((set) => [set.id, set]));
  return normalizePackConfig({
    pityAfter: patch.pityAfter ?? base.pityAfter,
    sets: base.sets.map((set) => ({ ...set, ...(incoming.get(set.id) || {}) })),
  });
}

export function setUnlockAt(release) {
  return release?.runtimeAvailableFrom || release?.plannedPublishAt || null;
}

export function isPackSetOpen(packSet, release, currentMs) {
  if (!packSet || packSet.weight <= 0) return false;
  if (release?.runtimeState === "held") return false;
  const unlock = setUnlockAt(release);
  if (unlock && Date.parse(unlock) > currentMs) return false;
  return true;
}

export function packCardAllowed(card, packSet) {
  if (!packSet || !rarityBucket(card)) return false;
  if (card.eventOnly && !packSet.includeEventCards) return false;
  if (card.packEligible === false && !packSet.includeEventCards) return false;
  return true;
}

export function effectiveRarities(rarities, presentCounts) {
  const entries = RARITY_TIERS
    .filter((tier) => (presentCounts[tier] || 0) > 0)
    .map((tier) => [tier, rarities[tier] || 0]);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const even = entries.length > 0 && total === 0;
  const result = { Common: 0, Uncommon: 0, Rare: 0 };
  for (const [tier, weight] of entries) {
    const share = even ? 1 : weight;
    const denom = even ? entries.length : total;
    result[tier] = Math.round((share / denom) * 1000) / 10;
  }
  return result;
}

export function resolvePackTable({
  pack,
  releaseSets = [],
  cards = [],
  now = Date.now(),
} = {}) {
  const config = normalizePackConfig(pack);
  const releases = new Map(releaseSets.map((set) => [set.id, set]));
  const open = config.sets.filter((set) => isPackSetOpen(set, releases.get(set.id), now));
  const total = open.reduce((sum, set) => sum + set.weight, 0);
  return {
    asOf: new Date(now).toISOString(),
    pityAfter: config.pityAfter,
    sets: open.map((set) => {
      const pool = cards.filter((card) => card.releaseSetId === set.id && packCardAllowed(card, set));
      const present = {
        Common: pool.filter((card) => rarityBucket(card) === "Common").length,
        Uncommon: pool.filter((card) => rarityBucket(card) === "Uncommon").length,
        Rare: pool.filter((card) => rarityBucket(card) === "Rare").length,
      };
      return {
        id: set.id,
        weight: set.weight,
        percent: total ? Math.round((set.weight / total) * 1000) / 10 : 0,
        rarities: set.rarities,
        effectiveRarities: effectiveRarities(set.rarities, present),
        availableFrom: setUnlockAt(releases.get(set.id)),
        cardCount: pool.length,
      };
    }),
  };
}
