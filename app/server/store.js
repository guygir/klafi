import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  drawNumberedIndex,
  jerusalemDay,
  moveOwnedCard,
  numberPoolFromStored,
  regularCopyCount,
  regularInventory,
  returnNumberedIndex,
  rollNumberedStamp,
  takePlainInstanceForCard,
} from "./numbered.js";
import { countTodayPulse } from "../public/today-pulse.js";
import { factionStandingsFromCollectors } from "./faction-standings.js";
import {
  LEAGUE_MAX,
  leagueMemberScore,
  leaveLeagueMembership,
  newLeagueCode,
  normalizeLeagueCode,
} from "./leagues.js";
import { ensurePublicBinderSlug, normalizePublicBinderSlug } from "./public-binder.js";
import { newReferralCode, normalizeInviteCode } from "./referral.js";
import { collectionStars, numberedHeldByCard } from "./stars.js";
import { enqueueAcceptedTradeNotice } from "./trade-notices.js";
import {
  TRADE_MESSAGES_HE,
  canAcceptTrade as canCompleteTrade,
  movedCardIdsFromVerdict,
  normalizeStoredTrade,
  ownerCanOfferCards,
  parseCreateTradeInput,
  publicTradeView,
  reservedOfferCopies,
  tradeRecordFromSides,
  validateTradeShape,
} from "./trade-core.js";
import { numberedTotal, takeCollectorBoard, takeNumberedBoard } from "./collector-board.js";
import { dailyRaceScore, raceTargetForSavedFaction, visibleDailyRaceLeaders } from "./daily-race.js";

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
  state.trades = state.trades.map((trade) => normalizeStoredTrade(trade));
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
    session.pendingTradeNotices ??= [];
    session.avatarId ??= "kid-boy";
    session.quizWonDay ??= null;
    session.currentQuiz ??= null;
    session.loginDay ??= null;
    session.loginStreak ??= 0;
    session.bestLoginStreak ??= session.loginStreak;
    session.visitDay ??= null;
    session.visitDates ??= [];
    session.visitStreak ??= 0;
    session.bestVisitStreak ??= session.visitStreak;
    session.visitStreakClaims ??= [];
    session.visitDateClaims ??= [];
    session.pendingStreakReward ??= null;
    session.streakCalendarAckDay ??= null;
    session.streakPrizeSkipped = Boolean(session.streakPrizeSkipped);
    session.achievementsEarned ??= {};
    session.referralCode = normalizeInviteCode(session.referralCode);
    session.invitedBy ??= null;
    session.referralRewardedAt ??= null;
    session.instances ??= [];
    session.packs ??= [];
  }
  return state;
}

export function tallyCardHolders(sessions = {}) {
  const holders = {};
  const numberedHolders = {};
  for (const session of Object.values(sessions || {})) {
    // One holder per player who holds any regular or opened numbered copy (x > 0 or y > 0 is +1,
    // never +2). Inventory holds exactly those: a numbered copy still in the warehouse is not in it.
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

export function listNumberedPulls(sessions = {}) {
  const pulls = [];
  for (const session of Object.values(sessions || {})) {
    const displayName = String(session.displayName || "").trim() || "שחקן";
    const binderSlug = session.publicBinderSlug || null;
    for (const instance of session.instances || []) {
      const index = Number(instance?.numberedIndex);
      if (!(index > 0) || !instance.cardId) continue;
      pulls.push({
        cardId: instance.cardId,
        displayName,
        index,
        of: Number(instance.numberedOf) || 0,
        binderSlug,
      });
    }
  }
  pulls.sort((a, b) => a.cardId.localeCompare(b.cardId) || a.index - b.index || a.displayName.localeCompare(b.displayName, "he"));
  return pulls;
}

export function cardHolderSnapshotFresh(snapshot, nowMs, ttlMs = CARD_HOLDER_SYNC_MS) {
  const at = Date.parse(snapshot?.computedAt || "");
  return Number.isFinite(at) && (nowMs - at) < ttlMs;
}

export function holderInventoryChanged(before, after) {
  const left = before?.inventory || {};
  const right = after?.inventory || {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (Number(left[key] || 0) !== Number(right[key] || 0)) return true;
  }
  return false;
}

export class JsonStore {
  constructor(filePath, { now = () => Date.now(), numberedRandom = Math.random } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.numberedRandom = numberedRandom;
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

  tokenForReferralCode(code) {
    const normalized = normalizeInviteCode(code);
    if (!normalized) return null;
    const found = Object.entries(this.state.sessions).find(([, session]) => session.referralCode === normalized);
    return found?.[0] || null;
  }

  freshReferralCode() {
    const taken = new Set(
      Object.values(this.state.sessions).map((session) => session.referralCode).filter(Boolean),
    );
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = newReferralCode();
      if (!taken.has(code)) return code;
    }
    return newReferralCode();
  }

  async listInvited(inviterToken) {
    if (!inviterToken) return [];
    return Object.values(this.state.sessions).filter((session) => session.invitedBy === inviterToken);
  }

  async ensureReferralCode(token) {
    const session = this.getSession(token);
    if (!session) return null;
    if (session.referralCode) return session.referralCode;
    return this.withSession(token, (current) => {
      if (!current.referralCode) current.referralCode = this.freshReferralCode();
      return current.referralCode;
    });
  }

  /** Same shape as the Postgres summaries: only what the referrals list reads. */
  async listInvitedSummaries(inviterToken) {
    return (await this.listInvited(inviterToken)).map((session) => ({
      displayName: session.displayName,
      referralCode: session.referralCode,
      invitedBy: session.invitedBy,
      referralRewardedAt: session.referralRewardedAt || null,
      inventory: session.inventory || {},
      numberedByCard: numberedHeldByCard(session),
    }));
  }

  async createSession(now, { inviteCode } = {}) {
    return this.exclusive(async () => {
      const token = randomUUID();
      const invitedBy = this.tokenForReferralCode(inviteCode);
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
        hiddenTradeIds: [],
        idleAnchorAt: now,
        nextIdleAt: null,
        unseenPulls: [],
        preparedPulls: [],
        idleDuplicateStreak: 0,
        idlePullCount: 0,
        highestRank: 1,
        claimedRankRewards: [],
        pendingRankRewards: [],
        pendingTradeNotices: [],
        loginDay: null,
        loginStreak: 0,
        bestLoginStreak: 0,
        visitDay: null,
        visitDates: [],
        visitStreak: 0,
        bestVisitStreak: 0,
        visitStreakClaims: [],
        visitDateClaims: [],
        pendingStreakReward: null,
        streakCalendarAckDay: null,
        streakPrizeSkipped: false,
        achievementsEarned: {},
        publicBinderSlug: ensurePublicBinderSlug({}),
        referralCode: this.freshReferralCode(),
        invitedBy: invitedBy && invitedBy !== token ? invitedBy : null,
        referralRewardedAt: null,
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

  invalidateCardHolderSnapshot() {
    this.state.cardHolderSnapshot = {
      holders: this.state.cardHolderSnapshot?.holders || {},
      numberedHolders: this.state.cardHolderSnapshot?.numberedHolders || {},
      computedAt: null,
    };
  }

  async withSession(token, mutator) {
    const nested = Boolean(this.transaction.getStore());
    return this.exclusive(async () => {
      const session = this.getSession(token);
      if (!session) return null;
      const snapshot = nested ? null : structuredClone(this.state);
      try {
        const before = { inventory: { ...(session.inventory || {}) } };
        const result = await mutator(session);
        if (holderInventoryChanged(before, session)) this.invalidateCardHolderSnapshot();
        bumpStateRevision(session);
        if (!nested) await this.persist();
        return result;
      } catch (error) {
        if (snapshot) this.state = snapshot;
        throw error;
      }
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
      todayPulse: countTodayPulse(this.state.sessions, jerusalemDay(Date.now())),
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

  async createTrade({ sessionToken, offered, wanted, offeredCardId, wantedCardId, createdAt, expiresAt }) {
    return this.exclusive(async () => {
      const session = this.getSession(sessionToken);
      const parsed = offered && wanted
        ? { offered, wanted }
        : parseCreateTradeInput({ offeredCardId, wantedCardId });
      const shape = validateTradeShape(parsed);
      if (!shape.ok) return { error: shape.code, messageHe: shape.messageHe };
      if (!session) return null;
      const existing = this.state.trades.find((trade) =>
        trade.ownerToken === sessionToken
        && trade.status === "open"
        && Date.parse(trade.expiresAt || 0) > Date.parse(createdAt));
      if (existing) return { blocked: true, existing };
      const canOffer = ownerCanOfferCards(
        session,
        this.state.trades,
        sessionToken,
        parsed.offered.cardIds,
        createdAt,
        regularCopyCount,
      );
      if (!canOffer.ok) return { error: "NOT_OWNED", messageHe: TRADE_MESSAGES_HE.NOT_OWNED, cardId: canOffer.cardId };
      const trade = tradeRecordFromSides({
        tradeId: randomUUID(),
        ownerToken: sessionToken,
        offered: parsed.offered,
        wanted: parsed.wanted,
        createdAt,
        expiresAt,
      });
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
      if (!trade || trade.ownerToken !== sessionToken || trade.status !== "open" || regularCopyCount(session, trade.offeredCardId) < 1) {
        return null;
      }
      session.inventory[trade.offeredCardId] -= 1;
      takePlainInstanceForCard(session, trade.offeredCardId);
      if (!session.inventory[trade.offeredCardId]) delete session.inventory[trade.offeredCardId];
      session.inventory[trade.wantedCardId] = (session.inventory[trade.wantedCardId] ?? 0) + 1;
      session.instances.push({
        instanceId: randomUUID(),
        cardId: trade.wantedCardId,
        finish,
        pulledAt: acceptedAt,
        isNew: regularCopyCount(session, trade.wantedCardId) === 1,
        acquiredBy: "simulated-trade",
      });
      session.tradeCount += 1;
      trade.status = "matched-demo";
      trade.acceptedAt = acceptedAt;
      trade.acceptedBy = "simulated-matching-user";
      this.invalidateCardHolderSnapshot();
      await this.persist();
      return trade;
    });
  }

  async acceptTrade({
    tradeId,
    sessionToken,
    acceptedAt,
    offeredCardId = null,
    wantedCardId = null,
    offeredFinishes = {},
    wantedFinishes = {},
  }) {
    return this.exclusive(async () => {
      const trade = this.state.trades.find((candidate) => candidate.tradeId === tradeId);
      const owner = trade ? this.getSession(trade.ownerToken) : null;
      const accepter = this.getSession(sessionToken);
      const verdict = trade && owner && accepter
        ? canCompleteTrade(trade, {
          owner,
          accepter: { ...accepter, token: sessionToken },
          trades: this.state.trades,
          at: acceptedAt,
          regularCopyCountFn: regularCopyCount,
          offeredCardId,
          wantedCardId,
        })
        : { ok: false, code: "ACCEPT_FAILED", messageHe: TRADE_MESSAGES_HE.ACCEPT_FAILED };
      if (!verdict.ok) {
        return {
          ok: false,
          error: verdict.code || "ACCEPT_FAILED",
          code: verdict.code || "ACCEPT_FAILED",
          messageHe: verdict.messageHe || TRADE_MESSAGES_HE.ACCEPT_FAILED,
        };
      }
      for (const cardId of verdict.offeredCardIds) {
        moveOwnedCard(owner, accepter, cardId, {
          acquiredBy: "trade-accepted",
          pulledAt: acceptedAt,
          finish: offeredFinishes[cardId] || offeredFinishes.default,
          instanceId: randomUUID(),
        });
      }
      for (const cardId of verdict.wantedCardIds) {
        moveOwnedCard(accepter, owner, cardId, {
          acquiredBy: "trade-accepted",
          pulledAt: acceptedAt,
          finish: wantedFinishes[cardId] || wantedFinishes.default,
          instanceId: randomUUID(),
        });
      }
      owner.tradeCount += 1;
      accepter.tradeCount += 1;
      trade.acceptedOfferedCardId = verdict.acceptedOfferedCardId;
      trade.acceptedWantedCardId = verdict.acceptedWantedCardId;
      trade.status = "accepted";
      trade.acceptedAt = acceptedAt;
      trade.acceptedBy = sessionToken;
      let accepterMoved = movedCardIdsFromVerdict(verdict);
      try {
        const ownerMoved = movedCardIdsFromVerdict(verdict, { viewer: "owner" });
        accepterMoved = movedCardIdsFromVerdict(verdict);
        enqueueAcceptedTradeNotice(owner, trade, {
          acceptedAt,
          accepterName: accepter.displayName,
          ownerName: owner.displayName,
          receivedCardIds: ownerMoved.receivedCardIds,
          givenCardIds: ownerMoved.givenCardIds,
        });
      } catch {
        /* Notice / id shaping is display-only. The transfer already happened. */
      }
      bumpStateRevision(owner);
      bumpStateRevision(accepter);
      this.invalidateCardHolderSnapshot();
      await this.persist();
      return {
        ...trade,
        ...accepterMoved,
      };
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

  async clearOpenTradesDebug(cancelledAt) {
    return this.exclusive(async () => {
      let cleared = 0;
      for (const trade of this.state.trades) {
        if (trade.status !== "open") continue;
        trade.status = "cancelled";
        trade.cancelledAt = cancelledAt;
        cleared += 1;
      }
      if (cleared) await this.persist();
      return { cleared };
    });
  }

  async hideTrade({ tradeId, sessionToken }) {
    return this.exclusive(async () => {
      const session = this.getSession(sessionToken);
      const trade = this.state.trades.find((candidate) => candidate.tradeId === tradeId);
      if (!session || !trade || trade.status !== "open" || trade.ownerToken === sessionToken) return null;
      session.hiddenTradeIds ??= [];
      if (!session.hiddenTradeIds.includes(tradeId)) session.hiddenTradeIds.push(tradeId);
      if (session.hiddenTradeIds.length > 200) session.hiddenTradeIds = session.hiddenTradeIds.slice(-200);
      await this.persist();
      return { tradeId };
    });
  }

  async reservedOfferCopiesFor(sessionToken, cardId, at) {
    return reservedOfferCopies(this.state.trades, sessionToken, cardId, at);
  }

  async listTrades(token) {
    const current = this.getSession(token);
    const hidden = new Set(current?.hiddenTradeIds || []);
    return this.state.trades
      .filter((trade) => trade.status === "open" || trade.ownerToken === token || trade.acceptedBy === token)
      .filter((trade) => trade.ownerToken === token || !hidden.has(trade.tradeId))
      .map((trade) => {
        const owner = this.getSession(trade.ownerToken);
        const view = publicTradeView(trade, {
          token,
          ownerSession: owner,
          viewerSession: current ? { ...current, token } : null,
          trades: this.state.trades,
          at: null,
          regularCopyCountFn: regularCopyCount,
        });
        return {
          ...view,
          ownerLabel: owner?.displayName || "שחקן קְלָפִי",
        };
      });
  }

  async leaderboardSummary(cards = [], now = Date.now(), currentToken = null) {
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const allCollectors = Object.entries(this.state.sessions)
      .map(([token, session]) => ({
        label: session.displayName,
        ownedUnique: Object.keys(regularInventory(session.inventory, numberedHeldByCard(session))).length,
        stars: collectionStars(session.inventory, cardsById, numberedHeldByCard(session)),
        numbered: numberedTotal(numberedHeldByCard(session)),
        packs: session.idlePullCount ?? session.packCount,
        current: token === currentToken,
        avatarId: session.avatarId || "kid-boy",
        factionId: session.factionId || null,
        loginStreak: session.loginStreak || 0,
        visitStreak: session.visitStreak || 0,
        rankLevel: session.highestRank || 1,
        binderSlug: session.publicBinderSlug || null,
      }))
      .sort((a, b) => b.stars - a.stars || b.ownedUnique - a.ownedUnique || b.packs - a.packs)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    const { collectors, collectorCount, yourCollectorRank } = takeCollectorBoard(allCollectors);
    const numberedBoard = takeNumberedBoard(allCollectors);
    const factions = factionStandingsFromCollectors(allCollectors);
    const partyIds = [...new Set(cards.filter(({ set }) => set !== "SYS" && !String(set).startsWith("special-")).map(({ set }) => set))].sort();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now));
    const targetPartyId = raceTargetForSavedFaction(this.getSession(currentToken)?.factionId, partyIds);
    const allDailyParty = targetPartyId
      ? Object.entries(this.state.sessions)
        .map(([token, session]) => ({
          label: session.displayName,
          current: token === currentToken,
          avatarId: session.avatarId || "kid-boy",
          factionId: session.factionId || null,
          loginStreak: session.loginStreak || 0,
          visitStreak: session.visitStreak || 0,
          rankLevel: session.highestRank || 1,
          binderSlug: session.publicBinderSlug || null,
          cards: dailyRaceScore(session.instances, day, targetPartyId, cardsById),
        }))
        .sort((a, b) => b.cards - a.cards)
      : [];
    const dailyParty = targetPartyId ? visibleDailyRaceLeaders(allDailyParty) : [];
    const targetPartyNameHe = targetPartyId
      ? (cards.find((card) => card.set === targetPartyId)?.setNameHe || targetPartyId)
      : null;
    return {
      collectors,
      collectorCount,
      yourCollectorRank,
      ...numberedBoard,
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
    const numberedPulls = listNumberedPulls(this.state.sessions);
    if (!snapshot?.computedAt || !cardHolderSnapshotFresh(snapshot, this.now())) {
      const fresh = await this.refreshCardHolderSnapshot();
      return { ...fresh, numberedPulls };
    }
    return { ...snapshot, numberedPulls };
  }

  async claimNumberedStamp(key, max, every = 30) {
    const cap = Math.max(0, Math.round(Number(max) || 0));
    if (!cap) return null;
    this.state.numberedIssued ??= {};
    const pool = numberPoolFromStored(this.state.numberedIssued[key], cap);
    if (!rollNumberedStamp(cap - pool.length, cap, every, this.numberedRandom)) return null;
    const drawn = drawNumberedIndex(pool, this.numberedRandom);
    if (!drawn) return null;
    this.state.numberedIssued[key] = drawn.pool;
    return { index: drawn.index, of: cap };
  }

  async returnNumberedStamp(key, index, max) {
    const cap = Math.max(0, Math.round(Number(max) || 0));
    if (!cap) return [];
    return this.exclusive(async () => {
      this.state.numberedIssued ??= {};
      const pool = returnNumberedIndex(numberPoolFromStored(this.state.numberedIssued[key], cap), index, cap);
      this.state.numberedIssued[key] = pool;
      await this.persist();
      return pool;
    });
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
        factionId: session?.factionId || null,
        loginStreak: session?.loginStreak || 0,
        visitStreak: session?.visitStreak || 0,
        rankLevel: session?.highestRank || 1,
        binderSlug: session?.publicBinderSlug || null,
        ...score,
      };
    });
  }

  async createLeague(ownerToken, name, now = this.now()) {
    return this.exclusive(async () => {
      if (!this.getSession(ownerToken)) return { error: "UNAUTHORIZED" };
      this.state.leagues ??= {};
      if (this.memberLeagues(ownerToken).length) return { error: "ALREADY_IN_LEAGUE" };
      let code = newLeagueCode();
      while (this.state.leagues[code]) code = newLeagueCode();
      const league = {
        code,
        name,
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
        if (this.memberLeagues(token).length) return { error: "ALREADY_IN_LEAGUE" };
        if (league.memberTokens.length >= LEAGUE_MAX) return { error: "LEAGUE_FULL" };
        league.memberTokens.push(token);
        await this.persist();
      }
      return { league };
    });
  }

  async leaveLeague(token, rawCode) {
    return this.exclusive(async () => {
      if (!this.getSession(token)) return { error: "UNAUTHORIZED" };
      const code = normalizeLeagueCode(rawCode);
      const left = leaveLeagueMembership(code ? this.state.leagues?.[code] : null, token);
      if (left.error) return left;
      if (left.deleted) delete this.state.leagues[code];
      else this.state.leagues[code] = left.league;
      await this.persist();
      return { left: true, deleted: Boolean(left.deleted) };
    });
  }

  memberLeagues(token) {
    return Object.values(this.state.leagues || {}).filter((league) => league.memberTokens.includes(token));
  }

  async listLeagues(token) {
    return this.memberLeagues(token)
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
