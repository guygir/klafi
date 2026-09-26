/**
 * Achievements: measures, tiers (three pages), and earned-stamps that persist in the session.
 * Pure helpers; server/app.js wires them to the store. The server is authoritative: the client
 * only renders what `achievementState` / `achievementPages` return.
 */

export const ACHIEVEMENT_TIERS = Object.freeze(["simple", "medium", "hard"]);
/** A catalog row with this rule and no setId expands to one badge per pullable release set. */
export const SET_COMPLETE_RULE = "setComplete";
/** Default names look like «שחקן 1a2b» (see store.createSession). */
const DEFAULT_NAME = /^שחקן [0-9a-f]{4}$/i;
const DEFAULT_AVATAR = "kid-boy";

export function normalizeTier(value) {
  return ACHIEVEMENT_TIERS.includes(value) ? value : "simple";
}

/** Studio / catalog row -> stored definition. Missing tier = simple; unknown tiers fall back too. */
export function normalizeAchievementDefinition(item) {
  return {
    id: String(item.id),
    nameHe: String(item.nameHe || item.name || item.id).slice(0, 48),
    descriptionHe: String(item.descriptionHe || item.description || "").slice(0, 160),
    rule: String(item.rule),
    target: Math.max(0, Math.round(Number(item.target) || 0)),
    tier: normalizeTier(item.tier),
    ...(item.setId ? { setId: String(item.setId) } : {}),
  };
}

/**
 * Pullable release sets, from the same full card list the leaderboards use: every release set with
 * at least one pack-eligible card, in release order, titled from the Studio release sets.
 */
export function pullableSets(cards, releaseSets = []) {
  const counts = new Map();
  for (const card of cards) {
    if (!card.idleEligible || card.eventOnly || !card.releaseSetId) continue;
    counts.set(card.releaseSetId, (counts.get(card.releaseSetId) || 0) + 1);
  }
  const order = new Map(releaseSets.map((set, index) => [set.id, Number(set.order) || index + 1]));
  const names = new Map(releaseSets.map((set) => [set.id, set.nameHe || set.name || set.id]));
  return [...counts]
    .map(([id, total]) => ({ id, total, nameHe: names.get(id) || id }))
    .sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999));
}

/** Catalog as players see it: each generic set-complete row becomes one badge per pullable set. */
export function expandAchievementCatalog(catalog = [], cards = [], releaseSets = []) {
  const sets = pullableSets(cards, releaseSets);
  return catalog.flatMap((definition) => {
    if (definition.rule !== SET_COMPLETE_RULE || definition.setId) return [definition];
    return sets.map((set) => ({
      ...definition,
      id: `${definition.id}:${set.id}`,
      setId: set.id,
      nameHe: `סדרת ${set.nameHe} מלאה`,
      descriptionHe: `אספו את כל ${set.total} הקלפים בסדרה «${set.nameHe}».`,
      target: set.total,
    }));
  });
}

export function collectionStarCount(session, cards) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return Object.keys(session.inventory || {}).reduce((sum, cardId) => {
    const card = byId.get(cardId);
    if (card?.rarity === "Promotion") return sum + 5;
    if (card?.rarity?.startsWith("Rare")) return sum + 3;
    if (card?.rarity?.startsWith("Uncommon")) return sum + 2;
    return sum + 1;
  }, 0);
}

/** The best pack-open streak the player ever reached (loginStreak resets; this never drops). */
export function bestLoginStreak(session) {
  return Math.max(Number(session?.bestLoginStreak) || 0, Number(session?.loginStreak) || 0);
}

export function hasCustomProfile(session) {
  const name = String(session?.displayName || "").trim();
  const customName = Boolean(name) && !DEFAULT_NAME.test(name);
  const customAvatar = Boolean(session?.avatarId) && session.avatarId !== DEFAULT_AVATAR;
  return customName || customAvatar;
}

/**
 * Everything the rules read. `extra` carries measures that need other players' data and are only
 * known where that data is loaded (league room): { league: 0|1 }.
 */
export function achievementMeasures(session, cards, extra = {}) {
  const inventory = session.inventory || {};
  const ownedIds = new Set(Object.keys(inventory));
  const unique = ownedIds.size;
  const collectible = cards.filter((card) => card.idleEligible || card.eventOnly || ownedIds.has(card.id));
  const commons = cards.filter(({ releaseSetId }) => releaseSetId === "party-leaders");
  const ownedLeaderParties = new Set(commons.filter(({ id }) => ownedIds.has(id)).map(({ set }) => set)).size;
  const eventClaims = Object.values(session.eventClaims || {}).reduce((sum, claims) => sum + Object.keys(claims || {}).length, 0);
  const idleEligible = cards.filter((card) => card.idleEligible && !card.eventOnly);
  const ownedIdle = idleEligible.filter(({ id }) => ownedIds.has(id)).length;
  const partySets = [...new Set(collectible.filter(({ set }) => set !== "SYS").map(({ set }) => set))]
    .map((set) => {
      const ids = collectible.filter((card) => card.set === set).map(({ id }) => id);
      return { set, owned: ids.filter((id) => ownedIds.has(id)).length, total: ids.length };
    });
  const bestSet = partySets.sort((a, b) => (b.owned / b.total) - (a.owned / a.total))[0];
  return {
    unique,
    idlePulls: session.idlePullCount || session.packCount || 0,
    sources: session.eventCounts?.source_opened ?? 0,
    shares: session.eventCounts?.share_created ?? 0,
    leaders: commons.filter(({ id }) => ownedIds.has(id)).length,
    leadersTotal: commons.length || 1,
    bestSetOwned: bestSet?.owned ?? 0,
    bestSetTotal: bestSet?.total ?? 1,
    trades: session.tradeCount || 0,
    favorites: session.favorites?.length ?? 0,
    events: eventClaims,
    leaderParties: ownedLeaderParties,
    stars: collectionStarCount(session, cards),
    duplicate: Math.max(0, ...Object.values(inventory), 0),
    rank: session.highestRank || 1,
    binderHalf: ownedIdle,
    binderHalfTarget: Math.max(1, Math.ceil(idleEligible.length / 2)),
    streak: bestLoginStreak(session),
    faction: session.factionId ? 1 : 0,
    profile: hasCustomProfile(session) ? 1 : 0,
    rare: cards.filter((card) => card.rarity?.startsWith("Rare") && Number(inventory[card.id]) > 0).length,
    numbered: (session.instances || []).filter((item) => Number(item?.numberedIndex) > 0).length,
    league: extra.league ? 1 : 0,
    setOwned: cards.reduce((owned, card) => {
      if (card.idleEligible && !card.eventOnly && card.releaseSetId && Number(inventory[card.id]) > 0) {
        owned[card.releaseSetId] = (owned[card.releaseSetId] || 0) + 1;
      }
      return owned;
    }, {}),
  };
}

function ruleTarget(definition, measures) {
  const dynamicTargets = {
    leaders: measures.leadersTotal,
    bestSet: measures.bestSetTotal,
    binderHalf: measures.binderHalfTarget,
  };
  return dynamicTargets[definition.rule] || Math.max(1, Number(definition.target) || 1);
}

function ruleValue(definition, measures) {
  if (definition.rule === SET_COMPLETE_RULE) return measures.setOwned?.[definition.setId] || 0;
  const raw = {
    bestSet: measures.bestSetOwned,
  }[definition.rule] ?? measures[definition.rule];
  return Number.isFinite(raw) ? raw : 0;
}

export function qualifies(definition, measures) {
  return ruleValue(definition, measures) >= ruleTarget(definition, measures);
}

/** An earned stamp wins over the live measure: once earned, a badge stays earned. */
export function achievementProgress(definition, measures, earnedAt = null) {
  const target = ruleTarget(definition, measures);
  const raw = ruleValue(definition, measures);
  const earned = Boolean(earnedAt) || raw >= target;
  return {
    id: definition.id,
    ...(definition.setId ? { setId: definition.setId } : {}),
    name: definition.nameHe || definition.name,
    description: definition.descriptionHe || definition.description,
    tier: normalizeTier(definition.tier),
    earned,
    earnedAt: earnedAt || null,
    progress: earned ? target : Math.min(raw, target),
    target,
  };
}

const FALLBACK = [{ id: "first-rip", nameHe: "First reveal", descriptionHe: "Reveal one collected card.", rule: "idlePulls", target: 1 }];

/** Page summary in tier order. Every page is always open (no page locking). */
export function achievementPages(list) {
  return ACHIEVEMENT_TIERS
    .map((tier) => {
      const items = list.filter((badge) => normalizeTier(badge.tier) === tier);
      return { tier, total: items.length, earned: items.filter(({ earned }) => earned).length };
    })
    .filter(({ total }) => total);
}

export function achievementState(session, cards, catalog = []) {
  const measures = achievementMeasures(session, cards);
  const stamps = session.achievementsEarned || {};
  const definitions = catalog.length ? catalog : FALLBACK;
  const list = definitions.map((definition) => achievementProgress(definition, measures, stamps[definition.id]));
  return { achievements: list, achievementPages: achievementPages(list) };
}

/** Ids the player now qualifies for but has no stamp yet. */
export function pendingAchievementStamps(session, cards, catalog = [], extra = {}) {
  const stamps = session?.achievementsEarned || {};
  const definitions = catalog.length ? catalog : FALLBACK;
  const measures = achievementMeasures(session, cards, extra);
  return definitions.filter((definition) => !stamps[definition.id] && qualifies(definition, measures)).map(({ id }) => id);
}

/** Session mutator: stamps earnedAt for newly qualified badges. Returns the new ids. */
export function stampAchievements(session, cards, catalog = [], nowMs = Date.now(), extra = {}) {
  const fresh = pendingAchievementStamps(session, cards, catalog, extra);
  if (!fresh.length) return fresh;
  session.achievementsEarned = { ...(session.achievementsEarned || {}) };
  const at = new Date(nowMs).toISOString();
  for (const id of fresh) session.achievementsEarned[id] = at;
  return fresh;
}

/** League measures for the viewer of a presented league (see leagues.publicLeague). */
export function leagueAchievementMeasures(presented) {
  const me = presented?.members?.find(({ current }) => current);
  return { league: me && presented.memberCount >= 2 ? 1 : 0 };
}
