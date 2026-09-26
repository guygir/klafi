import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { moveOwnedCard, stampFromGrantCount } from "./numbered.js";
import { factionStandingsFromCollectors } from "./faction-standings.js";
import { LEAGUE_MAX, hebrewSeasonLabel, leagueMemberScore, newLeagueCode, normalizeLeagueCode } from "./leagues.js";
import { ensurePublicBinderSlug, normalizePublicBinderSlug } from "./public-binder.js";

/**
 * Per-session write counter. Every state payload carries it as `revision`, so a client can drop a
 * response that was computed before one it has already applied (responses can arrive out of order).
 */
export function bumpStateRevision(session) {
  session.stateRevision = (Number(session.stateRevision) || 0) + 1;
  return session.stateRevision;
}

export const CARD_HOLDER_SYNC_MS = 60 * 60 * 1000;

export const EMPTY_STATE = {
  version: 6,
  sessions: {},
  analytics: { events: [] },
  trades: [],
  factions: {},
  reports: [],
  idempotency: {},
  numberedIssued: {},
  cardHolderSnapshot: { holders: {}, numberedHolders: {}, computedAt: null },
  leagues: {},
};

export function normalizeState(value = {}) {
  const state = { ...structuredClone(EMPTY_STATE), ...value };
  state.version = 6;
  state.sessions ??= {};
  state.analytics ??= { events: [] };
  state.analytics.events ??= [];
  state.trades ??= [];
  state.factions ??= {};
  state.reports ??= [];
  state.idempotency ??= {};
  state.numberedIssued ??= {};
  state.leagues ??= {};
  state.cardHolderSnapshot = {
    holders: state.cardHolderSnapshot?.holders || {},
    numberedHolders: state.cardHolderSnapshot?.numberedHolders || {},
    computedAt: state.cardHolderSnapshot?.computedAt || null,
  };
  for (const [token, session] of Object.entries(state.sessions)) {
    session.eventCounts ??= {};
    session.factionId ??= null;
    session.tradeCount ??= 0;
    session.eventClaims ??= {};
    session.favorites ??= [];
    session.displayName ??= `שחקן ${token.slice(0, 4)}`;
    session.idleAnchorAt ??= null;
    session.nextIdleAt ??= null;
    session.unseenPulls ??= [];
    session.preparedPulls ??= [];
    session.idleDuplicateStreak ??= 0;
    session.idlePullCount ??= 0;
    session.highestRank ??= 1;
    session.claimedRankRewards ??= [];
    session.pendingRankRewards ??= [];
    session.avatarId ??= "kid-boy";
    session.quizWonDay ??= null;
    session.currentQuiz ??= null;
    session.loginDay ??= null;
    session.loginStreak ??= 0;
  }
  return state;
}

function cardStars(card) {
  if (card?.rarity === "Promotion") return 5;
  if (card?.rarity?.startsWith("Rare")) return 3;
  if (card?.rarity?.startsWith("Uncommon")) return 2;
  return 1;
}

export function tallyCardHolders(sessions = {}) {
  const holders = {};
  const numberedHolders = {};
  for (const session of Object.values(sessions || {})) {
    for (const [cardId, copies] of Object.entries(session.inventory || {})) {
      if (Number(copies) > 0) holders[cardId] = (holders[cardId] || 0) + 1;
    }
    const seen = new Set();
    for (const instance of session.instances || []) {
      if (Number(instance?.numberedIndex) > 0 && instance.cardId && !seen.has(instance.cardId)) {
        seen.add(instance.cardId);
        numberedHolders[instance.cardId] = (numberedHolders[instance.cardId] || 0) + 1;
      }
    }
  }
  return { holders, numberedHolders };
}

export function cardHolderSnapshotFresh(snapshot, nowMs, ttlMs = CARD_HOLDER_SYNC_MS) {
  const at = Date.parse(snapshot?.computedAt || "");
  return Number.isFinite(at) && (nowMs - at) < ttlMs;
}

export class JsonStore {
  constructor(filePath, { now = () => Date.now() } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.state = structuredClone(EMPTY_STATE);
    this.queue = Promise.resolve();
    this.transaction = new AsyncLocalStorage();
    this.holderRefresh = null;
  }

  async init() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.state = normalizeState(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  async persist() {
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`);
    await rename(temporary, this.filePath);
  }

  async health() {
    return { ok: true, backend: "json" };
  }

  async hydrateSession(token) {
    return this.getSession(token);
  }

  async getStudioConfig() {
    return null;
  }

  async saveStudioConfig() {
    return null;
  }

  async createSession(now) {
    return this.exclusive(async () => {
      const token = randomUUID();
      this.state.sessions[token] = {
        displayName: `שחקן ${token.slice(0, 4)}`,
        avatarId: "kid-boy",
        createdAt: now,
        nextDailyAt: null,
        dryPacks: 0,
        packCount: 0,
        inventory: {},
        instances: [],
        packs: [],
        eventCounts: {},
        factionId: null,
        tradeCount: 0,
        eventClaims: {},
        favorites: [],
        idleAnchorAt: now,
        nextIdleAt: null,
        unseenPulls: [],
        preparedPulls: [],
        idleDuplicateStreak: 0,
        idlePullCount: 0,
        highestRank: 1,
        claimedRankRewards: [],
        pendingRankRewards: [],
        loginDay: null,
        loginStreak: 0,
        publicBinderSlug: ensurePublicBinderSlug({}),
      };
      await this.persist();
      return token;
    });
  }

  getSession(token) {
    return token ? this.state.sessions[token] ?? null : null;
  }

  async getPublicBinder(slug) {
    const normalized = normalizePublicBinderSlug(slug);
    if (!normalized) return null;
    return Object.values(this.state.sessions).find((session) => session.publicBinderSlug === normalized) || null;
  }

  async ensureBinderSlug(token) {
    const session = this.getSession(token);
    if (!session) return null;
    if (normalizePublicBinderSlug(session.publicBinderSlug)) return session;
    return this.withSession(token, (current) => {
      ensurePublicBinderSlug(current);
    }).then(() => this.getSession(token));
  }

  async withSession(token, mutator) {
    return this.exclusive(async () => {
      const session = this.getSession(token);
      if (!session) return null;
      const result = await mutator(session);
      bumpStateRevision(session);
      await this.persist();
      return result;
    });
  }

  async idempotent(token, key, route, operation) {
    if (!key) return { ...(await operation()), replayed: false };
    return this.exclusive(async () => {
      const storageKey = `${token}:${key}`;
      const existing = this.state.idempotency[storageKey];
      if (existing) {
        if (existing.route !== route) {
          return { status: 409, body: { error: "IDEMPOTENCY_KEY_REUSED" }, replayed: true };
        }
        return { status: existing.status, body: existing.body, replayed: true };
      }
      const result = await operation();
      this.state.idempotency[storageKey] = {
        route,
        status: result.status,
        body: result.body,
        createdAt: new Date().toISOString(),
      };
      const keys = Object.keys(this.state.idempotency);
      for (const expired of keys.slice(0, Math.max(0, keys.length - 5000))) {
        delete this.state.idempotency[expired];
      }
      await this.persist();
      return { ...result, replayed: false };
    });
  }

  async submitReport(report) {
    return this.exclusive(async () => {
      const existing = this.state.reports.find(({ reportId }) => reportId === report.reportId);
      if (!existing) {
        this.state.reports.push({
          ...report,
          status: "open",
          reviewerNote: null,
          updatedAt: report.createdAt,
        });
        await this.persist();
      }
      return { reportId: report.reportId, queued: true, replayed: Boolean(existing) };
    });
  }

  async listReports() {
    const priority = { open: 0, reviewing: 1, resolved: 2, rejected: 2 };
    return [...this.state.reports]
      .sort((left, right) => (
        (priority[left.status] ?? 3) - (priority[right.status] ?? 3)
        || Date.parse(left.createdAt) - Date.parse(right.createdAt)
      ))
      .slice(0, 500);
  }

  async updateReport(reportId, status, reviewerNote, updatedAt) {
    return this.exclusive(async () => {
      const report = this.state.reports.find((candidate) => candidate.reportId === reportId);
      if (!report) return false;
      report.status = status;
      report.reviewerNote = reviewerNote;
      report.updatedAt = updatedAt;
      await this.persist();
      return true;
    });
  }

  async recordEvent(event) {
    return this.exclusive(async () => {
      this.state.analytics.events.push(event);
      this.state.analytics.events = this.state.analytics.events.slice(-5000);
      const session = this.getSession(event.sessionToken);
      if (session) session.eventCounts[event.type] = (session.eventCounts[event.type] ?? 0) + 1;
      await this.persist();
      return event;
    });
  }

  async activitySummary() {
    const counts = {};
    const sessions = new Set();
    for (const event of this.state.analytics.events) {
      counts[event.type] = (counts[event.type] ?? 0) + 1;
      if (event.sessionToken) sessions.add(event.sessionToken);
    }
    return {
      counts,
      participatingSessions: sessions.size,
      fixture: false,
      label: "Recorded PoC activity",
    };
  }

  async setFaction(token, factionId) {
    return this.exclusive(async () => {
      const session = this.getSession(token);
      if (!session) return null;
      session.factionId = factionId;
      await this.persist();
      return factionId;
    });
  }

  async setDisplayName(token, displayName) {
    return this.exclusive(async () => {
      const session = this.getSession(token);
      if (!session) return null;
      session.displayName = displayName;
      await this.persist();
      return displayName;
    });
  }

  async setAvatar(token, avatarId) {
    return this.exclusive(async () => {
      const session = this.getSession(token);
      if (!session) return null;
      session.avatarId = avatarId;
      await this.persist();
      return avatarId;
    });
  }

  async incrementFaction(factionId, amount = 1) {
    if (!factionId) return;
    return this.exclusive(async () => {
      this.state.factions[factionId] = (this.state.factions[factionId] ?? 0) + amount;
      await this.persist();
    });
  }

  async createTrade({ sessionToken, offeredCardId, wantedCardId, createdAt, expiresAt }) {
    return this.exclusive(async () => {
      const session = this.getSession(sessionToken);
      if (!session || !session.inventory[offeredCardId] || offeredCardId === wantedCardId) return null;
      const existing = this.state.trades.find((trade) =>
        trade.ownerToken === sessionToken
        && trade.status === "open"
        && Date.parse(trade.expiresAt || 0) > Date.parse(createdAt));
      if (existing) return { blocked: true, existing };
      const reservedCopies = this.state.trades.filter((trade) =>
        trade.ownerToken === sessionToken
        && trade.offeredCardId === offeredCardId
        && trade.status === "open"
        && Date.parse(trade.expiresAt || 0) > Date.parse(createdAt)).length;
      if ((session.inventory[offeredCardId] ?? 0) <= reservedCopies) return null;
      const trade = {
        tradeId: randomUUID(),
        ownerToken: sessionToken,
        offeredCardId,
        wantedCardId,
        status: "open",
        createdAt,
        expiresAt,
        acceptedAt: null,
        acceptedBy: null,
      };
      this.state.trades.unshift(trade);
      this.state.trades = this.state.trades.slice(0, 100);
      await this.persist();
      return trade;
    });
  }

  async simulateTradeMatch({ tradeId, sessionToken, acceptedAt, finish }) {
    return this.exclusive(async () => {
      const trade = this.state.trades.find((candidate) => candidate.tradeId === tradeId);
      const session = this.getSession(sessionToken);
      if (!trade || trade.ownerToken !== sessionToken || trade.status !== "open" || !session?.inventory[trade.offeredCardId]) {
        return null;
      }
      session.inventory[trade.offeredCardId] -= 1;
      if (!session.inventory[trade.offeredCardId]) delete session.inventory[trade.offeredCardId];
      session.inventory[trade.wantedCardId] = (session.inventory[trade.wantedCardId] ?? 0) + 1;
      session.instances.push({
        instanceId: randomUUID(),
        cardId: trade.wantedCardId,
        finish,
        pulledAt: acceptedAt,
        isNew: session.inventory[trade.wantedCardId] === 1,
        acquiredBy: "simulated-trade",
      });
      session.tradeCount += 1;
      trade.status = "matched-demo";
      trade.acceptedAt = acceptedAt;
      trade.acceptedBy = "simulated-matching-user";
      await this.persist();
      return trade;
    });
  }

  async acceptTrade({ tradeId, sessionToken, acceptedAt, offeredFinish, wantedFinish }) {
    return this.exclusive(async () => {
      const trade = this.state.trades.find((candidate) => candidate.tradeId === tradeId);
      const owner = trade ? this.getSession(trade.ownerToken) : null;
      const accepter = this.getSession(sessionToken);
      if (!trade || trade.status !== "open" || Date.parse(trade.expiresAt || 0) <= Date.parse(acceptedAt) || trade.ownerToken === sessionToken
        || !owner?.inventory[trade.offeredCardId] || !accepter?.inventory[trade.wantedCardId]) {
        return null;
      }
      moveOwnedCard(owner, accepter, trade.offeredCardId, {
        acquiredBy: "trade-accepted",
        pulledAt: acceptedAt,
        finish: offeredFinish,
        instanceId: randomUUID(),
      });
      moveOwnedCard(accepter, owner, trade.wantedCardId, {
        acquiredBy: "trade-accepted",
        pulledAt: acceptedAt,
        finish: wantedFinish,
        instanceId: randomUUID(),
      });
      owner.tradeCount += 1;
      accepter.tradeCount += 1;
      trade.status = "accepted";
      trade.acceptedAt = acceptedAt;
      trade.acceptedBy = sessionToken;
      await this.persist();
      return trade;
    });
  }

  async expireTrades(currentAt) {
    return this.exclusive(async () => {
      let changed = false;
      for (const trade of this.state.trades) {
        if (trade.status === "open" && Date.parse(trade.expiresAt || 0) <= Date.parse(currentAt)) {
          trade.status = "expired";
          changed = true;
        }
      }
      if (changed) await this.persist();
      return changed;
    });
  }

  async cancelTrade({ tradeId, sessionToken, cancelledAt }) {
    return this.exclusive(async () => {
      const trade = this.state.trades.find((candidate) => candidate.tradeId === tradeId);
      if (!trade || trade.ownerToken !== sessionToken || trade.status !== "open") return null;
      trade.status = "cancelled";
      trade.cancelledAt = cancelledAt;
      await this.persist();
      return trade;
    });
  }

  async listTrades(token) {
    const current = this.getSession(token);
    return this.state.trades
      .filter((trade) => trade.status === "open" || trade.ownerToken === token || trade.acceptedBy === token)
      .map(({ ownerToken, acceptedBy, ...trade }) => {
        const owner = this.getSession(ownerToken);
        return {
          ...trade,
          ownerLabel: owner?.displayName || "שחקן קְלָפִי",
          ownedByCurrent: ownerToken === token,
          acceptedByCurrent: acceptedBy === token,
          canAccept: trade.status === "open"
            && ownerToken !== token
            && Boolean(owner?.inventory[trade.offeredCardId])
            && Boolean(current?.inventory[trade.wantedCardId]),
        };
      });
  }

  async leaderboardSummary(cards = [], now = Date.now(), currentToken = null) {
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const allCollectors = Object.entries(this.state.sessions)
      .map(([token, session]) => ({
        label: session.displayName,
        ownedUnique: Object.keys(session.inventory).length,
        stars: Object.keys(session.inventory).reduce((sum, cardId) => sum + cardStars(cardsById.get(cardId)), 0),
        packs: session.idlePullCount ?? session.packCount,
        current: token === currentToken,
        avatarId: session.avatarId || "kid-boy",
        factionId: session.factionId || null,
        loginStreak: session.loginStreak || 0,
        rankLevel: session.highestRank || 1,
        binderSlug: session.publicBinderSlug || null,
      }))
      .sort((a, b) => b.stars - a.stars || b.ownedUnique - a.ownedUnique || b.packs - a.packs)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    const collectors = allCollectors.slice(0, 8);
    const currentCollector = allCollectors.find(({ current }) => current);
    if (currentCollector && !collectors.some(({ current }) => current)) collectors.splice(7, 1, currentCollector);
    const factions = factionStandingsFromCollectors(allCollectors);
    const partyIds = [...new Set(cards.filter(({ set }) => set !== "SYS" && !String(set).startsWith("special-")).map(({ set }) => set))].sort();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now));
    const dayNumber = [...day].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const targetPartyId = partyIds.length ? partyIds[dayNumber % partyIds.length] : null;
    const allDailyParty = Object.entries(this.state.sessions)
      .map(([token, session]) => ({
        label: session.displayName,
        current: token === currentToken,
        avatarId: session.avatarId || "kid-boy",
        factionId: session.factionId || null,
        loginStreak: session.loginStreak || 0,
        rankLevel: session.highestRank || 1,
        binderSlug: session.publicBinderSlug || null,
        cards: session.packs
          .filter((pack) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(pack.pulledAt)) === day)
          .flatMap((pack) => pack.cards)
          .filter((instance) => cardsById.get(instance.cardId)?.set === targetPartyId).length,
      }))
      .sort((a, b) => b.cards - a.cards);
    const dailyParty = allDailyParty.slice(0, 8);
    const currentDaily = allDailyParty.find(({ current }) => current);
    if (currentDaily && !dailyParty.some(({ current }) => current)) dailyParty.splice(7, 1, currentDaily);
    const targetPartyNameHe = cards.find((card) => card.set === targetPartyId)?.setNameHe || targetPartyId;
    return {
      collectors,
      factions,
      dailyChallenge: { day, targetPartyId, targetPartyNameHe, leaders: dailyParty },
      fixture: false,
      label: "Real activity in this local PoC",
    };
  }

  scheduleCardHolderRefresh() {
    if (this.holderRefresh) return this.holderRefresh;
    this.holderRefresh = this.refreshCardHolderSnapshot()
      .catch(() => null)
      .finally(() => {
        this.holderRefresh = null;
      });
    return this.holderRefresh;
  }

  async refreshCardHolderSnapshot() {
    const tally = tallyCardHolders(this.state.sessions);
    const snapshot = {
      ...tally,
      computedAt: new Date(this.now()).toISOString(),
    };
    this.state.cardHolderSnapshot = snapshot;
    await this.persist();
    return snapshot;
  }

  async cardHolderSummary() {
    const snapshot = this.state.cardHolderSnapshot;
    if (!snapshot?.computedAt) return this.refreshCardHolderSnapshot();
    if (!cardHolderSnapshotFresh(snapshot, this.now())) this.scheduleCardHolderRefresh();
    return snapshot;
  }

  async claimNumberedStamp(key, max, every = 30) {
    this.state.numberedIssued ??= {};
    const next = (this.state.numberedIssued[key] || 0) + 1;
    this.state.numberedIssued[key] = next;
    return stampFromGrantCount(next, max, every);
  }

  scoreLeagueMembers(memberTokens, cards = []) {
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    return memberTokens.map((token) => {
      const session = this.getSession(token);
      const score = leagueMemberScore(session, cardsById);
      return {
        token,
        label: session?.displayName || "שחקן קְלָפִי",
        avatarId: session?.avatarId || "kid-boy",
        loginStreak: session?.loginStreak || 0,
        rankLevel: session?.highestRank || 1,
        ...score,
      };
    });
  }

  async createLeague(ownerToken, name, now = this.now()) {
    return this.exclusive(async () => {
      if (!this.getSession(ownerToken)) return { error: "UNAUTHORIZED" };
      this.state.leagues ??= {};
      let code = newLeagueCode();
      while (this.state.leagues[code]) code = newLeagueCode();
      const league = {
        code,
        name,
        seasonLabel: hebrewSeasonLabel(now),
        createdAt: new Date(now).toISOString(),
        ownerToken,
        memberTokens: [ownerToken],
      };
      this.state.leagues[code] = league;
      await this.persist();
      return { league };
    });
  }

  async joinLeague(token, rawCode) {
    return this.exclusive(async () => {
      if (!this.getSession(token)) return { error: "UNAUTHORIZED" };
      const code = normalizeLeagueCode(rawCode);
      const league = code ? this.state.leagues?.[code] : null;
      if (!league) return { error: "LEAGUE_NOT_FOUND" };
      if (!league.memberTokens.includes(token)) {
        if (league.memberTokens.length >= LEAGUE_MAX) return { error: "LEAGUE_FULL" };
        league.memberTokens.push(token);
        await this.persist();
      }
      return { league };
    });
  }

  async listLeagues(token) {
    return Object.values(this.state.leagues || {})
      .filter((league) => league.memberTokens.includes(token))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async getLeague(code) {
    return this.state.leagues?.[normalizeLeagueCode(code)] || null;
  }

  exclusive(operation) {
    if (this.transaction.getStore()) return operation();
    const run = () => this.transaction.run(true, operation);
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
}
