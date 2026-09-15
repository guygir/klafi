import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { JsonStore } from "./store.js";
import { PostgresStore } from "./postgres-store.js";
import { generateIdlePull, generatePack, rarityTier } from "./pack-engine.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const IDLE_INTERVAL_MS = 3 * 60 * 60 * 1000;
const IDLE_BACKLOG_CAP = 8;
const TRADE_TTL_MS = 24 * 60 * 60 * 1000;
const RANK_TITLES = [
  "אזרח סקרן",
  "קורא כותרות",
  "מצביע מעורב",
  "פעיל שכונתי",
  "חבר סניף",
  "רכז שטח",
  "מנהל מטה",
  "יועץ פרלמנטרי",
  "חבר כנסת",
  "יו״ר ועדה",
  "סגן שר",
  "שר",
  "שר בכיר",
  "ראש הממשלה",
];
const LEVEL_RATIOS = [0, 0.03, 0.07, 0.12, 0.18, 0.25, 0.33, 0.42, 0.52, 0.63, 0.74, 0.84, 0.92, 1];
const DEFAULT_REVEAL_TIMING = Object.freeze({
  quote: 200,
  party: 1100,
  name: 700,
  portrait: 1000,
});
const DEFAULT_VISUAL_CONFIG = Object.freeze({
  theme: "pack-v2",
  cardFrame: "tall-v2",
  density: "airy-v2",
  quoteReveal: "ink-v2",
});
const VISUAL_OPTIONS = Object.freeze({
  theme: new Set(["classic-v1", "pack-v2"]),
  cardFrame: new Set(["classic-v1", "tall-v2"]),
  density: new Set(["compact-v1", "airy-v2"]),
  quoteReveal: new Set(["fade-v1", "ink-v2"]),
});
const CLIENT_EVENTS = new Set([
  "back_completed",
  "binder_reached",
  "share_created",
  "source_opened",
  "referral_opened",
  "gift_preview_created",
]);
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
});

function json(response, status, value) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

const STATELESS_API_PATHS = new Set([
  "/api/health",
  "/api/catalog",
  "/api/specials",
  "/api/editorial",
  "/api/studio/content",
  "/api/game-config",
  "/api/presentation/content",
]);

function secretsMatch(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(String(provided));
  const right = Buffer.from(String(expected));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function publicPartyRegister(studioContent, cards = []) {
  if (studioContent?.parties?.length) {
    return studioContent.parties.map(({ id, displayNameHe, displayNameEn, requestedLetters, pip }) => ({
      id,
      displayNameHe,
      displayNameEn,
      requestedLetters: requestedLetters || [],
      pip,
    }));
  }
  const parties = new Map();
  for (const card of cards) {
    if (!card.set || card.set === "SYS" || String(card.set).startsWith("special-")) continue;
    if (parties.has(card.set)) continue;
    parties.set(card.set, {
      id: card.set,
      displayNameHe: card.setNameHe || card.set,
      displayNameEn: card.setName || card.set,
      requestedLetters: card.letters ? [card.letters] : [],
      pip: card.pip || null,
    });
  }
  return [...parties.values()];
}

async function readJsonFile(filePath, fallback) {
  if (!filePath) return fallback;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function bearer(request) {
  const match = request.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function studioSecretFrom(request) {
  return request.headers["x-kalpi-studio"] || null;
}

function validReleaseSets(value) {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  return value.every((item) =>
    item
    && typeof item === "object"
    && typeof item.id === "string"
    && item.id.length > 0
    && item.id.length <= 80
    && (item.runtimeState === undefined || item.runtimeState === "active" || item.runtimeState === "held")
    && (item.runtimeAvailableFrom === undefined || item.runtimeAvailableFrom === null || typeof item.runtimeAvailableFrom === "string"));
}

function mergeReleaseSets(current = [], patch) {
  if (!Array.isArray(patch)) return current;
  const next = current.map((set) => ({ ...set }));
  const byId = new Map(next.map((set) => [set.id, set]));
  for (const item of patch) {
    const existing = byId.get(item.id);
    if (!existing) continue;
    if (item.runtimeState === "active" || item.runtimeState === "held") existing.runtimeState = item.runtimeState;
    if (item.runtimeAvailableFrom !== undefined) existing.runtimeAvailableFrom = item.runtimeAvailableFrom || null;
  }
  return next;
}

function isLoopbackRequest(request) {
  const address = request.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function createRateLimiter() {
  const buckets = new Map();
  return function allow(key, limit, windowMs, current) {
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= current) {
      buckets.set(key, { count: 1, resetAt: current + windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    existing.count += 1;
    if (buckets.size > 10_000) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= current) buckets.delete(bucketKey);
      }
    }
    return {
      allowed: existing.count <= limit,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)),
    };
  };
}

function normalizeRevealTiming(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_REVEAL_TIMING).map(([key, fallback]) => {
    const candidate = Number(value[key]);
    return [key, Number.isFinite(candidate) ? Math.min(5000, Math.max(0, Math.round(candidate))) : fallback];
  }));
}

function validRevealTiming(value) {
  if (value === undefined) return true;
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(DEFAULT_REVEAL_TIMING).every((key) => (
      Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 5000
    ));
}

function normalizeVisualConfig(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_VISUAL_CONFIG).map(([key, fallback]) => (
    [key, VISUAL_OPTIONS[key].has(value[key]) ? value[key] : fallback]
  )));
}

function validVisualConfig(value) {
  return value === undefined || (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).every((key) => VISUAL_OPTIONS[key]?.has(value[key]))
  );
}

function validProgressionPatch(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.releaseLevelIncrements !== undefined) {
    const increments = value.releaseLevelIncrements;
    if (!increments || typeof increments !== "object" || Array.isArray(increments)) return false;
    if (!Object.values(increments).every((item) => Number.isInteger(item) && item >= 0 && item <= 20)) return false;
  }
  if (value.thresholdExponent !== undefined) {
    const exponent = Number(value.thresholdExponent);
    if (!Number.isFinite(exponent) || exponent < 0.5 || exponent > 3) return false;
  }
  return true;
}

function normalizeDisplayName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 24) return null;
  if (!/^[\p{L}\p{N} ._'״׳-]+$/u.test(normalized)) return null;
  return normalized;
}

function quoteDisplayNumber(member, card) {
  const rarityOffset = card.rarity.startsWith("Common") ? 0 : card.rarity.startsWith("Uncommon") ? 1 : 2;
  return 4 + ((member.slot - 1) * 3) + rarityOffset;
}

function runtimeCardFromStudio(party, member, card, releaseSets = []) {
  const letters = (party.finalLetters || party.requestedLetters || ["?"])[0];
  const quote = card.quote || {};
  const approved = member.quoteSlots.filter((candidate) =>
    candidate.publicationState === "approved" && candidate.quote?.displayText?.trim());
  const entryCard = approved.find((candidate) => candidate.rarity.startsWith("Common")) || approved[0];
  const isLeader = member.slot === 1 && card.id === entryCard?.id;
  const isSlotTwo = member.slot === 2 && card.id === entryCard?.id;
  const releaseSetId = isLeader ? "party-leaders" : isSlotTwo ? "party-slot-2" : "editorial-backlog";
  const release = releaseSets.find(({ id }) => id === releaseSetId);
  const activeForIdle = (isLeader || isSlotTwo) && (!release || release.runtimeState === "active");
  return {
    set: party.id,
    setName: party.displayNameEn,
    setNameHe: party.displayNameHe,
    letters,
    displayCode: `${letters}-${String(quoteDisplayNumber(member, card)).padStart(2, "0")}`,
    pip: party.pip,
    id: card.id,
    title: member.nameEn,
    titleHe: member.nameHe,
    hebrewTitle: member.nameHe,
    type: "Quote",
    typeHe: "ציטוט",
    rarity: card.rarity,
    subtitle: `מקום ${member.slot} · ${party.displayNameHe}`,
    subtitleHe: `מקום ${member.slot}`,
    body: quote.context || "",
    whyItMatters: card.editorial?.selectionRationale || "",
    source: quote.sourceTitle || quote.publisher || "",
    listSlot: member.slot,
    artKey: card.art?.artKey || null,
    releaseSetId,
    releaseOrder: isLeader ? 1 : isSlotTwo ? 2 : 90,
    releaseTier: isLeader || isSlotTwo ? "objective" : member.treatment === "critical" ? "critique" : "depth",
    releaseState: release?.runtimeState || (activeForIdle ? "active" : "held"),
    availableFrom: activeForIdle ? (release?.runtimeAvailableFrom || release?.plannedPublishAt || null) : null,
    idleEligible: activeForIdle,
    binderGroup: isLeader ? "leaders" : isSlotTwo ? "slot-2" : "people",
    subjectSet: null,
    walkout: {
      kind: "quote",
      text: quote.displayText || "",
      speaker: member.nameHe,
      date: quote.date || "",
      sourceId: card.id.toLowerCase(),
      sourceLabel: quote.sourceTitle || quote.publisher || "",
      sourceUrl: quote.sourceUrl || "",
      context: quote.context || "",
      quoteStatus: quote.status || "researching",
      selectionRationale: card.editorial?.selectionRationale || "",
      flavorDisclosure: card.editorial?.flavorDisclosure || "editorial-symbolism-not-evidence",
      releasePhase: member.treatment === "critical" ? "contrast" : "constructive",
      editorialRole: member.treatment,
      contentStatus: card.review?.contentStatus || card.publicationState || "researching",
    },
  };
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("REQUEST_TOO_LARGE");
  }
  return body ? JSON.parse(body) : {};
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, filePath);
}

function achievementMeasures(session, cards) {
  const ownedIds = new Set(Object.keys(session.inventory));
  const unique = ownedIds.size;
  const collectible = cards.filter((card) => card.idleEligible || card.eventOnly || ownedIds.has(card.id));
  const commons = cards.filter(({ releaseSetId }) => releaseSetId === "party-leaders");
  const ownedLeaderParties = new Set(commons.filter(({ id }) => ownedIds.has(id)).map(({ set }) => set)).size;
  const eventClaims = Object.values(session.eventClaims || {}).reduce((sum, claims) => sum + Object.keys(claims || {}).length, 0);
  const stars = collectionStarCount(session, cards);
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
    stars,
    duplicate: Math.max(0, ...Object.values(session.inventory || {}), 0),
    rank: session.highestRank || 1,
    binderHalf: ownedIdle,
    binderHalfTarget: Math.max(1, Math.ceil(idleEligible.length / 2)),
  };
}

function achievementProgress(definition, measures) {
  const dynamicTargets = {
    leaders: measures.leadersTotal,
    bestSet: measures.bestSetTotal,
    binderHalf: measures.binderHalfTarget,
  };
  const target = dynamicTargets[definition.rule] || Math.max(1, Number(definition.target) || 1);
  const raw = {
    idlePulls: measures.idlePulls,
    unique: measures.unique,
    sources: measures.sources,
    shares: measures.shares,
    leaders: measures.leaders,
    bestSet: measures.bestSetOwned,
    trades: measures.trades,
    favorites: measures.favorites,
    events: measures.events,
    leaderParties: measures.leaderParties,
    stars: measures.stars,
    duplicate: measures.duplicate,
    rank: measures.rank,
    binderHalf: measures.binderHalf,
  }[definition.rule] ?? 0;
  const progress = Math.min(raw, target);
  return {
    id: definition.id,
    name: definition.nameHe || definition.name,
    description: definition.descriptionHe || definition.description,
    earned: raw >= target,
    progress,
    target,
  };
}

function achievementState(session, cards, catalog = []) {
  const measures = achievementMeasures(session, cards);
  const definitions = catalog.length ? catalog : [{ id: "first-rip", nameHe: "First reveal", descriptionHe: "Reveal one collected card.", rule: "idlePulls", target: 1 }];
  return definitions.map((definition) => achievementProgress(definition, measures));
}

function publicAvatars(session, catalog = [], level = 1) {
  const currentLevel = Math.max(1, level || session.highestRank || 1);
  return catalog.map((avatar) => ({
    ...avatar,
    unlocked: currentLevel >= (avatar.unlockLevel || 1),
    selected: session.avatarId === avatar.id,
  }));
}

function activeIdleCards(cards, current = Date.now()) {
  return cards.filter((card) =>
    !card.eventOnly
    && card.idleEligible === true
    && (!card.availableFrom || Date.parse(card.availableFrom) <= current));
}

function collectionStarCount(session, cards) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return Object.keys(session.inventory).reduce((sum, cardId) => {
    const card = byId.get(cardId);
    if (card?.rarity === "Promotion") return sum + 5;
    if (card?.rarity?.startsWith("Rare")) return sum + 3;
    if (card?.rarity?.startsWith("Uncommon")) return sum + 2;
    return sum + 1;
  }, 0);
}

function progressionConfig(config = {}, activeReleaseIds = null) {
  const ranks = Array.isArray(config.rankNames) && config.rankNames.length >= 2
    ? config.rankNames
    : RANK_TITLES;
  const increments = config.releaseLevelIncrements && typeof config.releaseLevelIncrements === "object"
    ? config.releaseLevelIncrements
    : {};
  const releaseIds = activeReleaseIds === null ? Object.keys(increments) : activeReleaseIds;
  const configuredLevels = releaseIds.reduce((sum, id) => sum + Math.max(0, Math.round(Number(increments[id]) || 0)), 0);
  const firstSetLevels = Math.max(0, Math.round(Number(increments["party-leaders"]) || 0));
  const legacyLevels = Array.isArray(config.thresholdRatios) ? config.thresholdRatios.length : LEVEL_RATIOS.length;
  const totalLevels = Math.max(2, Math.min(ranks.length, configuredLevels || firstSetLevels || legacyLevels));
  const exponent = Math.max(0.5, Math.min(3, Number(config.thresholdExponent) || 1.2));
  const ratios = Array.isArray(config.thresholdRatios) && config.thresholdRatios.length === totalLevels
    ? config.thresholdRatios
    : Array.from({ length: totalLevels }, (_, index) =>
      index === totalLevels - 1 ? 1 : Number((index / (totalLevels - 1)) ** exponent));
  return {
    ratios,
    ranks,
    totalLevels,
    campaignLevels: ranks.length,
    releaseLevelIncrements: increments,
    thresholdExponent: exponent,
    reward: config.reward || "קלף בונוס מיידי",
  };
}

function progressionState(session, cards, config = {}, current = Date.now()) {
  const eligible = activeIdleCards(cards, current);
  const eligibleIds = new Set(eligible.map(({ id }) => id));
  const unique = Object.keys(session.inventory).filter((id) => eligibleIds.has(id)).length;
  const activeReleaseIds = [...new Set(eligible.map(({ releaseSetId }) => releaseSetId).filter(Boolean))];
  const { ratios, ranks, totalLevels, campaignLevels, reward } = progressionConfig(config, activeReleaseIds);
  const thresholds = ratios.map((ratio, index) => index === 0 ? 0 : Math.ceil(eligible.length * ratio));
  const computedLevel = eligible.length
    ? thresholds.reduce((result, threshold, index) => unique >= threshold ? index + 1 : result, 1)
    : 1;
  const earned = Math.max(1, session.highestRank || 1);
  const level = Math.max(computedLevel, Math.min(campaignLevels, earned));
  const openLevels = Math.max(totalLevels, level);
  const capped = Math.min(level, totalLevels);
  const start = thresholds[capped - 1] ?? 0;
  const target = level < totalLevels ? thresholds[level] : thresholds[totalLevels - 1];
  return {
    level,
    totalLevels: openLevels,
    campaignLevels,
    rank: ranks[level - 1],
    nextRank: level < openLevels ? ranks[level] : null,
    nextReleaseRank: level === openLevels && openLevels < campaignLevels ? ranks[level] : null,
    unique,
    start,
    target,
    remaining: Math.max(0, target - unique),
    percent: target === start ? 100 : Math.max(0, Math.min(100, Math.round(((unique - start) / (target - start)) * 100))),
    reward,
    teaser: config.teaser || "האם תגיעו לדרגת ראש הממשלה?",
    pendingRewards: [...(session.pendingRankRewards || [])],
  };
}

function syncProgression(session, cards, config, current) {
  const progression = progressionState({ ...session, highestRank: 1 }, cards, config, current);
  const previous = Math.max(1, session.highestRank || 1);
  if (progression.level > previous) {
    session.pendingRankRewards ??= [];
    session.claimedRankRewards ??= [];
    for (let rank = previous + 1; rank <= progression.level; rank += 1) {
      if (!session.claimedRankRewards.includes(rank) && !session.pendingRankRewards.includes(rank)) {
        session.pendingRankRewards.push(rank);
      }
    }
    session.highestRank = progression.level;
  }
  return progressionState(session, cards, config, current);
}

function publicState(session, now, cards, config = {}) {
  const next = session.nextDailyAt ? Date.parse(session.nextDailyAt) : 0;
  const eligibleCards = activeIdleCards(cards, now);
  return {
    displayName: session.displayName,
    createdAt: session.createdAt,
    nextDailyAt: session.nextDailyAt,
    packAvailable: !next || next <= now,
    dryPacks: session.dryPacks,
    packCount: session.packCount,
    inventory: session.inventory,
    instances: session.instances,
    favorites: session.favorites ?? [],
    lastPack: session.packs.at(-1) ?? null,
    ownedUnique: Object.keys(session.inventory).filter((id) => eligibleCards.some((card) => card.id === id)).length,
    ownedUniqueAll: Object.keys(session.inventory).length,
    starCount: collectionStarCount(session, cards),
    totalCards: eligibleCards.length,
    nextIdleAt: session.nextIdleAt,
    idleIntervalMs: IDLE_INTERVAL_MS,
    idleCapacity: IDLE_BACKLOG_CAP,
    unseenCount: session.unseenPulls?.length ?? 0,
    idlePullCount: session.idlePullCount ?? 0,
    factionId: session.factionId,
    tradeCount: session.tradeCount,
    achievements: achievementState(session, cards, config.achievements),
    avatars: publicAvatars(session, config.avatars, progressionState(session, cards, config, now).level),
    avatarId: session.avatarId || "kid-boy",
    progression: progressionState(session, cards, config, now),
    quizAvailable: Boolean(config.quizEnabled)
      && Boolean(Object.keys(session.inventory || {}).length)
      && session.quizWonDay !== jerusalemDay(now),
    quizWonToday: Boolean(config.quizEnabled) && session.quizWonDay === jerusalemDay(now),
  };
}

function jerusalemDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(ms));
}

function unitRandom(rng) {
  if (typeof rng === "function" && rng.length >= 1) return rng(1e9) / 1e9;
  const value = typeof rng === "function" ? rng() : Math.random();
  return Number.isFinite(value) ? value : Math.random();
}

function shuffleChoices(items, rng) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(unitRandom(rng) * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function quizChoices(correct, pool, rng) {
  const distractors = shuffleChoices(pool.filter((item) => item && item !== correct), rng).slice(0, 3);
  return shuffleChoices([correct, ...distractors], rng);
}

function buildOwnedCardQuiz(session, catalog, rng, nowMs) {
  const owned = catalog.filter((card) => session.inventory?.[card.id]);
  if (!owned.length) return null;
  const lastOwnedId = [...(session.instances || [])].reverse().find((instance) => session.inventory[instance.cardId])?.cardId;
  const card = catalog.find((item) => item.id === lastOwnedId) || owned.at(-1);
  const slotMatch = /^מקום\s+(\d+)$/.exec(String(card.subtitleHe || "").trim());
  const role = slotMatch ? `מקום ${slotMatch[1]}` : (card.subtitleHe || card.typeHe || card.type);
  const rolePrompt = slotMatch ? "איזה מקום ברשימה?" : "במה הקלף הזה עוסק?";
  const party = card.setNameHe || card.set;
  const rolePool = [...new Set(catalog.map((item) => {
    const subtitle = String(item.subtitleHe || "").trim();
    if (slotMatch) return /^מקום\s+\d+$/.test(subtitle) ? subtitle : "";
    return subtitle && !/^מקום\s+\d+$/.test(subtitle) ? subtitle : (item.typeHe || item.type);
  }).filter(Boolean))];
  const partyPool = [...new Set(catalog.map((item) => item.setNameHe || item.set).filter(Boolean))];
  const quizId = randomUUID();
  return {
    quizId,
    cardId: card.id,
    startedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + (5 * 60 * 1000)).toISOString(),
    answers: { role, list: party },
    public: {
      quizId,
      expiresAt: new Date(nowMs + (5 * 60 * 1000)).toISOString(),
      cardId: card.id,
      source: "owned-card",
      questions: [
        { id: "role", prompt: rolePrompt, options: quizChoices(role, rolePool, rng) },
        { id: "list", prompt: "באיזו רשימה?", options: quizChoices(party, partyPool, rng) },
      ],
    },
  };
}

async function serveFile(request, response, base, relativePath) {
  const root = path.resolve(base);
  const requested = path.resolve(root, relativePath);
  if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
    json(response, 403, { error: "FORBIDDEN" });
    return;
  }

  try {
    const info = await stat(requested);
    if (!info.isFile()) throw Object.assign(new Error("Not a file"), { code: "ENOENT" });
    const content = await readFile(requested);
    const extension = path.extname(requested).toLowerCase();
    const revalidate = new Set([".html", ".css", ".js", ".json", ".mp4"]).has(extension);
    const headers = {
      ...SECURITY_HEADERS,
      "content-type": MIME[extension] ?? "application/octet-stream",
      "cache-control": revalidate ? "no-cache, must-revalidate" : "public, max-age=86400",
      "accept-ranges": "bytes",
    };
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416, { ...headers, "content-range": `bytes */${content.length}` });
        response.end();
        return;
      }
      const suffixLength = match[1] ? null : Number(match[2]);
      const start = suffixLength === null
        ? Number(match[1])
        : Math.max(0, content.length - suffixLength);
      const requestedEnd = match[2] && suffixLength === null ? Number(match[2]) : content.length - 1;
      const end = Math.min(requestedEnd, content.length - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= content.length) {
        response.writeHead(416, { ...headers, "content-range": `bytes */${content.length}` });
        response.end();
        return;
      }
      const partial = content.subarray(start, end + 1);
      response.writeHead(206, {
        ...headers,
        "content-range": `bytes ${start}-${end}/${content.length}`,
        "content-length": partial.length,
      });
      response.end(request.method === "HEAD" ? undefined : partial);
      return;
    }
    response.writeHead(200, { ...headers, "content-length": content.length });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    json(response, 404, { error: "NOT_FOUND" });
  }
}

export async function createKalpiApp({
  dataDir,
  publicDir,
  cardsPath,
  advocacyPath,
  sourcesPath,
  sequencesPath,
  samplesPath,
  demoPackPath,
  studioContentPath,
  specialsPath,
  presentationContentPath,
  eventsPath,
  achievementsPath = eventsPath ? path.join(path.dirname(eventsPath), "achievements.json") : null,
  avatarsPath = eventsPath ? path.join(path.dirname(eventsPath), "avatars.json") : null,
  assetsDir,
  docsDir,
  databaseUrl,
  databaseSsl = false,
  debugEnabled = false,
  quizEnabled = false,
  studioSecret = process.env.STUDIO_SECRET || null,
  now = () => Date.now(),
  rng = randomInt,
} = {}) {
  const cards = JSON.parse(await readFile(cardsPath, "utf8"));
  const advocacy = JSON.parse(await readFile(advocacyPath, "utf8"));
  const sources = await readJsonFile(sourcesPath, []);
  const sequences = await readJsonFile(sequencesPath, []);
  const samples = await readJsonFile(samplesPath, []);
  const demoPack = await readJsonFile(demoPackPath, null);
  let studioContent = await readJsonFile(studioContentPath, null);
  const specials = await readJsonFile(specialsPath, { sets: [] });
  let presentationContent = presentationContentPath
    ? JSON.parse(await readFile(presentationContentPath, "utf8"))
    : { schemaVersion: 1, deckId: "poc-response", updatedAt: null, fields: {} };
  const events = eventsPath ? JSON.parse(await readFile(eventsPath, "utf8")) : { events: [] };
  let achievementCatalog = achievementsPath ? JSON.parse(await readFile(achievementsPath, "utf8")) : { achievements: [] };
  const avatarCatalog = avatarsPath ? JSON.parse(await readFile(avatarsPath, "utf8")) : { avatars: [] };
  const specialSets = new Map(specials.sets.map((set) => [set.id, set]));
  const specialLettersBySet = {
    "legendary-aces": "אס",
    "prestige-legacy": "מורשת",
    mouthpieces: "שופר",
    "satire-imitations": "סאטירה",
    records: "רקורד",
    "current-ministers": "שר",
  };
  const specialTypeBySet = {
    records: { type: "Record", typeHe: "רקורד" },
    "current-ministers": { type: "Ministerial record", typeHe: "שר בתפקיד" },
  };
  function runtimeSpecialCard(card) {
    const set = specialSets.get(card.setId);
    const setIndex = (specials.cards || []).filter((candidate) => candidate.setId === card.setId).findIndex(({ id }) => id === card.id) + 1;
    const specialLetters = specialLettersBySet[card.setId] || "מיוחד";
    const specialType = specialTypeBySet[card.setId] || { type: "Special", typeHe: "מיוחד" };
    return {
      id: card.id,
      set: `special-${card.setId}`,
      setName: set?.nameHe || card.setId,
      setNameHe: set?.nameHe || card.setId,
      title: card.nameHe,
      titleHe: card.nameHe,
      subtitle: card.displayText,
      subtitleHe: card.displayText,
      type: specialType.type,
      typeHe: specialType.typeHe,
      rarity: "Promotion",
      pip: "#c4a35a",
      artKey: card.artKey,
      body: card.context,
      whyItMatters: card.flavor,
      source: card.sourceTitle,
      letters: specialLetters,
      displayCode: `${specialLetters}-${String(setIndex).padStart(2, "0")}`,
      walkout: {
        kind: card.quoteStatus === "fact-record" ? "fact" : "quote",
        text: card.displayText,
        speaker: card.nameHe,
        date: card.date,
        quoteStatus: card.quoteStatus,
        sourceUrl: card.sourceUrl,
        sourceLabel: card.sourceTitle,
        contentStatus: card.contentStatus,
        editorialRole: card.setId,
        releasePhase: "event",
      },
      eventOnly: true,
      packEligible: false,
      idleEligible: false,
      releaseSetId: card.setId === "records" || card.setId === "current-ministers" ? "records" : "special-events",
      releaseOrder: card.setId === "records" || card.setId === "current-ministers" ? 4 : 10,
      releaseTier: "event",
      availableFrom: null,
      binderGroup: card.setId === "records" || card.setId === "current-ministers" ? "records" : "specials",
      subjectSet: null,
    };
  }
  const specialCards = (specials.cards || []).map(runtimeSpecialCard);
  const allCards = [...cards, ...specialCards];
  const cardsById = new Map(allCards.map((card) => [card.id, card]));
  const partyIds = new Set(cards.filter(({ set }) => set !== "SYS").map(({ set }) => set));
  if (studioContent) {
    studioContent.gameConfig = {
      ...studioContent.gameConfig,
      revealTiming: normalizeRevealTiming(studioContent.gameConfig?.revealTiming),
      visual: normalizeVisualConfig(studioContent.gameConfig?.visual),
    };
  }

  function publishStudioCard(member, card) {
    const party = studioContent.parties.find(({ id }) => id === member.partyId);
    if (!party) throw new Error(`Studio member references missing party: ${member.partyId}`);
    const existing = cardsById.get(card.id);
    const populated = Boolean(card.quote?.displayText?.trim());
    if (!populated) {
      if (existing && !existing.eventOnly) {
        cards.splice(cards.indexOf(existing), 1);
        allCards.splice(allCards.indexOf(existing), 1);
        cardsById.delete(card.id);
      }
      return null;
    }
    const published = runtimeCardFromStudio(party, member, card, studioContent.gameConfig?.releaseSets);
    if (existing) Object.assign(existing, published);
    else {
      cards.push(published);
      allCards.push(published);
      cardsById.set(published.id, published);
    }
    return existing || published;
  }

  if (demoPack) {
    const tiers = { Common: 0, Uncommon: 0, Rare: 0 };
    for (const configured of demoPack.cards) {
      const card = cardsById.get(configured.cardId);
      if (!card) throw new Error(`Demo pack references missing card: ${configured.cardId}`);
      tiers[rarityTier(card)] += 1;
    }
    if (demoPack.cards.length !== 6 || tiers.Common !== 3 || tiers.Uncommon !== 2 || tiers.Rare !== 1) {
      throw new Error("Demo pack must preserve the 3C / 2U / 1R composition");
    }
  }
  const store = databaseUrl
    ? new PostgresStore(databaseUrl, { ssl: databaseSsl })
    : new JsonStore(path.join(dataDir, "state.json"));
  await store.init();
  const studioOverlay = await store.getStudioConfig();
  if (studioContent && studioOverlay?.gameConfig) {
    studioContent.gameConfig = {
      ...studioContent.gameConfig,
      ...studioOverlay.gameConfig,
      revealTiming: normalizeRevealTiming(studioOverlay.gameConfig.revealTiming || studioContent.gameConfig.revealTiming),
      visual: normalizeVisualConfig(studioOverlay.gameConfig.visual || studioContent.gameConfig.visual),
      progression: {
        ...studioContent.gameConfig.progression,
        ...studioOverlay.gameConfig.progression,
      },
      releaseSets: studioOverlay.gameConfig.releaseSets || studioContent.gameConfig.releaseSets,
    };
  }
  function applyReleaseSets() {
    const sets = studioContent?.gameConfig?.releaseSets || [];
    const byId = new Map(sets.map((set) => [set.id, set]));
    for (const card of allCards) {
      if (card.eventOnly) continue;
      const release = byId.get(card.releaseSetId);
      if (!release) continue;
      const isIdleSet = card.releaseSetId === "party-leaders" || card.releaseSetId === "party-slot-2";
      const activeForIdle = isIdleSet && release.runtimeState === "active";
      card.releaseState = release.runtimeState;
      card.availableFrom = activeForIdle ? (release.runtimeAvailableFrom || release.plannedPublishAt || null) : null;
      card.idleEligible = activeForIdle;
    }
  }
  applyReleaseSets();
  const rateLimit = createRateLimiter();
  const runtimeProgression = () => ({
    ...studioContent?.gameConfig?.progression,
    achievements: achievementCatalog.achievements || [],
    avatars: avatarCatalog.avatars || [],
    quizEnabled,
  });
  const stateFor = (session) => publicState(session, now(), allCards, runtimeProgression());

  function publicGameConfig() {
    return {
      revealTiming: normalizeRevealTiming(studioContent?.gameConfig?.revealTiming),
      visual: normalizeVisualConfig(studioContent?.gameConfig?.visual),
      progression: progressionConfig(studioContent?.gameConfig?.progression),
      releaseSets: studioContent?.gameConfig?.releaseSets || [],
      parties: publicPartyRegister(studioContent, cards),
      achievements: achievementCatalog.achievements || [],
      avatars: avatarCatalog.avatars || [],
    };
  }

  function publicEditorial(debugRequest) {
    return {
      advocacy,
      sources: debugRequest ? sources : [],
      sequences: debugRequest ? sequences : [],
      samples: debugRequest ? samples : [],
      debugEnabled: debugRequest,
    };
  }

  function publicEvents(session, current = now()) {
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(current));
    return events.events.map((event) => ({
      ...event,
      active: event.status !== "blocked"
        && Date.parse(event.opensAt) <= current
        && current <= Date.parse(event.closesAt),
      claimedToday: Boolean(session.eventClaims?.[event.id]?.[dayKey]),
      cards: event.cardIds.map((id) => cardsById.get(id)).filter(Boolean),
    }));
  }

  async function settleIdle(token) {
    const currentMs = now();
    const pool = activeIdleCards(cards, currentMs);
    if (!pool.length) return { error: "NO_ACTIVE_RELEASE" };
    const result = await store.withSession(token, (current) => {
      current.unseenPulls ??= [];
      current.idleDuplicateStreak ??= 0;
      current.idlePullCount ??= 0;
      const fallbackAnchor = Date.parse(current.idleAnchorAt || current.createdAt);
      const nextAtMs = current.nextIdleAt
        ? Date.parse(current.nextIdleAt)
        : Number.isFinite(fallbackAnchor) ? fallbackAnchor : currentMs;
      const dueIntervals = currentMs >= nextAtMs
        ? Math.floor((currentMs - nextAtMs) / IDLE_INTERVAL_MS) + 1
        : 0;
      const freeSlots = Math.max(0, IDLE_BACKLOG_CAP - current.unseenPulls.length);
      const grantCount = Math.min(dueIntervals, freeSlots);
      const granted = [];
      for (let index = 0; index < grantCount; index += 1) {
        const pull = generateIdlePull({
          cards: pool,
          inventory: current.inventory,
          duplicateStreak: current.idleDuplicateStreak,
          rng,
        });
        const pulledAt = new Date(Math.min(currentMs, nextAtMs + (index * IDLE_INTERVAL_MS))).toISOString();
        const instance = grantCard(current, pull, { acquiredBy: "idle", pulledAt });
        current.idleDuplicateStreak = instance.isNew ? 0 : current.idleDuplicateStreak + 1;
        current.idlePullCount += 1;
        current.packs.push({
          packId: `idle-${instance.instanceId}`,
          mode: "idle",
          pulledAt,
          nextDailyAt: null,
          cards: [instance],
        });
        granted.push(instance);
      }
      if (dueIntervals) {
        current.nextIdleAt = new Date(nextAtMs + (dueIntervals * IDLE_INTERVAL_MS)).toISOString();
      } else if (!current.nextIdleAt) {
        current.nextIdleAt = new Date(nextAtMs).toISOString();
      }
      current.idleAnchorAt ??= new Date(nextAtMs).toISOString();
      current.packs = current.packs.slice(-100);
      current.instances = current.instances.slice(-500);
      syncProgression(current, allCards, studioContent?.gameConfig?.progression, currentMs);
      const unseen = new Set(current.unseenPulls);
      return {
        granted,
        queue: current.instances.filter(({ instanceId }) => unseen.has(instanceId)),
      };
    });
    if (result.granted.length) {
      await store.incrementFaction(store.getSession(token)?.factionId, result.granted.length);
      await store.recordEvent({
        eventId: randomUUID(),
        type: "idle_settled",
        sessionToken: token,
        cardId: null,
        packId: null,
        referralCode: null,
        count: result.granted.length,
        recordedAt: new Date(currentMs).toISOString(),
      });
    }
    return {
      mode: "idle-return",
      newlySettledCount: result.granted.length,
      cards: result.queue,
      state: stateFor(store.getSession(token)),
    };
  }
  function grantCard(session, pull, { acquiredBy, pulledAt }) {
    const isNew = !session.inventory[pull.cardId];
    session.inventory[pull.cardId] = (session.inventory[pull.cardId] ?? 0) + 1;
    const instance = {
      instanceId: randomUUID(),
      cardId: pull.cardId,
      finish: pull.finish,
      pulledAt,
      isNew,
      acquiredBy,
      seenAt: null,
    };
    session.instances.push(instance);
    session.unseenPulls ??= [];
    session.unseenPulls.push(instance.instanceId);
    return instance;
  }

  async function persistStudioConfig() {
    if (!studioContent) return;
    await store.saveStudioConfig({
      gameConfig: {
        revealTiming: studioContent.gameConfig.revealTiming,
        visual: studioContent.gameConfig.visual,
        progression: studioContent.gameConfig.progression,
        releaseSets: studioContent.gameConfig.releaseSets,
      },
    });
    if (studioContentPath && !databaseUrl) {
      await writeJsonAtomic(studioContentPath, studioContent);
    }
  }

  async function buildBootstrap(token, studioRequest) {
    const settled = await settleIdle(token);
    const idleReturn = settled.error
      ? { mode: "idle-return", newlySettledCount: 0, cards: [], state: stateFor(store.getSession(token)) }
      : settled;
    await store.expireTrades(new Date(now()).toISOString());
    return {
      token,
      catalog: { cards: allCards },
      editorial: publicEditorial(debugEnabled && studioRequest),
      activity: await store.activitySummary(),
      studioContent: studioRequest && studioContent
        ? { ...studioContent, debugEnabled: debugEnabled && studioRequest, studioEnabled: true }
        : null,
      gameConfig: publicGameConfig(),
      leaderboards: await store.leaderboardSummary(cards, now(), token),
      specials,
      idleReturn,
      trades: await store.listTrades(token),
      events: publicEvents(store.getSession(token)),
    };
  }

  return async function handler(request, response) {
    const requestId = randomUUID();
    response.setHeader("x-request-id", requestId);
    try {
      const url = new URL(request.url, "http://localhost");
      const debugRequest = debugEnabled && isLoopbackRequest(request);
      const studioRequest = debugRequest || secretsMatch(studioSecretFrom(request), studioSecret);
      if (!debugRequest) {
        response.setHeader(
          "content-security-policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        );
      }
      if (databaseUrl && url.pathname.startsWith("/api/") && !STATELESS_API_PATHS.has(url.pathname)) {
        await store.refresh();
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        const health = await store.health();
        json(response, 200, { status: health.ok ? "ok" : "degraded", backend: health.backend || "json" });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/session") {
        const clientAddress = request.socket?.remoteAddress || "unknown";
        const limit = rateLimit(`session:${clientAddress}`, 20, 10 * 60 * 1000, now());
        if (!limit.allowed) {
          response.setHeader("retry-after", String(limit.retryAfter));
          json(response, 429, { error: "RATE_LIMITED" });
          return;
        }
        const createdAt = new Date(now()).toISOString();
        const token = await store.createSession(createdAt);
        json(response, 201, { token });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/catalog") {
        json(response, 200, { cards: allCards });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/specials") {
        json(response, 200, specials);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/editorial") {
        json(response, 200, publicEditorial(debugRequest));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/studio/content") {
        if (!studioRequest || !studioContent) {
          json(response, 404, { error: "NOT_FOUND" });
          return;
        }
        json(response, 200, { ...studioContent, debugEnabled, studioEnabled: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        const clientAddress = request.socket?.remoteAddress || "unknown";
        let token = bearer(request);
        await store.hydrateSession(token);
        if (!store.getSession(token)) {
          const limit = rateLimit(`session:${clientAddress}`, 20, 10 * 60 * 1000, now());
          if (!limit.allowed) {
            response.setHeader("retry-after", String(limit.retryAfter));
            json(response, 429, { error: "RATE_LIMITED" });
            return;
          }
          token = await store.createSession(new Date(now()).toISOString());
        }
        json(response, 200, await buildBootstrap(token, studioRequest));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/game-config") {
        json(response, 200, publicGameConfig());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/presentation/content") {
        if (!debugRequest) {
          json(response, 404, { error: "NOT_FOUND" });
          return;
        }
        json(response, 200, presentationContent);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/activity") {
        json(response, 200, await store.activitySummary());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/leaderboards") {
        json(response, 200, await store.leaderboardSummary(cards, now(), bearer(request)));
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        const token = bearer(request);
        await store.hydrateSession(token);
        const session = store.getSession(token);
        if (!session) {
          json(response, 401, { error: "INVALID_SESSION" });
          return;
        }
        if (request.method === "POST") {
          const limit = rateLimit(`write:${token}`, 120, 60 * 1000, now());
          if (!limit.allowed) {
            response.setHeader("retry-after", String(limit.retryAfter));
            json(response, 429, { error: "RATE_LIMITED" });
            return;
          }
        }

        if (request.method === "GET" && url.pathname === "/api/state") {
          json(response, 200, stateFor(session));
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/profile") {
          const input = await readJson(request);
          const displayName = normalizeDisplayName(input.displayName);
          if (!displayName) {
            json(response, 400, { error: "INVALID_DISPLAY_NAME" });
            return;
          }
          await store.setDisplayName(token, displayName);
          const requestedAvatar = String(input.avatarId || session.avatarId || "kid-boy");
          const level = progressionState(store.getSession(token), allCards, runtimeProgression(), now()).level;
          const avatar = (avatarCatalog.avatars || []).find((item) => item.id === requestedAvatar);
          if (avatar && level >= (avatar.unlockLevel || 1)) {
            await store.setAvatar(token, avatar.id);
          }
          const current = store.getSession(token);
          json(response, 200, { displayName: current.displayName, avatarId: current.avatarId });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/favorites") {
          const input = await readJson(request);
          const cardId = String(input.cardId || "");
          const card = cardsById.get(cardId);
          if (!card) {
            json(response, 400, { error: "INVALID_CARD" });
            return;
          }
          if (!session.inventory[cardId]) {
            json(response, 409, { error: "CARD_NOT_OWNED" });
            return;
          }
          await store.withSession(token, (current) => {
            current.favorites ??= [];
            const nextFavorite = typeof input.favorite === "boolean"
              ? input.favorite
              : !current.favorites.includes(cardId);
            current.favorites = nextFavorite
              ? [...new Set([...current.favorites, cardId])]
              : current.favorites.filter((id) => id !== cardId);
          });
          json(response, 200, stateFor(store.getSession(token)));
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/idle/settle") {
          const idleReturn = await settleIdle(token);
          if (idleReturn.error) {
            json(response, 503, { error: idleReturn.error });
            return;
          }
          json(response, 200, idleReturn);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/idle/seen") {
          const input = await readJson(request);
          const requested = new Set(Array.isArray(input.instanceIds) ? input.instanceIds.map(String) : []);
          await store.withSession(token, (current) => {
            const unseen = new Set(current.unseenPulls || []);
            const accepted = new Set([...requested].filter((id) => unseen.has(id)));
            const seenAt = new Date(now()).toISOString();
            current.instances.forEach((instance) => {
              if (accepted.has(instance.instanceId)) instance.seenAt = seenAt;
            });
            current.unseenPulls = [...unseen].filter((id) => !accepted.has(id));
          });
          json(response, 200, stateFor(store.getSession(token)));
          return;
        }

        if ((request.method === "GET" && url.pathname === "/api/quiz") || (request.method === "POST" && url.pathname === "/api/quiz/answer")) {
          if (!quizEnabled) {
            json(response, 404, { error: "QUIZ_DISABLED" });
            return;
          }
        }

        if (request.method === "GET" && url.pathname === "/api/quiz") {
          const currentMs = now();
          const day = jerusalemDay(currentMs);
          const result = await store.withSession(token, (current) => {
            if (current.quizWonDay === day) {
              return { available: false, wonToday: true };
            }
            if (current.currentQuiz && Date.parse(current.currentQuiz.expiresAt) > currentMs) {
              return { available: true, wonToday: false, ...current.currentQuiz.public };
            }
            const quiz = buildOwnedCardQuiz(current, cards, rng, currentMs);
            if (!quiz) return { available: false, wonToday: false };
            current.currentQuiz = quiz;
            return { available: true, wonToday: false, ...quiz.public };
          });
          json(response, 200, result);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/quiz/answer") {
          const input = await readJson(request);
          const currentMs = now();
          const day = jerusalemDay(currentMs);
          const pool = activeIdleCards(cards, currentMs);
          const result = await store.withSession(token, (current) => {
            const quiz = current.currentQuiz;
            if (!quiz || quiz.quizId !== input.quizId) {
              return { status: 409, body: { error: "QUIZ_NOT_OPEN" } };
            }
            if (current.quizWonDay === day) {
              current.currentQuiz = null;
              return { status: 409, body: { error: "QUIZ_ALREADY_WON" } };
            }
            if (Date.parse(quiz.expiresAt) <= currentMs) {
              current.currentQuiz = null;
              return { status: 409, body: { error: "QUIZ_EXPIRED" } };
            }
            const correct = quiz.answers.role === input.answers?.role && quiz.answers.list === input.answers?.list;
            current.currentQuiz = null;
            if (!correct) {
              return { status: 200, body: { correct: false, wonToday: false, cardId: quiz.cardId } };
            }
            const pull = generateIdlePull({
              cards: pool,
              inventory: current.inventory,
              duplicateStreak: current.idleDuplicateStreak,
              rng,
            });
            const pulledAt = new Date(currentMs).toISOString();
            const instance = grantCard(current, pull, { acquiredBy: "quiz", pulledAt });
            current.quizWonDay = day;
            current.idleDuplicateStreak = instance.isNew ? 0 : current.idleDuplicateStreak + 1;
            current.packs.push({
              packId: `quiz-${instance.instanceId}`,
              mode: "quiz",
              pulledAt,
              nextDailyAt: null,
              cards: [instance],
            });
            current.packs = current.packs.slice(-100);
            syncProgression(current, allCards, studioContent?.gameConfig?.progression, currentMs);
            return {
              status: 201,
              body: {
                correct: true,
                wonToday: true,
                cardId: quiz.cardId,
                cards: [instance],
                state: null,
              },
            };
          });
          if (result.status === 201) {
            result.body.state = stateFor(store.getSession(token));
          }
          json(response, result.status, result.body);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/rewards/level") {
          const currentMs = now();
          const pool = activeIdleCards(cards, currentMs);
          const result = await store.withSession(token, (current) => {
            syncProgression(current, allCards, studioContent?.gameConfig?.progression, currentMs);
            const rank = current.pendingRankRewards?.shift();
            if (!rank) return null;
            const pull = generateIdlePull({
              cards: pool,
              inventory: current.inventory,
              duplicateStreak: current.idleDuplicateStreak,
              rng,
            });
            const pulledAt = new Date(currentMs).toISOString();
            const instance = grantCard(current, pull, { acquiredBy: `rank-${rank}`, pulledAt });
            current.claimedRankRewards ??= [];
            current.claimedRankRewards.push(rank);
            current.idleDuplicateStreak = instance.isNew ? 0 : current.idleDuplicateStreak + 1;
            return { rank, instance };
          });
          if (!result) {
            json(response, 409, { error: "NO_LEVEL_REWARD" });
            return;
          }
          json(response, 201, {
            mode: "level-reward",
            rank: result.rank,
            cards: [result.instance],
            state: stateFor(store.getSession(token)),
          });
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/events") {
          json(response, 200, { events: publicEvents(session) });
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/trades") {
          await store.expireTrades(new Date(now()).toISOString());
          json(response, 200, { trades: await store.listTrades(token), simulated: false });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/faction") {
          const input = await readJson(request);
          const factionId = input.factionId === null ? null : String(input.factionId || "");
          if (factionId !== null && !partyIds.has(factionId)) {
            json(response, 400, { error: "INVALID_FACTION" });
            return;
          }
          await store.setFaction(token, factionId);
          json(response, 200, stateFor(store.getSession(token)));
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/trades") {
          const input = await readJson(request);
          if (!cardsById.has(input.offeredCardId) || !cardsById.has(input.wantedCardId)) {
            json(response, 400, { error: "INVALID_CARD" });
            return;
          }
          const trade = await store.createTrade({
            sessionToken: token,
            offeredCardId: input.offeredCardId,
            wantedCardId: input.wantedCardId,
            createdAt: new Date(now()).toISOString(),
            expiresAt: new Date(now() + TRADE_TTL_MS).toISOString(),
          });
          if (!trade) {
            json(response, 400, { error: "INVALID_TRADE" });
            return;
          }
          json(response, 201, { trade: { ...trade, ownerToken: undefined }, simulated: false });
          return;
        }

        const tradeCancel = url.pathname.match(/^\/api\/trades\/([^/]+)\/cancel$/);
        if (request.method === "POST" && tradeCancel) {
          const trade = await store.cancelTrade({
            tradeId: tradeCancel[1],
            sessionToken: token,
            cancelledAt: new Date(now()).toISOString(),
          });
          if (!trade) {
            json(response, 409, { error: "TRADE_NOT_CANCELLABLE" });
            return;
          }
          json(response, 200, { trade: (await store.listTrades(token)).find(({ tradeId }) => tradeCancel[1]) });
          return;
        }

        const tradeMatch = url.pathname.match(/^\/api\/trades\/([^/]+)\/simulate-accept$/);
        if (request.method === "POST" && tradeMatch) {
          if (!debugRequest) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const currentTrade = (await store.listTrades(token)).find(({ tradeId }) => tradeId === tradeMatch[1]);
          const wanted = currentTrade ? cardsById.get(currentTrade.wantedCardId) : null;
          const trade = wanted ? await store.simulateTradeMatch({
            tradeId: tradeMatch[1],
            sessionToken: token,
            acceptedAt: new Date(now()).toISOString(),
            finish: rarityTier(wanted),
          }) : null;
          if (!trade) {
            json(response, 400, { error: "TRADE_NOT_MATCHABLE" });
            return;
          }
          json(response, 200, {
            trade: { ...trade, ownerToken: undefined },
            state: stateFor(store.getSession(token)),
            simulated: true,
          });
          return;
        }

        const tradeAccept = url.pathname.match(/^\/api\/trades\/([^/]+)\/accept$/);
        if (request.method === "POST" && tradeAccept) {
          const currentTrade = (await store.listTrades(token)).find(({ tradeId }) => tradeId === tradeAccept[1]);
          const offered = currentTrade ? cardsById.get(currentTrade.offeredCardId) : null;
          const wanted = currentTrade ? cardsById.get(currentTrade.wantedCardId) : null;
          const trade = offered && wanted ? await store.acceptTrade({
            tradeId: tradeAccept[1],
            sessionToken: token,
            acceptedAt: new Date(now()).toISOString(),
            offeredFinish: rarityTier(offered),
            wantedFinish: rarityTier(wanted),
          }) : null;
          if (!trade) {
            json(response, 409, { error: "TRADE_NOT_ACCEPTABLE" });
            return;
          }
          json(response, 200, {
            trade: (await store.listTrades(token)).find(({ tradeId }) => tradeAccept[1]),
            state: stateFor(store.getSession(token)),
          });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/debug/reset-pack") {
          if (!debugRequest) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          await store.withSession(token, (current) => {
            current.nextDailyAt = null;
          });
          json(response, 200, stateFor(store.getSession(token)));
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/debug/unlock-card") {
          if (!studioRequest) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const input = await readJson(request);
          const card = cardsById.get(String(input.cardId || ""));
          if (!card) {
            json(response, 400, { error: "INVALID_CARD" });
            return;
          }
          await store.withSession(token, (current) => {
            if (current.inventory[card.id]) return;
            const pulledAt = new Date(now()).toISOString();
            current.inventory[card.id] = 1;
            current.instances.push({
              instanceId: randomUUID(),
              cardId: card.id,
              finish: card.rarity,
              pulledAt,
              isNew: true,
              acquiredBy: "debug-unlock",
            });
          });
          json(response, 200, stateFor(store.getSession(token)));
          return;
        }

        const eventPull = url.pathname.match(/^\/api\/events\/([^/]+)\/pull$/);
        if (request.method === "POST" && eventPull) {
          const event = events.events.find(({ id }) => id === eventPull[1]);
          const current = now();
          if (!event || event.status === "blocked" || Date.parse(event.opensAt) > current || current > Date.parse(event.closesAt)) {
            json(response, 404, { error: "EVENT_NOT_ACTIVE" });
            return;
          }
          const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone || "Asia/Jerusalem" }).format(new Date(current));
          const result = await store.withSession(token, (currentSession) => {
            currentSession.eventClaims ??= {};
            currentSession.eventClaims[event.id] ??= {};
            if (currentSession.eventClaims[event.id][dayKey]) {
              return { status: 409, body: { error: "EVENT_ALREADY_CLAIMED" } };
            }
            const pool = event.cardIds.map((id) => cardsById.get(id)).filter(Boolean);
            if (!pool.length) return { status: 500, body: { error: "EMPTY_EVENT" } };
            const unowned = pool.filter((card) => !currentSession.inventory[card.id]);
            const card = (unowned.length ? unowned : pool)[rng((unowned.length ? unowned : pool).length)];
            const pulledAt = new Date(current).toISOString();
            const instance = {
              instanceId: randomUUID(),
              cardId: card.id,
              finish: "Promotion",
              pulledAt,
              isNew: !currentSession.inventory[card.id],
              acquiredBy: "event",
            };
            currentSession.inventory[card.id] = (currentSession.inventory[card.id] ?? 0) + 1;
            currentSession.instances.push(instance);
            currentSession.eventClaims[event.id][dayKey] = card.id;
            return {
              status: 201,
              body: { packId: `event-${event.id}-${dayKey}`, mode: "event", pulledAt, nextDailyAt: null, cards: [instance] },
            };
          });
          json(response, result.status, result.body);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/studio/content") {
          if (!studioRequest || !studioContent) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const input = await readJson(request);
          const member = studioContent.members.find((candidate) => candidate.id === input.memberId);
          const card = member?.quoteSlots.find((candidate) => candidate.id === input.cardId);
          if (!member || !card || !input.patch || typeof input.patch !== "object" || Array.isArray(input.patch)) {
            json(response, 400, { error: "INVALID_STUDIO_PATCH" });
            return;
          }
          const allowed = new Set(["publicationState", "quote", "editorial", "art", "review"]);
          for (const key of Object.keys(input.patch)) {
            if (!allowed.has(key)) {
              json(response, 400, { error: "INVALID_STUDIO_FIELD", field: key });
              return;
            }
          }
          if (input.patch.publicationState) card.publicationState = String(input.patch.publicationState);
          for (const key of ["quote", "editorial", "art", "review"]) {
            if (input.patch[key] && typeof input.patch[key] === "object" && !Array.isArray(input.patch[key])) {
              card[key] = { ...card[key], ...input.patch[key] };
            }
          }
          if (input.memberPatch?.identityReference && typeof input.memberPatch.identityReference === "object") {
            const identityReference = {};
            for (const key of ["url", "license", "status"]) {
              if (key in input.memberPatch.identityReference) {
                identityReference[key] = String(input.memberPatch.identityReference[key]);
              }
            }
            member.identityReference = { ...member.identityReference, ...identityReference };
          }
          card.review = {
            ...card.review,
            revision: Number(card.review?.revision || 0) + 1,
            updatedAt: new Date(now()).toISOString(),
          };
          studioContent.generatedAt = new Date(now()).toISOString();
          const runtimeCard = publishStudioCard(member, card);
          if (studioContentPath && !databaseUrl) {
            await writeJsonAtomic(studioContentPath, studioContent);
            await writeJsonAtomic(cardsPath, cards);
          }
          await persistStudioConfig();
          json(response, 200, {
            memberId: member.id,
            identityReference: member.identityReference,
            card,
            runtimeCard,
            removedCardId: runtimeCard ? null : card.id,
            saved: true,
          });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/studio/specials") {
          if (!studioRequest || !specialsPath) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const input = await readJson(request);
          const card = specials.cards?.find((candidate) => candidate.id === input.cardId);
          if (!card || !input.patch || typeof input.patch !== "object" || Array.isArray(input.patch)) {
            json(response, 400, { error: "INVALID_SPECIAL_PATCH" });
            return;
          }
          const allowed = new Set([
            "displayText",
            "originalText",
            "date",
            "sourceUrl",
            "sourceTitle",
            "context",
            "scene",
            "flavor",
            "artKey",
            "contentStatus",
          ]);
          for (const [key, value] of Object.entries(input.patch)) {
            if (!allowed.has(key) || typeof value !== "string") {
              json(response, 400, { error: "INVALID_SPECIAL_FIELD", field: key });
              return;
            }
            card[key] = value.trim();
          }
          const existing = cardsById.get(card.id);
          if (!existing?.eventOnly) {
            json(response, 409, { error: "SPECIAL_RUNTIME_CARD_MISSING" });
            return;
          }
          Object.assign(existing, runtimeSpecialCard(card));
          specials.updatedAt = new Date(now()).toISOString();
          await writeJsonAtomic(specialsPath, specials);
          json(response, 200, { card, runtimeCard: existing, saved: true });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/presentation/content") {
          if (!debugRequest || !presentationContentPath) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const input = await readJson(request);
          if (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) {
            json(response, 400, { error: "INVALID_PRESENTATION_FIELDS" });
            return;
          }
          const entries = Object.entries(input.fields);
          if (entries.length > 500 || entries.some(([key, value]) =>
            !/^s\d{2}-t\d{3}$/.test(key) || typeof value !== "string" || value.length > 2000)) {
            json(response, 400, { error: "INVALID_PRESENTATION_FIELDS" });
            return;
          }
          presentationContent = {
            schemaVersion: 1,
            deckId: "poc-response",
            updatedAt: new Date(now()).toISOString(),
            fields: Object.fromEntries(entries),
          };
          await writeJsonAtomic(presentationContentPath, presentationContent);
          json(response, 200, presentationContent);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/studio/config") {
          if (!studioRequest || !studioContent) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const input = await readJson(request);
          if (!validRevealTiming(input.revealTiming) || !validVisualConfig(input.visual) || !validProgressionPatch(input.progression) || !validReleaseSets(input.releaseSets)) {
            json(response, 400, { error: "INVALID_GAME_CONFIG" });
            return;
          }
          studioContent.gameConfig = {
            ...studioContent.gameConfig,
            revealTiming: normalizeRevealTiming(input.revealTiming ?? studioContent.gameConfig?.revealTiming),
            visual: normalizeVisualConfig(input.visual ?? studioContent.gameConfig?.visual),
            progression: {
              ...studioContent.gameConfig.progression,
              releaseLevelIncrements: {
                ...(studioContent.gameConfig.progression?.releaseLevelIncrements || {}),
                ...(input.progression?.releaseLevelIncrements || {}),
              },
              thresholdExponent: input.progression?.thresholdExponent
                ?? studioContent.gameConfig.progression?.thresholdExponent,
            },
            releaseSets: mergeReleaseSets(studioContent.gameConfig.releaseSets, input.releaseSets),
          };
          studioContent.generatedAt = new Date(now()).toISOString();
          applyReleaseSets();
          await persistStudioConfig();
          json(response, 200, publicGameConfig());
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/studio/achievements") {
          if (!studioRequest || !achievementsPath) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const input = await readJson(request);
          const next = Array.isArray(input.achievements) ? input.achievements : null;
          if (!next || !next.every((item) => item?.id && item.rule)) {
            json(response, 400, { error: "INVALID_ACHIEVEMENTS" });
            return;
          }
          achievementCatalog = {
            schemaVersion: 1,
            achievements: next.map((item) => ({
              id: String(item.id),
              nameHe: String(item.nameHe || item.name || item.id).slice(0, 48),
              descriptionHe: String(item.descriptionHe || item.description || "").slice(0, 160),
              rule: String(item.rule),
              target: Math.max(0, Math.round(Number(item.target) || 0)),
            })),
          };
          await writeJsonAtomic(achievementsPath, achievementCatalog);
          json(response, 200, achievementCatalog);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/studio/events") {
          if (!studioRequest || !eventsPath) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const input = await readJson(request);
          const next = Array.isArray(input.events) ? input.events : null;
          if (!next || !next.every((item) => item?.id && item.nameHe && item.opensAt && item.closesAt)) {
            json(response, 400, { error: "INVALID_EVENTS" });
            return;
          }
          events.events = next.map((item) => ({
            id: String(item.id),
            nameHe: String(item.nameHe).slice(0, 64),
            descriptionHe: String(item.descriptionHe || "").slice(0, 240),
            status: ["active", "blocked", "scheduled"].includes(item.status) ? item.status : "blocked",
            opensAt: String(item.opensAt),
            closesAt: String(item.closesAt),
            timezone: item.timezone || "Asia/Jerusalem",
            cardIds: Array.isArray(item.cardIds) ? item.cardIds.map(String) : [],
          }));
          await writeJsonAtomic(eventsPath, events);
          json(response, 200, events);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/packs/demo") {
          if (!debugRequest || !demoPack) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const pulledAt = new Date(now()).toISOString();
          json(response, 200, {
            packId: `demo-${demoPack.id}`,
            mode: "demo",
            label: demoPack.label,
            description: demoPack.description,
            pulledAt,
            nextDailyAt: null,
            cards: demoPack.cards.map((configured, index) => ({
              instanceId: `demo-${index + 1}-${configured.cardId}`,
              cardId: configured.cardId,
              finish: configured.finish,
              pulledAt,
              isNew: false,
            })),
          });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/packs/bibi-demo") {
          if (!debugRequest || !demoPack) {
            json(response, 404, { error: "NOT_FOUND" });
            return;
          }
          const bibiCards = ["LIK-M01-Q01", "LIK-M01-Q02", "LIK-M01-Q03"].map((cardId) => cardsById.get(cardId));
          if (bibiCards.some((card) => !card)
            || bibiCards.map(rarityTier).join(",") !== "Common,Uncommon,Rare") {
            json(response, 500, { error: "BIBI_DEBUG_CARD_MISSING" });
            return;
          }
          const pulledAt = new Date(now()).toISOString();
          const configuredCards = [
            ...bibiCards.map((card) => ({ cardId: card.id, finish: rarityTier(card) })),
            ...demoPack.cards.filter(({ finish }) => finish === "Common").slice(0, 2),
            ...demoPack.cards.filter(({ finish }) => finish === "Uncommon").slice(0, 1),
          ];
          const pack = await store.withSession(token, (current) => {
            const instances = configuredCards.map((configured) => {
              const isNew = !current.inventory[configured.cardId];
              current.inventory[configured.cardId] = (current.inventory[configured.cardId] ?? 0) + 1;
              const instance = {
                instanceId: randomUUID(),
                cardId: configured.cardId,
                finish: configured.finish,
                pulledAt,
                isNew,
                acquiredBy: "bibi-debug-pack",
              };
              current.instances.push(instance);
              return instance;
            });
            return {
            packId: `bibi-demo-${now()}`,
            mode: "bibi-demo",
            label: "חבילת ביבי לבדיקה",
            description: "חבילת בדיקה בהרכב 3 נפוצים, 2 לא נפוצים ונדיר אחד.",
            pulledAt,
            nextDailyAt: null,
              cards: instances,
            };
          });
          json(response, 201, {
            ...pack,
            state: stateFor(store.getSession(token)),
          });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/events") {
          const input = await readJson(request);
          if (!CLIENT_EVENTS.has(input.type)) {
            json(response, 400, { error: "INVALID_EVENT" });
            return;
          }
          if (input.cardId && !cardsById.has(input.cardId)) {
            json(response, 400, { error: "INVALID_CARD" });
            return;
          }
          if (["back_completed", "share_created"].includes(input.type) && !session.inventory[input.cardId]) {
            json(response, 403, { error: "CARD_NOT_OWNED" });
            return;
          }
          if (input.type === "gift_preview_created" && (session.inventory[input.cardId] ?? 0) < 2) {
            json(response, 403, { error: "DUPLICATE_REQUIRED" });
            return;
          }
          const event = {
            eventId: randomUUID(),
            type: input.type,
            sessionToken: token,
            cardId: input.cardId ?? null,
            packId: input.packId ?? null,
            referralCode: String(input.referralCode ?? "").slice(0, 64) || null,
            recordedAt: new Date(now()).toISOString(),
          };
          await store.recordEvent(event);
          json(response, 201, { recorded: true, eventId: event.eventId });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/packs/daily") {
          const result = await store.withSession(token, (current) => {
            const pulledAtMs = now();
            const nextAtMs = current.nextDailyAt ? Date.parse(current.nextDailyAt) : 0;
            if (nextAtMs > pulledAtMs) {
              return {
                status: 429,
                body: { error: "PACK_NOT_READY", nextDailyAt: current.nextDailyAt },
              };
            }

            const generated = generatePack({
              cards,
              inventory: current.inventory,
              dryPacks: current.dryPacks,
              packCount: current.packCount,
              rng,
            });
            const pulledAt = new Date(pulledAtMs).toISOString();
            const nextDailyAt = new Date(pulledAtMs + DAY_MS).toISOString();
            const packId = randomUUID();
            let newCards = 0;
            const instances = generated.map((pull) => {
              const isNew = !current.inventory[pull.cardId];
              if (isNew) newCards += 1;
              current.inventory[pull.cardId] = (current.inventory[pull.cardId] ?? 0) + 1;
              const instance = {
                instanceId: randomUUID(),
                cardId: pull.cardId,
                finish: pull.finish,
                pulledAt,
                isNew,
              };
              current.instances.push(instance);
              return instance;
            });

            current.nextDailyAt = nextDailyAt;
            current.packCount += 1;
            current.dryPacks = newCards ? 0 : current.dryPacks + 1;
            const pack = { packId, pulledAt, nextDailyAt, cards: instances };
            current.packs.push(pack);
            current.packs = current.packs.slice(-20);
            current.instances = current.instances.slice(-500);

            return { status: 201, body: pack };
          });

          if (!result) {
            json(response, 401, { error: "INVALID_SESSION" });
            return;
          }
          if (result.status === 201) {
            await store.incrementFaction(store.getSession(token)?.factionId);
            await store.recordEvent({
              eventId: randomUUID(),
              type: "pack_opened",
              sessionToken: token,
              cardId: null,
              packId: result.body.packId,
              referralCode: null,
              recordedAt: result.body.pulledAt,
            });
          }
          json(response, result.status, result.body);
          return;
        }

        json(response, 404, { error: "NOT_FOUND" });
        return;
      }

      if (url.pathname.startsWith("/design-assets/")) {
        await serveFile(request, response, assetsDir, url.pathname.slice("/design-assets/".length));
        return;
      }

      if (docsDir && url.pathname.startsWith("/project-docs/")) {
        if (!debugRequest) {
          json(response, 404, { error: "NOT_FOUND" });
          return;
        }
        await serveFile(request, response, docsDir, url.pathname.slice("/project-docs/".length));
        return;
      }

      const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      await serveFile(request, response, publicDir, relative);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        requestId,
        method: request.method,
        path: request.url,
        message: error.message,
        stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
      }));
      if (!response.headersSent) json(response, 500, { error: "SERVER_ERROR" });
      else response.end();
    }
  };
}

export { DAY_MS, IDLE_BACKLOG_CAP, IDLE_INTERVAL_MS, LEVEL_RATIOS, RANK_TITLES };
