import { buildMemberWeavePrompt, buildPackImagePrompt, buildPackRipPrompt, buildWeavePrompt } from "./prompt-builder.js";
import { avatarBallotState, factionLetterArt, factionLetters } from "./avatar-ballot.js";
import { applyIdleCountdown, formatCountdown, homeIdleReadyCopy, idleCountdownCopy, IDLE_BACKLOG_CAP, resumeClockAfterCap, timeUntil } from "./idle-countdown.js";
import { starContributionBins } from "./star-contribution-bins.js";
import { binderBadgeOrder } from "./badge-order.js";
import { isStaleState, mergeLeaderboards, overlayPendingSeen, stateRevision } from "./state-sync.js";
import { attachKlafiTips, markPageSeen, readSeenPages, readTipsPref } from "./tips.js";
import {
  exitWalkoutSunburst,
  readSunburstRarityOverride,
  resolveSunburstRarity,
  syncWalkoutSunburst,
  teardownWalkoutSunburst,
} from "./walkout-sunburst.js";
import { destroyPackRip, mountPackRip, packRipMarkup, preloadPackRipAssets, schedulePackRipPrefetch } from "./packrip.js";
import { createSfx, revealClipForStage, sfxRarityKey } from "./sfx.js";

const SESSION_KEY = "kalpi-alpha-session";
const STUDIO_KEY = "kalpi-studio-secret";
const HOME_CACHE_KEY = "kalpi-home-cache";
// When the server state last arrived (0 = only the localStorage cache so far).
let stateFreshAt = 0;
let eventPredictionRefreshAt = 0;
const EVENT_PREDICTION_STALE_MS = 60_000;
const PENDING_IDLE_SEEN_KEY = "kalpi-pending-idle-seen";
const PENDING_REPORTS_KEY = "kalpi-pending-reports";
const PENDING_MUTATIONS_KEY = "kalpi-pending-mutations";
const STATIC_DATA_VERSION = "visible-sets-3";
const LIVE_RELEASE_SET_IDS = ["party-leaders", "party-slot-2", "decisions", "records", "set-5"];
const DAY_MS = 24 * 60 * 60 * 1000;
const TRADE_BOARD_PAGE_SIZE = 3;
const WALKOUT_STAGES = ["blank", "quote", "party", "identity", "portrait"];

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function playerDialogOpen() {
  return [
    elements.dialog,
    elements.advocacyDialog,
    elements.profileDialog,
    elements.reportDialog,
    elements.levelDialog,
    elements.eventDialog,
    elements.shareSheet,
  ].some((dialog) => dialog?.open);
}
const model = {
  token: localStorage.getItem(SESSION_KEY),
  stateRevision: 0,
  editorial: null,
  studioContent: null,
  gameConfig: {
    revealTiming: { quote: 400, party: 1800, name: 1800, portrait: 2000 },
    visual: { theme: "pack-v2", cardFrame: "tall-v2", density: "airy-v2", quoteReveal: "ink-v2" },
  },
  activity: null,
  leaderboards: null,
  trades: [],
  specials: { sets: [] },
  events: [],
  catalog: [],
  byId: new Map(),
  serverState: null,
  currentPack: null,
  idleQueue: [],
  currentCardIndex: 0,
  packPhase: "sealed",
  walkoutStage: 0,
  previewMode: false,
  binderFilter: "ALL",
  binderParty: "",
  binderOwnedOnly: false,
  binderPage: 0,
  achievementTier: null,
  communityPage: "trade",
  communitySection: "market",
  eventPage: "active",
  reviewFilter: "all",
  selectedStudioPartyId: null,
  selectedStudioMemberId: null,
  selectedStudioSpecialSetId: null,
  dialogCardId: null,
  dialogBack: false,
  holdGeneration: 0,
  renderedLevel: null,
  selectedAvatarId: null,
  extrasReady: false,
  specialWindow: null,
  leagues: [],
  leaguesKnown: false,
  leaguesCacheToken: null,
  leagueLeaveConfirm: null,
  showcase: false,
  cardHolders: { holders: {}, numberedHolders: {} },
  cardHoldersReady: false,
  dialogNumbered: false,
  reports: [],
  reportSubject: null,
  levelRewardReady: null,
  levelRewardGrant: null,
  guestBinder: null,
  watchedTrade: null,
  tradeBoardPage: 0,
  tradeBoardOffered: "",
  tradeBoardWanted: "",
};
let showcaseTimers = [];
let packTimers = [];
// One pack-rip at a time: the live player and an AbortController for its packrip:* listeners.
let packRip = null;
let packRipListeners = null;
let homePackRipBusy = false;
const sfx = createSfx();
const klafiTips = attachKlafiTips();

const elements = {
  views: [...document.querySelectorAll(".view")],
  main: document.querySelector("#main"),
  headerStatus: document.querySelector("#header-status"),
  playerName: document.querySelector("#player-name"),
  playerNameLabel: document.querySelector("#player-name-label"),
  levelAvatar: document.querySelector("#level-avatar"),
  levelAvatarButton: document.querySelector("#level-avatar-button"),
  avatarPicker: document.querySelector("#avatar-picker"),
  studioAchievements: document.querySelector("#studio-achievements"),
  studioEvents: document.querySelector("#studio-events"),
  addAchievement: document.querySelector("#add-achievement"),
  saveAchievements: document.querySelector("#save-achievements"),
  saveEvents: document.querySelector("#save-events"),
  profileDialog: document.querySelector("#profile-dialog"),
  profileForm: document.querySelector("#profile-form"),
  profileNameInput: document.querySelector("#profile-name-input"),
  profileError: document.querySelector("#profile-error"),
  recoveryCode: document.querySelector("#profile-recovery-code"),
  copyRecovery: document.querySelector("#copy-recovery-code"),
  restoreInput: document.querySelector("#profile-restore-input"),
  restoreButton: document.querySelector("#restore-recovery-code"),
  restoreStatus: document.querySelector("#profile-restore-status"),
  enableIdleNotify: document.querySelector("#enable-idle-notify"),
  soundToggle: document.querySelector("#sound-toggle"),
  homeEnableNotify: document.querySelector("#home-enable-notify"),
  notifyStatus: document.querySelector("#notify-status"),
  leagueNameInput: document.querySelector("#league-name-input"),
  createLeague: document.querySelector("#create-league"),
  leagueJoinInput: document.querySelector("#league-join-input"),
  joinLeague: document.querySelector("#join-league"),
  leagueStatus: document.querySelector("#league-status"),
  leagueRooms: document.querySelector("#league-rooms"),
  todaySpecialsRow: document.querySelector("#today-specials-row"),
  todaySpecialsCopy: document.querySelector("#today-specials-copy"),
  todaySpecialsCopyRepeat: document.querySelector("#today-specials-copy-repeat"),
  closeProfile: document.querySelector("#close-profile"),
  homeTitle: document.querySelector("#home-title"),
  homeCopy: document.querySelector("#home-copy"),
  skipToMain: document.querySelector("#skip-to-main"),
  advocacyShort: document.querySelector("#advocacy-short"),
  openAdvocacy: document.querySelector("#open-advocacy"),
  advocacyDialog: document.querySelector("#advocacy-dialog"),
  closeAdvocacy: document.querySelector("#close-advocacy"),
  advocacySponsor: document.querySelector("#advocacy-sponsor"),
  advocacyFull: document.querySelector("#advocacy-full"),
  advocacyPhases: document.querySelector("#advocacy-phases"),
  collectionCount: document.querySelector("#collection-count"),
  collectionProgress: document.querySelector("#collection-progress"),
  activityCopy: document.querySelector("#activity-copy"),
  idleStorage: document.querySelector("#idle-storage"),
  activeRelease: document.querySelector("#active-release"),
  siteCardPeeks: document.querySelector("#site-card-peeks"),
  todayChallengeVisual: document.querySelector("#today-challenge-visual"),
  todayChallengeHook: document.querySelector("#today-challenge-hook"),
  todayChallengeMeta: document.querySelector("#today-challenge-meta"),
  todayLeaderHook: document.querySelector("#today-leader-hook"),
  todayLeaderMeta: document.querySelector("#today-leader-meta"),
  homePack: document.querySelector("#home-pack"),
  openPack: document.querySelector("#open-pack"),
  openPackFancy: document.querySelector("#open-pack-fancy"),
  openBibiPack: document.querySelector("#open-bibi-pack"),
  cooldownCopy: document.querySelector("#cooldown-copy"),
  packStep: document.querySelector("#pack-step"),
  packHeading: document.querySelector("#pack-heading"),
  packCounter: document.querySelector("#pack-counter"),
  ripStage: document.querySelector("#rip-stage"),
  packAction: document.querySelector("#pack-action"),
  packHint: document.querySelector("#pack-hint"),
  sharedTitle: document.querySelector("#shared-title"),
  sharedCard: document.querySelector("#shared-card"),
  sharedNotice: document.querySelector("#shared-notice"),
  sharedTrust: document.querySelector("#shared-trust"),
  sharedSource: document.querySelector("#shared-source"),
  sharedOpenGame: document.querySelector("#shared-open-game"),
  showcaseNotice: document.querySelector("#showcase-notice"),
  showcaseCount: document.querySelector("#showcase-count"),
  showcaseFilters: document.querySelector("#showcase-filters"),
  showcaseGrid: document.querySelector("#showcase-grid"),
  showcaseEmpty: document.querySelector("#showcase-empty"),
  showcaseOpenGame: document.querySelector("#showcase-open-game"),
  studioShareBinder: document.querySelector("#studio-share-binder"),
  studioShareBinderLink: document.querySelector("#studio-share-binder-link"),
  studioShareBinderCopy: document.querySelector("#studio-share-binder-copy"),
  dialogHolders: document.querySelector("#dialog-holders"),
  binderPercent: document.querySelector("#binder-percent"),
  binderCount: document.querySelector("#binder-count"),
  binderEyebrow: document.querySelector("#binder-eyebrow"),
  binderTitle: document.querySelector("#binder-title"),
  shareMyBinder: document.querySelector("#share-my-binder"),
  guestBinderBanner: document.querySelector("#guest-binder-banner"),
  guestBinderLabel: document.querySelector("#guest-binder-label"),
  closeGuestBinder: document.querySelector("#close-guest-binder"),
  binderShareUrl: document.querySelector("#binder-share-url"),
  copyBinderShare: document.querySelector("#copy-binder-share"),
  binderFilters: document.querySelector("#binder-filters"),
  binderGrid: document.querySelector("#binder-grid"),
  binderPager: document.querySelector("#binder-pager"),
  binderEmpty: document.querySelector("#binder-empty"),
  achievementsEmpty: document.querySelector("#achievements-empty"),
  achievementGrid: document.querySelector("#achievement-grid"),
  achievementTiers: document.querySelector("#achievement-tiers"),
  communityTabs: document.querySelector("#community-tabs"),
  communitySections: document.querySelector("#community-sections"),
  earnedBadgeRail: document.querySelector("#earned-badge-rail"),
  earnedBadgeList: document.querySelector("#earned-badge-list"),
  levelNumber: document.querySelector("#level-number"),
  levelTeaser: document.querySelector("#level-teaser"),
  levelRank: document.querySelector("#level-rank"),
  levelProgress: document.querySelector("#level-progress"),
  levelProgressCount: document.querySelector("#level-progress-count"),
  levelNext: document.querySelector("#level-next"),
  levelDialog: document.querySelector("#level-dialog"),
  levelDialogTitle: document.querySelector("#level-dialog-title"),
  levelUnlocks: document.querySelector("#level-unlocks"),
  levelDialogReward: document.querySelector("#level-dialog-reward"),
  closeLevel: document.querySelector("#close-level"),
  claimLevel: document.querySelector("#claim-level"),
  eventDialog: document.querySelector("#event-dialog"),
  eventDialogKicker: document.querySelector("#event-dialog-kicker"),
  eventDialogTitle: document.querySelector("#event-dialog-title"),
  eventDialogCopy: document.querySelector("#event-dialog-copy"),
  eventDialogOk: document.querySelector("#event-dialog-ok"),
  closeEventDialog: document.querySelector("#close-event-dialog"),
  avatarSeal: document.querySelector("#avatar-seal"),
  levelLetter: document.querySelector("#level-letter"),
  levelLetterText: document.querySelector("#level-letter-text"),
  levelStreakCount: document.querySelector("#level-streak-count"),
  tradePreview: document.querySelector("#trade-preview"),
  tradeActive: document.querySelector("#trade-active"),
  tradeCompose: document.querySelector("#trade-compose"),
  tradeOfferedPreview: document.querySelector("#trade-offered-preview"),
  tradeWantedPreview: document.querySelector("#trade-wanted-preview"),
  tradeDemo: document.querySelector("#trade-demo"),
  tradeOfferedSet: document.querySelector("#trade-offered-set"),
  tradeOfferedCard: document.querySelector("#trade-offered-card"),
  tradeWantedSet: document.querySelector("#trade-wanted-set"),
  tradeWantedCard: document.querySelector("#trade-wanted-card"),
  tradeCreate: document.querySelector("#trade-create"),
  tradeBoard: document.querySelector("#trade-board"),
  tradeBoardToolbar: document.querySelector("#trade-board-toolbar"),
  tradeBoardOffered: document.querySelector("#trade-board-offered"),
  tradeBoardWanted: document.querySelector("#trade-board-wanted"),
  tradeBoardPager: document.querySelector("#trade-board-pager"),
  creatorCode: document.querySelector("#creator-code"),
  copyCreatorLink: document.querySelector("#copy-creator-link"),
  creatorLinkPreview: document.querySelector("#creator-link-preview"),
  growthEmpty: document.querySelector("#growth-empty"),
  growthMetrics: document.querySelector("#growth-metrics"),
  factionSelect: document.querySelector("#faction-select"),
  saveFaction: document.querySelector("#save-faction"),
  factionMembers: document.querySelector("#faction-members"),
  factionBoard: document.querySelector("#faction-board"),
  collectorBoard: document.querySelector("#collector-board"),
  dailyChallengeTitle: document.querySelector("#daily-challenge-title"),
  dailyChallengeLeaderArt: document.querySelector("#daily-challenge-leader-art"),
  dailyChallengeRecap: document.querySelector("#daily-challenge-recap"),
  dailyChallengeBoard: document.querySelector("#daily-challenge-board"),
  studioSponsor: document.querySelector("#studio-sponsor"),
  studioViewpoint: document.querySelector("#studio-viewpoint"),
  studioReleaseStatus: document.querySelector("#studio-release-status"),
  studioReleaseSets: document.querySelector("#studio-release-sets"),
  studioPackNow: document.querySelector("#studio-pack-now"),
  saveReleaseSets: document.querySelector("#save-release-sets"),
  debugClock: document.querySelector("#debug-clock"),
  headerDebugReset: document.querySelector("#header-debug-reset"),
  runGuidedDemo: document.querySelector("#run-guided-demo"),
  studioDebugPull: document.querySelector("#studio-debug-pull-button"),
  studioDebugPullStatus: document.querySelector("#studio-debug-pull-status"),
  debugResetPack: document.querySelector("#debug-reset-pack"),
  studioContentSummary: document.querySelector("#studio-content-summary"),
  studioPartyTabs: document.querySelector("#studio-party-tabs"),
  studioMemberSelect: document.querySelector("#studio-member-select"),
  studioMemberStatus: document.querySelector("#studio-member-status"),
  studioCardGrid: document.querySelector("#studio-card-grid"),
  studioMemberExtras: document.querySelector("#studio-member-extras"),
  studioSpecialTabs: document.querySelector("#studio-special-tabs"),
  studioSpecialGrid: document.querySelector("#studio-special-grid"),
  studioStageLabel: document.querySelector("#studio-stage-label"),
  playStudioReveal: document.querySelector("#play-studio-reveal"),
  showStudioComplete: document.querySelector("#show-studio-complete"),
  copyMemberPrompts: document.querySelector("#copy-member-prompts"),
  exportPartyContent: document.querySelector("#export-party-content"),
  exportAllQuotes: document.querySelector("#export-all-quotes"),
  delayQuote: document.querySelector("#delay-quote"),
  delayParty: document.querySelector("#delay-party"),
  delayName: document.querySelector("#delay-name"),
  delayPortrait: document.querySelector("#delay-portrait"),
  visualTheme: document.querySelector("#visual-theme"),
  visualCardFrame: document.querySelector("#visual-card-frame"),
  visualDensity: document.querySelector("#visual-density"),
  visualQuoteReveal: document.querySelector("#visual-quote-reveal"),
  levelIncrements: document.querySelector("#level-increments"),
  levelExponent: document.querySelector("#level-exponent"),
  levelStreak: document.querySelector("#level-streak"),
  rankNames: document.querySelector("#rank-names"),
  grantLevelReward: document.querySelector("#grant-level-reward"),
  avatarUnlocks: document.querySelector("#avatar-unlocks"),
  numberedSets: document.querySelector("#numbered-sets"),
  numberedEvery: document.querySelector("#numbered-every"),
  numberedTip: document.querySelector("#numbered-tip"),
  numberedTipDismiss: document.querySelector("#numbered-tip-dismiss"),
  copyPackPrompts: document.querySelector("#copy-pack-prompts"),
  editorialSample: document.querySelector("#editorial-sample"),
  reviewFilter: document.querySelector("#review-filter"),
  cardReviewList: document.querySelector("#card-review-list"),
  studioReportList: document.querySelector("#studio-report-list"),
  studioReportEmpty: document.querySelector("#studio-report-empty"),
  errorTitle: document.querySelector("#error-title"),
  errorCopy: document.querySelector("#error-copy"),
  retry: document.querySelector("#retry"),
  navButtons: [...document.querySelectorAll("[data-nav]")],
  dialog: document.querySelector("#card-dialog"),
  dialogCard: document.querySelector("#dialog-card"),
  dialogTrust: document.querySelector("#dialog-trust"),
  dialogSource: document.querySelector("#dialog-source"),
  dialogWhatsapp: document.querySelector("#dialog-whatsapp"),
  dialogInstagram: document.querySelector("#dialog-instagram"),
  shareSheet: document.querySelector("#share-sheet"),
  shareSheetTitle: document.querySelector("#share-sheet-title"),
  shareSheetImage: document.querySelector("#share-sheet-image"),
  shareSheetCaption: document.querySelector("#share-sheet-caption"),
  shareSheetSend: document.querySelector("#share-sheet-send"),
  shareSheetSave: document.querySelector("#share-sheet-save"),
  closeShareSheet: document.querySelector("#close-share-sheet"),
  dialogReport: document.querySelector("#dialog-report"),
  closeDialog: document.querySelector("#close-dialog"),
  reportDialog: document.querySelector("#report-dialog"),
  reportForm: document.querySelector("#report-form"),
  reportCardLabel: document.querySelector("#report-card-label"),
  reportCategory: document.querySelector("#report-category"),
  reportDetails: document.querySelector("#report-details"),
  reportStatus: document.querySelector("#report-status"),
  submitReport: document.querySelector("#submit-report"),
  closeReport: document.querySelector("#close-report"),
  openBugReport: document.querySelector("#open-bug-report"),
  openFeatureRequest: document.querySelector("#open-feature-request"),
  bugDialogTitle: document.querySelector("#bug-dialog-title"),
  bugDialogLede: document.querySelector("#bug-dialog-lede"),
  bugDetailsLabel: document.querySelector("#bug-details-label"),
  bugDialog: document.querySelector("#bug-dialog"),
  bugForm: document.querySelector("#bug-form"),
  bugNickname: document.querySelector("#bug-nickname"),
  bugDetails: document.querySelector("#bug-details"),
  bugWebsite: document.querySelector("#bug-website"),
  bugCount: document.querySelector("#bug-count"),
  bugStatus: document.querySelector("#bug-status"),
  submitBug: document.querySelector("#submit-bug"),
  closeBug: document.querySelector("#close-bug"),
  toast: document.querySelector("#toast"),
  waitDialog: document.querySelector("#wait-dialog"),
  waitDialogCopy: document.querySelector("#wait-dialog-copy"),
  bottomNav: document.querySelector(".bottom-nav"),
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function cardTitle(card) {
  return card.titleHe || card.hebrewTitle || card.title;
}

function cardSetName(card) {
  return card.setNameHe || card.setName || card.set;
}

function cardCode(card) {
  return card.displayCode || `${partyLetters(card)}-${card.id.match(/(\d{2})$/)?.[1] || "01"}`;
}

function visualConfigInputs() {
  return {
    theme: elements.visualTheme,
    cardFrame: elements.visualCardFrame,
    density: elements.visualDensity,
    quoteReveal: elements.visualQuoteReveal,
  };
}

function applyVisualConfig() {
  const configured = model.gameConfig.visual || {};
  const params = new URLSearchParams(location.search);
  const app = document.querySelector("#app");
  const values = {
    theme: params.get("theme") || configured.theme || "pack-v2",
    cardFrame: params.get("cardFrame") || configured.cardFrame || "tall-v2",
    density: params.get("density") || configured.density || "airy-v2",
    quoteReveal: params.get("quoteReveal") || configured.quoteReveal || "ink-v2",
  };
  for (const [key, value] of Object.entries(values)) {
    app.dataset[key] = value;
    document.documentElement.dataset[key] = value;
  }
  for (const [key, input] of Object.entries(visualConfigInputs())) {
    if (input) input.value = configured[key] || values[key];
  }
  queueCardTextFit(app);
}

function isLiveReleaseSet(id) {
  return LIVE_RELEASE_SET_IDS.includes(id);
}

function usesFullartFrame(card) {
  return isLiveReleaseSet(card?.releaseSetId);
}

function playerCatalog() {
  return model.catalog.filter((card) => isLiveReleaseSet(card.releaseSetId));
}

function cardDisplayFrame(card) {
  if (usesFullartFrame(card)) return "fullart-v1";
  return document.querySelector("#app")?.dataset.cardFrame || "tall-v2";
}

function studioSecret() {
  return localStorage.getItem(STUDIO_KEY);
}

function captureStudioSecret() {
  const url = new URL(location.href);
  const key = url.searchParams.get("studioKey");
  if (!key) return;
  localStorage.setItem(STUDIO_KEY, key);
  applyStudioAccess({ studioEnabled: true, debugEnabled: model.studioContent?.debugEnabled });
  url.searchParams.delete("studioKey");
  history.replaceState({}, "", url);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(model.token ? { authorization: `Bearer ${model.token}` } : {}),
      ...(studioSecret() ? { "x-kalpi-studio": studioSecret() } : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error ?? "REQUEST_FAILED");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function clientOperationId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pendingMutationKey(scope) {
  let pending = {};
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_MUTATIONS_KEY) || "{}");
  } catch {
    pending = {};
  }
  if (!pending[scope]) {
    pending[scope] = clientOperationId(scope);
    localStorage.setItem(PENDING_MUTATIONS_KEY, JSON.stringify(pending));
  }
  return pending[scope];
}

function clearPendingMutation(scope) {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_MUTATIONS_KEY) || "{}");
    delete pending[scope];
    localStorage.setItem(PENDING_MUTATIONS_KEY, JSON.stringify(pending));
  } catch {
    localStorage.removeItem(PENDING_MUTATIONS_KEY);
  }
}

function pendingReports() {
  try {
    const reports = JSON.parse(localStorage.getItem(PENDING_REPORTS_KEY) || "[]");
    return Array.isArray(reports) ? reports : [];
  } catch {
    return [];
  }
}

function rememberPendingReport(report) {
  const pending = pendingReports().filter(({ reportId }) => reportId !== report.reportId);
  pending.push(report);
  localStorage.setItem(PENDING_REPORTS_KEY, JSON.stringify(pending));
}

let reportFlush = null;
let reportRetryTimer = null;
function flushPendingReports() {
  if (reportFlush) return reportFlush;
  if (!model.token || !pendingReports().length) return Promise.resolve([]);
  clearTimeout(reportRetryTimer);
  reportFlush = (async () => {
    const delivered = [];
    for (const report of pendingReports()) {
      try {
        await request("/api/reports", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-idempotency-key": report.reportId,
          },
          body: JSON.stringify(report),
        });
        const remaining = pendingReports().filter(({ reportId }) => reportId !== report.reportId);
        localStorage.setItem(PENDING_REPORTS_KEY, JSON.stringify(remaining));
        delivered.push(report.reportId);
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
          const remaining = pendingReports().filter(({ reportId }) => reportId !== report.reportId);
          localStorage.setItem(PENDING_REPORTS_KEY, JSON.stringify(remaining));
          continue;
        }
        throw error;
      }
    }
    return delivered;
  })().catch((error) => {
    reportRetryTimer = setTimeout(() => flushPendingReports().catch(() => {}), 15_000 + Math.floor(Math.random() * 30_000));
    throw error;
  }).finally(() => {
    reportFlush = null;
  });
  return reportFlush;
}

async function ensureSession() {
  if (model.token) {
    try {
      setServerState(await request("/api/state"));
      return;
    } catch (error) {
      if (error.status !== 401) throw error;
    }
  }

  const { token } = await request("/api/session", { method: "POST" });
  model.token = token;
  model.stateRevision = 0;
  localStorage.setItem(SESSION_KEY, token);
  setServerState(await request("/api/state"));
}

function applyStudioAccess(studioContent = model.studioContent) {
  document.querySelectorAll("[data-debug-only]").forEach((element) => {
    element.hidden = !studioContent?.debugEnabled;
  });
  document.querySelectorAll("[data-studio-only]").forEach((element) => {
    element.hidden = !studioContent?.studioEnabled;
  });
  if (document.querySelector("#studio-view")?.classList.contains("active") && !studioViewAllowed()) {
    renderHome();
    showView("home");
  }
}

/** Revision of the newest server state applied; older payloads are dropped (see state-sync.js). */
function noteStateRevision(state) {
  const revision = stateRevision(state);
  if (revision != null) model.stateRevision = Math.max(model.stateRevision || 0, revision);
}

/** Every full/merged server state goes through here so a late, older response cannot win. */
function setServerState(state, { merge = false } = {}) {
  if (!state || typeof state !== "object") return false;
  if (isStaleState(state, model.stateRevision)) return false;
  noteStateRevision(state);
  const { state: shown } = overlayPendingSeen({ state }, pendingIdleSeen());
  model.serverState = merge ? { ...model.serverState, ...shown } : shown;
  return true;
}

function applyHomePayload(home) {
  if (home.token) {
    if (model.token && home.token !== model.token) model.stateRevision = 0;
    model.token = home.token;
    localStorage.setItem(SESSION_KEY, home.token);
  }
  // An older response (e.g. a settle computed before the last open's seen ack) never overwrites newer state.
  if (home.state && isStaleState(home.state, model.stateRevision)) return false;
  if (home.state) {
    noteStateRevision(home.state);
    stateFreshAt = Date.now();
    const previous = model.serverState || {};
    const overlaid = overlayPendingSeen({ state: home.state, cards: home.cards }, pendingIdleSeen());
    const incoming = overlaid.state;
    home = { ...home, cards: overlaid.cards };
    model.serverState = {
      ...previous,
      ...incoming,
      inventory: incoming.inventory ?? previous.inventory ?? {},
      idlePullCount: incoming.idlePullCount ?? previous.idlePullCount ?? 0,
      achievements: incoming.achievements ?? previous.achievements ?? [],
      achievementPages: incoming.achievementPages ?? previous.achievementPages ?? [],
      loginStreak: incoming.loginStreak ?? previous.loginStreak ?? 0,
    };
    if (home.cards) model.idleQueue = home.cards;
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
      token: model.token,
      cards: model.idleQueue,
      state: {
        displayName: model.serverState.displayName,
        avatarId: model.serverState.avatarId,
        ownedUnique: model.serverState.ownedUnique,
        totalCards: model.serverState.totalCards,
        unseenCount: model.serverState.unseenCount,
        nextIdleAt: model.serverState.nextIdleAt,
        preparedPulls: model.serverState.preparedPulls || [],
        idleCapacity: model.serverState.idleCapacity,
        idleIntervalMs: model.serverState.idleIntervalMs,
        idleStarterReady: model.serverState.idleStarterReady,
        progression: model.serverState.progression,
        avatars: model.serverState.avatars,
        inventory: model.serverState.inventory || {},
        favorites: model.serverState.favorites || [],
        starCount: model.serverState.starCount,
        loginStreak: model.serverState.loginStreak || 0,
        factionId: model.serverState.factionId || null,
        numberedCopies: model.serverState.numberedCopies || [],
        idlePullCount: model.serverState.idlePullCount ?? 0,
        achievements: model.serverState.achievements || [],
        achievementPages: model.serverState.achievementPages || [],
      },
    }));
    prefetchAvatars(home.state.avatars);
  }
}

function applyCachedHome() {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || "null");
    if (!cached?.state) return;
    if (cached.token && !model.token) {
      model.token = cached.token;
      localStorage.setItem(SESSION_KEY, cached.token);
    }
    model.serverState = { ...model.serverState, ...cached.state };
    model.idleQueue = cached.cards || [];
  } catch {
    localStorage.removeItem(HOME_CACHE_KEY);
  }
}

async function loadShell() {
  const warmedShell = window.__kalpiWarmup?.shell;
  if (window.__kalpiWarmup) window.__kalpiWarmup.shell = null;
  const shell = await (warmedShell || fetch(`/shell.json?v=${STATIC_DATA_VERSION}`, { cache: "force-cache" }).then((response) => {
    if (!response.ok) throw new Error("SHELL_MISSING");
    return response.json();
  }));
  model.gameConfig = { ...model.gameConfig, ...shell.gameConfig };
  if (Array.isArray(model.gameConfig.releaseSets)) {
    model.gameConfig.releaseSets = model.gameConfig.releaseSets.filter((set) => isLiveReleaseSet(set.id));
  }
  model.editorial = shell.editorial || model.editorial;
  if (!model.serverState && shell.totals) {
    model.serverState = {
      ownedUnique: 0,
      totalCards: shell.totals.idleEligible,
      unseenCount: 0,
      idleCapacity: shell.gameConfig?.idle?.capacity,
      idleIntervalMs: shell.gameConfig?.idle?.intervalMs,
      idleStarterReady: shell.gameConfig?.idle?.starterReady,
      progression: {
        level: 1,
        totalLevels: Math.max(2, shell.gameConfig?.progression?.rankNames?.length || 5),
        rank: shell.gameConfig?.progression?.rankNames?.[0] || "אזרח סקרן",
        unique: 0,
        start: 0,
        target: 1,
        remaining: 1,
        percent: 0,
        teaser: shell.gameConfig?.progression?.teaser,
      },
    };
  } else if (shell.totals && model.serverState && !model.serverState.totalCards) {
    model.serverState.totalCards = shell.totals.idleEligible;
  }
  applyVisualConfig();
}

function applyCatalog(cards) {
  if (!cards?.length) return;
  const visible = cards.filter((card) => isLiveReleaseSet(card.releaseSetId));
  model.catalog = visible;
  model.byId = new Map(visible.map((card) => [card.id, card]));
}

function mergeLiveCatalogFields(liveCards = []) {
  for (const live of liveCards) {
    const card = model.byId.get(live.id);
    if (!card) continue;
    const slot = Number(live.listSlot);
    if (Number.isInteger(slot) && slot > 0) card.listSlot = slot;
    if (live.subtitleHe) card.subtitleHe = live.subtitleHe;
    if (live.subtitle) card.subtitle = live.subtitle;
    if (live.membershipNote) card.membershipNote = live.membershipNote;
  }
}

function applyFullBoot(boot) {
  if (boot.token) {
    model.token = boot.token;
    localStorage.setItem(SESSION_KEY, boot.token);
  }
  const { cards } = boot.catalog;
  model.editorial = boot.editorial;
  model.activity = boot.activity;
  model.studioContent = boot.studioContent;
  model.gameConfig = boot.gameConfig;
  applyStudioAccess(boot.studioContent);
  applyVisualConfig();
  model.leaderboards = mergeLeaderboards(null, boot.leaderboards);
  model.specials = boot.specials;
  model.serverState = boot.idleReturn.state;
  model.idleQueue = boot.idleReturn.cards || [];
  model.trades = boot.trades || [];
  model.events = boot.events || [];
  applyCatalog(cards);
  populateRevealTimingInputs();
  populateLevelIncrements();
  populateStudioMeta();
  applyHomePayload({ token: boot.token, state: boot.idleReturn.state, cards: boot.idleReturn.cards || [] });
}

let catalogHydrate = null;
let homeHydrate = null;
let extrasHydrate = null;
let idleHydrate = null;
let idleRefillTimer = null;
let idleSeenHydrate = null;
let idleSeenRetryTimer = null;
let catalogFailed = false;
const PLAYER_VIEWS = ["home", "binder", "achievements", "growth", "studio"];

function studioViewAllowed() {
  return Boolean(model.studioContent?.studioEnabled || studioSecret());
}

function catalogReady() {
  return Boolean(model.catalog.length);
}

function ownershipReady() {
  return Boolean(model.serverState?.inventory);
}

function requestedPlayerView() {
  const params = new URLSearchParams(location.search);
  if (params.get("gift") || params.get("card")) return "";
  const view = params.get("view");
  if (view === "studio" && !studioViewAllowed()) return "";
  return PLAYER_VIEWS.includes(view) ? view : "";
}

function isLookOnlyShowcase() {
  const path = String(location.pathname || "").replace(/\.html$/, "");
  if (path === "/share/binder") return true;
  return new URLSearchParams(location.search).get("showcase") === "1";
}

function persistPlayerView(name) {
  if (model.showcase) return;
  const url = new URL(location.href);
  if (PLAYER_VIEWS.includes(name) && name !== "home") url.searchParams.set("view", name);
  else url.searchParams.delete("view");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next !== current) history.replaceState({}, "", next);
}

function paintPlayerView(name) {
  if (name === "studio" && !studioViewAllowed()) name = "home";
  if (name === "home") renderHome();
  else if (name === "binder") renderBinder();
  else if (name === "achievements") renderAchievements();
  else if (name === "events") renderEvents();
  else if (name === "growth") renderGrowth();
  else if (name === "studio") renderStudio();
  showView(name);
}

function pendingCopy(loading, failed) {
  return catalogFailed ? failed : loading;
}

function setEmptyNote(element, copy, { pending = false, failed = false, hidden = false } = {}) {
  if (!element) return;
  element.hidden = hidden;
  if (copy) element.textContent = copy;
  element.classList.toggle("is-loading", pending && !failed && !hidden);
  element.classList.toggle("is-failed", failed && !hidden);
}

async function loadStaticCatalog() {
  if (model.catalog.length) return model;
  if (!catalogHydrate) {
    const warmedCatalog = window.__kalpiWarmup?.catalog;
    if (window.__kalpiWarmup) window.__kalpiWarmup.catalog = null;
    catalogHydrate = (warmedCatalog || fetch(`/catalog.json?v=${STATIC_DATA_VERSION}`, { cache: "force-cache" }).then((response) => {
      if (!response.ok) throw new Error("CATALOG_MISSING");
      return response.json();
    })).then((payload) => {
      catalogFailed = false;
      applyCatalog(payload.cards || payload);
      prefetchIdleAssets();
      if (model.showcase) {
        renderShowcaseBinder();
        return model;
      }
      renderProfile();
      renderBinder();
      renderHome();
      handleInboundLink();
      return model;
    }).catch((error) => {
      catalogFailed = true;
      if (model.showcase) renderShowcaseBinder();
      else renderBinder();
      throw error;
    }).finally(() => {
      catalogHydrate = null;
    });
  }
  return catalogHydrate;
}

async function hydrateHome() {
  if (model.showcase) return null;
  if (!homeHydrate) {
    const warmedHome = window.__kalpiWarmup?.home;
    if (window.__kalpiWarmup) window.__kalpiWarmup.home = null;
    homeHydrate = (warmedHome || request("/api/home")).then(async (home) => {
      applyHomePayload(home);
      try {
        const config = await request("/api/game-config");
        if (config) model.gameConfig = { ...model.gameConfig, ...config };
      } catch {
        /* Shell parties stay until the live register arrives. */
      }
      try {
        const live = await request("/api/catalog");
        mergeLiveCatalogFields(live.cards || []);
      } catch {
        /* Static catalog.json stays until the live list slots arrive. */
      }
      hydrateCardHolders().catch(() => {});
      prefetchBinderArt(playerCatalog());
      renderProfile();
      renderHome();
      renderBinder();
      renderAchievements();
      return home;
    }).finally(() => {
      homeHydrate = null;
    });
  }
  return homeHydrate;
}

function dropUnknownIdleHead() {
  if (!model.catalog.length) return [];
  const unknown = [];
  while (model.idleQueue.length && !model.byId.get(model.idleQueue[0].cardId)) {
    unknown.push(model.idleQueue.shift().instanceId);
  }
  const knownIds = unknown.filter(Boolean);
  if (knownIds.length) {
    rememberPendingIdleSeen(knownIds);
    flushPendingIdleSeen().catch(() => {});
  }
  return unknown;
}

function nextCachedIdleCard(current = Date.now()) {
  dropUnknownIdleHead();
  if (model.idleQueue.length) return { instance: model.idleQueue[0], prepared: false };
  const prepared = [...(model.serverState?.preparedPulls || [])]
    .sort((left, right) => Date.parse(left.availableAt) - Date.parse(right.availableAt));
  const instance = prepared.find(({ availableAt }) => Date.parse(availableAt) <= current);
  return instance ? { instance, prepared: true } : null;
}

function cachedDueCount(current = Date.now()) {
  return model.idleQueue.length + (model.serverState?.preparedPulls || [])
    .filter(({ availableAt }) => Date.parse(availableAt) <= current).length;
}

function artUrl(card) {
  return card?.artKey ? `/design-assets/${encodeURIComponent(card.artKey)}` : "";
}

function prefetchCardArt(cards = []) {
  for (const card of cards) {
    const url = artUrl(card);
    if (!url) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  }
}

function prefetchIdleAssets() {
  if (!model.catalog.length) return;
  const pulls = [...model.idleQueue, ...(model.serverState?.preparedPulls || [])]
    .map(({ cardId }) => model.byId.get(cardId));
  prefetchCardArt([
    ...pulls,
    ...playerCatalog().slice(0, 4),
  ]);
}

function pendingIdleSeen() {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_IDLE_SEEN_KEY) || "[]");
    return Array.isArray(value) ? value.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function rememberPendingIdleSeen(instanceIds) {
  const pending = [...new Set([...pendingIdleSeen(), ...instanceIds])];
  localStorage.setItem(PENDING_IDLE_SEEN_KEY, JSON.stringify(pending));
}

function flushPendingIdleSeen() {
  if (idleSeenHydrate) return idleSeenHydrate;
  const instanceIds = pendingIdleSeen();
  if (!model.token || !instanceIds.length) return Promise.resolve(null);
  clearTimeout(idleSeenRetryTimer);
  idleSeenHydrate = request("/api/idle/seen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instanceIds }),
  }).then((state) => {
    const acknowledged = new Set(instanceIds);
    const remaining = pendingIdleSeen().filter((instanceId) => !acknowledged.has(instanceId));
    localStorage.setItem(PENDING_IDLE_SEEN_KEY, JSON.stringify(remaining));
    const racedParty = model.leaderboards?.dailyChallenge?.targetPartyId;
    const openedRaceCard = racedParty && (state?.instances || [])
      .some(({ instanceId, cardId }) => acknowledged.has(instanceId) && model.byId.get(cardId)?.set === racedParty);
    model.idleQueue = model.idleQueue.filter(({ instanceId }) => !acknowledged.has(instanceId));
    applyHomePayload({ state });
    if (openedRaceCard) refreshDailyChallenge();
    renderHome();
    renderBinder();
    renderAchievements();
    scheduleIdleRefill({ priority: "buffered" });
    return state;
  }).catch((error) => {
    idleSeenRetryTimer = setTimeout(() => flushPendingIdleSeen().catch(() => {}), 5000 + Math.floor(Math.random() * 10_000));
    throw error;
  }).finally(() => {
    idleSeenHydrate = null;
    // Ids remembered while this ack was in flight (a quick second open) go out right away.
    const unsent = pendingIdleSeen().filter((instanceId) => !instanceIds.includes(instanceId));
    if (unsent.length) queueMicrotask(() => flushPendingIdleSeen().catch(() => {}));
  });
  return idleSeenHydrate;
}

async function hydrateIdleQueue() {
  if (model.showcase) return null;
  if (!idleHydrate) {
    idleHydrate = (async () => {
      if (!model.token) await hydrateHome();
      const settled = await request("/api/idle/settle", { method: "POST" });
      applyHomePayload({ ...settled, cards: settled.cards || [], state: settled.state });
      prefetchIdleAssets();
      renderHome();
      refreshDailyChallenge();
      flushPendingIdleSeen().catch(() => {});
      return settled;
    })().finally(() => {
      idleHydrate = null;
    });
  }
  return idleHydrate;
}

function scheduleIdleRefill({ priority = "buffered" } = {}) {
  clearTimeout(idleRefillTimer);
  const delay = priority === "urgent"
    ? 0
    : priority === "backlog"
      ? 500 + Math.floor(Math.random() * 2000)
      : 15_000 + Math.floor(Math.random() * 45_000);
  idleRefillTimer = setTimeout(() => {
    hydrateIdleQueue().catch(() => {
      scheduleIdleRefill({ priority: "buffered" });
    });
  }, delay);
}

function applyExtrasPayload({ events, trades, leaderboards, activity, specials, state, specialWindow }) {
  if (events) model.events = events.events || events;
  if (trades) model.trades = trades.trades || trades;
  if (leaderboards) model.leaderboards = mergeLeaderboards(model.leaderboards, leaderboards);
  if (activity) model.activity = activity;
  if (specials) model.specials = specials;
  if (specialWindow !== undefined) model.specialWindow = specialWindow;
  if (state) setServerState(state, { merge: true });
}

function paintExtras() {
  renderProfile();
  renderHome();
  renderBinder();
  renderAchievements();
  renderEvents();
  renderGrowth();
  renderStudio();
}

async function hydrateExtras() {
  if (model.showcase) return model;
  if (model.extrasReady) return model;
  if (!extrasHydrate) {
    extrasHydrate = (async () => {
      if (!model.token) {
        try {
          await hydrateHome();
        } catch {
          /* Community and badges still paint from catalog/home cache. */
        }
      }
      const jobs = [
        ["community", () => request("/api/community")],
      ];
      // Prefetch the league room with the community extras so the Leagues tab opens on it.
      if (model.token) jobs.push(["leagues", () => hydrateLeagues()]);
      if (studioSecret()) {
        jobs.push(["events", () => request("/api/events")]);
        jobs.push(["specials", () => request("/api/specials")]);
      }
      await Promise.all(jobs.map(async ([key, run]) => {
        try {
          const payload = await run();
          if (key === "leagues") return;
          applyExtrasPayload(key === "community" ? payload : { [key]: payload });
          paintExtras();
        } catch {
          /* One slow or failed extra must not keep badges/community on Loading. */
        }
      }));
      if (studioSecret()) {
        try {
          model.studioContent = await request("/api/studio/content");
          applyStudioAccess(model.studioContent);
        } catch {
          /* Studio stays closed without the secret. */
        }
      }
      model.extrasReady = true;
      paintExtras();
      return model;
    })().finally(() => {
      extrasHydrate = null;
    });
  }
  return extrasHydrate;
}

async function hydrateCatalog() {
  try {
    return await loadStaticCatalog();
  } catch {
    const boot = await request("/api/bootstrap");
    applyFullBoot(boot);
    paintExtras();
    handleInboundLink();
    return boot;
  }
}

function leaveShowcase() {
  location.assign("/");
}

async function hydrateLookOnlyCatalog() {
  await loadStaticCatalog().catch(() => null);
  try {
    const config = await request("/api/game-config");
    if (config) {
      model.gameConfig = { ...model.gameConfig, ...config };
      if (Array.isArray(model.gameConfig.releaseSets)) {
        model.gameConfig.releaseSets = model.gameConfig.releaseSets.filter((set) => isLiveReleaseSet(set.id));
      }
    }
  } catch {
    /* Shell release sets stay until the live config arrives. */
  }
  try {
    const live = await request("/api/catalog");
    const liveCards = (live.cards || []).filter((card) => isLiveReleaseSet(card.releaseSetId));
    if (!model.catalog.length) applyCatalog(liveCards);
    else {
      mergeLiveCatalogFields(liveCards);
      const extras = liveCards.filter((card) => !model.byId.has(card.id));
      if (extras.length) applyCatalog([...model.catalog, ...extras]);
    }
  } catch {
    /* Static catalog.json stays until the live list slots arrive. */
  }
  hydrateCardHolders().catch(() => {});
  prefetchBinderArt(playerCatalog());
}

async function bootstrapShowcase() {
  model.showcase = true;
  model.token = null;
  document.querySelector("#app")?.classList.add("showcase-active");
  if (elements.headerStatus) elements.headerStatus.textContent = "תצוגה בלבד";
  showView("showcase");
  try {
    await loadShell();
    renderAdvocacy();
    await hydrateLookOnlyCatalog();
    renderShowcaseBinder();
    showView("showcase");
  } catch (error) {
    showError("לא הצלחנו לפתוח את האלבום.", describeError(error));
  }
}

async function bootstrap() {
  captureStudioSecret();
  if (isLookOnlyShowcase()) {
    model.token = null;
    return bootstrapShowcase();
  }
  applyCachedHome();
  if (notifyPermission() === "granted") {
    ensureServiceWorker().then(() => scheduleIdleNotification()).catch(() => {});
  }
  if (model.token) hydrateExtras().catch(() => {});
  const inboundView = requestedPlayerView();
  if (inboundView && inboundView !== "home") paintPlayerView(inboundView);
  else showView("home");
  const catalogPromise = loadStaticCatalog().catch(() => null);
  const extrasNeeded = inboundView && inboundView !== "home" && inboundView !== "binder";
  try {
    await loadShell();
    renderAdvocacy();
    renderProfile();
    renderHome();
    await catalogPromise;
    if (inboundView === "binder") renderBinder();
    renderAchievements();
    renderGrowth();
    const homePromise = hydrateHome();
    homePromise.then(() => {
      prefetchIdleAssets();
      if (pendingIdleSeen().length) flushPendingIdleSeen().catch(() => {});
      if (pendingReports().length) flushPendingReports().catch(() => {});
      const clock = idleCountdownCopy({
        serverState: model.serverState,
        idleQueueLength: model.idleQueue.length,
      });
      const cap = model.serverState?.idleCapacity || model.gameConfig?.idle?.capacity || IDLE_BACKLOG_CAP;
      const cachedBufferSize = model.idleQueue.length + (model.serverState?.preparedPulls || []).length;
      const missingDueCard = clock.needsSettle || cachedDueCount() > 0;
      const priority = clock.needsSettle || !cachedBufferSize
        ? "urgent"
        : cachedDueCount() > 1 ? "backlog" : "buffered";
      if (clock.needsSettle || missingDueCard || cachedBufferSize < cap) {
        scheduleIdleRefill({ priority });
      }
      hydrateExtras().catch(() => {});
      scheduleIdleNotification();
      if (inboundLeagueCode()) consumeInboundLeague().catch(() => {});
    }).catch(() => {});
    if (extrasNeeded) await homePromise.then(() => hydrateExtras()).catch(() => null);
    else homePromise.catch(() => null);
  } catch (error) {
    try {
      await hydrateCatalog();
      paintPlayerView(inboundView || "home");
    } catch {
      showError("לא הצלחנו לפתוח את המשחק.", describeError(error));
    }
  }
}

function renderAdvocacy() {
  requestAnimationFrame(layoutAdvocacyDock);
  const profile = model.editorial?.advocacy;
  if (!profile) return;
  if (elements.advocacyShort) elements.advocacyShort.textContent = "";
  elements.advocacySponsor.textContent = `בחסות ${profile.sponsor}`;
  elements.advocacyFull.textContent = "קְלָפִי מתחילה בהיכרות עובדתית, ממשיכה לעמדות ולהחלטות, ואחר כך מפרסמת גם סדרות ביקורת לפי קו עריכתי גלוי. בחירת הציטוטים אינה ניטרלית — בכל קלף מופיעים המקור והסיווג.";
    elements.advocacyPhases.innerHTML = "<li><strong>היכרות —</strong> מנהיגים ומשנים.</li><li><strong>עומק —</strong> עמדות, החלטות ורקורדים.</li><li><strong>ביקורת —</strong> סדרות שמסומנות במפורש.</li><li><strong>מקור —</strong> לכל קלף מצורף קישור; ניסוח מחדש מסומן בכוכבית.</li>";
}

async function recordEvent(type, details = {}) {
  if (model.showcase) return;
  try {
    await request("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, ...details }),
    });
    model.activity = await request("/api/activity");
    setServerState(await request("/api/state"));
    renderActivity();
    renderBinder();
    renderAchievements();
    renderProgression();
    renderGrowth();
  } catch (error) {
    console.warn(`Could not record ${type}`, error);
  }
}

function inboundShareCardId() {
  const params = new URLSearchParams(location.search);
  const fromPath = location.pathname.match(/^\/share\/([^/]+)$/);
  const gift = params.get("gift");
  if (gift && gift !== "1") return gift;
  return params.get("card") ?? (fromPath ? decodeURIComponent(fromPath[1]) : null);
}

function handleInboundLink() {
  if (model.showcase) return;
  const params = new URLSearchParams(location.search);
  const cardId = inboundShareCardId();
  const referralCode = params.get("ref");
  if (referralCode && !sessionStorage.getItem(`kalpi-ref-${referralCode}`)) {
    sessionStorage.setItem(`kalpi-ref-${referralCode}`, "1");
    recordEvent("referral_opened", { referralCode, cardId });
  }
  const binderSlug = inboundBinderSlug();
  if (binderSlug) {
    openPublicBinder(binderSlug).catch(() => showToast("לא מצאנו את האלבום הזה."));
    return;
  }
  if (cardId && model.byId.has(cardId)) {
    showSharedCard(cardId, params.has("gift"));
    return;
  }
  if (params.get("league")) {
    showLeaguesCommunity();
    return;
  }
  const requestedView = params.get("view");
  if (requestedView === "studio" && !studioViewAllowed()) {
    persistPlayerView("home");
    return;
  }
  if (PLAYER_VIEWS.includes(requestedView)) {
    elements.navButtons.find((button) => button.dataset.nav === requestedView)?.click();
  }
}

function showSharedCard(cardId, isTradeIntent = false) {
  const card = model.byId.get(cardId);
  elements.sharedTitle.textContent = cardTitle(card);
  elements.sharedCard.innerHTML = displayCardMarkup(card);
  elements.sharedNotice.textContent = isTradeIntent
    ? "זו תצוגה של הצעת החלפה. הבעלות לא השתנתה, והקלף לא נכנס לאוסף שלכם."
    : "זו תצוגת שיתוף בלבד. הקלף לא נכנס לאוסף שלכם.";
  if (elements.sharedTrust) {
    const line = cardTrustLine(card);
    elements.sharedTrust.textContent = line;
    elements.sharedTrust.hidden = !line;
  }
  configureSourceLink(elements.sharedSource, card);
  elements.sharedSource.dataset.sourceCard = card.id;
  showView("shared");
  queueCardTextFit(elements.sharedCard);
}

function leaveSharedCard() {
  const url = new URL(location.href);
  ["card", "gift", "ref"].forEach((key) => url.searchParams.delete(key));
  history.replaceState({}, "", url);
  renderHome();
  showView("home");
}

function describeError(error) {
  if (error.message === "Failed to fetch") return "השרת לא זמין. נסו שוב.";
  return "האוסף נשמר. נסו שוב.";
}

function fitCardText(element) {
  const frame = element.closest(".kalpi-card");
  const isFullart = frame?.dataset.cardFrame === "fullart-v1";
  const compact = ["binder", "peek", "trade"].includes(frame?.dataset.cardSurface);
  if (isFullart && element.dataset.fitCardText !== "quote" && !compact) return;
  const frameWidth = frame?.clientWidth ?? 0;
  if (!frameWidth || !element.clientWidth || !element.clientHeight) return;
  const role = element.dataset.fitCardText;
  const scale = (isFullart
    ? {
      quote: { low: 0.024, high: 0.058, floor: compact ? 6 : 7, ceiling: compact ? 13 : 20 },
      party: { low: 0.03, high: 0.042, floor: compact ? 8 : 10, ceiling: 12 },
      name: { low: 0.048, high: 0.08, floor: compact ? 9 : 13, ceiling: 24 },
    }
    : {
      quote: { low: 0.04, high: 0.085, floor: compact ? 8 : 13, ceiling: 30 },
      party: { low: 0.035, high: 0.052, floor: compact ? 8 : 10, ceiling: 13 },
      name: { low: 0.052, high: 0.078, floor: compact ? 9 : 13, ceiling: 27 },
    })[role] || { low: 0.04, high: 0.085, floor: compact ? 8 : 13, ceiling: 30 };
  const hardMin = role === "quote" ? Math.min(6, scale.floor) : scale.floor;
  let low = hardMin;
  let high = Math.max(hardMin, Math.min(scale.ceiling, frameWidth * scale.high));
  const slop = role === "quote" ? 0 : 1;
  const fitsAt = (size) => {
    element.style.fontSize = `${size}px`;
    return element.scrollHeight <= element.clientHeight + slop
      && element.scrollWidth <= element.clientWidth + slop;
  };
  if (fitsAt(high)) return;
  for (let index = 0; index < 16; index += 1) {
    const size = (low + high) / 2;
    if (fitsAt(size)) low = size;
    else high = size;
  }
  let size = fitsAt(low) ? low : high;
  while (size > hardMin && !fitsAt(size)) size -= 0.25;
  if (!fitsAt(size)) element.style.fontSize = `${hardMin}px`;
  else element.style.fontSize = `${size}px`;
}

function fitVisibleCardText(root = document) {
  root.querySelectorAll("[data-fit-card-text]").forEach(fitCardText);
}

function fitBallotLetterText(node) {
  if (!node || node.hidden || node.clientWidth < 2 || node.clientHeight < 2) return;
  const stack = node.querySelector(".letter-fit") || node;
  if (!stack.textContent.trim()) {
    stack.style.fontSize = "";
    stack.style.transform = "";
    return;
  }
  stack.style.transform = "none";
  stack.querySelectorAll("span").forEach((glyph) => {
    glyph.style.fontSize = "1em";
    glyph.style.lineHeight = "inherit";
  });
  const count = Math.max(
    1,
    Number(node.dataset.letters) || stack.querySelectorAll("span").length || [...stack.textContent].length,
  );
  stack.style.fontSize = `${count === 1 ? 24 : 20}px`;
  const inset = 3;
  const scaleX = Math.max(0, node.clientWidth - inset) / Math.max(1, stack.scrollWidth);
  const scaleY = Math.max(0, node.clientHeight - inset) / Math.max(1, stack.scrollHeight);
  const scale = Math.min(scaleX, scaleY);
  const widen = Math.min(1.38, scaleX / Math.max(scale, 0.01));
  stack.style.transformOrigin = "center center";
  stack.style.transform = `scale(${Math.max(0.45, scale * widen)}, ${Math.max(0.45, scale)})`;
}

const ballotLetterObserver = typeof ResizeObserver === "undefined"
  ? null
  : new ResizeObserver((entries) => {
    for (const entry of entries) fitBallotLetterText(entry.target);
  });

function queueBallotLetterFit(root = document) {
  const nodes = root.matches?.(".level-letter-text, .collector-letter-text")
    ? [root]
    : [...root.querySelectorAll(".level-letter-text, .collector-letter-text")];
  requestAnimationFrame(() => {
    nodes.forEach((node) => {
      fitBallotLetterText(node);
      ballotLetterObserver?.observe(node);
    });
  });
}

const observedCardFrames = new WeakSet();
const cardResizeObserver = typeof ResizeObserver === "undefined"
  ? null
  : new ResizeObserver((entries) => {
    for (const entry of entries) fitVisibleCardText(entry.target);
  });

function queueCardTextFit(root = document) {
  requestAnimationFrame(() => {
    fitVisibleCardText(root);
    queueBallotLetterFit(root);
    if (!cardResizeObserver) return;
    root.querySelectorAll(".kalpi-card").forEach((frame) => {
      if (observedCardFrames.has(frame)) return;
      observedCardFrames.add(frame);
      cardResizeObserver.observe(frame);
    });
  });
}

function showView(name) {
  if (name === "studio" && !studioViewAllowed()) name = "home";
  model.holdGeneration += 1;
  persistPlayerView(name);
  document.querySelector("#app").classList.toggle("home-active", name === "home");
  for (const view of elements.views) {
    view.classList.toggle("active", view.id === `${name}-view`);
  }
  for (const button of elements.navButtons) {
    const active = button.dataset.nav === name;
    button.classList.toggle("active", active);
    if (button.closest(".bottom-nav")) {
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  }
  elements.bottomNav.hidden = model.showcase || !["home", "binder", "achievements", "events", "growth"].includes(name);
  if (!model.showcase) klafiTips.sync();
  requestAnimationFrame(() => {
    elements.main.focus({ preventScroll: true });
    fitVisibleCardText(elements.main);
    queueBallotLetterFit(elements.main);
  });
}

function showError(title, copy) {
  elements.errorTitle.textContent = title;
  elements.errorCopy.textContent = copy;
  showView("error");
}

function completion() {
  const owned = model.serverState?.ownedUnique ?? 0;
  const total = model.serverState?.totalCards ?? playerCatalog().length ?? 28;
  return { owned, total, percent: total ? Math.round((owned / total) * 100) : 0 };
}

function localStarCount() {
  const inventory = model.serverState?.inventory || {};
  const cards = playerCatalog();
  if (!cards.length) return model.serverState?.starCount ?? 0;
  return cards.reduce((sum, card) => {
    if (!inventory[card.id]) return sum;
    if (card.rarity === "Promotion") return sum + 5;
    if (card.rarity?.startsWith("Rare")) return sum + 3;
    if (card.rarity?.startsWith("Uncommon")) return sum + 2;
    return sum + 1;
  }, 0);
}

function pageSizeForCards() {
  if (window.innerWidth <= 420) return 4;
  if (window.innerWidth <= 760) return 6;
  return 8;
}

function pagerMarkup(page, pages, target) {
  if (pages <= 1) return "";
  return `<button type="button" data-page-target="${target}" data-page="${Math.max(0, page - 1)}" ${page === 0 ? "disabled" : ""} aria-label="העמוד הקודם">→</button>
    <span>${page + 1}/${pages}</span>
    <button type="button" data-page-target="${target}" data-page="${Math.min(pages - 1, page + 1)}" ${page === pages - 1 ? "disabled" : ""} aria-label="העמוד הבא">←</button>`;
}

function showWait(copy) {
  if (!elements.waitDialog) return;
  if (elements.waitDialogCopy) elements.waitDialogCopy.textContent = copy || "רגע…";
  if (!elements.waitDialog.open) elements.waitDialog.showModal();
}

function hideWait() {
  if (elements.waitDialog?.open) elements.waitDialog.close();
}

function formatEventCountdown(milliseconds) {
  const days = Math.floor(milliseconds / DAY_MS);
  return days >= 2 ? `${days} ימים` : formatCountdown(milliseconds);
}

function avatarUrl(avatar) {
  return avatar?.art ? `/design-assets/${avatar.art}` : "";
}

function prefetchAvatars(avatars = model.serverState?.avatars || model.gameConfig?.avatars || []) {
  for (const avatar of avatars) {
    const url = avatarUrl(avatar);
    if (!url) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  }
}

function selectedAvatar() {
  const avatars = model.serverState?.avatars || model.gameConfig?.avatars || [];
  return avatars.find(({ selected }) => selected) || avatars.find(({ id }) => id === model.serverState?.avatarId) || avatars[0];
}

function renderProfile() {
  if (!model.serverState) return;
  if (elements.playerNameLabel) elements.playerNameLabel.textContent = model.serverState.displayName;
  else elements.playerName.textContent = model.serverState.displayName;
  const avatar = selectedAvatar();
  if (elements.binderShareUrl) {
    elements.binderShareUrl.value = publicBinderShareUrl(model.serverState.binderSlug);
  }
  if (elements.levelAvatar && avatar) {
    elements.levelAvatar.src = avatarUrl(avatar);
    elements.levelAvatar.alt = avatar.nameHe || "";
  }
  prefetchAvatars();
  renderAvatarSeal();
  renderNotifyControl();
}

function factionParty(factionId = model.serverState?.factionId) {
  if (!factionId) return null;
  const found = partyRegister().find(({ id }) => id === factionId);
  if (found) return found;
  const card = (model.catalog || []).find((item) => item.set === factionId);
  if (!card) return { id: factionId };
  return {
    id: factionId,
    displayNameHe: card.setNameHe || factionId,
    requestedLetters: card.letters ? [card.letters] : [],
    letterChip: card.letterChip || "",
    letterArt: card.letterArt || "",
    pip: card.pip || null,
  };
}


function streakFireMarkup() {
  return `<i class="streak-fire" aria-hidden="true"><svg viewBox="0 0 12 16" width="16" height="18"><path class="flame-outer" d="M6 16C2.6 16 .6 13.6.6 10.6.6 7.2 3.4 5.1 4.3 2.4c.4 1.7 1.5 2.8 2.6 2.8 1.7 0 2.3-2 1.6-4.8C11 3.2 12.4 6.4 12.4 9.6 12.4 13.2 9.8 16 6 16z"/><path class="flame-inner" d="M6 14.1c-1.8 0-2.9-1.2-2.9-2.9 0-1.6 1.3-2.7 1.8-4.1.3 1 .9 1.7 1.6 1.7.9 0 1.3-1.1 1-2.5 1 1.3 1.7 2.8 1.7 4.4 0 1.9-1.3 3.4-3.2 3.4z"/></svg></i>`;
}

function collectorFaceMarkup(entry = {}) {
  const avatar = (model.serverState?.avatars || model.gameConfig?.avatars || []).find(({ id }) => id === entry.avatarId);
  const party = factionParty(entry.factionId);
  const streak = Number(entry.loginStreak) >= 3 ? Number(entry.loginStreak) : 0;
  return `<span class="collector-face">${avatar?.art ? `<img src="${avatarUrl(avatar)}" alt="">` : ""}${letterChipMarkup(party)}${streak ? `<em class="collector-streak"><b class="streak-count">${streak}</b>${streakFireMarkup()}</em>` : ""}</span>`;
}

function binderNameMarkup(entry = {}) {
  const name = escapeHtml(entry.label || "שחקן קְלָפִי");
  if (!entry.binderSlug) return name;
  return `<button type="button" class="player-binder-link" data-binder-slug="${escapeHtml(entry.binderSlug)}">${name}</button>`;
}

function letterChipMarkup(party, { className = "collector-letter-text" } = {}) {
  const letters = factionLetters(party);
  const art = factionLetterArt(party);
  if (art) {
    const imageClass = className.replace(/-text$/, "") || "collector-letter";
    return `<img class="${imageClass}" src="/design-assets/${encodeURIComponent(art)}" alt="${escapeHtml(letters)}">`;
  }
  if (!letters) return "";
  const marks = [...letters];
  const inner = marks.length > 1
    ? `<i class="letter-fit">${marks.map((mark) => `<span>${escapeHtml(mark)}</span>`).join("")}</i>`
    : `<i class="letter-fit">${escapeHtml(letters)}</i>`;
  return `<b class="${className}" data-letters="${marks.length}">${inner}</b>`;
}

function paintLetterChip(image, text, party) {
  const letters = factionLetters(party);
  const art = factionLetterArt(party);
  const paintText = (visible) => {
    if (!text) return;
    text.hidden = !visible;
    text.replaceChildren();
    if (visible && letters) {
      const marks = [...letters];
      text.dataset.letters = String(marks.length);
      const stack = document.createElement("i");
      stack.className = "letter-fit";
      if (marks.length > 1) {
        for (const mark of marks) {
          const glyph = document.createElement("span");
          glyph.textContent = mark;
          stack.append(glyph);
        }
      } else {
        stack.textContent = letters;
      }
      text.append(stack);
      queueBallotLetterFit(text);
    } else {
      delete text.dataset.letters;
      text.style.fontSize = "";
      text.style.transform = "";
    }
  };
  if (image) {
    image.onload = null;
    image.onerror = null;
    if (art) {
      image.hidden = false;
      image.alt = letters;
      image.onload = () => paintText(false);
      image.onerror = () => {
        image.hidden = true;
        image.removeAttribute("src");
        paintText(Boolean(letters));
      };
      image.src = `/design-assets/${encodeURIComponent(art)}`;
      if (image.complete && image.naturalWidth) paintText(false);
      else paintText(Boolean(letters));
    } else {
      image.hidden = true;
      image.removeAttribute("src");
      image.alt = "";
      paintText(Boolean(letters));
    }
  } else {
    paintText(Boolean(letters) && !art);
  }
}

function renderAvatarSeal() {
  const party = factionParty();
  const view = avatarBallotState(party);
  paintLetterChip(elements.levelLetter, elements.levelLetterText, party);
  paintLetterChip(elements.playerLetter, elements.playerLetterText, party);
  if (elements.avatarSeal) elements.avatarSeal.hidden = !view.showBlankSeal;
  elements.levelAvatarButton?.classList.toggle("has-faction-letter", view.showLetterArt || view.showLetterText);
  elements.playerName?.classList.toggle("has-faction-letter", view.showLetterArt || view.showLetterText);
  elements.levelAvatarButton?.classList.toggle("has-faction-seal", view.showBlankSeal);
}

function rankNameAtLevel(level) {
  const ranks = model.gameConfig?.progression?.rankNames || model.gameConfig?.progression?.ranks || [];
  const name = ranks[Math.max(0, Number(level) - 1)];
  return name || "";
}

function renderAvatarPicker() {
  if (!elements.avatarPicker) return;
  const avatars = model.serverState?.avatars || [];
  const selected = model.selectedAvatarId || model.serverState.avatarId || "kid-boy";
  elements.avatarPicker.innerHTML = avatars.map((avatar) => `
    <button type="button" class="avatar-choice${avatar.unlocked ? "" : " locked"}${avatar.id === selected ? " selected" : ""}" data-avatar-id="${avatar.id}" ${avatar.unlocked ? "" : "disabled"} aria-pressed="${avatar.id === selected}">
      <img src="${avatarUrl(avatar)}" alt="" />
      <span>${escapeHtml(avatar.nameHe)}</span>
      ${avatar.unlocked ? "" : `<small>${escapeHtml(rankNameAtLevel(avatar.unlockLevel) || `רמה ${avatar.unlockLevel}`)}</small>`}
    </button>`).join("");
}

const SESSION_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fillRecoveryCode() {
  if (elements.recoveryCode) elements.recoveryCode.value = model.token || "";
  if (elements.restoreInput) elements.restoreInput.value = "";
  if (elements.restoreStatus) elements.restoreStatus.textContent = "";
}

function openProfileDialog() {
  elements.profileNameInput.value = model.serverState?.displayName || "";
  model.selectedAvatarId = model.serverState?.avatarId || "kid-boy";
  elements.profileError.textContent = "";
  fillRecoveryCode();
  renderNotifyControl();
  prefetchAvatars();
  renderAvatarPicker();
  elements.profileDialog.showModal();
  elements.profileNameInput.focus();
  elements.profileNameInput.select();
}

const IDLE_NOTIFY_KEY = "klafi:idle-notify";
const IDLE_NOTIFY_COPY = "הקלף מוכן לאיסוף";
let idleNotifyTimer = null;
let scheduledIdleAt = "";

function lastIdleNotify() {
  try {
    return localStorage.getItem(IDLE_NOTIFY_KEY) || "";
  } catch {
    return "";
  }
}

function markIdleNotified(at) {
  try {
    localStorage.setItem(IDLE_NOTIFY_KEY, at);
  } catch {
    /* Permission still works without the once-key. */
  }
}

function notifyPermission() {
  return "Notification" in window ? Notification.permission : "unsupported";
}

function renderNotifyControl() {
  const permission = notifyPermission();
  const home = elements.homeEnableNotify;
  const profile = elements.enableIdleNotify;
  const unsupported = permission === "unsupported";
  const granted = permission === "granted";
  const denied = permission === "denied";
  if (profile) {
    profile.hidden = unsupported || granted;
    profile.textContent = denied ? "התראות חסומות בדפדפן" : "להפעיל התראות";
    profile.disabled = denied;
  }
  if (home) {
    home.hidden = granted;
    home.textContent = denied
      ? "התראות חסומות בדפדפן"
      : unsupported
        ? "התראות לא זמינות כאן"
        : "להפעיל התראות";
    home.disabled = false;
  }
  if (elements.notifyStatus) {
    elements.notifyStatus.textContent = unsupported
      ? "הדפדפן הזה לא תומך בהתראות."
      : granted
        ? "התראה אחת תישלח כשהקלף מוכן."
        : "אפשר לשחק גם בלי התראות — האוסף עדיין נשמר. באייפון: הוסיפו למסך הבית ואז הפעילו התראות.";
  }
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator) || model.showcase) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function explainUnavailableNotifications() {
  const permission = notifyPermission();
  if (permission === "unsupported") {
    showToast("הדפדפן הזה לא תומך בהתראות. אפשר לשחק גם בלי התראות — האוסף עדיין נשמר.", 6000);
    return true;
  }
  if (permission === "denied") {
    showToast("התראות חסומות בדפדפן. אפשר לשחק גם בלי התראות — האוסף עדיין נשמר. באייפון: הוסיפו למסך הבית ואז הפעילו התראות.", 6000);
    return true;
  }
  return false;
}

async function requestIdleNotifications() {
  if (explainUnavailableNotifications()) {
    renderNotifyControl();
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await ensureServiceWorker();
    scheduleIdleNotification();
  }
  renderNotifyControl();
}

async function notifyIdleReady(nextIdleAt) {
  if (!nextIdleAt || lastIdleNotify() === nextIdleAt) return;
  if (Date.parse(nextIdleAt) > Date.now()) return;
  markIdleNotified(nextIdleAt);
  const options = {
    body: IDLE_NOTIFY_COPY,
    tag: nextIdleAt,
    lang: "he",
    dir: "rtl",
    icon: "/design-assets/pack-wrapper-klafi.png",
  };
  try {
    const ready = navigator.serviceWorker?.ready;
    if (ready) {
      const registration = await ready;
      if (registration.showNotification) {
        await registration.showNotification("קְלָפִי", options);
        return;
      }
    }
  } catch {
    /* Fall through to the page Notification. */
  }
  if (notifyPermission() === "granted") {
    try {
      new Notification("קְלָפִי", options);
    } catch {
      /* Safari can reject the constructor after a granted prompt. */
    }
  }
}

function scheduleIdleNotification() {
  if (model.showcase || notifyPermission() !== "granted") return;
  const nextIdleAt = model.serverState?.nextIdleAt;
  if (!nextIdleAt || lastIdleNotify() === nextIdleAt) return;
  const when = Date.parse(nextIdleAt);
  if (!Number.isFinite(when)) return;
  if (when <= Date.now()) {
    notifyIdleReady(nextIdleAt);
    return;
  }
  if (scheduledIdleAt === nextIdleAt && idleNotifyTimer) return;
  clearTimeout(idleNotifyTimer);
  scheduledIdleAt = nextIdleAt;
  idleNotifyTimer = setTimeout(() => notifyIdleReady(nextIdleAt), Math.min(when - Date.now(), 2_000_000_000));
}

const COMMUNITY_SECTIONS = {
  market: ["trade", "open-trades"],
  race: ["leagues", "collectors", "challenge", "faction"],
};

function communitySectionFor(page) {
  return COMMUNITY_SECTIONS.race.includes(page) ? "race" : "market";
}

function showCommunitySection(section) {
  const pages = COMMUNITY_SECTIONS[section] || COMMUNITY_SECTIONS.market;
  if (!pages.includes(model.communityPage)) model.communityPage = pages[0];
  model.communitySection = section;
  renderGrowth();
}

function showLeaguesCommunity() {
  model.communityPage = "leagues";
  model.communitySection = "race";
  showView("growth");
}

function inboundLeagueCode() {
  return new URLSearchParams(location.search).get("league") || "";
}

function clearInboundLeague() {
  const url = new URL(location.href);
  if (!url.searchParams.has("league")) return;
  url.searchParams.delete("league");
  history.replaceState({}, "", url);
}

async function consumeInboundLeague() {
  const code = inboundLeagueCode();
  if (!code || !model.token) return;
  showLeaguesCommunity();
  if (elements.leagueJoinInput) elements.leagueJoinInput.value = code;
  await joinLeagueFromInput(code);
  clearInboundLeague();
}

function leagueFaceMarkup(entry = {}) {
  const avatar = (model.serverState?.avatars || model.gameConfig?.avatars || []).find(({ id }) => id === entry.avatarId);
  const streak = Number(entry.loginStreak) >= 3 ? Number(entry.loginStreak) : 0;
  return `<span class="collector-face">${avatar?.art ? `<img src="${avatarUrl(avatar)}" alt="">` : ""}${streak ? `<em class="collector-streak"><b class="streak-count">${streak}</b>${streakFireMarkup()}</em>` : ""}</span>`;
}

// Leagues: one per player (server-enforced). The room is cached per session token so Community opens
// on it at once; /api/leagues refreshes it silently (prefetched with the community extras). Until the
// first answer, with no cache, the desk shows a skeleton, never the "no league" setup.
const LEAGUE_CACHE_KEY = "klafi:leagues";

function readLeagueCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(LEAGUE_CACHE_KEY) || "null");
    return cached && cached.token === model.token && Array.isArray(cached.leagues) ? cached.leagues : null;
  } catch {
    return null;
  }
}

function setLeagues(leagues) {
  model.leagues = (leagues || []).slice(0, 1);
  model.leaguesKnown = true;
  if (model.leagueLeaveConfirm && !model.leagues.some(({ code }) => code === model.leagueLeaveConfirm)) {
    model.leagueLeaveConfirm = null;
  }
  try {
    if (model.token) localStorage.setItem(LEAGUE_CACHE_KEY, JSON.stringify({ token: model.token, leagues: model.leagues }));
  } catch {
    /* A full storage only costs the instant first paint. */
  }
}

function ensureLeagueCache() {
  if (model.leaguesKnown || model.leaguesCacheToken === model.token) return;
  model.leaguesCacheToken = model.token;
  const cached = readLeagueCache();
  // Only a cached room is trusted for the first paint; a cached "no league" waits for the server
  // (the player may have joined elsewhere), so the empty setup never flashes before a room.
  if (cached?.length) {
    model.leagues = cached.slice(0, 1);
    model.leaguesKnown = true;
  }
}

function leagueLeaveMarkup(league) {
  if (model.leagueLeaveConfirm !== league.code) {
    return `<button type="button" class="league-leave" data-leave-league="${escapeHtml(league.code)}">עזיבת ליגה</button>`;
  }
  return `<div class="league-leave-confirm" role="group" aria-label="אישור עזיבת הליגה">
        <p>${Number(league.memberCount) <= 1
          ? `לעזוב את «${escapeHtml(league.name)}»? אתם האחרונים בליגה, אז היא תיסגר.`
          : `לעזוב את «${escapeHtml(league.name)}»? הכוכבים שלכם נשארים, ואפשר לחזור עם הקוד.`}</p>
        <div>
          <button type="button" class="league-leave-yes" data-leave-league-confirm="${escapeHtml(league.code)}">כן, לעזוב</button>
          <button type="button" data-leave-league-cancel>ביטול</button>
        </div>
      </div>`;
}

function renderLeagues() {
  if (!elements.leagueRooms) return;
  ensureLeagueCache();
  const rooms = (model.leagues || []).slice(0, 1);
  const desk = elements.leagueRooms.closest(".league-desk");
  const pending = !model.leaguesKnown && Boolean(model.token) && !model.showcase;
  desk?.classList.toggle("has-rooms", rooms.length > 0);
  desk?.classList.toggle("leagues-pending", pending);
  const setup = desk?.querySelector(".league-setup");
  if (setup) {
    // One league per player: with a room, the create/join form only reappears to show a rejection
    // (e.g. an invite link for a second league).
    const status = Boolean(elements.leagueStatus?.textContent);
    setup.hidden = pending || (rooms.length > 0 && !status);
    setup.open = rooms.length === 0 || status;
  }
  if (pending) {
    elements.leagueRooms.innerHTML = `<div class="league-skeleton" aria-busy="true" aria-label="טוענים את הליגה…">
      <span></span><span></span><span></span>
    </div>`;
    return;
  }
  if (!rooms.length) {
    elements.leagueRooms.innerHTML = '<p class="work-note">עדיין אין ליגה. פתחו אחת, או הזינו קוד הזמנה.</p>';
    return;
  }
  elements.leagueRooms.innerHTML = rooms.map((league) => `
    <article class="league-room" data-league-code="${escapeHtml(league.code)}">
      <header class="league-room-head">
        <div class="league-room-title">
          <h4 title="${escapeHtml(league.name)}">${escapeHtml(league.name)}</h4>
        </div>
        <div class="league-qr">${league.qrSvg || ""}</div>
      </header>
      <div class="league-room-code">
        <button type="button" class="league-code-stamp" data-copy-league="${escapeHtml(league.joinUrl || league.code)}" aria-label="העתקת קישור הזמנה · קוד ${escapeHtml(league.code)}">
          <b dir="ltr">${escapeHtml(league.code)}</b>
          <small aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg><span>לחצו להעתקת הקישור</span></small>
        </button>
        ${leagueLeaveMarkup(league)}
      </div>
      <ol class="league-board">
        ${(league.members || []).map((entry) => `
          <li class="${entry.current ? "current-player" : ""}">
            ${leagueFaceMarkup(entry)}
            <span>${entry.rank}. ${escapeHtml(entry.label)}${entry.current ? "" : ` <button type="button" class="report-link inline" data-report-name="${escapeHtml(entry.label)}">דיווח</button>`}</span>
            <strong>★${entry.stars} · ${entry.ownedUnique} שונים</strong>
          </li>`).join("")}
      </ol>
    </article>`).join("");
}

let leaguesHydrate = null;

/** League badges are stamped when the server builds the room; pull state so they show. */
function refreshAfterLeagueBadges(leagues) {
  if (!(leagues || []).some((league) => league?.earnedAchievements?.length)) return;
  request("/api/state").then((state) => {
    if (setServerState(state) && elements.achievementGrid?.closest(".view")?.classList.contains("active")) renderAchievements();
  }).catch(() => {});
}

async function hydrateLeagues() {
  if (!model.token || model.showcase) return;
  if (leaguesHydrate) return leaguesHydrate;
  leaguesHydrate = (async () => {
    try {
      const payload = await request("/api/leagues");
      setLeagues(payload.leagues);
      refreshAfterLeagueBadges(payload.leagues);
    } catch {
      /* Community still opens without a league list; a cached room stays. */
      if (!model.leaguesKnown) {
        model.leagues = [];
        model.leaguesKnown = true;
      }
    }
    renderLeagues();
  })().finally(() => {
    leaguesHydrate = null;
  });
  return leaguesHydrate;
}

function setLeagueStatus(message) {
  if (elements.leagueStatus) elements.leagueStatus.textContent = message || "";
  const setup = elements.leagueStatus?.closest(".league-setup");
  if (setup && message) {
    setup.hidden = false;
    setup.open = true;
  } else if (setup && !message && model.leagues?.length) {
    setup.hidden = true;
  }
}

function leagueErrorCopy(error, fallback) {
  if (error?.body?.message) return error.body.message;
  if (error?.body?.error === "LEAGUE_FULL") return "הליגה מלאה — אפשר עד 32 שחקנים.";
  if (error?.status === 404) return "הקוד לא נמצא.";
  return fallback;
}

async function createLeagueRoom() {
  setLeagueStatus("");
  if (elements.createLeague) elements.createLeague.disabled = true;
  try {
    const payload = await request("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: elements.leagueNameInput?.value || "" }),
    });
    setLeagues([payload.league]);
    renderLeagues();
    if (elements.leagueNameInput) elements.leagueNameInput.value = "";
    showToast("הליגה נפתחה.");
  } catch (error) {
    setLeagueStatus(leagueErrorCopy(error, "לא הצלחנו לפתוח ליגה עכשיו."));
    if (error?.body?.error === "ALREADY_IN_LEAGUE") hydrateLeagues().catch(() => {});
  } finally {
    if (elements.createLeague) elements.createLeague.disabled = false;
  }
}

async function leaveLeagueRoom(code) {
  const button = elements.leagueRooms?.querySelector("[data-leave-league-confirm]");
  if (button) button.disabled = true;
  try {
    const payload = await request("/api/leagues/leave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    model.leagueLeaveConfirm = null;
    setLeagueStatus("");
    setLeagues(payload.leagues);
    renderLeagues();
    showToast("עזבתם את הליגה.");
    if (!model.leagues.length) elements.leagueNameInput?.focus({ preventScroll: true });
  } catch (error) {
    model.leagueLeaveConfirm = null;
    if (error?.body?.error === "NOT_IN_LEAGUE") {
      await hydrateLeagues();
      return;
    }
    renderLeagues();
    showToast("לא הצלחנו לעזוב את הליגה עכשיו.");
  }
}

async function joinLeagueFromInput(rawCode) {
  const code = (rawCode || elements.leagueJoinInput?.value || "").trim();
  setLeagueStatus("");
  if (!code) {
    setLeagueStatus("הדביקו קוד הזמנה.");
    return;
  }
  if (elements.joinLeague) elements.joinLeague.disabled = true;
  try {
    const payload = await request("/api/leagues/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setLeagues([payload.league]);
    renderLeagues();
    if (elements.leagueJoinInput) elements.leagueJoinInput.value = "";
    showToast("נכנסתם לליגה.");
  } catch (error) {
    setLeagueStatus(leagueErrorCopy(error, "לא הצלחנו להצטרף לליגה."));
  } finally {
    if (elements.joinLeague) elements.joinLeague.disabled = false;
  }
}

async function copyRecoveryCode() {
  const token = model.token || "";
  if (!token) return;
  const copied = await copyText(token);
  showToast(copied ? "קוד השחזור הועתק." : "העתיקו את הקוד מהשדה.");
}

async function restoreSessionFromCode() {
  const token = (elements.restoreInput?.value || "").trim();
  if (elements.restoreStatus) elements.restoreStatus.textContent = "";
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    if (elements.restoreStatus) elements.restoreStatus.textContent = "הקוד לא נראה שלם. הדביקו אותו במלואו.";
    elements.restoreInput?.focus();
    return;
  }
  if (token === model.token) {
    if (elements.restoreStatus) elements.restoreStatus.textContent = "זה כבר הקוד של המכשיר הזה.";
    return;
  }
  if (elements.restoreButton) elements.restoreButton.disabled = true;
  try {
    const state = await request("/api/state", {
      headers: { authorization: `Bearer ${token}` },
    });
    model.token = token;
    model.leagues = [];
    model.leaguesKnown = false;
    model.leaguesCacheToken = null;
    localStorage.setItem(SESSION_KEY, token);
    try {
      localStorage.removeItem(PENDING_MUTATIONS_KEY);
      localStorage.removeItem(PENDING_IDLE_SEEN_KEY);
      localStorage.removeItem(HOME_CACHE_KEY);
    } catch {
      /* Recovery still switches the live session. */
    }
    model.serverState = state;
    model.stateRevision = stateRevision(state) ?? 0;
    model.idleQueue = [];
    model.extrasReady = false;
    extrasHydrate = null;
    homeHydrate = null;
    applyHomePayload({ token, state });
    fillRecoveryCode();
    await Promise.all([
      hydrateHome().catch(() => {}),
      hydrateExtras().catch(() => {}),
    ]);
    renderProfile();
    renderHome();
    renderBinder();
    renderGrowth();
    renderAchievements();
    elements.profileDialog.close();
    showToast("האוסף שוחזר במכשיר הזה.");
  } catch (error) {
    if (elements.restoreStatus) {
      elements.restoreStatus.textContent = error.status === 401
        ? "הקוד לא נמצא. בדקו שהעתקתם אותו במלואו."
        : "לא הצלחנו לשחזר את האוסף עכשיו.";
    }
  } finally {
    if (elements.restoreButton) elements.restoreButton.disabled = false;
  }
}

async function saveProfile(event) {
  event.preventDefault();
  elements.profileError.textContent = "";
  try {
    const profile = await request("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: elements.profileNameInput.value,
        avatarId: model.selectedAvatarId || model.serverState.avatarId,
      }),
    });
    model.serverState.displayName = profile.displayName;
    model.serverState.avatarId = profile.avatarId || model.serverState.avatarId;
    setServerState((await request("/api/home")).state, { merge: true });
    applyExtrasPayload(await request("/api/community"));
    renderProfile();
    renderHome();
    renderGrowth();
    elements.profileDialog.close();
    showToast("השם נשמר.");
  } catch (error) {
    elements.profileError.textContent = error.status === 400
      ? "אפשר להשתמש ב־2–24 אותיות, מספרים, רווחים, גרש או מקף."
      : "לא הצלחנו לשמור את השם.";
  }
}

let quizTimer = null;
const quizAnswers = {};

function stopQuizTimer() {
  if (quizTimer) {
    clearInterval(quizTimer);
    quizTimer = null;
  }
}

function formatQuizClock(remainingMs) {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function openQuizDialog(retried = false) {
  return;
  elements.quizStatus.textContent = "";
  if (elements.quizFail) {
    elements.quizFail.hidden = true;
    elements.quizFail.textContent = "";
  }
  elements.quizSubmit.disabled = false;
  try {
    const quiz = await request("/api/quiz");
    if (!quiz.available) {
      showToast(quiz.wonToday ? "כבר סיימתם את החידון היומי." : "צריך קלף באוסף כדי להיבחן.");
      return;
    }
    model.currentQuiz = quiz;
    Object.keys(quizAnswers).forEach((key) => delete quizAnswers[key]);
    const card = model.byId.get(quiz.cardId);
    elements.quizTitle.textContent = card ? cardTitle(card) : "שתי שאלות, חמש דקות.";
    elements.quizCard.innerHTML = card ? displayCardMarkup(card) : "";
    elements.quizQuestions.innerHTML = quiz.questions.map((question) => `
      <fieldset data-quiz-question="${escapeHtml(question.id)}">
        <legend>${escapeHtml(question.prompt)}</legend>
        ${question.options.map((option) => `<button type="button" data-quiz-option="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join("")}
      </fieldset>`).join("");
    const tick = () => {
      const remaining = Date.parse(quiz.expiresAt) - Date.now();
      elements.quizClock.textContent = formatQuizClock(remaining);
      if (remaining <= 0) {
        stopQuizTimer();
        elements.quizSubmit.disabled = true;
        elements.quizStatus.textContent = "נגמר הזמן. אפשר לנסות שוב אחר כך.";
      }
    };
    stopQuizTimer();
    tick();
    quizTimer = setInterval(tick, 1000);
    elements.quizDialog.showModal();
  } catch (error) {
    if (error.status === 401 && !retried) {
      try {
        await ensureSession();
        return openQuizDialog(true);
      } catch {
        showToast("צריך להיכנס מחדש כדי לפתוח את החידון.");
        return;
      }
    }
    showToast(error.body?.error === "SERVER_ERROR"
      ? "החידון נתקע בשרת. נסו שוב."
      : "לא הצלחנו לפתוח את החידון.");
  }
}

async function submitQuiz() {
  if (!model.currentQuiz) return;
  const unanswered = model.currentQuiz.questions.filter(({ id }) => !quizAnswers[id]);
  if (unanswered.length) {
    elements.quizStatus.textContent = "בחרו תשובה לכל שאלה.";
    return;
  }
  elements.quizSubmit.disabled = true;
  try {
    const result = await request("/api/quiz/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quizId: model.currentQuiz.quizId, answers: quizAnswers }),
    });
    stopQuizTimer();
    if (result.correct) {
      setServerState(result.state);
      model.idleQueue = result.cards || [];
      model.currentPack = {
        packId: result.cards?.[0] ? `quiz-${result.cards[0].instanceId}` : "quiz",
        mode: "quiz",
        cards: result.cards || [],
      };
      model.currentCardIndex = 0;
      elements.quizDialog.close();
      showView("pack");
      startWalkout();
      showToast("שתי תשובות נכונות · חבילה נוספת.");
    } else {
      if (elements.quizFail) {
        elements.quizFail.hidden = false;
        elements.quizFail.textContent = "לא הפעם. פתחו את גב הקלף ונסו שוב אחר כך.";
      } else {
        elements.quizStatus.textContent = "לא הפעם. פתחו את גב הקלף ונסו שוב אחר כך.";
      }
      if (elements.openQuiz) elements.openQuiz.hidden = true;
    }
  } catch (error) {
    elements.quizSubmit.disabled = false;
    elements.quizStatus.textContent = error.status === 409 ? "החידון כבר לא פתוח." : "לא הצלחנו לבדוק.";
  }
}

function renderHome() {
  const { owned, total, percent } = completion();
  const unseen = model.serverState?.unseenCount ?? model.idleQueue.length;
  const due = Boolean(model.serverState?.nextIdleAt) && !timeUntil(model.serverState.nextIdleAt);
  const available = unseen > 0 || due;
  const readyCopy = homeIdleReadyCopy({ unseenCount: unseen, available });
  const idleCapacity = model.serverState?.idleCapacity ?? model.gameConfig?.idle?.capacity ?? IDLE_BACKLOG_CAP;
  elements.collectionCount.textContent = `${owned} מתוך ${total} בסדרה הפעילה · ${percent}%`;
  elements.collectionProgress.style.width = `${percent}%`;
  elements.openPack.disabled = !available;
  elements.openPack.textContent = readyCopy.action;
  if (available) {
    preloadPackRipAssets();
    sfx.preload();
  }
  if (elements.idleStorage) {
    elements.idleStorage.hidden = true;
    elements.idleStorage.textContent = `${unseen}/${idleCapacity}`;
  }
  const activeReleaseIds = [...new Set(model.catalog.filter(({ idleEligible }) => idleEligible).map(({ releaseSetId }) => releaseSetId))];
  const releaseNames = activeReleaseIds
    .map((id) => model.gameConfig?.releaseSets?.find((release) => release.id === id)?.nameHe)
    .filter(Boolean);
  if (elements.activeRelease) elements.activeRelease.textContent = releaseNames.join(" + ");
  elements.homeTitle.textContent = readyCopy.title;
  elements.homeCopy.textContent = readyCopy.lede;
  renderSiteCardPeeks();
  renderProgression();
  renderActivity();
  renderTodayDocket();
  updateCountdown();
  if (elements.openQuiz) elements.openQuiz.hidden = true;
  layoutAdvocacyDock();
}

function renderSiteCardPeeks() {
  if (!elements.siteCardPeeks) return;
  const recentIds = [...(model.serverState?.instances || [])]
    .reverse()
    .map(({ cardId }) => cardId);
  const uniqueRecent = [...new Set(recentIds)]
    .map((cardId) => model.byId.get(cardId))
    .filter(Boolean);
  const variedFallback = ["Symbol", "Quote", "Platform"]
    .flatMap((type) => model.catalog.filter((card) => card.type === type).slice(0, 2));
  const cards = [...uniqueRecent.slice(0, 3), ...variedFallback]
    .filter((card, index, all) => all.findIndex(({ id }) => id === card.id) === index)
    .slice(0, 6);
  const signature = cards.map(({ id }) => id).join("|");
  if (elements.siteCardPeeks.dataset.cards === signature) return;
  elements.siteCardPeeks.dataset.cards = signature;
  elements.siteCardPeeks.innerHTML = cards.map((card) => `
    <div class="site-card-peek">${displayCardMarkup(card, "peek")}</div>
  `).join("");
  queueCardTextFit(elements.siteCardPeeks);
}

function partyRegister() {
  if (model.studioContent?.parties?.length) return model.studioContent.parties;
  if (model.gameConfig?.parties?.length) return model.gameConfig.parties;
  const parties = new Map();
  for (const card of model.catalog || []) {
    if (!card.set || card.set === "SYS" || String(card.set).startsWith("special-")) continue;
    if (parties.has(card.set)) continue;
    parties.set(card.set, {
      id: card.set,
      displayNameHe: card.setNameHe || card.set,
      displayNameEn: card.setName || card.set,
      requestedLetters: card.letters ? [card.letters] : [],
      pip: card.pip || null,
      letterChip: factionLetterArt({ id: card.set }),
    });
  }
  return [...parties.values()];
}

function localDailyChallenge(now = Date.now()) {
  const partyIds = [...new Set(
    (model.catalog.length
      ? model.catalog.filter(({ set }) => set && set !== "SYS" && !String(set).startsWith("special-")).map(({ set }) => set)
      : (model.gameConfig?.parties || []).map(({ id }) => id)
    ),
  )].sort();
  if (!partyIds.length) return null;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now));
  const dayNumber = [...day].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const targetPartyId = partyIds[dayNumber % partyIds.length];
  return {
    day,
    targetPartyId,
    targetPartyNameHe: partyDisplayName(targetPartyId, "") || targetPartyId,
    leaders: [],
  };
}

function partyDisplayName(partyId, fallback = "הסיעה היומית") {
  if (!partyId) return fallback;
  const fromRegister = partyRegister().find(({ id }) => id === partyId)?.displayNameHe;
  if (fromRegister) return fromRegister;
  const challenge = model.leaderboards?.dailyChallenge;
  if (challenge?.targetPartyId === partyId && challenge.targetPartyNameHe) return challenge.targetPartyNameHe;
  const fromCatalog = model.catalog.find((card) => card.set === partyId)?.setNameHe;
  return fromCatalog || partyId;
}

function challengeRecap() {
  const leaders = model.leaderboards?.dailyChallenge?.leaders || [];
  const current = leaders.find(({ current }) => current);
  const ranked = [...leaders].sort((a, b) => b.cards - a.cards);
  const place = current ? ranked.findIndex((entry) => entry.current) + 1 : null;
  const counts = leaders.map(({ cards }) => Number(cards) || 0);
  const peak = Math.max(0, ...counts);
  const lastBin = Math.min(4, Math.max(peak, 1));
  const binFor = (value) => (lastBin === 4 && peak > 4 && value >= 4 ? 4 : value);
  const bins = Array.from({ length: lastBin + 1 }, (_, cards) => ({
    label: cards === 4 && peak > 4 ? "4+" : String(cards),
    count: counts.filter((value) => binFor(value) === cards).length,
    you: Boolean(current && binFor(current.cards) === cards),
  }));
  const field = Math.max(1, ...bins.map(({ count }) => count));
  const hasCrowd = leaders.length >= 2;
  // The server hides other players on 0, so the board is "who scored today" plus your own row.
  const othersScored = leaders.filter((entry) => !entry.current && Number(entry.cards) > 0).length;
  const meta = !current
    ? "עוד לא אספתם מהסיעה של היום"
    : Number(current.cards) > 0
      ? `${current.cards} קלפים · מקום ${place}${othersScored ? "" : " · רק אתם אספתם היום"}`
      : othersScored
        ? `עוד לא אספתם היום · ${othersScored === 1 ? "שחקן אחד כבר אסף" : `${othersScored} שחקנים כבר אספו`}`
        : "עוד אף אחד לא אסף היום — פתחו ותהיו ראשונים";
  return { current, place, bins, field, meta, players: leaders.length, hasCrowd, othersScored };
}

function renderChallengeRecap() {
  if (!elements.dailyChallengeRecap) return;
  const recap = challengeRecap();
  elements.dailyChallengeRecap.hidden = false;
  elements.dailyChallengeRecap.style.setProperty("--bins", String(recap.bins.length));
  const score = recap.current ? recap.current.cards : 0;
  // Players on 0 are hidden (except you), so "alone" means nobody else scored yet, not an empty game.
  const place = !recap.current
    ? "עוד לא בטבלה"
    : !score
      ? recap.othersScored ? "עוד לא אספתם היום" : "עוד אף אחד לא אסף היום"
      : !recap.othersScored
        ? "מקום 1 · רק אתם אספתם היום"
        : `מקום ${recap.place} מתוך ${Math.max(recap.players, recap.place)}`;
  elements.dailyChallengeRecap.innerHTML = `
    <div class="challenge-recap-score">
      <small>היום אספתם מהסיעה</small>
      <strong>${score}<span>קלפים</span></strong>
      <b class="challenge-recap-place">${escapeHtml(place)}</b>
    </div>
    ${recap.hasCrowd ? `<div class="challenge-hist">
      <small>כמה קלפים אספו היום</small>
      <div class="challenge-hist-plot" dir="ltr" aria-hidden="true">
        ${recap.bins.map((bin, index) => `<div class="challenge-hist-col${bin.you ? " you" : ""}">
          <b style="height:${bin.count ? Math.max(4, Math.round((bin.count / recap.field) * 100)) : 0}%; animation-delay:${index * 40}ms"></b>
        </div>`).join("")}
      </div>
      <div class="challenge-hist-axis" dir="ltr">${recap.bins.map((bin) => `<span>${escapeHtml(bin.label)}</span>`).join("")}</div>
    </div>` : ""}
  `;
}

function renderTodayDocket() {
  if (!elements.todayChallengeHook) return;
  const challenge = model.leaderboards?.dailyChallenge || (model.extrasReady ? null : localDailyChallenge());
  const challengeParty = challenge
    ? partyDisplayName(challenge.targetPartyId, challenge.targetPartyNameHe || "")
    : "טוענים…";
  const challengeLeaders = challenge?.leaders?.slice(0, 3) || [];
  const challengeLeader = challengeLeaders[0];
  const challengeCurrent = challenge?.leaders?.find(({ current }) => current);
  const party = partyRegister().find(({ id }) => id === challenge?.targetPartyId);
  const challengeCard = model.catalog.find((card) => card.set === challenge?.targetPartyId && card.artKey)
    || {
      id: `${party?.id || "SYS"}-TODAY`,
      set: party?.id || "SYS",
      titleHe: party?.requestedLetters?.[0] || "קְלָפִי",
      type: "Symbol",
      artKey: null,
      pip: party?.pip || "#1f4f4a",
    };
  if (elements.todayChallengeVisual.dataset.card !== challengeCard.id) {
    elements.todayChallengeVisual.dataset.card = challengeCard.id;
    elements.todayChallengeVisual.style.setProperty("--pip", challengeCard.pip);
    elements.todayChallengeVisual.innerHTML = artMarkup(challengeCard, true);
  }
  elements.todayChallengeHook.textContent = challengeParty;
  const recap = challengeRecap();
  elements.todayChallengeMeta.textContent = recap.meta;

  const leader = model.leaderboards?.collectors?.[0];
  const currentCollector = model.leaderboards?.collectors?.find(({ current }) => current);
  const collectorCrowd = (model.leaderboards?.collectors?.length || 0) >= 2;
  elements.todayLeaderHook.textContent = !collectorCrowd
    ? "הטבלה מחכה לעוד שחקנים"
    : currentCollector?.rank
    ? `אתם במקום ${currentCollector.rank}`
    : leader?.current
      ? "אתם במקום הראשון"
      : "המקום הראשון פנוי";
  elements.todayLeaderMeta.textContent = "";
  renderTodaySpecials();
}

// The Today event ticker. Always visible; CSS owns the motion (see .today-specials-line).
// updateCountdown calls this every second, so it only writes to the DOM when something changed:
// re-setting the copy's text each tick is what used to re-trigger layout (and restart the line).
function renderTodaySpecials() {
  const row = elements.todaySpecialsRow;
  if (!row) return;
  const windowOpen = model.specialWindow;
  if (windowOpen?.reward === "pull" && !windowOpen.claimedToday) refreshEventPredictionIfStale();
  document.querySelector("#home-view")?.classList.toggle("has-specials", Boolean(windowOpen));
  let line = "אין אירוע כרגע";
  if (windowOpen?.reward === "pull") {
    line = windowOpen.claimedToday
      ? windowOpen.claimedTickerHe || `${windowOpen.nameHe} · החבילה כבר אצלכם`
      : windowOpen.tickerHe || `${windowOpen.nameHe} · חבילה נוספת לכל שחקן`;
  } else if (windowOpen) {
    const closes = new Date(windowOpen.closesAt);
    const until = Number.isNaN(closes.getTime())
      ? ""
      : closes.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
    const detail = windowOpen.claimedToday
      ? "הקלף היומי כבר באוסף — והוא נשאר באלבום."
      : until
        ? `פתוח עד ${until}. קלף אחד להיום.`
        : "קלף אחד להיום — והוא נשאר באלבום.";
    line = `חלון מיוחד · ${windowOpen.nameHe} · ${detail}`;
  }
  const state = !windowOpen ? "idle" : windowOpen.claimedToday ? "claimed" : "live";
  if (row.dataset.state !== state) row.dataset.state = state;
  row.classList.toggle("is-marquee", Boolean(windowOpen));
  // A claimed pull event keeps scrolling its "already yours" line but is no longer a control:
  // disabled = no click, no focus, no pop-up, no POST. (Card events manage .disabled themselves.)
  const inert = windowOpen?.reward === "pull" && Boolean(windowOpen.claimedToday);
  if (inert !== (row.dataset.inert === "true")) {
    row.dataset.inert = String(inert);
    row.disabled = inert;
  }
  for (const copy of [elements.todaySpecialsCopy, elements.todaySpecialsCopyRepeat]) {
    if (copy && copy.textContent !== line) copy.textContent = line;
  }
}

function layoutAdvocacyDock() {
  const dock = elements.openAdvocacy;
  if (!dock) return;
  dock.style.left = "";
  dock.style.right = "";
  dock.style.bottom = "";
}

function renderActivity() {
  const activity = model.activity;
  if (!activity || !elements.activityCopy) return;
  const pulls = activity.counts.idle_settled ?? 0;
  const shares = activity.counts.share_created ?? 0;
  elements.activityCopy.textContent = `${pulls} איסופים · ${shares} שיתופים`;
}

const SEEN_LEVEL_KEY = "klafi-seen-level-dialog";

function seenLevel() {
  const value = Number(localStorage.getItem(SEEN_LEVEL_KEY));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function markLevelSeen(level) {
  localStorage.setItem(SEEN_LEVEL_KEY, String(level));
  model.renderedLevel = level;
}

function levelUnlockItems(fromLevel, toLevel) {
  const ranks = model.gameConfig?.progression?.rankNames || model.gameConfig?.progression?.ranks || [];
  const avatars = model.serverState?.avatars || [];
  const items = [];
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    const rank = ranks[level - 1];
    if (rank) items.push(`דרגה חדשה · ${rank}`);
    items.push("קלף בונוס");
    avatars
      .filter((avatar) => Number(avatar.unlockLevel) === level)
      .forEach((avatar) => items.push(`אווטאר חדש · ${avatar.nameHe}`));
  }
  return [...new Set(items)];
}

function fillLevelDialog(progression, fromLevel) {
  const toLevel = fromLevel + 1;
  elements.levelDialogTitle.textContent = `הגעתם לרמה ${toLevel}`;
  const items = levelUnlockItems(fromLevel, toLevel);
  if (elements.levelUnlocks) {
    elements.levelUnlocks.hidden = !items.length;
    elements.levelUnlocks.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }
  elements.levelDialogReward.textContent = items.length ? "קלף הבונוס כבר נכנס לאוסף." : (progression.reward || "");
}

function prefetchLevelReward(cards = []) {
  prefetchCardArt((cards || []).map(({ cardId }) => model.byId.get(cardId)).filter(Boolean));
}

function startLevelRewardGrant() {
  if (model.levelRewardGrant) return model.levelRewardGrant;
  const pending = model.serverState?.progression?.pendingRewards || [];
  if (!pending.length) {
    if (model.levelRewardReady?.cards?.length) {
      prefetchLevelReward(model.levelRewardReady.cards);
      return Promise.resolve(model.levelRewardReady);
    }
    return Promise.reject(Object.assign(new Error("NO_LEVEL_REWARD"), { status: 409 }));
  }
  const mutationScope = `level-reward-${pending[0]}`;
  model.levelRewardGrant = request("/api/rewards/level", {
    method: "POST",
    headers: { "x-idempotency-key": pendingMutationKey(mutationScope) },
  }).then((reward) => {
    clearPendingMutation(mutationScope);
    model.levelRewardReady = reward;
    model.levelRewardGrant = null;
    if (reward.state) setServerState(reward.state);
    prefetchLevelReward(reward.cards);
    renderHome();
    renderPendingLevelCue();
    return reward;
  }).catch((error) => {
    model.levelRewardGrant = null;
    throw error;
  });
  return model.levelRewardGrant;
}

function renderPendingLevelCue() {
  /* Packs are granted when the level dialog opens. No waiting button. */
}

function openPendingLevelDialog() {
  const progression = model.serverState?.progression;
  const pending = progression?.pendingRewards || [];
  if (!progression || !pending.length) return;
  fillLevelDialog(progression, Math.min(...pending) - 1);
  if (!elements.levelDialog.open) elements.levelDialog.showModal();
  startLevelRewardGrant().catch(() => {});
}

function dismissLevelDialog() {
  if (elements.levelDialog.open) elements.levelDialog.close();
  const pending = model.serverState?.progression?.pendingRewards || [];
  if (pending.length) queueMicrotask(() => openPendingLevelDialog());
}

function renderProgression({ announce = false } = {}) {
  const progression = model.serverState?.progression;
  if (!progression) return;
  elements.levelNumber.textContent = `רמה ${progression.level}/${progression.totalLevels}`;
  elements.levelNumber.setAttribute("aria-label", `רמה ${progression.level} מתוך ${progression.totalLevels} שפתוחות כרגע`);
  const streak = Number(model.serverState?.loginStreak) || 0;
  const showStreak = streak >= 3;
  elements.levelRank.textContent = progression.rank;
  if (elements.levelStreak) {
    elements.levelStreak.hidden = !showStreak;
    if (elements.levelStreakCount) elements.levelStreakCount.textContent = showStreak ? String(streak) : "";
  }
  if (elements.playerStreak) {
    elements.playerStreak.hidden = !showStreak;
    if (elements.playerStreakCount) elements.playerStreakCount.textContent = showStreak ? String(streak) : "";
  }
  elements.levelAvatarButton?.classList.toggle("has-streak", showStreak);
  elements.levelAvatarButton?.classList.toggle("has-week-streak", streak >= 7);
  elements.playerName?.classList.toggle("has-streak", showStreak);
  if (elements.levelAvatarButton) {
    elements.levelAvatarButton.setAttribute("aria-label", showStreak
      ? `${progression.rank} · רצף ${streak} · הפרופיל והאווטאר`
      : `${progression.rank} · הפרופיל והאווטאר`);
  }
  if (elements.levelTeaser) elements.levelTeaser.textContent = progression.teaser;
  const unique = progression.unique || 0;
  const target = Math.max(progression.target || 0, unique);
  const filled = target ? Math.max(0, Math.min(100, Math.round((unique / target) * 100))) : 100;
  elements.levelProgress.style.width = `${filled}%`;
  elements.levelProgressCount.textContent = `${unique}/${target}`;
  if (progression.remaining) {
    elements.levelNext.textContent = progression.remaining === 1
      ? "חסר לכם עוד קלף חדש אחד כדי לעלות רמה"
      : `חסרים לכם עוד ${progression.remaining} קלפים חדשים כדי לעלות רמה`;
  } else {
    elements.levelNext.textContent = progression.nextReleaseRank
      ? `הרמה מוכנה. ${progression.nextReleaseRank} תיפתח בסדרה הבאה`
      : "הגעתם לדרגת ראש הממשלה";
  }
  const seen = seenLevel();
  const pending = progression.pendingRewards || [];
  if (pending.length && !elements.levelDialog.open && revealInProgress()) {
    model.renderedLevel = Math.max(seen, progression.level);
  } else if (pending.length && !elements.levelDialog.open) {
    openPendingLevelDialog();
    markLevelSeen(Math.min(...pending));
  } else if (!seen && !pending.length) {
    markLevelSeen(progression.level);
  } else {
    model.renderedLevel = Math.max(seen, progression.level);
  }
  renderPendingLevelCue();
}

function updateCountdown() {
  renderTodayDocket();
  scheduleIdleNotification();
  const view = idleCountdownCopy({
    serverState: model.serverState,
    idleQueueLength: model.idleQueue.length,
  });
  applyIdleCountdown(elements.cooldownCopy, view);
  if (elements.headerStatus) elements.headerStatus.hidden = true;
  if (view.needsSettle && !idleHydrate) scheduleIdleRefill({ priority: "urgent" });
  if (view.full) {
    if (elements.debugClock) elements.debugClock.textContent = "Idle pull · full";
    return;
  }
  if (elements.debugClock) elements.debugClock.textContent = `Next idle pull · ${formatCountdown(view.remaining)}`;
}

setInterval(updateCountdown, 1000);

function resetPackRip() {
  packRipListeners?.abort();
  packRipListeners = null;
  destroyPackRip();
  packRip = null;
}

// Renders the sealed pack (idle, t = 0) into #rip-stage and returns a fresh listener signal.
// Display only: the pull is already settled on the server before the rip plays.
function renderSealedPackRip() {
  resetPackRip();
  elements.ripStage.innerHTML = packRipMarkup();
  packRip = mountPackRip(elements.ripStage);
  packRip?.seek(0);
  packRipListeners = new AbortController();
  // Rip SFX rides the animation clock: packrip:start carries ripAt (t0 + 1000 ms) and the clip is
  // scheduled on the AudioContext so its attack lands there. packrip:rip stays the visual beat.
  elements.ripStage.addEventListener("packrip:start", (event) => {
    sfx.scheduleRip(event.detail.ripAt);
  }, { signal: packRipListeners.signal });
  return packRipListeners.signal;
}

function playHomePackRip() {
  if (!elements.ripStage) return { finished: Promise.resolve(), release() {} };
  packTimers.forEach(clearTimeout);
  packTimers = [];
  teardownWalkoutSunburst({ immediate: true });
  sfx.stopReveals();
  model.packPhase = "tearing";
  elements.packStep.textContent = "קלף אחד";
  elements.packHeading.textContent = "קורעים את החבילה.";
  elements.packCounter.textContent = "0 / 1";
  const signal = renderSealedPackRip();
  const player = packRip;
  setPackAction("פותחים…", true, "");
  showView("pack");
  let released = false;
  const finished = new Promise((resolve) => {
    if (!player) {
      resolve();
      return;
    }
    elements.ripStage.addEventListener("packrip:done", () => resolve(), { once: true, signal });
    // play() also settles if the player is torn down early, so the caller never hangs.
    player.play().then(resolve);
  });
  return {
    finished,
    release({ revealing = false } = {}) {
      if (released) return;
      released = true;
      if (player && packRip === player) resetPackRip();
      // Aborted before the reveal (settle failed / nothing ready): leave the pack view.
      if (!revealing && model.packPhase === "tearing") {
        model.packPhase = "sealed";
        showView("home");
      }
    },
  };
}

async function openIdleReturn(opening = "regular") {
  sfx.unlock();
  if (homePackRipBusy) return;
  homePackRipBusy = true;
  try {
    await openIdleReturnOnce(opening);
  } finally {
    homePackRipBusy = false;
  }
}

async function openIdleReturnOnce(opening) {
  if (!model.catalog.length) loadStaticCatalog().catch(() => {});
  elements.openPack.disabled = true;
  if (elements.openPackFancy) elements.openPackFancy.disabled = true;
  elements.openPack.textContent = "פותחים…";
  const cached = nextCachedIdleCard();
  const rip = playHomePackRip({ holdAtEnd: !cached });
  try {
    const settlement = cached && !cached.prepared
      ? Promise.resolve({ value: { cards: model.idleQueue, state: model.serverState } })
      : hydrateIdleQueue().then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    let selected = cached?.instance;
    if (!selected) {
      const outcome = await settlement;
      if (outcome.error) throw outcome.error;
      const settled = outcome.value;
      selected = settled.cards?.[0];
    } else if (cached.prepared) {
      model.serverState.preparedPulls = (model.serverState.preparedPulls || [])
        .filter(({ instanceId }) => instanceId !== selected.instanceId);
      model.serverState.inventory = { ...(model.serverState.inventory || {}) };
      model.serverState.inventory[selected.cardId] = (model.serverState.inventory[selected.cardId] ?? 0) + 1;
      model.serverState.unseenCount = (model.serverState.unseenCount || 0) + 1;
      model.serverState.instances = [
        ...(model.serverState.instances || []),
        { ...selected, pulledAt: selected.availableAt, seenAt: null },
      ].slice(-500);
      applyHomePayload({ state: model.serverState });
    }
    if (!selected) {
      rip.release();
      renderHome();
      showToast("הקלף הבא עדיין נאסף.");
      return;
    }
    await rip.finished;
    model.currentPack = {
      packId: `idle-return-${Date.now()}`,
      mode: "idle-return",
      pulledAt: new Date().toISOString(),
      cards: [selected],
      settlement,
      preparedReveal: Boolean(cached?.prepared),
    };
    model.currentCardIndex = 0;
    model.previewMode = false;
    rip.release({ revealing: true });
    showView("pack");
    startWalkout();
  } catch (error) {
    rip.release();
    renderHome();
    showToast("לא הצלחנו לטעון את הקלפים שנאספו.");
  }
}

const STUDIO_DEBUG_LABEL = "משיכת בדיקה · לא נשמר";

// Studio debug pull: the server picks a card of the chosen rarity without saving anything; the
// client plays the normal rip -> walkout -> sunburst -> sounds path and never calls save/seen.
async function runStudioDebugPull() {
  sfx.unlock();
  if (homePackRipBusy) return;
  homePackRipBusy = true;
  const button = elements.studioDebugPull;
  const checked = document.querySelector('input[name="studio-debug-rarity"]:checked');
  const rarity = checked?.value ? Number(checked.value) : null;
  if (button) button.disabled = true;
  if (elements.studioDebugPullStatus) elements.studioDebugPullStatus.textContent = "";
  let rip = null;
  try {
    if (!model.catalog.length) await loadStaticCatalog();
    rip = playHomePackRip();
    elements.packStep.textContent = STUDIO_DEBUG_LABEL;
    const pulled = await request("/api/studio/debug-pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rarity }),
    });
    if (!pulled.cards?.every(({ cardId }) => model.byId.has(cardId))) throw new Error("CARD_NOT_IN_CATALOG");
    await rip.finished;
    model.currentPack = { ...pulled, mode: "studio-debug", debug: true };
    model.currentCardIndex = 0;
    model.previewMode = false;
    rip.release({ revealing: true });
    showView("pack");
    startWalkout();
  } catch (error) {
    rip?.release();
    showView("studio");
    const message = error.status === 404 ? "משיכת בדיקה זמינה רק לעורכי Studio."
      : error.status === 409 ? "אין קלף זמין בדרגה הזאת."
        : "משיכת הבדיקה נכשלה.";
    if (elements.studioDebugPullStatus) elements.studioDebugPullStatus.textContent = message;
    showToast(message);
  } finally {
    homePackRipBusy = false;
    if (button) button.disabled = false;
  }
}

async function runGuidedDemo() {
  elements.runGuidedDemo.disabled = true;
  elements.runGuidedDemo.textContent = "Loading guided pack…";
  try {
    model.currentPack = await request("/api/packs/demo", { method: "POST" });
    model.currentCardIndex = 0;
    model.previewMode = false;
    model.packPhase = "sealed";
    renderPack();
    showView("pack");
  } catch (error) {
    showToast(error.status === 404 ? "Guided demo is disabled." : "Could not load the guided demo.");
  } finally {
    elements.runGuidedDemo.disabled = false;
    elements.runGuidedDemo.textContent = "Run six-card guided demo";
  }
}

async function openBibiDebugPack() {
  elements.openBibiPack.disabled = true;
  elements.openBibiPack.textContent = "מכינים…";
  try {
    model.currentPack = await request("/api/packs/bibi-demo", { method: "POST" });
    setServerState(await request("/api/state"));
    model.leaderboards = mergeLeaderboards(model.leaderboards, await request("/api/leaderboards"));
    model.currentCardIndex = 0;
    model.previewMode = false;
    model.currentPack.cards = model.currentPack.cards.slice(0, 1);
    const rip = playHomePackRip();
    await rip.finished;
    rip.release({ revealing: true });
    showView("pack");
    startWalkout();
  } catch (error) {
    showToast(error.status === 404 ? "מצב הבדיקה כבוי." : "לא הצלחנו לפתוח את חבילת הבדיקה.");
  } finally {
    elements.openBibiPack.disabled = false;
    elements.openBibiPack.textContent = "פתיחת חבילת ביבי";
  }
}

function renderPack() {
  const phase = model.packPhase;
  const count = model.currentPack?.cards.length ?? 1;
  const isDemo = model.currentPack?.mode?.includes("demo");
  elements.packCounter.textContent = `${Math.min(model.currentCardIndex + (phase === "complete-card" ? 1 : 0), count)} / ${count}`;

    if (phase === "sealed") {
    elements.packStep.textContent = isDemo ? "חבילת הדגמה" : "קלף אחד";
    elements.packHeading.textContent = "קורעים את החבילה.";
    renderSealedPackRip();
    setPackAction("קרעו את החבילה", false, count === 1 ? "הקלף כבר שמור אצלכם." : "הקלפים כבר שמורים אצלכם.");
  } else if (phase === "tearing") {
    // The rip plays on the sealed markup already in the stage; only re-render if it is missing.
    if (!packRip || !elements.ripStage.querySelector(".pr-stage")) renderSealedPackRip();
    setPackAction("פותחים…", true, "");
  } else if (phase === "fanned") {
    elements.packStep.textContent = `${count} קלפים`;
    elements.packHeading.textContent = "הנה הקלפים.";
    resetPackRip();
    elements.ripStage.innerHTML = `<div class="fan" aria-label="קלפים סגורים">${"<span class=\"fan-card\"></span>".repeat(count)}</div>`;
    setPackAction("חושפים…", true, "");
  }
}

function setPackAction(label, disabled, hint) {
  elements.packAction.textContent = label;
  elements.packAction.disabled = disabled;
  elements.packHint.textContent = hint;
}

const SEEN_ACK_MODES = new Set(["idle-return", "level-reward", "quiz"]);

/**
 * Opening a warehouse card = seeing it. Send the seen ack as soon as the reveal starts (the card is
 * already granted server-side), so the server credits unique/level/faction during the reveal and
 * its response is in hand before the player taps back to Today. Once per pack; idempotent server-side.
 * The local ready-count decrement is display-only and is reconciled by the ack's server state.
 */
function acknowledgeRevealedPack(pack) {
  if (!pack || pack.seenAck || model.previewMode || !SEEN_ACK_MODES.has(pack.mode)) return pack?.seenAck;
  const instanceIds = (pack.cards || []).map(({ instanceId }) => instanceId).filter(Boolean);
  const opened = new Set(instanceIds);
  const ownershipReady = pack.mode === "idle-return" && pack.preparedReveal
    ? pack.settlement.then((outcome) => {
      if (outcome.error || !outcome.value?.cards?.some(({ instanceId }) => opened.has(instanceId))) {
        throw outcome.error || new Error("PREPARED_PULL_NOT_MATERIALIZED");
      }
    })
    : Promise.resolve();
  pack.seenAck = ownershipReady.then(() => {
    const alreadyPending = new Set(pendingIdleSeen());
    const fresh = instanceIds.filter((instanceId) => !alreadyPending.has(instanceId));
    rememberPendingIdleSeen(instanceIds);
    const queued = model.idleQueue.filter(({ instanceId }) => opened.has(instanceId)).length;
    model.idleQueue = model.idleQueue.filter(({ instanceId }) => !opened.has(instanceId));
    if (fresh.length && queued) {
      const cap = model.serverState?.idleCapacity ?? IDLE_BACKLOG_CAP;
      const before = model.serverState?.unseenCount || 0;
      const unseenCount = Math.max(0, before - Math.min(fresh.length, queued));
      model.serverState = { ...model.serverState, unseenCount };
      // Same rule the server applies on this ack: leaving a full warehouse resumes the clock.
      if (before >= cap && unseenCount < cap) model.serverState = resumeClockAfterCap(model.serverState);
    }
    return flushPendingIdleSeen();
  }).catch(() => {
    scheduleIdleRefill({ priority: "urgent" });
  });
  return pack.seenAck;
}

function revealInProgress() {
  return Boolean(document.querySelector("#pack-view")?.classList.contains("active"))
    && ["tearing", "fanned", "walkout", "complete-card"].includes(model.packPhase);
}

async function handlePackAction() {
  if (model.packPhase === "sealed") {
    sfx.unlock();
    sfx.stopReveals();
    model.packPhase = "tearing";
    renderPack();
    const player = packRip;
    const signal = packRipListeners?.signal;
    if (!player || !signal) {
      model.packPhase = "fanned";
      renderPack();
      packTimers.push(setTimeout(startWalkout, 550));
      return;
    }
    // Advance on the VFX's own settle beat (packrip:done at 2600 ms, prompt under reduced motion).
    elements.ripStage.addEventListener("packrip:done", () => {
      if (model.packPhase !== "tearing" || packRip !== player) return;
      model.packPhase = "fanned";
      renderPack();
      packTimers.push(setTimeout(startWalkout, 550));
    }, { once: true, signal });
    player.play();
  } else if (model.packPhase === "complete-card") {
    exitWalkoutSunburst();
    if (model.previewMode) {
      model.previewMode = false;
      renderHome();
      showView("home");
      return;
    }
    if (model.currentCardIndex < model.currentPack.cards.length - 1) {
      model.currentCardIndex += 1;
      startWalkout();
    } else if (model.currentPack.mode === "event") {
      renderBinder();
      renderEvents();
      showView("events");
      renderProgression({ announce: true });
      showToast("קלף האירוע נוסף לאוסף.");
    } else if (model.currentPack.mode === "studio-debug") {
      // Debug pull: nothing was granted, so there is nothing to mark seen or refresh.
      showView("studio");
      if (elements.studioDebugPullStatus) elements.studioDebugPullStatus.textContent = "משיכת הבדיקה הסתיימה. שום דבר לא נשמר.";
    } else if (model.currentPack.mode === "demo") {
      renderStudio();
      showView("studio");
      showToast("Guided demo complete. Daily state was not changed.");
    } else if (SEEN_ACK_MODES.has(model.currentPack.mode)) {
      // The seen ack was sent when the reveal started (acknowledgeRevealedPack), so the server has
      // usually credited progress/unique/faction by now and Today paints the server's numbers.
      acknowledgeRevealedPack(model.currentPack);
      const opened = new Set(model.currentPack.cards.map(({ instanceId }) => instanceId).filter(Boolean));
      model.idleQueue = model.idleQueue.filter(({ instanceId }) => !opened.has(instanceId));
      // Leave the pack view first: a level-up dialog held back during the reveal opens here.
      showView(model.idleQueue.length ? "home" : "binder");
      renderHome();
      renderBinder();
      renderAchievements();
      renderGrowth();
      renderProgression({ announce: true });
    } else {
      model.leaderboards = mergeLeaderboards(model.leaderboards, await request("/api/leaderboards"));
      renderHome();
      renderBinder();
      renderGrowth();
      showView("binder");
      recordEvent("binder_reached", { packId: model.currentPack.packId });
      renderProgression({ announce: true });
    }
  }
}

function playRevealSound(stage) {
  if (model.previewMode) return;
  const instance = model.currentPack?.cards?.[model.currentCardIndex];
  const card = instance ? model.byId.get(instance.cardId) : null;
  if (!instance) return;
  // Strict tier 1-4 from the pull; the ?rarity= QA override keeps sound in step with the sunburst.
  const clip = revealClipForStage(stage, readSunburstRarityOverride() || sfxRarityKey(instance, card));
  if (clip) sfx.play(clip, { reveal: true });
}

function finishWalkoutCard() {
  model.walkoutStage = WALKOUT_STAGES.length - 1;
  renderWalkoutStage();
  playRevealSound(WALKOUT_STAGES[model.walkoutStage]);
  model.packPhase = "complete-card";
  const isLast = model.currentCardIndex === model.currentPack.cards.length - 1;
  const doneLabel = model.currentPack.mode === "studio-debug" ? "חזרה לסטודיו" : "לאוסף";
  setPackAction(isLast ? doneLabel : "הקלף הבא", false, "");
  maybeShowNumberedTip();
}

function numberedTipTargets() {
  const nodes = [];
  const packActive = document.querySelector("#pack-view")?.classList.contains("active");
  const walkoutTag = packActive
    ? elements.ripStage?.querySelector(".walkout .card-numbered-tag")
    : null;
  if (walkoutTag) nodes.push(walkoutTag);
  if (elements.dialog?.open) {
    const dialogTag = elements.dialogCard?.querySelector(".card-numbered-tag");
    if (dialogTag) nodes.push(dialogTag);
    if (elements.dialogWhatsapp) nodes.push(elements.dialogWhatsapp);
    if (elements.dialogInstagram) nodes.push(elements.dialogInstagram);
  }
  return nodes;
}

function setNumberedTipTargets(on) {
  document.querySelectorAll(".numbered-tip-target").forEach((node) => {
    node.classList.remove("numbered-tip-target");
  });
  if (!on) return;
  for (const node of numberedTipTargets()) node.classList.add("numbered-tip-target");
}

function hideNumberedTip() {
  if (elements.numberedTip) elements.numberedTip.hidden = true;
  setNumberedTipTargets(false);
}

function maybeShowNumberedTip() {
  const tip = elements.numberedTip;
  if (!tip || model.showcase) {
    hideNumberedTip();
    return;
  }
  const instance = model.currentPack?.cards?.[model.currentCardIndex] || stampForCard(model.byId.get(model.dialogCardId));
  if (!instance?.numberedIndex) {
    hideNumberedTip();
    return;
  }
  if (readTipsPref() === "off" || readSeenPages().numbered) {
    hideNumberedTip();
    return;
  }
  tip.hidden = false;
  setNumberedTipTargets(true);
}

function startWalkout() {
  acknowledgeRevealedPack(model.currentPack);
  packTimers.forEach(clearTimeout);
  packTimers = [];
  resetPackRip();
  teardownWalkoutSunburst({ immediate: true });
  sfx.stopReveals();
  model.packPhase = "walkout";
  if (prefersReducedMotion()) {
    finishWalkoutCard();
    return;
  }
  model.walkoutStage = 0;
  renderWalkoutStage();
  const configured = readRevealDelays();
  const delays = [configured.quote, configured.party, configured.name];
  const nextStage = [1, 2, WALKOUT_STAGES.length - 1];
  let elapsed = 0;
  delays.forEach((delay, index) => {
    elapsed += delay;
    packTimers.push(setTimeout(() => {
      if (model.packPhase !== "walkout") return;
      model.walkoutStage = nextStage[index];
      renderWalkoutStage();
      if (model.walkoutStage === WALKOUT_STAGES.length - 1) finishWalkoutCard();
      else playRevealSound(WALKOUT_STAGES[model.walkoutStage]);
    }, elapsed));
  });
}

function applyCardStage(card, stage) {
  WALKOUT_STAGES.forEach((name) => card.classList.remove(`stage-${name}`));
  card.classList.add(`stage-${stage}`);
}

function startSharedWalkout(cardId, isGift = false) {
  const card = model.byId.get(cardId);
  model.currentPack = {
    packId: null,
    cards: [{
      cardId,
      finish: card.rarity.startsWith("Rare") ? "Rare" : card.rarity,
      isNew: false,
    }],
  };
  model.currentCardIndex = 0;
  model.previewMode = true;
  showView("pack");
  startWalkout();
  if (isGift) showToast("זו רק תצוגת החלפה. הבעלות לא השתנתה.");
}

function renderWalkoutStage() {
  const instance = model.currentPack.cards[model.currentCardIndex];
  const card = model.byId.get(instance.cardId);
  const stage = WALKOUT_STAGES[model.walkoutStage];
  elements.packStep.textContent = model.currentPack.mode === "studio-debug"
    ? STUDIO_DEBUG_LABEL
    : `קלף ${model.currentCardIndex + 1}`;
  elements.packCounter.textContent = `${model.currentCardIndex + 1} / ${model.currentPack.cards.length}`;
  elements.packHeading.textContent = {
    blank: "",
    quote: "",
    party: "",
    identity: "",
    portrait: instance.finish === "Promotion" ? "קלף אירוע" : "",
  }[stage];

  let walkoutCard = elements.ripStage.querySelector(".walkout .kalpi-card");
  if (!walkoutCard || elements.ripStage.dataset.cardId !== card.id) {
    elements.ripStage.dataset.cardId = card.id;
    elements.ripStage.innerHTML = `
      <div class="walkout" style="--walkout-pip:${card.pip}">
        <div class="walkout-content">
          ${cardMarkup(card, instance, { progressiveStage: "blank", surface: "walkout" })}
        </div>
      </div>`;
    walkoutCard = elements.ripStage.querySelector(".walkout .kalpi-card");
    fitVisibleCardText(elements.ripStage);
  }
  applyCardStage(walkoutCard, stage);
  syncWalkoutSunburst({
    walkout: elements.ripStage.querySelector(".walkout"),
    cardEl: walkoutCard,
    stage,
    rarityKey: resolveSunburstRarity(instance, card),
    pip: card.pip,
  });
  setPackAction("חושפים…", true, "");
}

function placeholderMark(card) {
  if (card.type === "Symbol") {
    const match = cardTitle(card).match(/[\u0590-\u05ff]+/);
    return match?.[0] ?? card.set;
  }
  if (card.type === "Platform") return "§";
  if (card.type === "Quote") return "“";
  if (card.set === "SYS") return card.id.slice(-2);
  return cardTitle(card).split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
}

function partyLetters(card) {
  if (card.letters) return card.letters;
  return {
    LIK: "מחל",
    RAM: "עם",
    DEM: "אמת",
    SYS: "SYS",
  }[card.set] ?? card.set;
}

function rarityMark(rarity) {
  const normalized = String(rarity).toLowerCase();
  if (normalized.includes("ממוספר") || normalized.includes("numbered")) return "★★★★";
  if (normalized.includes("promo") || normalized.includes("legendary") || normalized.includes("event")) return "P";
  if (normalized.includes("rare") || normalized.includes("holo")) return "★★★";
  if (normalized.includes("uncommon")) return "★★";
  return "★";
}

function rarityNameHe(rarity) {
  const normalized = String(rarity).toLowerCase();
  if (normalized.includes("ממוספר") || normalized.includes("numbered")) return "ממוספר";
  if (normalized.includes("promo")) return "קידום";
  if (normalized.includes("holo")) return "הולו";
  if (normalized.includes("rare")) return "נדיר";
  if (normalized.includes("uncommon")) return "לא נפוץ";
  return "נפוץ";
}

function artMarkup(card, mini = false, eager = false) {
  const className = mini ? "mini-art" : "card-art";
  const url = artUrl(card);
  if (url) {
    const load = eager ? 'fetchpriority="high"' : 'loading="lazy"';
    return `<img class="${className}" src="${url}" alt="" decoding="async" ${load} aria-label="איור של ${escapeHtml(cardTitle(card))}">`;
  }
  return `<div class="${className} placeholder" role="img" aria-label="איור זמני של ${escapeHtml(cardTitle(card))}" data-mark="${escapeHtml(placeholderMark(card))}"></div>`;
}

function prefetchBinderArt(cards = []) {
  const list = cards.filter((card) => artUrl(card));
  prefetchCardArt(list.slice(0, 12));
  const rest = list.slice(12);
  if (!rest.length) return;
  const run = () => prefetchCardArt(rest);
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 200);
}

const FILTER_SET_SHORT = {
  "party-leaders": "מנהיגים",
  "party-slot-2": "משנה",
  "set-5": "רגעים",
  "decisions": "החלטות",
  "records": "הישגים",
};

function openBinderReleaseIds() {
  const catalog = model.catalog || [];
  const hidden = new Set(["decisions", "records"]);
  return (model.gameConfig?.releaseSets || [])
    .map(({ id, runtimeState }) => ({ id, runtimeState }))
    .filter(({ id }) => isLiveReleaseSet(id) && !hidden.has(id))
    .filter(({ id }) => catalog.some((card) => card.releaseSetId === id && !card.eventOnly))
    .map(({ id }) => id);
}

function filterSetChip(set, label, count, active) {
  return `<button type="button" role="tab" aria-selected="${active}" tabindex="${active ? "0" : "-1"}" class="${active ? "active" : ""}" data-filter="${escapeHtml(set)}"><span class="filter-name">${escapeHtml(label)}</span><span class="filter-count">${count}</span></button>`;
}

function displayedCardQuote(card) {
  const text = String(card.walkout.text || "").trim();
  if (!text) return "";
  if (card.type !== "Quote") return text;
  const bare = text.replace(/^״|״$/g, "");
  const needsMarker = ["shortened", "attributed-paraphrase"].includes(card.walkout?.quoteStatus);
  const marked = needsMarker && !bare.endsWith("*") ? `${bare}*` : bare;
  return `״${marked}״`;
}

function formatTrustDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return value || "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("he-IL");
}

function quoteTrustLabel(card) {
  return {
    shortened: "* הציטוט קוצר; הנוסח וההקשר המלאים נמצאים במקור.",
    "attributed-paraphrase": "* ניסוח מיוחס או פרפרזה — לא תמלול מילה במילה.",
  }[card.walkout?.quoteStatus] || "";
}

function partyTrustLabel(card) {
  if (!card.set || card.set === "SYS" || String(card.set).startsWith("special-")) return "";
  const party = partyRegister().find(({ id }) => id === card.set);
  if (!party?.filingStatus && !party?.letterStatus) return "";
  const letters = (party.finalLetters || party.requestedLetters || []).join(" / ");
  const letterStatus = {
    protected: "אותיות מוגנות",
    requested: "אותיות מבוקשות",
    disputed: "אותיות במחלוקת",
  }[party.letterStatus] || "אותיות הרשימה";
  const filingStatus = party.finalLetters?.length
    ? "אותיות שאושרו במאגר"
    : party.filingStatus === "submitted-pending-cec-review"
      ? "הרשימה הוגשה; במאגר היא עדיין ממתינה לבדיקת ועדת הבחירות"
      : "סטטוס הרשימה עדיין לא אומת במאגר";
  const asOf = formatTrustDate(party.asOfDate);
  return [filingStatus, letters ? `${letterStatus}: ${letters}` : "", asOf ? `נכון ל־${asOf}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function partyStatusShort(party) {
  if (party?.finalLetters?.length) return "אותיות מאושרות במאגר";
  if (party?.filingStatus === "submitted-pending-cec-review") {
    const asOf = formatTrustDate(party.asOfDate);
    return `במאגר: הוגשה וממתינה לבדיקת ועדת הבחירות${asOf ? ` (${asOf})` : ""}`;
  }
  return "";
}

function cardTrustSummary(card) {
  return [quoteTrustLabel(card), partyTrustLabel(card)].filter(Boolean).join(" ");
}

function cardTrustReceipt(card) {
  const quoteStatus = {
    shortened: "ציטוט מקוצר*",
    "attributed-paraphrase": "ניסוח מיוחס*",
  }[card.walkout?.quoteStatus];
  const party = partyRegister().find(({ id }) => id === card.set);
  const filingStatus = partyStatusShort(party);
  return [quoteStatus, filingStatus].filter(Boolean);
}

function cardTrustLine(card) {
  const walkout = card.walkout || {};
  const contentClass = card.releaseTier === "critique"
    ? "פרשנות/ביקורת"
    : walkout.kind === "quote" ? "ציטוט" : "עובדתי";
  const releaseName = model.gameConfig?.releaseSets?.find(({ id }) => id === card.releaseSetId)?.nameHe;
  return [contentClass, ...cardTrustReceipt(card), releaseName, formatTrustDate(walkout.date)]
    .filter(Boolean)
    .join(" · ");
}

function configureSourceLink(link, card) {
  const sourceUrl = card.walkout?.sourceUrl;
  link.hidden = !sourceUrl;
  if (!sourceUrl) {
    link.removeAttribute("href");
    return;
  }
  link.href = sourceUrl;
  link.textContent = "למקור המצורף ↗";
  const sourceName = card.walkout?.sourceLabel ? `: ${card.walkout.sourceLabel}` : "";
  link.setAttribute("aria-label", `פתיחת המקור${sourceName} בחלון חדש`);
}

function cardPresentation(card, instance = {}) {
  const numbered = Number(instance.numberedIndex) > 0;
  const finishLabel = numbered ? "Holo" : (instance.finish ?? card.rarity);
  const rarityLabel = numbered ? "ממוספר" : finishLabel;
  const listSlot = Number(card?.listSlot);
  const slotLabel = Number.isInteger(listSlot) && listSlot > 0 ? `מקום ${listSlot}` : "";
  const membershipNote = String(card.membershipNote || "").trim();
  return {
    title: cardTitle(card),
    subtitle: [slotLabel || card.subtitleHe || card.subtitle || "", membershipNote].filter(Boolean).join(" · "),
    quote: displayedCardQuote(card),
    rawQuote: String(card.walkout?.text || "").trim(),
    code: cardCode(card),
    setName: cardSetName(card),
    typeLabel: card.typeHe || "קלף",
    finishLabel,
    finishClass: [
      String(finishLabel ?? "Common").split(/\s|\//)[0].toLowerCase(),
      numbered ? "numbered" : "",
      numbered && instance.holoStyle === "chroma" ? "holo-chroma" : "",
    ].filter(Boolean).join(" "),
    rarityMark: rarityMark(rarityLabel),
    rarityName: rarityNameHe(rarityLabel),
    listSlot: Number.isInteger(listSlot) && listSlot > 0 ? listSlot : null,
    trustLabel: cardTrustSummary(card),
    pip: card.pip,
    artKey: card.artKey || null,
  };
}

function ownedCountFor(card) {
  return model.serverState?.inventory?.[card.id] ?? 0;
}

function stampForCard(card) {
  const copies = model.serverState?.numberedCopies || [];
  const instances = model.serverState?.instances || [];
  return copies.find((item) => item.cardId === card?.id)
    || instances.find((item) => item.cardId === card?.id && item.numberedIndex)
    || null;
}

function catalogNumberedSets() {
  const configured = model.gameConfig?.progression?.numberedSets;
  return Array.isArray(configured) && configured.length ? configured : ["set-5"];
}

function isPossibleNumberedCard(card) {
  return Boolean(card && catalogNumberedSets().includes(card.releaseSetId) && !card.eventOnly);
}

function catalogNumberedInstance(card) {
  if (!isPossibleNumberedCard(card)) return {};
  const listSlot = Number(card?.listSlot);
  const of = Number.isInteger(listSlot) && listSlot > 0 ? listSlot : 1;
  return { numberedIndex: 1, numberedOf: of, finish: "Holo" };
}

function catalogCardMarkup(card, surface = "binder", numbered = false) {
  return cardMarkup(card, {
    finish: card.rarity,
    count: 1,
    ...(numbered ? catalogNumberedInstance(card) : {}),
  }, { progressiveStage: "portrait", surface });
}

function possibleNumberedCards() {
  return playerCatalog().filter(isPossibleNumberedCard);
}

function holderCountFor(card, numbered = false) {
  const bag = numbered ? model.cardHolders?.numberedHolders : model.cardHolders?.holders;
  return Number(bag?.[card?.id] || 0);
}

function printRunFor(card) {
  const slot = Number(card?.listSlot);
  return Number.isInteger(slot) && slot > 0 ? slot : 0;
}

function holderLine(count, numbered = false, card = null) {
  if (numbered) {
    const of = printRunFor(card);
    if (of > 0) return `${count}/${of} מחזיקים עותק ממוספר`;
    if (count <= 0) return "אף שחקן עדיין לא מחזיק עותק ממוספר";
    if (count === 1) return "שחקן אחד מחזיק עותק ממוספר";
    return `${count} שחקנים מחזיקים עותק ממוספר`;
  }
  if (count <= 0) return "אף שחקן עדיין לא מחזיק בקלף הזה";
  if (count === 1) return "שחקן אחד מחזיק בקלף הזה";
  return `${count} שחקנים מחזיקים בקלף הזה`;
}

async function hydrateCardHolders() {
  try {
    const warmed = window.__kalpiWarmup?.holders;
    if (window.__kalpiWarmup) window.__kalpiWarmup.holders = null;
    const payload = await (warmed || request("/api/card-holders"));
    if (!payload) return;
    model.cardHolders = {
      holders: payload.holders || {},
      numberedHolders: payload.numberedHolders || {},
    };
    model.cardHoldersReady = true;
    if (model.showcase) renderShowcaseBinder();
    else if (catalogReady()) renderBinder();
    if (elements.dialog?.open) renderDialogCard();
  } catch {
    /* Holder counts stay empty until the hourly snapshot arrives. */
  }
}

function renderShowcaseBinder() {
  const showcaseView = document.querySelector("#showcase-view");
  if (!elements.showcaseGrid) return;
  if (!catalogReady()) {
    if (elements.showcaseCount) elements.showcaseCount.textContent = "";
    if (elements.showcaseFilters) elements.showcaseFilters.innerHTML = "";
    elements.showcaseGrid.innerHTML = catalogFailed ? "" : renderPendingWells();
    setEmptyNote(elements.showcaseEmpty, pendingCopy("טוענים את האלבום…", "לא הצלחנו לטעון את האלבום."), {
      pending: !catalogFailed,
      failed: catalogFailed,
    });
    showcaseView?.setAttribute("aria-busy", catalogFailed ? "false" : "true");
    return;
  }
  const filterX = elements.showcaseFilters?.querySelector(".filter-sets")?.scrollLeft || 0;
  const gridY = elements.showcaseGrid.scrollTop || 0;
  showcaseView?.setAttribute("aria-busy", "false");
  const playerCards = playerCatalog();
  const releaseOrder = openBinderReleaseIds();
  const numberedCards = possibleNumberedCards();
  const setOrder = ["ALL", ...releaseOrder.map((id) => `RELEASE:${id}`)];
  if (numberedCards.length) setOrder.push("NUMBERED");
  const setLabels = {};
  for (const release of model.gameConfig?.releaseSets || []) {
    setLabels[`RELEASE:${release.id}`] = FILTER_SET_SHORT[release.id] || release.nameHe;
  }
  setLabels.ALL = "הכול";
  setLabels.NUMBERED = "ממוספרים";
  if (model.binderFilter === "FAVORITES") model.binderFilter = "ALL";
  if (model.binderFilter !== "ALL" && model.binderFilter !== "SPECIALS" && model.binderFilter !== "NUMBERED" && !model.binderFilter.startsWith("RELEASE:")) {
    model.binderParty = model.binderFilter;
    model.binderFilter = "ALL";
  }
  const partyOptions = [...new Map(
    playerCards.filter((card) => !card.eventOnly).map((card) => [card.set, cardSetName(card)]),
  )].sort((left, right) => left[1].localeCompare(right[1], "he"));
  if (model.binderParty && !partyOptions.some(([id]) => id === model.binderParty)) model.binderParty = "";
  if (elements.showcaseCount) {
    elements.showcaseCount.textContent = numberedCards.length
      ? `${playerCards.length} קלפים בסדרות הפתוחות · ${numberedCards.length} ממוספרים אפשריים`
      : `${playerCards.length} קלפים בסדרות הפתוחות`;
  }
  if (elements.showcaseFilters) {
    elements.showcaseFilters.innerHTML = [
      `<label class="filter-party${model.binderParty ? " active" : ""}">
        <span>מפלגה</span>
        <select data-showcase-party aria-label="סינון לפי מפלגה">
          <option value="">כל המפלגות</option>
          ${partyOptions.map(([id, name]) => {
            const count = playerCards.filter((card) => card.set === id).length;
            return `<option value="${escapeHtml(id)}"${model.binderParty === id ? " selected" : ""}>${escapeHtml(name)} · ${count}</option>`;
          }).join("")}
        </select>
      </label>`,
      `<div class="filter-sets" role="tablist" aria-label="סינון לפי סדרה">`,
      ...setOrder.map((set) => {
        const count = set === "ALL"
          ? playerCards.length
          : set === "NUMBERED"
            ? numberedCards.length
          : playerCards.filter((card) => card.releaseSetId === set.slice(8)).length;
        const active = model.binderFilter === set;
        return filterSetChip(set, setLabels[set] || set, count, active);
      }),
      `</div>`,
    ].join("");
  }

  const numberedView = model.binderFilter === "NUMBERED";
  const sourceCards = numberedView ? numberedCards : playerCards;
  const visible = sourceCards.filter((card) => {
    if (numberedView) return !model.binderParty || card.set === model.binderParty;
    const releaseOk = model.binderFilter === "ALL"
      || (model.binderFilter === "SPECIALS" ? card.eventOnly
        : model.binderFilter.startsWith("RELEASE:") && card.releaseSetId === model.binderFilter.slice(8));
    const partyOk = !model.binderParty || card.set === model.binderParty;
    return releaseOk && partyOk;
  });
  elements.showcaseGrid.innerHTML = visible.map((card) => `
      <div class="binder-slot owned new-card-thumb" role="listitem" style="--pip:${card.pip}">
        <button class="binder-card-open" type="button" data-card-id="${card.id}"${numberedView ? ' data-numbered="1"' : ""} aria-label="פתיחת ${escapeHtml(cardTitle(card))}">
          <div class="binder-shared-card">${catalogCardMarkup(card, "binder", numberedView)}</div>
        </button>
      </div>`).join("");
  setEmptyNote(elements.showcaseEmpty, "אין קלפים שמתאימים לסינון.", { hidden: visible.length > 0 });
  queueCardTextFit(elements.showcaseGrid);
  const nextStrip = elements.showcaseFilters?.querySelector(".filter-sets");
  if (nextStrip) nextStrip.scrollLeft = filterX;
  elements.showcaseGrid.scrollTop = gridY;
}

function displayCardMarkup(card, surface = "display") {
  const stamp = stampForCard(card);
  return cardMarkup(card, {
    finish: stamp?.finish || card.rarity,
    count: ownedCountFor(card),
    numberedIndex: stamp?.numberedIndex,
    numberedOf: stamp?.numberedOf,
  }, { progressiveStage: "portrait", surface });
}

function cardMarkup(card, instance = {}, { reveal = false, progressiveStage = null, surface = "full" } = {}) {
  const presentation = cardPresentation(card, instance);
  const stage = progressiveStage || "portrait";
  const progressive = `progressive-card stage-${stage}`;
  const copies = Number(instance.count ?? 0);
  const frame = cardDisplayFrame(card);
  return `
    <article class="kalpi-card ${presentation.finishClass} ${progressive} ${reveal ? "reveal" : ""}" data-card-surface="${escapeHtml(surface)}" data-card-frame="${escapeHtml(frame)}" style="--pip:${presentation.pip}" aria-label="קלף ${escapeHtml(presentation.title)}${instance.numberedIndex ? `. ממוספר ${instance.numberedIndex} מתוך ${instance.numberedOf}` : ""}${presentation.trustLabel ? `. ${escapeHtml(presentation.trustLabel)}` : ""}">
      <section class="card-face front">
        <span class="card-pip" aria-hidden="true"></span>
        <div class="card-image-zone">
          ${artMarkup(card, false, surface === "display" || surface === "walkout")}
          <div class="card-image-meta">
            <span class="card-code-tag">${escapeHtml(presentation.code)}</span>
            <span class="card-meta-mid"></span>
            <span class="card-meta-end">
              ${frame === "fullart-v1" ? "" : `<strong aria-label="${presentation.rarityName}">${presentation.rarityMark}</strong>`}
              ${instance.numberedIndex ? `<b class="card-numbered-tag" aria-label="ממוספר ${instance.numberedIndex} מתוך ${instance.numberedOf}">${instance.numberedIndex}/${instance.numberedOf}</b>` : ""}
              ${copies > 1 ? `<b class="card-copies-tag">×${copies}</b>` : ""}
              ${instance.isNew && !instance.numberedIndex ? '<b class="new-stamp">חדש</b>' : ""}
            </span>
          </div>
        </div>
        <div class="card-identity-stack">
          <h2 class="card-name-zone" data-fit-card-text="name" dir="rtl" lang="he">${escapeHtml(presentation.title)}</h2>
          <p class="card-party-zone" data-fit-card-text="party" dir="rtl" lang="he" style="--pip:${presentation.pip}">${escapeHtml(presentation.setName)}${card.type === "Quote" ? ` · ${escapeHtml(presentation.subtitle)}` : ""}</p>
          <p class="card-rarity-zone" dir="rtl" lang="he"><span class="card-rarity-run"><strong aria-hidden="true">${presentation.rarityMark}</strong> ${escapeHtml(presentation.rarityName)}</span></p>
          <blockquote class="card-quote-zone" data-fit-card-text="quote" dir="rtl" lang="he">${escapeHtml(presentation.quote)}</blockquote>
        </div>
      </section>
    </article>`;
}

function binderCardMarkup(card) {
  return `
    <div class="binder-shared-card">${displayCardMarkup(card, "binder")}</div>`;
}

function renderPendingWells(count = 6) {
  return Array.from({ length: count }, () =>
    `<div class="binder-slot is-loading" aria-hidden="true"><span class="missing-code">···</span></div>`
  ).join("");
}

async function openPublicBinder(slug) {
  const payload = await request(`/api/public-binder/${encodeURIComponent(slug)}`);
  model.guestBinder = payload;
  model.binderOwnedOnly = true;
  showView("binder");
  renderBinder();
}

function closePublicBinder() {
  model.guestBinder = null;
  const url = new URL(location.href);
  url.searchParams.delete("binder");
  if (/^\/share\/u\//.test(url.pathname)) url.pathname = "/";
  history.replaceState({}, "", url);
  renderBinder();
}

function binderInventory() {
  return model.guestBinder?.inventory || model.serverState?.inventory || {};
}

function copyMyBinderLink() {
  const slug = model.serverState?.binderSlug;
  const link = publicBinderShareUrl(slug);
  if (!link) {
    showToast("הקישור לאלבום עדיין לא מוכן.");
    return;
  }
  copyText(link).then((copied) => {
    showToast(copied ? "קישור האלבום הועתק." : "העתיקו את הקישור מהשדה.");
  });
}

function packBinderBadges() {
  const list = elements.earnedBadgeList;
  const host = list?.querySelector(".binder-badge-medals");
  if (!list || !host) return;
  const medals = [...host.querySelectorAll(".badge-medallion")];
  const overflow = host.querySelector(".badge-overflow");
  medals.forEach((medal) => { medal.hidden = false; });
  if (overflow) {
    overflow.hidden = true;
    overflow.textContent = "+";
  }
  if (!medals.length || host.clientWidth < 8) return;

  const gap = Number.parseFloat(getComputedStyle(host).columnGap || getComputedStyle(host).gap) || 8;
  const available = host.clientWidth;
  const medalWidth = (index) => medals[index].getBoundingClientRect().width;
  const widthFor = (count, includeOverflow) => {
    let width = 0;
    for (let index = 0; index < count; index += 1) {
      width += medalWidth(index) + (index ? gap : 0);
    }
    if (includeOverflow && overflow) {
      overflow.hidden = false;
      overflow.textContent = `+${Math.max(1, medals.length - count)}`;
      width += (count ? gap : 0) + overflow.getBoundingClientRect().width;
    }
    return width;
  };

  if (widthFor(medals.length, false) <= available + 0.5) {
    if (overflow) overflow.hidden = true;
    return;
  }

  let shown = 0;
  for (let count = medals.length - 1; count >= 0; count -= 1) {
    if (widthFor(count, true) <= available + 0.5) {
      shown = count;
      break;
    }
  }
  medals.forEach((medal, index) => { medal.hidden = index >= shown; });
  const rest = medals.length - shown;
  if (overflow) {
    overflow.hidden = rest <= 0;
    overflow.textContent = rest > 0 ? `+${rest}` : "+";
    if (rest > 0) overflow.setAttribute("aria-label", `עוד ${rest} הישגים`);
    else overflow.removeAttribute("aria-label");
  }
}

const binderBadgeObserver = typeof ResizeObserver === "undefined"
  ? null
  : new ResizeObserver(() => packBinderBadges());

function queueBinderBadgePack() {
  requestAnimationFrame(() => {
    packBinderBadges();
    const list = elements.earnedBadgeList;
    if (list && binderBadgeObserver) binderBadgeObserver.observe(list);
  });
}

function renderBinder() {
  const binderView = document.querySelector("#binder-view");
  if (!catalogReady()) {
    if (model.serverState?.totalCards) {
      const { owned, total, percent } = completion();
      elements.binderPercent.textContent = `${percent}%`;
      elements.binderCount.textContent = `${owned} מתוך ${total} בסדרה הפעילה`;
    } else {
      elements.binderPercent.textContent = "…";
      elements.binderCount.textContent = "טוענים את הסדרה";
    }
    elements.binderFilters.innerHTML = "";
    elements.binderPager.innerHTML = "";
    elements.binderGrid.innerHTML = catalogFailed ? "" : renderPendingWells();
    setEmptyNote(elements.binderEmpty, pendingCopy("טוענים את האלבום…", "לא הצלחנו לטעון את האלבום."), {
      pending: !catalogFailed,
      failed: catalogFailed,
    });
    binderView?.setAttribute("aria-busy", catalogFailed ? "false" : "true");
    return;
  }
  const filterX = elements.binderFilters?.querySelector(".filter-sets")?.scrollLeft || 0;
  const gridY = elements.binderGrid?.scrollTop || 0;
  const waitingOwnership = !ownershipReady();
  binderView?.setAttribute("aria-busy", waitingOwnership ? "true" : "false");
  const inventory = binderInventory();
  const guest = Boolean(model.guestBinder);
  if (elements.binderEyebrow) {
    elements.binderEyebrow.textContent = guest ? `האוסף של ${model.guestBinder.displayName}` : "האוסף שלי";
  }
  if (elements.guestBinderBanner) elements.guestBinderBanner.hidden = !guest;
  if (elements.guestBinderLabel) {
    elements.guestBinderLabel.textContent = guest ? `האלבום של ${model.guestBinder.displayName}` : "";
  }
  if (elements.shareMyBinder) elements.shareMyBinder.hidden = guest;
  const { owned, total, percent } = guest
    ? (() => {
      const guestOwned = Object.keys(inventory).length;
      const guestTotal = playerCatalog().length || guestOwned;
      return {
        owned: guestOwned,
        total: guestTotal,
        percent: guestTotal ? Math.round((guestOwned / guestTotal) * 100) : 0,
      };
    })()
    : completion();
  elements.binderPercent.textContent = `${percent}%`;
  elements.binderPercent.title = `${owned} קלפים שונים מתוך ${total} בסדרה הפעילה כרגע`;
  elements.binderCount.textContent = `${owned} מתוך ${total} בסדרה הפעילה`;
  setEmptyNote(
    elements.binderEmpty,
    waitingOwnership ? "טוענים את האוסף…" : "פתחו קלף כדי להתחיל.",
    { pending: waitingOwnership, hidden: !waitingOwnership && owned > 0 },
  );

  const playerCards = playerCatalog();
  const releaseOrder = openBinderReleaseIds();
  const numberedIds = new Set(((guest ? model.guestBinder?.numberedCopies : null)
    || model.serverState?.numberedCopies
    || model.serverState?.instances
    || [])
    .filter((item) => item.numberedIndex)
    .map((item) => item.cardId));
  const setOrder = ["ALL", ...releaseOrder.map((id) => `RELEASE:${id}`)];
  if (numberedIds.size) setOrder.push("NUMBERED");
  if (model.binderFilter.startsWith("RELEASE:") && !releaseOrder.includes(model.binderFilter.slice(8))) {
    model.binderFilter = "ALL";
  }
  const setLabels = {};
  for (const release of model.gameConfig?.releaseSets || []) {
    setLabels[`RELEASE:${release.id}`] = FILTER_SET_SHORT[release.id] || release.nameHe;
  }
  setLabels.ALL = "הכול";
  setLabels.SPECIALS = "מיוחדים";
  setLabels.NUMBERED = "ממוספרים";
  if (model.binderFilter === "FAVORITES") model.binderFilter = "ALL";
  if (model.binderFilter !== "ALL" && model.binderFilter !== "SPECIALS" && model.binderFilter !== "NUMBERED" && !model.binderFilter.startsWith("RELEASE:")) {
    model.binderParty = model.binderFilter;
    model.binderFilter = "ALL";
  }
  const partyOptions = [...new Map(
    playerCards.filter((card) => !card.eventOnly).map((card) => [card.set, cardSetName(card)]),
  )].sort((left, right) => left[1].localeCompare(right[1], "he"));
  if (model.binderParty && !partyOptions.some(([id]) => id === model.binderParty)) model.binderParty = "";
  elements.binderFilters.innerHTML = [
    `<label class="filter-party${model.binderParty ? " active" : ""}">
      <span>מפלגה</span>
      <select data-binder-party aria-label="סינון לפי מפלגה">
        <option value="">כל המפלגות</option>
        ${partyOptions.map(([id, name]) => {
          const count = playerCards.filter((card) => card.set === id && inventory[card.id]).length;
          return `<option value="${escapeHtml(id)}"${model.binderParty === id ? " selected" : ""}>${escapeHtml(name)} · ${count}</option>`;
        }).join("")}
      </select>
    </label>`,
    `<label class="filter-owned${(guest || model.binderOwnedOnly) ? " active" : ""}">
      <input type="checkbox" data-binder-owned ${guest || model.binderOwnedOnly ? "checked" : ""} ${guest ? "disabled" : ""} />
      באוסף
    </label>`,
    `<div class="filter-sets" role="tablist" aria-label="סינון לפי סדרה">`,
    ...setOrder.map((set) => {
      const count = set === "ALL"
        ? owned
        : set === "NUMBERED"
          ? numberedIds.size
        : playerCards.filter((card) => card.releaseSetId === set.slice(8) && inventory[card.id]).length;
      const active = model.binderFilter === set;
      return filterSetChip(set, setLabels[set] || set, count, active);
    }),
    `</div>`,
  ].join("");

  const visible = playerCards.filter((card) => {
    const releaseOk = model.binderFilter === "ALL"
      || (model.binderFilter === "SPECIALS" ? card.eventOnly
        : model.binderFilter === "NUMBERED" ? numberedIds.has(card.id)
        : model.binderFilter.startsWith("RELEASE:") && card.releaseSetId === model.binderFilter.slice(8));
    const partyOk = !model.binderParty || card.set === model.binderParty;
    const ownedOk = !(guest || model.binderOwnedOnly) || Boolean(inventory[card.id]);
    return releaseOk && partyOk && ownedOk;
  });
  elements.binderGrid.innerHTML = visible.map((card) => {
    const count = inventory[card.id] ?? 0;
    if (!count || (model.binderFilter === "NUMBERED" && !numberedIds.has(card.id))) {
      if (guest || model.binderFilter === "NUMBERED") return "";
      return `<div class="binder-slot" role="listitem" aria-label="${escapeHtml(`${cardTitle(card)} · ${cardCode(card)} · חסר באוסף`)}">
        <span class="missing-code">${escapeHtml(cardCode(card))}</span>
        ${!guest && model.studioContent?.studioEnabled ? `<button class="debug-unlock-card" type="button" data-debug-unlock="${card.id}">פתיחה</button>` : ""}
      </div>`;
    }
    return `
      <div class="binder-slot owned new-card-thumb" role="listitem" style="--pip:${card.pip}">
        <button class="binder-card-open" type="button" data-card-id="${card.id}" aria-label="פתיחת ${escapeHtml(cardTitle(card))}, ברשותכם ${count}">
          ${binderCardMarkup(card)}
        </button>
      </div>`;
  }).join("");
  const visibleColumns = window.innerWidth <= 520 ? 3 : window.innerWidth <= 760 ? 5 : 6;
  elements.binderPager.innerHTML = visible.length > visibleColumns
    ? '<span class="binder-scroll-hint">יש עוד קלפים למטה ↓</span>'
    : "";

  // Only some medals fit: hard first, then medium, then simple; newest first within a tier.
  const earned = binderBadgeOrder(visibleEarnedBadges());
  const starExplanation = "כוכבי אוסף · נפוץ = 1 · לא נפוץ = 2 · נדיר = 3 · מיוחד = 5";
  const starCount = localStarCount();
  const starCounter = `<span class="collection-star-count" tabindex="0" title="${starExplanation}" data-tooltip="${starExplanation}" aria-label="${starCount} כוכבי אוסף. ${starExplanation}"><b aria-hidden="true">★</b><strong>${starCount}</strong></span>`;
  const rail = elements.earnedBadgeList || elements.earnedBadgeRail;
  const medals = earned.map((badge) => {
    const copy = hebrewBadge(badge);
    return `<span class="badge-medallion" tabindex="0" aria-label="${escapeHtml(`${copy.name}: ${copy.description}`)}" data-tooltip="${escapeHtml(`${copy.name} · ${copy.description}`)}">${badgeArtwork(badge.id, { tier: achievementTier(badge) })}</span>`;
  }).join("");
  rail.innerHTML = `<div class="binder-badge-medals">${medals}<button class="badge-overflow" type="button" hidden data-open-achievements>+</button></div>${starCounter}`;
  queueBinderBadgePack();
  queueCardTextFit(elements.binderGrid);
  const nextStrip = elements.binderFilters?.querySelector(".filter-sets");
  if (nextStrip) nextStrip.scrollLeft = filterX;
  if (elements.binderGrid) elements.binderGrid.scrollTop = gridY;
  syncBinderScrollCue();
}

// The "more cards" cue sits in its own row under the grid; hide its text once the last row is in view.
function syncBinderScrollCue() {
  const grid = elements.binderGrid;
  if (!grid) return;
  const atEnd = grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 4;
  document.querySelector("#binder-view")?.classList.toggle("binder-at-end", atEnd);
}

let badgeArtworkSeq = 0;
const BADGE_SHEEN_KEY = "klafi:badge-sheen";
let badgeSheenShown = null;

function takeBadgeSheen(id) {
  if (!badgeSheenShown) {
    try { badgeSheenShown = new Set(JSON.parse(localStorage.getItem(BADGE_SHEEN_KEY) || "[]")); } catch { badgeSheenShown = new Set(); }
  }
  if (badgeSheenShown.has(id)) return false;
  badgeSheenShown.add(id);
  try { localStorage.setItem(BADGE_SHEEN_KEY, JSON.stringify([...badgeSheenShown])); } catch { /* private mode */ }
  return true;
}

/** Tier mark on every badge: simple 1 star, medium 2, hard 3. */
function badgeTierStarCount(tier) {
  return tier === "hard" ? 3 : tier === "medium" ? 2 : 1;
}

/** Small star row in the shield peak, in the tier's finish, leaving the badge icon alone. */
function badgeTierStarRow(tier, { style, foilKey } = {}) {
  const count = badgeTierStarCount(tier);
  const star = "M0-2.85.86-.86 3.05-.86 1.28.4 1.85 2.55 0 1.44-1.85 2.55-1.28.4-3.05-.86L-.86-.86Z";
  const gap = 6.6;
  const start = 24 - ((count - 1) * gap) / 2;
  const foil = style === "hard" ? ` style="fill:url(#${foilKey}-foil)"` : "";
  return `<g class="badge-tier-stars" data-tier-stars="${count}">${
    Array.from({ length: count }, (_, index) =>
      `<g class="badge-tier-star-wrap" transform="translate(${start + index * gap} 9.1)">
        <circle class="badge-tier-star-back" r="3.15"/>
        <path class="badge-tier-star" d="${star}"${foil}/>
      </g>`
    ).join("")
  }</g>`;
}

/**
 * Badge art by tier. simple: ink (the original look). medium: gold rim, gold ribbon, seal dot.
 * hard: holo foil field with a one-time diagonal sheen (static under reduced motion). Unearned
 * hard badges are a grey outline only (no foil); unearned ink/gold ones are dimmed.
 * Every badge keeps its own icon and adds a 1/2/3 star row for the tier.
 * The sheen plays once per badge per device (see takeBadgeSheen), not on every re-render.
 */
function badgeArtwork(id, { tier = "simple", earned = true, sheen = false } = {}) {
  const icon = {
    "first-rip": '<path d="M16 20h16v14H16zM16 24l8-5 8 5M24 19v15"/><path d="M20 16l2-4 2 4 2-4 2 4"/>',
    "register-five": '<rect x="15" y="18" width="13" height="17" rx="1"/><path d="M19 15h13v17M23 12h12v17"/>',
    "source-check": '<circle cx="22" cy="23" r="7"/><path d="M27 28l6 6M19 23l2 2 4-5"/>',
    "share-pull": '<circle cx="17" cy="25" r="2.5"/><circle cx="31" cy="18" r="2.5"/><circle cx="31" cy="32" r="2.5"/><path d="M19.5 24l9-4.5M19.5 26l9 4.5"/>',
    "commons-complete": '<path d="M15 22h18l-2 13H17zM13 22h22M19 16h10l3 6H16z"/><path d="M21 19h6"/>',
    "set-chase": '<path d="M24 13l3.2 6.3 7 .9-5.1 4.8 1.3 6.9-6.4-3.3-6.4 3.3 1.3-6.9-5.1-4.8 7-.9z"/>',
    "trade-match": '<rect x="13" y="17" width="11" height="15" rx="1"/><rect x="24" y="20" width="11" height="15" rx="1"/><path d="M17 14h11l-2-2M31 38H20l2 2"/>',
    "collector-ten": '<path d="M17 17h14v18H17zM20 14h14v18M14 20h14v18"/>',
    "event-first": '<path d="M16 18h16v17H16zM20 14v8M28 14v8M16 24h16"/><path d="M21 29h6"/>',
    "source-three": '<circle cx="20" cy="23" r="6"/><path d="M24 28l7 7M29 17h5M31.5 14.5v5"/>',
    "trade-three": '<path d="M14 20h17l-3-3M34 31H17l3 3"/><circle cx="17" cy="27" r="3"/><circle cx="31" cy="24" r="3"/>',
    "three-parties": '<circle cx="24" cy="16" r="3"/><circle cx="16" cy="31" r="3"/><circle cx="32" cy="31" r="3"/><path d="M22 19l-4 9M26 19l4 9M19 31h10"/>',
    "twenty-stars": '<path d="M24 13l3.2 6.5 7.2 1-5.2 5.1 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5.1 7.2-1z"/>',
    "idle-eight": '<path d="M16 18h16v16H16zM20 14h16v16M24 22h8M24 26h8"/>',
    "first-double": '<rect x="14" y="18" width="12" height="16" rx="1"/><rect x="22" y="14" width="12" height="16" rx="1"/>',
    "five-leaders": '<circle cx="16" cy="20" r="2.4"/><circle cx="24" cy="16" r="2.4"/><circle cx="32" cy="20" r="2.4"/><circle cx="19" cy="30" r="2.4"/><circle cx="29" cy="30" r="2.4"/>',
    "event-three": '<path d="M16 17h16v16H16zM20 14v6M28 14v6M16 23h16"/><path d="M20 28h8"/>',
    "share-three": '<circle cx="16" cy="24" r="2.2"/><circle cx="32" cy="16" r="2.2"/><circle cx="32" cy="32" r="2.2"/><path d="M18 23l12-6M18 25l12 6"/>',
    "rank-three": '<path d="M15 32h18l-3-16H18zM18 16h12l-2-4H20z"/>',
    "fifty-stars": '<path d="M18 16l2 4 4 .6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4-.6zM30 22l1.6 3.2 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"/>',
    "binder-half": '<path d="M14 16h20v22H14zM24 16v22M17 21h5M17 26h5M26 21h5M26 26h5"/>',
    "faction-pick": '<path d="M18 35V13M18 14h13l-3 4.5 3 4.5H18"/>',
    "own-name": '<circle cx="21" cy="19" r="4"/><path d="M13.5 33c.8-4.6 3.6-7 7.5-7 1.8 0 3.3.5 4.6 1.4M27 34l6.5-6.5 2 2L29 36h-2z"/>',
    "streak-seven": '<rect x="15" y="16" width="18" height="17" rx="1.5"/><path d="M15 21h18M19 13.5v5M29 13.5v5M20 25h8l-4.5 6"/>',
    "league-member": '<circle cx="19" cy="19" r="3"/><circle cx="29" cy="19" r="3"/><path d="M13 32c.7-4 3-6 6-6s5.3 2 6 6M23 32c.7-4 3-6 6-6s5.3 2 6 6"/>',
    "rare-three": '<path d="M17.5 17h13l4.5 6-11 12-11-12z"/><path d="M13 23h22M21 17l-2 6 5 12 5-12-2-6"/>',
    "numbered-first": '<path d="M21.5 14l-3 20M30 14l-3 20M15.5 20.5h18M14.5 27.5h18"/>',
    "streak-thirty": '<path d="M24 12.5c1.2 4.2 6.5 6.4 6.5 12.5a6.5 6.5 0 0 1-13 0c0-3.2 1.8-5.4 3.2-7.4.8 2 1.9 3.2 3.3 3.5-1.2-3-.9-5.9 0-8.6z"/>',
    "ten-copies": '<rect x="13" y="19" width="11" height="15" rx="1"/><rect x="18.5" y="16.5" width="11" height="15" rx="1"/><rect x="24" y="14" width="11" height="15" rx="1"/><path d="M27 19v6M30 19h2.5v6H30z"/>',
  }[id] || (String(id).startsWith("set-complete:")
    ? '<rect x="14" y="17" width="12" height="16" rx="1"/><rect x="20" y="14" width="12" height="16" rx="1"/><path d="M23.5 22.5l2.5 2.5 4.5-5"/>'
    : '<circle cx="24" cy="24" r="5"/>');
  const style = tier === "hard" && !earned ? "unearned" : tier;
  const key = `b${badgeArtworkSeq += 1}`;
  const shell = "M24 3 41 10v15c0 11-7 18-17 23C14 43 7 36 7 25V10z";
  const foil = style === "hard"
    ? `<defs>
      <linearGradient id="${key}-foil" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f4e7b8"/><stop offset=".3" stop-color="#b9d9d2"/>
        <stop offset=".55" stop-color="#d9c2e8"/><stop offset=".8" stop-color="#f1d59a"/><stop offset="1" stop-color="#a8cfe0"/>
      </linearGradient>
      <clipPath id="${key}-clip"><path d="${shell}"/></clipPath>
    </defs>`
    : "";
  const field = style === "hard"
    ? `<circle class="badge-field" cx="24" cy="24" r="14" style="fill:url(#${key}-foil)"/>`
    : '<circle class="badge-field" cx="24" cy="24" r="14"/>';
  const extra = style === "medium"
    ? '<circle class="badge-seal-dot" cx="24" cy="42.5" r="2.2"/>'
    : style === "hard" && sheen
      ? `<g clip-path="url(#${key}-clip)"><rect class="badge-sheen" x="-18" y="-6" width="12" height="68"/></g>`
      : "";
  return `<svg class="badge-artwork badge-tier-${style}" viewBox="0 0 48 56" aria-hidden="true">${foil}
    <path class="badge-ribbon" d="M15 39v14l9-5 9 5V39"/>
    <path class="badge-shell" d="${shell}"/>
    ${field}
    <g class="badge-icon">${icon}</g>${extra}
    ${badgeTierStarRow(tier, { style, foilKey: key })}
  </svg>`;
}

const ACHIEVEMENT_RULES = [
  ["idlePulls", "איסוף אוטומטי"],
  ["unique", "קלפים שונים"],
  ["sources", "מקורות"],
  ["shares", "שיתופים"],
  ["leaders", "מנהיגים"],
  ["bestSet", "סדרה מלאה"],
  ["trades", "החלפות"],
  ["events", "אירועים"],
  ["leaderParties", "סיעות מנהיגים"],
  ["stars", "כוכבים"],
  ["duplicate", "עותק כפול"],
  ["rank", "רמה"],
  ["binderHalf", "חצי אלבום"],
  ["streak", "רצף ימים (הכי ארוך)"],
  ["faction", "בחירת מפלגה"],
  ["profile", "שם או אווטאר משלי"],
  ["rare", "קלפים נדירים"],
  ["numbered", "קלפים ממוספרים"],
  ["league", "חבר בליגה"],
  ["setComplete", "סדרה מלאה (תג לכל סדרה)"],
];

function achievementEditorMarkup(badge = {}) {
  const id = badge.id || `badge-${Date.now().toString(36)}`;
  const rule = badge.rule || "unique";
  return `
      <fieldset data-achievement-id="${escapeHtml(id)}">
        <legend>${escapeHtml(id)}</legend>
        <label>מזהה <input data-ach-field="id" value="${escapeHtml(id)}" /></label>
        <label>שם <input data-ach-field="nameHe" value="${escapeHtml(badge.nameHe || badge.name || "")}" /></label>
        <label>תיאור <input data-ach-field="descriptionHe" value="${escapeHtml(badge.descriptionHe || badge.description || "")}" /></label>
        <label>כלל
          <select data-ach-field="rule">
            ${ACHIEVEMENT_RULES.map(([value, label]) => `<option value="${value}"${rule === value ? " selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>יעד <input data-ach-field="target" type="number" min="0" max="200" value="${badge.target ?? 1}" /></label>
        <label>עמוד
          <select data-ach-field="tier">
            ${ACHIEVEMENT_TIER_ORDER.map((tier) => `<option value="${tier}"${achievementTier(badge) === tier ? " selected" : ""}>${ACHIEVEMENT_TIER_LABELS[tier]}</option>`).join("")}
          </select>
        </label>
      </fieldset>`;
}

function populateStudioMeta() {
  if (elements.studioAchievements) {
    const badges = model.gameConfig.achievements || model.serverState?.achievements || [];
    elements.studioAchievements.innerHTML = badges.map((badge) => `
      ${achievementEditorMarkup(badge)}`).join("");
  }
  if (elements.studioEvents) {
    elements.studioEvents.innerHTML = (model.events || []).map((event) => `
      <fieldset data-event-id="${escapeHtml(event.id)}">
        <legend>${escapeHtml(event.id)}</legend>
        <label>שם <input data-event-field="nameHe" value="${escapeHtml(event.nameHe || "")}" /></label>
        <label>תיאור <input data-event-field="descriptionHe" value="${escapeHtml(event.descriptionHe || "")}" /></label>
        <label>סטטוס
          <select data-event-field="status">
            ${["active", "scheduled", "blocked"].map((status) => `<option value="${status}"${event.status === status || (status === "active" && event.active) ? " selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <label>פתיחה <input data-event-field="opensAt" value="${escapeHtml(event.opensAt || "")}" /></label>
        <label>סגירה <input data-event-field="closesAt" value="${escapeHtml(event.closesAt || "")}" /></label>
        <input type="hidden" data-event-field="cardIds" value="${escapeHtml((event.cardIds || event.cards?.map(({ id }) => id) || []).join(","))}" />
      </fieldset>`).join("");
  }
}

async function saveStudioAchievements() {
  const achievements = [...elements.studioAchievements.querySelectorAll("[data-achievement-id]")].map((row) => ({
    id: (row.querySelector('[data-ach-field="id"]')?.value || row.dataset.achievementId).trim(),
    nameHe: row.querySelector('[data-ach-field="nameHe"]').value.trim(),
    descriptionHe: row.querySelector('[data-ach-field="descriptionHe"]').value.trim(),
    rule: row.querySelector('[data-ach-field="rule"]').value,
    target: Number(row.querySelector('[data-ach-field="target"]').value) || 0,
    tier: row.querySelector('[data-ach-field="tier"]')?.value || "simple",
  }));
  try {
    const saved = await request("/api/studio/achievements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ achievements }),
    });
    model.gameConfig.achievements = saved.achievements;
    setServerState(await request("/api/state"));
    renderAchievements();
    showToast("Achievements published.");
  } catch (error) {
    showToast(error.status === 404 ? "Achievement editing is debug-only." : "Could not save achievements.");
  }
}

async function saveStudioEvents() {
  const events = [...elements.studioEvents.querySelectorAll("[data-event-id]")].map((row) => ({
    id: row.dataset.eventId,
    nameHe: row.querySelector('[data-event-field="nameHe"]').value.trim(),
    descriptionHe: row.querySelector('[data-event-field="descriptionHe"]').value.trim(),
    status: row.querySelector('[data-event-field="status"]').value,
    opensAt: row.querySelector('[data-event-field="opensAt"]').value.trim(),
    closesAt: row.querySelector('[data-event-field="closesAt"]').value.trim(),
    cardIds: row.querySelector('[data-event-field="cardIds"]').value.split(",").map((id) => id.trim()).filter(Boolean),
  }));
  try {
    await request("/api/studio/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
    });
    model.events = (await request("/api/events")).events;
    populateStudioMeta();
    renderEvents();
    renderTodayDocket();
    showToast("Events published.");
  } catch (error) {
    showToast(error.status === 404 ? "Event editing is debug-only." : "Could not save events.");
  }
}

const BADGE_COPY = {
  "first-rip": ["חשיפה ראשונה", "חשפו קלף שנאסף במחסן."],
  "register-five": ["חמישה באוסף", "אספו חמישה קלפים שונים."],
  "source-check": ["בדקתי מקור", "פתחו את המקור של אחד מהקלפים."],
  "share-pull": ["העברתי הלאה", "שתפו קלף אחד."],
  "commons-complete": ["כל המנהיגים", "אספו את מנהיגי כל המפלגות."],
  "set-chase": ["סדרה מלאה", "השלימו סדרה של מפלגה."],
  "trade-match": ["החלפה ראשונה", "השלימו החלפה עם שחקן אחר."],
  "collector-ten": ["עשרה שונים", "אספו עשרה קלפים שונים."],
  "event-first": ["מהדורה מוגבלת", "אספו קלף מאירוע."],
  "source-three": ["קורא מקורות", "פתחו מקורות של שלושה קלפים."],
  "trade-three": ["שולחן החלפות", "השלימו שלוש החלפות."],
  "three-parties": ["רוחב המפה", "אספו מנהיגים משלוש מפלגות."],
  "twenty-stars": ["עשרים כוכבים", "הגיעו לעשרים כוכבי אוסף."],
  "idle-eight": ["מחסן מלא", "אספו שמונה קלפים מהמחסן האוטומטי."],
  "first-double": ["עותק כפול", "קבלו עותק שני של אותו קלף."],
  "five-leaders": ["חמש סיעות", "אספו מנהיגים מחמש מפלגות."],
  "event-three": ["שלושה אירועים", "אספו שלושה קלפי אירוע."],
  "share-three": ["שלושה שיתופים", "שתפו שלושה קלפים."],
  "rank-three": ["מצביע מעורב", "הגיעו לרמה 3."],
  "fifty-stars": ["חמישים כוכבים", "הגיעו לחמישים כוכבי אוסף."],
  "binder-half": ["חצי האלבום", "השלימו חצי מהסדרה הפעילה."],
  "faction-pick": ["בחרתי צד", "בחרו מפלגה."],
  "own-name": ["שם משלי", "בחרו שם או אווטאר משלכם."],
  "streak-seven": ["שבוע רצוף", "פתחו קלפים שבעה ימים ברצף."],
  "league-member": ["חבר בליגה", "היו בליגה עם עוד שחקן לפחות."],
  "rare-three": ["שלושה נדירים", "אספו שלושה קלפים נדירים שונים."],
  "ten-copies": ["עשרה עותקים", "אספו עשרה עותקים של אותו קלף."],
  "numbered-first": ["ממוספר", "אספו קלף הולו ממוספר."],
  "streak-thirty": ["חודש רצוף", "פתחו קלפים שלושים ימים ברצף."],
};

const ACHIEVEMENT_TIER_LABELS = Object.freeze({ simple: "הקלים", medium: "הבינוניים", hard: "הקשים" });
const ACHIEVEMENT_TIER_ORDER = Object.freeze(["simple", "medium", "hard"]);

function achievementTier(badge) {
  return ACHIEVEMENT_TIER_ORDER.includes(badge?.tier) ? badge.tier : "simple";
}

function hebrewBadge(badge) {
  if (badge?.setId) {
    // One badge per pullable set (server-expanded); the short set name matches the Binder chips.
    const short = FILTER_SET_SHORT[badge.setId];
    return { name: short ? `סדרת ${short} מלאה` : badge.name, description: badge.description };
  }
  const copy = BADGE_COPY[badge.id];
  return { name: copy?.[0] || badge.name, description: copy?.[1] || badge.description };
}

function localAchievementMeasures() {
  const inventory = model.serverState?.inventory || {};
  const ownedIds = Object.keys(inventory);
  const unique = ownedIds.length;
  const cards = playerCatalog();
  const leaders = cards.filter((card) => card.releaseSetId === "party-leaders" && inventory[card.id]);
  const partySets = [...new Map(cards.filter((card) => card.set !== "SYS").map((card) => [card.set, cards.filter((item) => item.set === card.set)]))];
  const bestSet = partySets
    .map(([, group]) => {
      const owned = group.filter((card) => inventory[card.id]).length;
      return { owned, total: group.length || 1 };
    })
    .sort((left, right) => (right.owned / right.total) - (left.owned / left.total))[0];
  return {
    idlePulls: model.serverState?.idlePullCount || unique,
    unique,
    sources: model.activity?.counts?.source_opened ?? 0,
    shares: model.activity?.counts?.share_created ?? 0,
    leaders: leaders.length,
    leadersTotal: cards.filter((card) => card.releaseSetId === "party-leaders").length || 1,
    bestSetOwned: bestSet?.owned ?? 0,
    bestSetTotal: bestSet?.total ?? 1,
    trades: model.serverState?.tradeCount || 0,
    events: 0,
    leaderParties: new Set(leaders.map((card) => card.set)).size,
    stars: model.serverState?.starCount || unique,
    duplicate: Math.max(0, ...Object.values(inventory).map(Number), 0),
    rank: model.serverState?.progression?.level || 1,
    binderHalf: unique,
    binderHalfTarget: Math.max(1, Math.ceil((model.serverState?.totalCards || cards.length || 1) / 2)),
  };
}

function localAchievementList() {
  const measures = localAchievementMeasures();
  const rules = {
    "first-rip": "idlePulls",
    "register-five": "unique",
    "source-check": "sources",
    "share-pull": "shares",
    "commons-complete": "leaders",
    "set-chase": "bestSet",
    "trade-match": "trades",
    "collector-ten": "unique",
    "event-first": "events",
    "source-three": "sources",
    "trade-three": "trades",
    "three-parties": "leaderParties",
    "twenty-stars": "stars",
    "idle-eight": "idlePulls",
    "first-double": "duplicate",
    "five-leaders": "leaderParties",
    "event-three": "events",
    "share-three": "shares",
    "rank-three": "rank",
    "fifty-stars": "stars",
    "binder-half": "binderHalf",
  };
  const targets = {
    "register-five": 5,
    "collector-ten": 10,
    "source-three": 3,
    "trade-three": 3,
    "three-parties": 3,
    "twenty-stars": 20,
    "idle-eight": 8,
    "first-double": 2,
    "five-leaders": 5,
    "event-three": 3,
    "share-three": 3,
    "rank-three": 3,
    "fifty-stars": 50,
  };
  const source = model.gameConfig?.achievements?.length
    ? model.gameConfig.achievements
    : Object.keys(BADGE_COPY).map((id) => ({
      id,
      name: BADGE_COPY[id][0],
      description: BADGE_COPY[id][1],
    }));
  // Unknown ids get no local rule: only the server can award them (no optimistic false earns).
  const definitions = source.map((badge) => ({
    ...badge,
    rule: badge.rule || rules[badge.id] || null,
    target: badge.target || targets[badge.id] || 1,
  }));
  const dynamicTargets = {
    leaders: measures.leadersTotal,
    bestSet: measures.bestSetTotal,
    binderHalf: measures.binderHalfTarget,
  };
  return definitions.map((badge) => {
    const target = dynamicTargets[badge.rule] || Math.max(1, Number(badge.target) || 1);
    const raw = {
      idlePulls: measures.idlePulls,
      unique: measures.unique,
      sources: measures.sources,
      shares: measures.shares,
      leaders: measures.leaders,
      bestSet: measures.bestSetOwned,
      trades: measures.trades,
      events: measures.events,
      leaderParties: measures.leaderParties,
      stars: measures.stars,
      duplicate: measures.duplicate,
      rank: measures.rank,
      binderHalf: measures.binderHalf,
    }[badge.rule] ?? 0;
    const progress = Math.min(raw, target);
    return {
      ...badge,
      earned: raw >= target,
      progress,
      target,
    };
  });
}

function isHeartedAchievement(badge) {
  return badge?.id === "favorite-first" || badge?.rule === "favorites";
}

function achievementList() {
  const local = localAchievementList().filter((badge) => !isHeartedAchievement(badge));
  const server = (model.serverState?.achievements || []).filter((badge) => !isHeartedAchievement(badge));
  if (!server.length) return local;
  return server.map((badge) => {
    const fallback = local.find((item) => item.id === badge.id);
    if (badge.earned || !fallback?.earned) return badge;
    return { ...badge, earned: true, progress: badge.target };
  });
}

/** Server page summary (tier order); falls back to counting the list. */
function achievementPageList(badges = achievementList()) {
  const server = model.serverState?.achievementPages;
  if (server?.length) return server;
  return ACHIEVEMENT_TIER_ORDER
    .map((tier) => {
      const items = badges.filter((badge) => achievementTier(badge) === tier);
      return { tier, total: items.length, earned: items.filter(({ earned }) => earned).length };
    })
    .filter(({ total }) => total);
}

/** Earned badges (every page is open). */
function visibleEarnedBadges() {
  return achievementList().filter((badge) => badge.earned);
}

function renderAchievements() {
  setEmptyNote(elements.achievementsEmpty, "", { hidden: true });
  if (!elements.achievementGrid) return;
  const badges = achievementList();
  if (!badges.length) {
    setEmptyNote(elements.achievementsEmpty, "טוענים את התגים…", { hidden: false });
  }
  const pages = achievementPageList(badges);
  if (!pages.some(({ tier }) => tier === model.achievementTier)) model.achievementTier = pages[0]?.tier || "simple";
  if (elements.achievementTiers) {
    elements.achievementTiers.hidden = pages.length < 2;
    elements.achievementTiers.innerHTML = pages.map((item) => {
      const active = item.tier === model.achievementTier;
      return `<button type="button" role="tab" data-achievement-tier="${item.tier}" aria-selected="${active}" aria-controls="achievement-grid" class="${active ? "active" : ""}">
        <span>${ACHIEVEMENT_TIER_LABELS[item.tier] || item.tier}</span>
        <small>${item.earned}/${item.total}</small>
      </button>`;
    }).join("");
  }
  elements.achievementGrid.innerHTML = badges
    .filter((badge) => achievementTier(badge) === model.achievementTier)
    .map((badge) => {
    const copy = hebrewBadge(badge);
    const tier = achievementTier(badge);
    const target = Math.max(1, Number(badge.target) || 1);
    const progress = Math.max(0, Math.min(target, Number(badge.progress) || 0));
    const percent = badge.earned ? 100 : Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
    return `
    <article class="achievement-badge tier-${tier} ${badge.earned ? "earned" : ""}" data-badge-id="${escapeHtml(badge.id)}">
      <span class="achievement-seal" aria-hidden="true">${badgeArtwork(badge.id, { tier, earned: badge.earned, sheen: tier === "hard" && badge.earned && takeBadgeSheen(badge.id) })}</span>
      <div>
        <strong>${escapeHtml(copy.name)}</strong>
        <p>${escapeHtml(copy.description)}</p>
        <div class="achievement-track" role="img" aria-label="${progress} מתוך ${target}">
          <span style="width:${percent}%"></span>
          <b>${badge.earned ? target : progress}/${target}</b>
        </div>
      </div>
    </article>`;
  }).join("");
}

function creatorLink() {
  const code = (elements.creatorCode?.value ?? "launch-circle")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "launch-circle";
  const url = new URL(location.origin);
  url.searchParams.set("ref", `creator-${code}`);
  return url.toString();
}

function tradeThumbMarkup(card) {
  if (!card) return "";
  return `<span class="trade-thumb-frame">${binderCardMarkup(card)}</span>`;
}

function tradeHasCards(trade) {
  return model.byId.has(trade.offeredCardId) && model.byId.has(trade.wantedCardId);
}

function tradeSideMarkup(cardId, card, role) {
  const label = role === "give" ? "נותנים" : "מקבלים";
  return `<div class="trade-side">
    <small>${label}</small>
    <button type="button" class="trade-thumb" data-trade-choice-card="${escapeHtml(cardId)}" ${card ? "" : "hidden"} aria-label="${label}: ${escapeHtml(card ? cardTitle(card) : cardId)}">
      ${tradeThumbMarkup(card)}
    </button>
  </div>`;
}

function tradeBoardFilterOptions(trades, key) {
  const seen = new Map();
  for (const trade of trades) {
    const id = trade[key];
    if (!id || seen.has(id)) continue;
    const card = model.byId.get(id);
    seen.set(id, card ? cardTitle(card) : id);
  }
  return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1], "he"));
}

function fillTradeBoardFilter(select, trades, key, selected) {
  if (!select) return selected;
  const options = tradeBoardFilterOptions(trades, key);
  select.innerHTML = [
    '<option value="">הכול</option>',
    ...options.map(([id, title]) => `<option value="${escapeHtml(id)}">${escapeHtml(title)}</option>`),
  ].join("");
  if (options.some(([id]) => id === selected)) {
    select.value = selected;
    return selected;
  }
  select.value = "";
  return "";
}

function tradeBoardPagerMarkup(page, pages, remaining) {
  if (pages <= 1) return "";
  const nextCount = remaining > 0 ? Math.min(TRADE_BOARD_PAGE_SIZE, remaining) : TRADE_BOARD_PAGE_SIZE;
  return `<button type="button" data-page-target="trades" data-page="${Math.max(0, page - 1)}" ${page === 0 ? "disabled" : ""}>הקודמות</button>
    <span>${page + 1}/${pages}</span>
    <button type="button" data-page-target="trades" data-page="${Math.min(pages - 1, page + 1)}" ${page === pages - 1 ? "disabled" : ""}>עוד ${nextCount}</button>`;
}

function renderTradeBoard() {
  if (!elements.tradeBoard) return;
  const openOffers = model.trades
    .filter((trade) => trade.status === "open" && tradeHasCards(trade))
    .sort((left, right) => Number(right.ownedByCurrent) - Number(left.ownedByCurrent) || Number(right.canAccept) - Number(left.canAccept));
  model.tradeBoardOffered = fillTradeBoardFilter(elements.tradeBoardOffered, openOffers, "offeredCardId", model.tradeBoardOffered);
  model.tradeBoardWanted = fillTradeBoardFilter(elements.tradeBoardWanted, openOffers, "wantedCardId", model.tradeBoardWanted);
  if (elements.tradeBoardToolbar) elements.tradeBoardToolbar.hidden = openOffers.length === 0;
  const filtered = openOffers.filter((trade) => (
    (!model.tradeBoardOffered || trade.offeredCardId === model.tradeBoardOffered)
    && (!model.tradeBoardWanted || trade.wantedCardId === model.tradeBoardWanted)
  ));
  const pages = Math.max(1, Math.ceil(filtered.length / TRADE_BOARD_PAGE_SIZE));
  model.tradeBoardPage = Math.min(model.tradeBoardPage, pages - 1);
  const start = model.tradeBoardPage * TRADE_BOARD_PAGE_SIZE;
  const page = filtered.slice(start, start + TRADE_BOARD_PAGE_SIZE);
  const remaining = Math.max(0, filtered.length - start - page.length);
  elements.tradeBoard.innerHTML = page.length
    ? page.map((trade) => tradeRowMarkup(trade)).join("")
    : `<p class="work-note">${openOffers.length ? "אין הצעות שמתאימות לסינון." : "אין כרגע הצעות פתוחות."}</p>`;
  if (elements.tradeBoardPager) elements.tradeBoardPager.innerHTML = tradeBoardPagerMarkup(model.tradeBoardPage, pages, remaining);
  queueCardTextFit(elements.tradeBoard);
}

function tradeRowMarkup(trade) {
  const offeredCard = model.byId.get(trade.offeredCardId);
  const wantedCard = model.byId.get(trade.wantedCardId);
  const until = new Date(trade.expiresAt).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
  const action = trade.ownedByCurrent
    ? `<button type="button" class="trade-offer-action" data-cancel-trade="${trade.tradeId}">ביטול</button>`
    : trade.canAccept
      ? `<button type="button" class="trade-offer-action accept" data-accept-trade="${trade.tradeId}">קבלה</button>`
      : `<span class="trade-unavailable">אין לכם את ${escapeHtml(wantedCard ? cardTitle(wantedCard) : "הקלף")}</span>`;
  const offeredRole = trade.ownedByCurrent ? "give" : "receive";
  const wantedRole = trade.ownedByCurrent ? "receive" : "give";
  return `<article class="trade-offer ${trade.status}${trade.ownedByCurrent ? " mine" : ""}">
    ${tradeSideMarkup(trade.offeredCardId, offeredCard, offeredRole)}
    <b aria-hidden="true">⇄</b>
    ${tradeSideMarkup(trade.wantedCardId, wantedCard, wantedRole)}
    <div class="trade-offer-bar">
      <p>${escapeHtml(trade.ownedByCurrent ? "ההצעה שלכם" : trade.ownerLabel)} · עד ${escapeHtml(until)}</p>
      ${action}
    </div>
  </article>`;
}

function watchOpenTrade() {
  const mine = model.trades.find((trade) => trade.ownedByCurrent && trade.status === "open");
  if (mine) model.watchedTrade = { tradeId: mine.tradeId, receivedCardId: mine.wantedCardId };
}

function settleReceivedCard(cardId, message) {
  renderBinder();
  renderGrowth();
  showToast(message);
  if (cardId) openCardDialog(cardId);
}

function applyTradeResult(result) {
  if (result?.state) setServerState(result.state, { merge: true });
  if (result?.trades) model.trades = result.trades.trades || result.trades;
  watchOpenTrade();
  renderBinder();
  renderGrowth();
}

async function pollWatchedTrade() {
  if (!model.watchedTrade || document.visibilityState !== "visible" || !model.token) return;
  const payload = await request("/api/trades");
  const trades = payload.trades || payload;
  model.trades = trades;
  const watched = trades.find((trade) => trade.tradeId === model.watchedTrade.tradeId);
  if (watched?.status === "accepted") {
    const receivedCardId = model.watchedTrade.receivedCardId;
    model.watchedTrade = null;
    setServerState(await request("/api/state"));
    settleReceivedCard(receivedCardId, "מישהו קיבל את ההצעה. הקלף נכנס לאוסף.");
    return;
  }
  if (!watched || watched.status !== "open") {
    model.watchedTrade = null;
    renderGrowth();
  }
}

async function refreshDailyChallenge() {
  try {
    const boards = await request("/api/leaderboards");
    model.leaderboards = mergeLeaderboards(model.leaderboards, boards);
    renderTodayDocket();
    if (model.communityPage === "challenge" || model.communityPage === "collectors") renderGrowth();
  } catch {
    /* Race board stays on the last server snapshot. */
  }
}

function factionHistMarkup(bins) {
  const field = Math.max(1, ...bins.map(({ count }) => count));
  const cols = bins.map((bin, index) => {
    const height = bin.count ? Math.max(8, Math.round((bin.count / field) * 100)) : 0;
    return `<div class="challenge-hist-col${bin.you ? " you" : ""}">
      <b style="height:${height}%; animation-delay:${index * 40}ms"></b>
    </div>`;
  }).join("");
  const axis = bins.map((bin) => `<span>${escapeHtml(bin.label)}</span>`).join("");
  return `<div class="faction-hist challenge-hist">
    <div class="challenge-hist-plot faction-hist-plot" dir="ltr" aria-hidden="true">${cols}</div>
    <div class="challenge-hist-axis" dir="ltr">${axis}</div>
  </div>`;
}

function renderFactionMembers() {
  if (!elements.factionMembers) return;
  const partyId = elements.factionSelect?.value || "";
  const entry = (model.leaderboards?.factions || []).find((faction) => faction.partyId === partyId);
  const scores = entry?.scores || (entry?.members || []).map((member) => ({
    stars: member.stars || 0,
    current: Boolean(member.current),
  }));
  if (!partyId) {
    elements.factionMembers.innerHTML = '<p class="work-note">בחרו מפלגה כדי לראות איפה אתם עומדים.</p>';
    return;
  }
  const bins = starContributionBins(scores);
  elements.factionMembers.innerHTML = bins.length
    ? factionHistMarkup(bins)
    : '<p class="work-note">עדיין אף אחד לא בחר במפלגה הזו.</p>';
}

function syncCommunityPage() {
  const section = communitySectionFor(model.communityPage);
  model.communitySection = section;
  const communityClasses = {
    trade: ".trade-desk",
    "open-trades": ".open-trades-desk",
    faction: ".faction-desk",
    collectors: ".leaderboard-desk",
    leagues: ".league-desk",
    challenge: ".daily-challenge-desk",
  };
  for (const [page, selector] of Object.entries(communityClasses)) {
    document.querySelector(selector)?.toggleAttribute("hidden", page !== model.communityPage);
  }
  elements.communitySections?.querySelectorAll("[data-community-section]").forEach((button) => {
    const active = button.dataset.communitySection === section;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.communityTabs?.setAttribute("data-community-section", section);
  elements.communityTabs?.querySelectorAll("[data-community-page]").forEach((button) => {
    const inSection = button.dataset.communitySection === section;
    const active = button.dataset.communityPage === model.communityPage;
    button.hidden = !inSection;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active && inSection));
    button.tabIndex = active && inSection ? 0 : -1;
  });
}

function renderGrowth() {
  const communityTabs = elements.communityTabs;
  const growthGrid = document.querySelector(".growth-grid");
  communityTabs?.removeAttribute("hidden");
  growthGrid?.removeAttribute("hidden");
  syncCommunityPage();
  if (model.communityPage === "leagues") {
    renderLeagues();
    hydrateLeagues().catch(() => {});
  }
  if (!model.catalog.length || !model.serverState || !elements.tradePreview) {
    setEmptyNote(elements.growthEmpty, pendingCopy("טוענים את הקהילה…", "לא הצלחנו לטעון את הקהילה."), {
      pending: !catalogFailed,
      failed: catalogFailed,
    });
    return;
  }
  model.serverState.inventory ??= {};
  setEmptyNote(elements.growthEmpty, "", { hidden: true });
  const liveCards = playerCatalog();
  const duplicate = liveCards.find((card) => (model.serverState.inventory[card.id] ?? 0) > 1);
  const owned = liveCards.find((card) => (model.serverState.inventory[card.id] ?? 0) > 0);
  const card = duplicate ?? owned ?? liveCards[0];
  const count = model.serverState.inventory[card.id] ?? 0;
  const isLive = count > 1;
  elements.tradePreview.dataset.cardId = card.id;
  elements.tradePreview.dataset.liveDuplicate = String(isLive);
  elements.tradeDemo.textContent = "קישור לדוגמה";
  elements.creatorLinkPreview.textContent = creatorLink();

  const counts = model.activity?.counts ?? {};
  const metrics = [
    ["שחקנים", model.activity?.participatingSessions ?? 0],
    ["חבילות", counts.pack_opened ?? 0],
    ["מקורות שנפתחו", counts.source_opened ?? 0],
    ["שיתופים", counts.share_created ?? 0],
  ];
  elements.growthMetrics.innerHTML = metrics
    .map(([label, value]) => `<div class="metric-row"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  const ownedCards = liveCards.filter((candidate) => (model.serverState.inventory[candidate.id] ?? 0) > 0);
  const releaseNames = Object.fromEntries((model.gameConfig?.releaseSets || []).map(({ id, nameHe }) => [id, nameHe]));
  const fallbackReleaseNames = {
    foundations: "יסודות",
    "party-symbols": "סמלי המפלגות",
    "editorial-backlog": "קלפים קודמים",
    "special-events": "אירועים מיוחדים",
  };
  const releaseName = (candidate) =>
    releaseNames[candidate.releaseSetId] || fallbackReleaseNames[candidate.releaseSetId] || "סדרה אחרת";
  const groupedOptions = (cards) => {
    const releases = [...new Map(cards.map((candidate) => [`release:${candidate.releaseSetId || "other"}`, releaseName(candidate)]))];
    return releases
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
      .join("");
  };
  const matchesTradeGroup = (candidate, value) =>
    (candidate.releaseSetId || "other") === String(value || "").replace(/^release:/, "");
  const previousOfferedSet = elements.tradeOfferedSet.value;
  const previousWantedSet = elements.tradeWantedSet.value;
  const offeredValue = elements.tradeOfferedCard.value;
  const wantedValue = elements.tradeWantedCard.value;
  elements.tradeOfferedSet.innerHTML = ownedCards.length ? groupedOptions(ownedCards) : '<option value="">אין קלפים</option>';
  elements.tradeWantedSet.innerHTML = groupedOptions(liveCards);
  if ([...elements.tradeOfferedSet.options].some(({ value }) => value === previousOfferedSet)) elements.tradeOfferedSet.value = previousOfferedSet;
  if ([...elements.tradeWantedSet.options].some(({ value }) => value === previousWantedSet)) elements.tradeWantedSet.value = previousWantedSet;
  const offeredCards = ownedCards.filter((candidate) => matchesTradeGroup(candidate, elements.tradeOfferedSet.value));
  const wantedCards = liveCards.filter((candidate) => matchesTradeGroup(candidate, elements.tradeWantedSet.value));
  elements.tradeOfferedCard.innerHTML = offeredCards.length
    ? offeredCards.map((candidate) => `<option value="${candidate.id}">${escapeHtml(cardTitle(candidate))} · ${escapeHtml(cardCode(candidate))}</option>`).join("")
    : '<option value="">קודם אספו קלף</option>';
  if (offeredCards.some(({ id }) => id === offeredValue)) elements.tradeOfferedCard.value = offeredValue;
  elements.tradeWantedCard.innerHTML = wantedCards
    .map((candidate) => `<option value="${candidate.id}">${escapeHtml(cardTitle(candidate))} · ${escapeHtml(cardCode(candidate))}</option>`).join("");
  if (wantedCards.some(({ id }) => id === wantedValue)) elements.tradeWantedCard.value = wantedValue;
  for (const select of [elements.tradeOfferedSet, elements.tradeWantedSet, elements.tradeOfferedCard, elements.tradeWantedCard]) {
    const chosen = select.selectedOptions[0];
    select.title = chosen?.text || "";
  }
  const mine = model.trades.find((trade) => trade.ownedByCurrent && trade.status === "open");
  elements.tradeCreate.disabled = Boolean(mine) || !ownedCards.length;
  const paintThumb = (thumb, cardId) => {
    const selected = model.byId.get(cardId);
    if (!thumb) return;
    thumb.hidden = !selected;
    if (!selected) {
      thumb.replaceChildren();
      return;
    }
    thumb.dataset.tradeChoiceCard = selected.id;
    thumb.setAttribute("aria-label", `פתיחת ${cardTitle(selected)}`);
    thumb.innerHTML = tradeThumbMarkup(selected);
    queueCardTextFit(thumb);
  };
  paintThumb(elements.tradeOfferedPreview, elements.tradeOfferedCard.value);
  paintThumb(elements.tradeWantedPreview, elements.tradeWantedCard.value);
  prefetchCardArt([
    card,
    model.byId.get(elements.tradeOfferedCard.value),
    model.byId.get(elements.tradeWantedCard.value),
  ]);
  if (elements.tradeActive && elements.tradeCompose) {
    elements.tradeActive.hidden = !mine;
    elements.tradeCompose.hidden = Boolean(mine);
    // The publish button lives in the title row; it goes with the compose form.
    elements.tradeCreate.hidden = Boolean(mine);
    elements.tradeActive.innerHTML = mine ? `${tradeRowMarkup(mine)}<p class="work-note">אפשר הצעה אחת בכל פעם. כשמישהו מקבל, הקלף נכנס לאוסף מיד.</p>` : "";
    if (mine) queueCardTextFit(elements.tradeActive);
  }
  watchOpenTrade();
  renderTradeBoard();

  const selectedFaction = model.serverState.factionId;
  const parties = partyRegister();
  elements.factionSelect.innerHTML = [
    '<option value="">ללא מפלגה</option>',
    ...parties.map((party) => {
      const letters = (party.finalLetters || party.requestedLetters || []).join(" / ");
      return `<option value="${party.id}"${selectedFaction === party.id ? " selected" : ""}>${escapeHtml([
        party.displayNameHe,
        letters,
      ].filter(Boolean).join(" · "))}</option>`;
    }),
  ].join("");
  if (elements.factionBoard) elements.factionBoard.innerHTML = "";
  renderFactionMembers();
  const collectorEntries = model.leaderboards?.collectors || [];
  const collectorPreview = collectorEntries.slice(0, 3);
  const currentCollector = collectorEntries.find(({ current }) => current);
  if (currentCollector && !collectorPreview.includes(currentCollector)) collectorPreview.push(currentCollector);
  elements.collectorBoard.innerHTML = collectorPreview.length
    ? collectorPreview.map((entry) => {
        const ranks = model.gameConfig?.progression?.rankNames || model.gameConfig?.progression?.ranks || [];
        const rankName = ranks[(entry.rankLevel || 1) - 1] || "";
        return `<div class="collector-row${entry.current ? " current-player" : ""}">
          ${collectorFaceMarkup(entry)}
          <span>${entry.rank}. ${binderNameMarkup(entry)}${rankName ? ` · ${escapeHtml(rankName)}` : ""}${entry.current ? "" : ` <button type="button" class="report-link inline" data-report-name="${escapeHtml(entry.label)}">דיווח</button>`}</span>
          <strong>★${entry.stars} · ${entry.ownedUnique} שונים</strong>
        </div>`;
      }).join("")
    : '<p class="work-note">הטבלה מחכה לשחקן הראשון.</p>';

  const challenge = model.leaderboards?.dailyChallenge || (model.extrasReady ? null : localDailyChallenge());
  const challengeDate = challenge?.day ? new Date(`${challenge.day}T12:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }) : "";
  const challengeLeaderCard = model.catalog.find((card) =>
    card.set === challenge?.targetPartyId && card.releaseSetId === "party-leaders");
  elements.dailyChallengeLeaderArt.innerHTML = challengeLeaderCard ? artMarkup(challengeLeaderCard, true) : "";
  elements.dailyChallengeLeaderArt.style.setProperty("--pip", challengeLeaderCard?.pip || "#1f4f4a");
  elements.dailyChallengeTitle.textContent = `היום ${challengeDate} · מי אסף הכי הרבה קלפים של ${partyDisplayName(challenge?.targetPartyId)}?`;
  renderChallengeRecap();
  const raceLeaders = challenge?.leaders || [];
  const raceScored = raceLeaders.some((entry) => Number(entry.cards) > 0);
  const raceNote = raceScored
    ? ""
    : `<p class="work-note">${raceLeaders.length ? "עוד אף אחד לא אסף מהסיעה של היום — הקלף הראשון שתפתחו ישים אתכם בראש." : "עוד אף אחד לא אסף מהסיעה של היום."}</p>`;
  elements.dailyChallengeBoard.innerHTML = raceLeaders.slice(0, 3).map((entry, index) => `<div class="collector-row${entry.current ? " current-player" : ""}">${collectorFaceMarkup(entry)}<span>${raceScored ? `${index + 1}. ` : ""}${binderNameMarkup(entry)}${entry.current ? "" : ` <button type="button" class="report-link inline" data-report-name="${escapeHtml(entry.label)}">דיווח</button>`}</span><strong>${entry.cards} קלפים</strong></div>`).join("") + raceNote;

  const specialDescriptions = {
    "prestige-legacy": "דמויות פוליטיות מתקופות שונות.",
    mouthpieces: "סיווג עריכתי גלוי של אנשי תקשורת ושל מסרים.",
    "satire-imitations": "דמויות סאטיריות — לא ציטוטים של הפוליטיקאים עצמם.",
    "legendary-aces": "קלפי קידום שזמינים רק באירועים.",
    records: "עובדות מספריות ורקורדים, עם יחידת המדידה וההסתייגות על הקלף.",
    "current-ministers": "תפקיד נוכחי לצד תוצאה שנמדדה בכהונה — בלי לטעון שהתפקיד גרם לתוצאה.",
  };
  if (elements.specialsGrid) elements.specialsGrid.innerHTML = (model.specials.sets || []).map((set) => `
    <section class="special-set">
      <header><span>P</span><div><h3>${escapeHtml(set.nameHe)}</h3></div></header>
      <p>${escapeHtml(specialDescriptions[set.id] || "")}</p>
      <div>${(set.cards || model.specials.cards.filter((special) => special.setId === set.id)).map((special) => `<article>
        <span>${escapeHtml(special.id)}</span>
        <strong lang="he" dir="rtl">${escapeHtml(special.nameHe)}</strong>
        <blockquote lang="he" dir="rtl">${escapeHtml(special.displayText)}</blockquote>
        <a href="${escapeHtml(special.sourceUrl)}" target="_blank" rel="noopener">למקור ↗</a>
      </article>`).join("")}</div>
    </section>`).join("");
  syncCommunityPage();
  const openCount = model.trades.filter((trade) => trade.status === "open" && !trade.ownedByCurrent).length;
  const openTab = document.querySelector("#community-tab-open-trades");
  if (openTab) openTab.textContent = openCount ? `הצעות פתוחות · ${openCount}` : "הצעות פתוחות";
  const boardHint = document.querySelector("#trade-board-hint");
  if (boardHint) {
    boardHint.hidden = true;
    boardHint.textContent = "";
  }
}

function renderEvents() {
  if (!elements.activeEvent) return;
  if (!model.extrasReady) {
    elements.activeEvent.innerHTML = `<p class="empty-note ${catalogFailed ? "is-failed" : "is-loading"}">${pendingCopy("טוענים את האירועים…", "לא הצלחנו לטעון את האירועים.")}</p>`;
    elements.eventPull.hidden = true;
    if (elements.eventCards) elements.eventCards.innerHTML = "";
    if (elements.eventUpcoming) elements.eventUpcoming.innerHTML = "";
    return;
  }
  const active = model.events.find((event) => event.active);
  if (!active) {
    elements.activeEvent.innerHTML = "<h2>אין אירוע פעיל כרגע.</h2><p>האירוע הבא יופיע כאן.</p>";
    elements.eventPull.hidden = true;
    elements.eventCards.innerHTML = "";
  } else {
    const remaining = formatEventCountdown(Math.max(0, Date.parse(active.closesAt) - Date.now()));
    elements.activeEvent.innerHTML = `<p class="work-kicker">פתוח עכשיו · ${remaining}</p><h2>${escapeHtml(active.nameHe)}</h2><p>${escapeHtml(active.descriptionHe)}</p>`;
    elements.eventPull.hidden = false;
    elements.eventPull.disabled = active.claimedToday;
    elements.eventPull.dataset.eventId = active.id;
    elements.eventPull.textContent = active.reward === "pull"
      ? (active.claimedToday ? "החבילה הנוספת כבר אצלכם" : "איסוף החבילה הנוספת")
      : (active.claimedToday ? "הקלף היומי כבר נאסף" : "פתיחת קלף האירוע");
    elements.eventCards.innerHTML = active.cards.map((card) => `
      <article class="event-card">${displayCardMarkup(card, "event")}</article>`).join("");
  }
  const upcoming = model.events.filter((event) => !event.active && Date.parse(event.opensAt) > Date.now());
  const past = model.events.filter((event) => !event.active && Date.parse(event.opensAt) <= Date.now());
  const scheduled = upcoming.filter(({ status }) => status !== "blocked");
  const awaitingApproval = upcoming.filter(({ status }) => status === "blocked");
  const ledgerSection = (title, items, line) => items.length
    ? `<section class="event-ledger-block"><p class="work-kicker">${title}</p>${items.map((event) => `<p>${escapeHtml(line(event))}</p>`).join("")}</section>`
    : "";
  elements.eventUpcoming.innerHTML = `
    <div class="event-ledger">
      ${ledgerSection("מתוזמן", scheduled, (event) => `${event.nameHe} · ${new Date(event.opensAt).toLocaleDateString("he-IL")}`)}
      ${ledgerSection("בהכנה", awaitingApproval, (event) => `${event.nameHe} · ממתין לאישור תוכן ואמנות`)}
      ${ledgerSection("נסגרו", past, (event) => event.nameHe)}
      ${!scheduled.length && !awaitingApproval.length && !past.length ? "<p>אין אירועים נוספים בלוח.</p>" : ""}
    </div>`;
  elements.activeEvent.hidden = model.eventPage !== "active";
  elements.eventPull.hidden = model.eventPage !== "active" || !active;
  elements.eventCards.hidden = model.eventPage !== "collection";
  elements.eventUpcoming.hidden = model.eventPage !== "upcoming";
  document.querySelector(".specials-catalog").hidden = model.eventPage !== "upcoming";
  elements.eventTabs?.querySelectorAll("[data-event-page]").forEach((button) => {
    const activePage = button.dataset.eventPage === model.eventPage;
    button.classList.toggle("active", activePage);
    button.setAttribute("aria-selected", String(activePage));
  });
}

async function claimTodaySpecial() {
  const windowOpen = model.specialWindow;
  if (!windowOpen) return;
  if (windowOpen.reward === "pull") {
    if (windowOpen.claimedToday) return;
    await claimEventPull(windowOpen);
    return;
  }
  if (windowOpen.claimedToday) {
    elements.navButtons.find((button) => button.dataset.nav === "binder")?.click();
    return;
  }
  elements.todaySpecialsRow.disabled = true;
  try {
    model.currentPack = await request(`/api/events/${encodeURIComponent(windowOpen.id)}/pull`, { method: "POST" });
    setServerState(await request("/api/state"));
    model.specialWindow = { ...windowOpen, claimedToday: true };
    model.currentCardIndex = 0;
    model.previewMode = false;
    model.currentPack.cards = (model.currentPack.cards || []).slice(0, 1);
    renderTodayDocket();
    showView("pack");
    startWalkout();
  } catch (error) {
    if (error.status === 409) {
      model.specialWindow = { ...windowOpen, claimedToday: true };
      renderTodayDocket();
      showToast("קלף האירוע כבר נאסף היום.");
      return;
    }
    showToast("חלון האיסוף סגור עכשיו.");
  } finally {
    elements.todaySpecialsRow.disabled = false;
  }
}

function pullCountCopy(count) {
  return count === 1 ? "חבילה אחת" : `${count} חבילות`;
}

// Event pop-up copy, one entry per outcome. The same strings serve the instant (predicted) pop-up
// and the server-confirmed one, so a confirmation that agrees changes nothing on screen.
const EVENT_PULL_COPY = {
  success: (count) => ({
    outcome: "success",
    title: "חבילה נוספת נכנסה למחסן",
    copy: `תודה שאתם כאן מההתחלה. החבילה כבר מחכה לכם, ויש לכם עכשיו ${pullCountCopy(count)} לפתיחה.`,
  }),
  cap: (cap) => ({
    outcome: "cap",
    title: "המחסן מלא",
    copy: `יש לכם כבר ${cap} חבילות שמחכות, וזה המקסימום. פתחו חבילה אחת וחזרו ללחוץ על השורה, והחבילה הנוספת תחכה לכם.`,
  }),
  claimed: () => ({
    outcome: "claimed",
    title: "החבילה כבר אצלכם",
    copy: "כבר אספתם את החבילה הנוספת של האירוע. היא מחכה לכם במחסן.",
  }),
  closed: () => ({
    outcome: "closed",
    title: "האירוע נסגר",
    copy: "חלון האיסוף סגור עכשיו.",
  }),
  retry: () => ({
    outcome: "retry",
    title: "לא הצלחנו לאשר",
    copy: "החיבור נקטע והחבילה עוד לא נוספה. נסו שוב בעוד רגע.",
    action: "לנסות שוב",
  }),
};

function showEventOutcome(kicker, view) {
  elements.eventDialog.dataset.outcome = view.outcome;
  elements.eventDialogKicker.textContent = kicker;
  elements.eventDialogTitle.textContent = view.title;
  elements.eventDialogCopy.textContent = view.copy;
  elements.eventDialogOk.textContent = view.action || "הבנתי";
  if (!elements.eventDialog.open) elements.eventDialog.showModal();
}

/**
 * Ready pulls the server will see when it settles: the ready (unseen) queue plus prepared pulls
 * whose time has come, capped. Both come from the last home/settle/state payload.
 */
function predictedReadyPulls(state = model.serverState || {}, nowMs = Date.now()) {
  const cap = state.idleCapacity || model.gameConfig?.idle?.capacity || IDLE_BACKLOG_CAP;
  const unseen = state.unseenCount ?? model.idleQueue.length;
  const due = (state.preparedPulls || []).filter(({ availableAt }) => Date.parse(availableAt) <= nowMs).length;
  return { ready: Math.min(cap, unseen + due), cap };
}

function applyEventPullPayload(payload) {
  if (!payload?.state) return;
  applyHomePayload({ state: payload.state, cards: payload.cards });
  if (payload.specialWindow !== undefined) model.specialWindow = payload.specialWindow;
  renderHome();
}

let eventPullInFlight = null;

// The pop-up outcome is predicted from cached state, so while a pull event is on the line keep
// that state reasonably fresh: one cheap settle when it is over a minute old or an idle pull is
// due (nextIdleAt passed). Throttled to once a minute; never on the tap itself.
function refreshEventPredictionIfStale(nowMs = Date.now()) {
  if (model.showcase || !model.token || eventPullInFlight) return;
  if (nowMs - eventPredictionRefreshAt < EVENT_PREDICTION_STALE_MS) return;
  const nextIdle = Date.parse(model.serverState?.nextIdleAt || "");
  const stale = nowMs - stateFreshAt > EVENT_PREDICTION_STALE_MS || (Number.isFinite(nextIdle) && nextIdle <= nowMs);
  if (!stale) return;
  eventPredictionRefreshAt = nowMs;
  hydrateIdleQueue().catch(() => {});
}

// Pull-reward event (launch week). The pop-up opens on the tap itself with the outcome predicted
// from cached state (success with count + 1, or the cap message), then the POST reconciles: the
// server checks the window, the once-per-player claim and the cap, and only its answer changes the
// count or the line. If it disagrees, or the request fails, the pop-up copy is swapped.
function claimEventPull(windowOpen) {
  const kicker = windowOpen.nameHe || "אירוע";
  if (eventPullInFlight) {
    if (!elements.eventDialog.open) elements.eventDialog.showModal();
    return eventPullInFlight;
  }
  const { ready, cap } = predictedReadyPulls();
  const predicted = ready >= cap ? EVENT_PULL_COPY.cap(cap) : EVENT_PULL_COPY.success(ready + 1);
  showEventOutcome(kicker, predicted);
  eventPullInFlight = (async () => {
    let view;
    try {
      const result = await request(`/api/events/${encodeURIComponent(windowOpen.id)}/pull`, {
        method: "POST",
        signal: globalThis.AbortSignal?.timeout?.(10_000),
      });
      applyEventPullPayload(result);
      view = EVENT_PULL_COPY.success(result.readyCount);
    } catch (error) {
      const body = error.body || {};
      applyEventPullPayload(body);
      view = body.error === "PULL_CAP_REACHED"
        ? EVENT_PULL_COPY.cap(body.capacity || cap)
        : body.error === "EVENT_ALREADY_CLAIMED"
          ? EVENT_PULL_COPY.claimed()
          : error.status === 404
            ? EVENT_PULL_COPY.closed()
            : EVENT_PULL_COPY.retry();
    }
    const disagrees = view.outcome !== predicted.outcome || view.copy !== predicted.copy;
    // Agreeing answers leave the pop-up alone (open or already dismissed); a disagreement is shown.
    if (disagrees) showEventOutcome(kicker, view);
    return view;
  })().finally(() => {
    eventPullInFlight = null;
  });
  return eventPullInFlight;
}

async function pullEventCard() {
  const eventId = elements.eventPull.dataset.eventId;
  if (!eventId) return;
  const activeEvent = model.events.find(({ id }) => id === eventId);
  if (activeEvent?.reward === "pull") {
    elements.eventPull.disabled = true;
    await claimEventPull(activeEvent);
    model.events = (await request("/api/events").catch(() => ({ events: model.events }))).events;
    renderEvents();
    return;
  }
  elements.eventPull.disabled = true;
  try {
    model.currentPack = await request(`/api/events/${encodeURIComponent(eventId)}/pull`, { method: "POST" });
    setServerState(await request("/api/state"));
    model.events = (await request("/api/events")).events;
    model.currentCardIndex = 0;
    model.previewMode = false;
    model.currentPack.cards = (model.currentPack.cards || []).slice(0, 1);
    showView("pack");
    startWalkout();
  } catch {
    model.events = (await request("/api/events")).events;
    renderEvents();
    showToast("קלף האירוע כבר נאסף היום.");
  }
}

function revealDelayInputs() {
  return {
    quote: elements.delayQuote,
    party: elements.delayParty,
    name: elements.delayName,
    portrait: elements.delayPortrait,
  };
}

function readRevealDelays() {
  const configured = model.gameConfig.revealTiming || {};
  const defaults = { quote: 400, party: 1800, name: 1800, portrait: 2000 };
  const stale = !configured.quote || configured.quote < 200 || (configured.party ?? 0) < 400;
  return stale ? { ...defaults } : { ...defaults, ...configured };
}

function readStudioRevealDelays() {
  return Object.fromEntries(Object.entries(revealDelayInputs()).map(([key, input]) => {
    const value = Math.min(5000, Math.max(0, Math.round(Number(input.value) || 0)));
    input.value = String(value);
    return [key, value];
  }));
}

function populateRevealTimingInputs() {
  for (const [key, input] of Object.entries(revealDelayInputs())) {
    input.value = String(model.gameConfig.revealTiming[key]);
  }
}

function populateLevelIncrements() {
  if (!elements.levelIncrements) return;
  const increments = model.gameConfig.progression?.releaseLevelIncrements || {};
  const sets = model.gameConfig.releaseSets || [];
  if (elements.levelExponent) elements.levelExponent.value = String(model.gameConfig.progression?.thresholdExponent ?? 1.2);
  elements.levelIncrements.innerHTML = `${sets.map((set) => `
    <label>${escapeHtml(set.nameHe)}
      <input type="number" min="0" max="20" data-level-increment="${escapeHtml(set.id)}" value="${increments[set.id] ?? 0}" />
    </label>`).join("")}
    <p class="work-note">תקרת רמה = סכום התוספות של סדרות שפתוחות לאיסוף. ברירת המחדל 1 לכל סדרה — הטקסט «חסרים לכם עוד N קלפים» הוא הסף, לא משקל נסתר. סדרה חדשה מוסיפה רמה אחת.</p>`;
  if (elements.rankNames) {
    elements.rankNames.value = (model.gameConfig.progression?.rankNames || model.gameConfig.progression?.ranks || []).join("\n");
  }
  if (elements.grantLevelReward) {
    elements.grantLevelReward.checked = model.gameConfig.progression?.grantLevelReward !== false;
  }
  if (elements.avatarUnlocks) {
    const avatars = model.gameConfig.avatars || model.serverState?.avatars || [];
    elements.avatarUnlocks.innerHTML = avatars.map((avatar) => `
      <label>${escapeHtml(avatar.nameHe)}
        <input type="number" min="1" max="24" data-avatar-unlock="${escapeHtml(avatar.id)}" value="${avatar.unlockLevel || 1}" />
      </label>`).join("");
  }
  if (elements.numberedEvery) {
    elements.numberedEvery.value = Number(model.gameConfig.progression?.numberedEvery) || 30;
  }
  if (elements.numberedSets) {
    const selected = new Set(model.gameConfig.progression?.numberedSets || []);
    elements.numberedSets.innerHTML = sets.map((set) => `
      <label>
        <input type="checkbox" data-numbered-set="${escapeHtml(set.id)}"${selected.has(set.id) ? " checked" : ""} />
        ${escapeHtml(set.nameHe)}
      </label>`).join("");
  }
  populateReleaseSets();
}

function packSetFor(id) {
  return (model.gameConfig.pack?.sets || []).find((set) => set.id === id) || {
    id,
    weight: 0,
    includeEventCards: false,
    rarities: { Common: 70, Uncommon: 25, Rare: 5 },
  };
}

function populateReleaseSets() {
  if (!elements.studioReleaseSets) return;
  const sets = model.gameConfig.releaseSets || [];
  elements.studioReleaseSets.innerHTML = sets.map((set) => {
    const pack = packSetFor(set.id);
    return `
    <div class="studio-release-row">
      <b>${escapeHtml(set.nameHe)}</b>
      <select data-release-state="${escapeHtml(set.id)}">
        <option value="held"${set.runtimeState === "held" ? " selected" : ""}>held</option>
        <option value="active"${set.runtimeState === "active" ? " selected" : ""}>active</option>
      </select>
      <input data-release-from="${escapeHtml(set.id)}" type="datetime-local" value="${escapeHtml(toDatetimeLocal(set.runtimeAvailableFrom || set.plannedPublishAt))}" />
      <label>Set %
        <input data-pack-weight="${escapeHtml(set.id)}" type="number" min="0" max="1000" value="${pack.weight}" />
      </label>
      <label>C
        <input data-pack-common="${escapeHtml(set.id)}" type="number" min="0" max="1000" value="${pack.rarities.Common}" />
      </label>
      <label>U
        <input data-pack-uncommon="${escapeHtml(set.id)}" type="number" min="0" max="1000" value="${pack.rarities.Uncommon}" />
      </label>
      <label>R
        <input data-pack-rare="${escapeHtml(set.id)}" type="number" min="0" max="1000" value="${pack.rarities.Rare}" />
      </label>
      <label class="studio-event-cards">Event cards
        <input data-pack-events="${escapeHtml(set.id)}" type="checkbox"${pack.includeEventCards ? " checked" : ""} />
      </label>
    </div>`;
  }).join("");
  const current = model.gameConfig.pack?.current;
  if (elements.studioPackNow) {
    const order = current?.rarityOrder;
    const orderNote = order?.holds
      ? ` Specific C ~${order.hardestCommon} pulls; specific R ~${order.easiestRare} pulls.`
      : order
        ? " Specific rarity order is off: a Common can be harder than an Uncommon or Rare. Re-sort cards or lower the easier bucket."
        : "";
    elements.studioPackNow.textContent = current?.sets?.length
      ? `Now pulling: ${current.sets.map((set) => {
        const name = sets.find((release) => release.id === set.id)?.nameHe || set.id;
        return `${name} ${set.percent}% (C ${set.effectiveRarities.Common} / U ${set.effectiveRarities.Uncommon} / R ${set.effectiveRarities.Rare})`;
      }).join(" · ")}.${orderNote}`
      : "Now pulling: no set is open. Activate a dated set with weight above 0.";
  }
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readStudioReleaseSets() {
  return (model.gameConfig.releaseSets || []).map((set) => {
    const state = elements.studioReleaseSets?.querySelector(`[data-release-state="${CSS.escape(set.id)}"]`)?.value;
    const from = elements.studioReleaseSets?.querySelector(`[data-release-from="${CSS.escape(set.id)}"]`)?.value;
    return {
      id: set.id,
      runtimeState: state === "active" ? "active" : "held",
      runtimeAvailableFrom: from ? new Date(from).toISOString() : null,
    };
  });
}

function readNumberField(selector, fallback) {
  const value = Math.round(Number(elements.studioReleaseSets?.querySelector(selector)?.value));
  return Number.isFinite(value) ? Math.min(1000, Math.max(0, value)) : fallback;
}

function readStudioPack() {
  const pityAfter = model.gameConfig.pack?.pityAfter || 4;
  return {
    pityAfter,
    sets: (model.gameConfig.releaseSets || []).map((set) => {
      const current = packSetFor(set.id);
      return {
        id: set.id,
        weight: readNumberField(`[data-pack-weight="${CSS.escape(set.id)}"]`, current.weight),
        includeEventCards: Boolean(elements.studioReleaseSets?.querySelector(`[data-pack-events="${CSS.escape(set.id)}"]`)?.checked),
        rarities: {
          Common: readNumberField(`[data-pack-common="${CSS.escape(set.id)}"]`, current.rarities.Common),
          Uncommon: readNumberField(`[data-pack-uncommon="${CSS.escape(set.id)}"]`, current.rarities.Uncommon),
          Rare: readNumberField(`[data-pack-rare="${CSS.escape(set.id)}"]`, current.rarities.Rare),
        },
      };
    }),
  };
}

function readStudioProgression() {
  const increments = { ...(model.gameConfig.progression?.releaseLevelIncrements || {}) };
  elements.levelIncrements?.querySelectorAll("[data-level-increment]").forEach((input) => {
    increments[input.dataset.levelIncrement] = Math.min(20, Math.max(0, Math.round(Number(input.value) || 0)));
  });
  const exponent = Number(elements.levelExponent?.value);
  const rankNames = String(elements.rankNames?.value || "")
    .split(/\n+/)
    .map((name) => name.trim())
    .filter(Boolean);
  const boxes = [...(elements.numberedSets?.querySelectorAll("[data-numbered-set]") || [])];
  const numberedSets = boxes.length
    ? boxes.filter((input) => input.checked).map((input) => input.dataset.numberedSet)
    : model.gameConfig.progression?.numberedSets;
  return {
    releaseLevelIncrements: increments,
    thresholdExponent: Number.isFinite(exponent) ? exponent : model.gameConfig.progression?.thresholdExponent,
    rankNames: rankNames.length >= 2 ? rankNames : model.gameConfig.progression?.rankNames,
    grantLevelReward: elements.grantLevelReward ? elements.grantLevelReward.checked : model.gameConfig.progression?.grantLevelReward !== false,
    numberedSets,
    numberedEvery: Math.min(1000, Math.max(1, Math.round(Number(elements.numberedEvery?.value) || 30))),
  };
}

function readStudioAvatars() {
  return (model.gameConfig.avatars || []).map((avatar) => {
    const value = Number(elements.avatarUnlocks?.querySelector(`[data-avatar-unlock="${CSS.escape(avatar.id)}"]`)?.value);
    return {
      id: avatar.id,
      unlockLevel: Number.isInteger(value) ? Math.min(24, Math.max(1, value)) : avatar.unlockLevel || 1,
    };
  });
}

function readStudioVisualConfig() {
  return Object.fromEntries(Object.entries(visualConfigInputs()).map(([key, input]) => [key, input.value]));
}

async function saveVisualConfig() {
  const visual = readStudioVisualConfig();
  try {
    model.gameConfig = await request("/api/studio/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revealTiming: readStudioRevealDelays(),
        visual,
        progression: readStudioProgression(),
        releaseSets: readStudioReleaseSets(),
        pack: readStudioPack(),
      }),
    });
    applyVisualConfig();
    populateLevelIncrements();
    renderHome();
    renderBinder();
    renderAchievements();
    renderEvents();
    renderGrowth();
    showToast("Visual configuration published to the game.");
  } catch (error) {
    showToast(error.status === 404 ? "Studio configuration is disabled outside debug mode." : "Could not publish visual configuration.");
  }
}

async function saveRevealDelays() {
  const revealTiming = readStudioRevealDelays();
  try {
    model.gameConfig = await request("/api/studio/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revealTiming,
        visual: readStudioVisualConfig(),
        progression: readStudioProgression(),
        releaseSets: readStudioReleaseSets(),
        pack: readStudioPack(),
      }),
    });
    populateRevealTimingInputs();
    populateLevelIncrements();
    showToast("Reveal timing published to the game.");
  } catch (error) {
    showToast(error.status === 404 ? "Studio configuration is disabled outside debug mode." : "Could not publish reveal timing.");
  }
}

function setShowcaseStage(stage) {
  elements.studioCardGrid.dataset.stage = String(stage);
  elements.studioCardGrid.querySelectorAll(".kalpi-card").forEach((card) => {
    applyCardStage(card, WALKOUT_STAGES[stage]);
  });
  elements.studioStageLabel.textContent = [
    "Ready · empty field",
    "01 / 04 · quote",
    "02 / 04 · party + slot",
    "03 / 04 · member name",
    "04 / 04 · portrait",
  ][stage];
}

function clearShowcaseTimers() {
  showcaseTimers.forEach(clearTimeout);
  showcaseTimers = [];
}

function showStudioComplete() {
  clearShowcaseTimers();
  setShowcaseStage(4);
  elements.playStudioReveal.disabled = false;
}

function playStudioReveal() {
  clearShowcaseTimers();
  setShowcaseStage(0);
  elements.playStudioReveal.disabled = true;
  const delays = readStudioRevealDelays();
  let elapsed = 0;
  ["quote", "party", "name", "portrait"].forEach((key, index) => {
    const stage = index + 1;
    elapsed += delays[key];
    showcaseTimers.push(setTimeout(() => {
      setShowcaseStage(stage);
      if (stage === 4) elements.playStudioReveal.disabled = false;
    }, elapsed));
  });
}

function selectedStudio() {
  if (!model.studioContent) return {};
  const party = model.studioContent.parties.find(({ id }) => id === model.selectedStudioPartyId)
    || model.studioContent.parties[0];
  const members = model.studioContent.members.filter(({ partyId }) => partyId === party?.id);
  const member = members.find(({ id }) => id === model.selectedStudioMemberId) || members[0];
  return { party, members, member };
}

function studioField(label, path, value, { type = "text", options = [] } = {}) {
  if (type === "select") {
    return `<label>${label}<select data-studio-field="${path}">${options.map((option) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  }
  if (type === "textarea") {
    return `<label>${label}<textarea data-studio-field="${path}" rows="3">${escapeHtml(value || "")}</textarea></label>`;
  }
  return `<label>${label}<input data-studio-field="${path}" type="${type}" value="${escapeHtml(value || "")}" /></label>`;
}

function studioReleasedDisplayCode(member, card) {
  const approved = member.quoteSlots.filter((candidate) =>
    candidate.publicationState === "approved" && candidate.quote?.displayText?.trim());
  const entryCard = approved.find((candidate) => candidate.rarity.startsWith("Common")) || approved[0];
  if (card.id !== entryCard?.id || ![1, 2].includes(member.slot)) return null;
  const index = model.studioContent.members.filter((candidate) => candidate.slot === member.slot).findIndex(({ id }) => id === member.id);
  if (index < 0) return null;
  return `${member.slot === 1 ? "ראש" : "משנה"}-${String(index + 1).padStart(2, "0")}`;
}

function studioCardForRuntime(party, member, card) {
  const letters = (party.finalLetters || party.requestedLetters || ["?"])[0];
  return {
    id: card.id,
    set: party.id,
    setName: party.displayNameEn,
    setNameHe: party.displayNameHe,
    letters,
    displayCode: studioReleasedDisplayCode(member, card) || `${letters}-${card.id.slice(-2)}`,
    pip: party.pip,
    title: member.nameEn,
    titleHe: member.nameHe,
    type: "Quote",
    typeHe: "ציטוט",
    rarity: card.rarity,
    subtitle: `מקום ${member.slot} · ${party.displayNameHe}`,
    subtitleHe: `מקום ${member.slot}`,
    membershipNote: String(member.membershipNote || "").trim(),
    artKey: card.art?.artKey || null,
    walkout: {
      text: card.quote?.displayText?.trim() || "",
    },
  };
}

function studioCardMarkup(party, member, card) {
  const populated = Boolean(card.quote?.displayText?.trim());
  const sharedCard = studioCardForRuntime(party, member, card);
  return `
    <article class="naama-concept concept-card studio-quote-card${populated ? "" : " blank-slot"}" data-studio-card="${card.id}">
      <div class="studio-card-heading">
        <p class="concept-number">${escapeHtml(card.rarity)} · ${escapeHtml(card.id)}</p>
        <span class="status-chip">${escapeHtml(card.review?.contentStatus || card.publicationState)}</span>
      </div>
      <div class="studio-shared-card">${displayCardMarkup(sharedCard)}</div>
      <div class="studio-editor-fields">
        ${studioField("Display quote", "quote.displayText", card.quote.displayText, { type: "textarea" })}
        <details>
          <summary>Evidence and wording</summary>
          ${studioField("Original text", "quote.originalText", card.quote.originalText, { type: "textarea" })}
          ${studioField("English translation", "quote.translation", card.quote.translation, { type: "textarea" })}
          ${studioField("Classification", "quote.status", card.quote.status, { type: "select", options: ["researching", "exact", "shortened", "attributed-paraphrase"] })}
          ${studioField("Date", "quote.date", card.quote.date)}
          ${studioField("Source URL", "quote.sourceUrl", card.quote.sourceUrl, { type: "url" })}
          ${studioField("Source title", "quote.sourceTitle", card.quote.sourceTitle)}
          ${studioField("Publisher", "quote.publisher", card.quote.publisher)}
          ${studioField("Source type", "quote.sourceType", card.quote.sourceType, { type: "select", options: ["", "primary", "closest-primary", "secondary"] })}
          ${studioField("Source quality", "quote.sourceQuality", card.quote.sourceQuality, { type: "select", options: ["", "A", "B", "C"] })}
          ${studioField("Context", "quote.context", card.quote.context, { type: "textarea" })}
          ${studioField("Source location", "quote.sourceLocation", card.quote.sourceLocation)}
        </details>
        ${studioField("Scene", "editorial.scene", card.editorial.scene, { type: "textarea" })}
        ${studioField("Added flavor", "editorial.flavor", card.editorial.flavor, { type: "textarea" })}
        <details>
          <summary>Identity reference</summary>
          <label>Reference URL<input data-studio-member-field="url" type="url" value="${escapeHtml(member.identityReference?.url || "")}" /></label>
          <label>License / usage note<input data-studio-member-field="license" type="text" value="${escapeHtml(member.identityReference?.license || "")}" /></label>
          <label>Reference status<input data-studio-member-field="status" type="text" value="${escapeHtml(member.identityReference?.status || "")}" /></label>
        </details>
        ${studioField("Art key", "art.artKey", card.art?.artKey)}
        <details>
          <summary>Weave export metadata</summary>
          ${studioField("Model / version", "art.modelVersion", card.art?.modelVersion)}
          ${studioField("Seed", "art.seed", card.art?.seed)}
          ${studioField("Identity reference strength", "art.identityReferenceStrength", card.art?.identityReferenceStrength)}
          ${studioField("Style reference strength", "art.styleReferenceStrength", card.art?.styleReferenceStrength)}
          ${studioField("Output review", "art.outputReviewStatus", card.art?.outputReviewStatus, { type: "select", options: ["missing", "generated", "likeness-review", "approved", "rejected"] })}
        </details>
        ${studioField("Review status", "review.contentStatus", card.review?.contentStatus, { type: "select", options: ["blank", "researched", "review-needed", "reviewed", "approved", "rejected"] })}
      </div>
      <div class="studio-card-actions">
        <button type="button" data-save-studio-card="${card.id}"${model.studioContent.studioEnabled ? "" : " disabled"}>Save card</button>
        <button type="button" data-copy-studio-card="${card.id}"${populated ? "" : " disabled"}>Copy Weave prompt</button>
        ${card.quote.sourceUrl ? `<a href="${escapeHtml(card.quote.sourceUrl)}" target="_blank" rel="noopener">Inspect source ↗</a>` : ""}
      </div>
      <p class="concept-note">Editorial flavor is symbolic framing—not documentary evidence.</p>
    </article>`;
}

function updateStudioCardPreview(container) {
  const { party, member } = selectedStudio();
  const sourceCard = member?.quoteSlots.find(({ id }) => id === container.dataset.studioCard);
  if (!party || !member || !sourceCard) return;
  const previewCard = JSON.parse(JSON.stringify(sourceCard));
  container.querySelectorAll("[data-studio-field]").forEach((field) => {
    setNestedPatch(previewCard, field.dataset.studioField, field.value);
  });
  const preview = container.querySelector(".studio-shared-card");
  const stage = WALKOUT_STAGES[Number(elements.studioCardGrid.dataset.stage)] || "portrait";
  preview.innerHTML = cardMarkup(
    studioCardForRuntime(party, member, previewCard),
    { finish: previewCard.rarity },
    { progressiveStage: stage, surface: "studio" },
  );
  queueCardTextFit(preview);
}

function renderContentStudio() {
  if (!model.studioContent || !elements.studioCardGrid) return;
  model.selectedStudioPartyId ||= model.studioContent.parties[0]?.id;
  let selection = selectedStudio();
  model.selectedStudioMemberId ||= selection.members[0]?.id;
  selection = selectedStudio();
  const { party, members, member } = selection;
  if (!party || !member) return;

  const populated = model.studioContent.members.flatMap(({ quoteSlots }) => quoteSlots)
    .filter((card) => card.quote.displayText.trim()).length;
  const sourced = model.studioContent.members.flatMap(({ quoteSlots }) => quoteSlots)
    .filter((card) => card.quote.sourceUrl.trim()).length;
  elements.studioContentSummary.textContent = `${model.studioContent.parties.length} parties · ${model.studioContent.members.length} politicians · ${populated} populated quote cards · ${sourced} sourced.`;

  elements.studioPartyTabs.innerHTML = model.studioContent.parties.map((candidate) => {
    const partyMembers = model.studioContent.members.filter(({ partyId }) => partyId === candidate.id);
    const filled = partyMembers.flatMap(({ quoteSlots }) => quoteSlots).filter((card) => card.quote.displayText.trim()).length;
    const possible = partyMembers.length * 3;
    return `<button type="button" role="tab" aria-selected="${candidate.id === party.id}" data-studio-party="${candidate.id}" style="--party-pip:${escapeHtml(candidate.pip)}"><b>${escapeHtml(candidate.displayNameHe)}</b><span>${filled}/${possible}</span></button>`;
  }).join("");
  elements.studioMemberSelect.innerHTML = members.map((candidate) => {
    const filled = candidate.quoteSlots.filter((card) => card.quote.displayText.trim()).length;
    return `<option value="${candidate.id}"${candidate.id === member.id ? " selected" : ""}>${escapeHtml(candidate.nameHe)} · ${filled}/3</option>`;
  }).join("");
  const sourceQuality = member.quoteSlots.filter((card) => card.quote.sourceQuality).map((card) => card.quote.sourceQuality).join(" / ") || "not sourced";
  elements.studioMemberStatus.textContent = `${party.requestedLetters.join(" / ")} · slot ${member.slot} · ${member.treatment} · evidence ${sourceQuality}`;
  elements.studioCardGrid.innerHTML = member.quoteSlots.map((card) => studioCardMarkup(party, member, card)).join("");
  const moments = member.visualMemeMoments || [];
  const alternates = member.alternateCandidates || [];
  elements.studioMemberExtras.innerHTML = moments.length || alternates.length ? `
    <div class="studio-extra-head">
      <div><p class="work-kicker">Meme research desk</p><h3>${moments.length} visual moments · ${alternates.length} alternate lines</h3></div>
      <p>Visual moments are not quotations. They need their own inspectable event source before they become scene flavor.</p>
    </div>
    ${moments.length ? `<section class="studio-moment-list"><h4>Sourced visual moments</h4>${moments.map((moment) => `
      <article>
        <div><strong>${escapeHtml(moment.labelHe || moment.labelEn || moment.title || moment.name || moment.displayText || "Visual moment")}</strong><span>${escapeHtml(moment.eventDate || moment.date || moment.evidenceStatus || moment.textStatus || "")}</span></div>
        <p>${escapeHtml(moment.description || moment.context || moment.scene || "")}</p>
        ${moment.flavor ? `<p><b>Card flavor:</b> ${escapeHtml(moment.flavor)}</p>` : ""}
        ${moment.sourceUrl ? `<a href="${escapeHtml(moment.sourceUrl)}" target="_blank" rel="noopener">Inspect visual source ↗</a>` : ""}
      </article>`).join("")}</section>` : ""}
    ${alternates.length ? `<details class="studio-alternates"><summary>Open alternate quote corpus (${alternates.length})</summary>${alternates.map((quote) => `
      <article>
        <blockquote dir="rtl" lang="he">${escapeHtml(quote.displayText || quote.originalText || quote.text || "")}</blockquote>
        <p>${escapeHtml(quote.date || "")} · ${escapeHtml(quote.context || quote.selectionRationale || "")}</p>
        ${quote.sourceUrl ? `<a href="${escapeHtml(quote.sourceUrl)}" target="_blank" rel="noopener">Inspect source ↗</a>` : ""}
      </article>`).join("")}</details>` : ""}
  ` : "";
  setShowcaseStage(4);
  queueCardTextFit(elements.studioCardGrid);
}

function specialStudioField(label, key, value, { type = "text", options = [] } = {}) {
  if (type === "select") {
    return `<label>${label}<select data-special-field="${key}">${options.map((option) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  }
  if (type === "textarea") {
    return `<label>${label}<textarea data-special-field="${key}" rows="3">${escapeHtml(value || "")}</textarea></label>`;
  }
  return `<label>${label}<input data-special-field="${key}" type="${type}" value="${escapeHtml(value || "")}" /></label>`;
}

function specialStudioCardMarkup(card) {
  const runtimeCard = model.byId.get(card.id);
  if (!runtimeCard) return "";
  return `
    <article class="naama-concept concept-card studio-quote-card" data-studio-special-card="${card.id}">
      <div class="studio-card-heading">
        <p class="concept-number">${escapeHtml(runtimeCard.displayCode)} · ${escapeHtml(card.id)}</p>
        <span class="status-chip">${escapeHtml(card.contentStatus)}</span>
      </div>
      <div class="studio-shared-card">${displayCardMarkup(runtimeCard)}</div>
      <div class="studio-editor-fields">
        ${specialStudioField("Display text", "displayText", card.displayText, { type: "textarea" })}
        <details>
          <summary>Evidence and wording</summary>
          ${specialStudioField("Full record", "originalText", card.originalText, { type: "textarea" })}
          ${specialStudioField("Date / period", "date", card.date)}
          ${specialStudioField("Source URL", "sourceUrl", card.sourceUrl, { type: "url" })}
          ${specialStudioField("Source title", "sourceTitle", card.sourceTitle)}
          ${specialStudioField("Context and caveats", "context", card.context, { type: "textarea" })}
        </details>
        ${specialStudioField("Scene", "scene", card.scene, { type: "textarea" })}
        ${specialStudioField("Added flavor", "flavor", card.flavor, { type: "textarea" })}
        ${specialStudioField("Art key", "artKey", card.artKey)}
        ${specialStudioField("Review status", "contentStatus", card.contentStatus, { type: "select", options: ["draft", "review-needed", "approved", "rejected"] })}
      </div>
      <div class="studio-card-actions">
        <button type="button" data-save-studio-special="${card.id}"${model.studioContent?.studioEnabled ? "" : " disabled"}>Save live card</button>
        <a href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noopener">Inspect source ↗</a>
      </div>
      <p class="concept-note">Fact cards retain their source, measurement unit and caveat in the live runtime record.</p>
    </article>`;
}

function renderSpecialStudio() {
  if (!elements.studioSpecialTabs || !elements.studioSpecialGrid) return;
  const populatedSets = (model.specials.sets || []).filter((set) =>
    model.specials.cards.some((card) => card.setId === set.id));
  model.selectedStudioSpecialSetId ||= populatedSets.find(({ id }) => id === "records")?.id || populatedSets[0]?.id;
  const selectedSet = populatedSets.find(({ id }) => id === model.selectedStudioSpecialSetId) || populatedSets[0];
  if (!selectedSet) return;
  elements.studioSpecialTabs.innerHTML = populatedSets.map((set) => {
    const count = model.specials.cards.filter((card) => card.setId === set.id).length;
    return `<button type="button" role="tab" aria-selected="${set.id === selectedSet.id}" data-studio-special-set="${set.id}"><b>${escapeHtml(set.nameHe)}</b><span>${count}</span></button>`;
  }).join("");
  const cards = model.specials.cards.filter((card) => card.setId === selectedSet.id);
  elements.studioSpecialGrid.innerHTML = cards.map(specialStudioCardMarkup).join("");
  queueCardTextFit(elements.studioSpecialGrid);
}

function updateSpecialStudioPreview(container) {
  const sourceCard = model.byId.get(container.dataset.studioSpecialCard);
  if (!sourceCard) return;
  const previewCard = JSON.parse(JSON.stringify(sourceCard));
  container.querySelectorAll("[data-special-field]").forEach((field) => {
    if (field.dataset.specialField === "displayText") {
      previewCard.subtitle = field.value;
      previewCard.subtitleHe = field.value;
      previewCard.walkout.text = field.value;
    }
    if (field.dataset.specialField === "artKey") previewCard.artKey = field.value || null;
  });
  const preview = container.querySelector(".studio-shared-card");
  preview.innerHTML = displayCardMarkup(previewCard);
  queueCardTextFit(preview);
}

async function saveStudioSpecial(cardId) {
  const container = elements.studioSpecialGrid.querySelector(`[data-studio-special-card="${CSS.escape(cardId)}"]`);
  const patch = Object.fromEntries(
    [...container.querySelectorAll("[data-special-field]")].map((field) => [field.dataset.specialField, field.value]),
  );
  try {
    const result = await request("/api/studio/specials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId, patch }),
    });
    const rawIndex = model.specials.cards.findIndex(({ id }) => id === cardId);
    model.specials.cards[rawIndex] = result.card;
    const runtimeIndex = model.catalog.findIndex(({ id }) => id === cardId);
    if (runtimeIndex >= 0) model.catalog[runtimeIndex] = result.runtimeCard;
    model.byId.set(cardId, result.runtimeCard);
    renderSpecialStudio();
    renderBinder();
    renderGrowth();
    showToast(`Saved live special ${cardId}.`);
  } catch (error) {
    showToast(error.status === 404 ? "Special-card saving is disabled outside debug mode." : "Could not save this special card.");
  }
}

function setNestedPatch(target, dottedPath, value) {
  const [group, field] = dottedPath.split(".");
  target[group] ||= {};
  target[group][field] = value;
}

async function saveStudioCard(cardId) {
  const { member } = selectedStudio();
  const container = elements.studioCardGrid.querySelector(`[data-studio-card="${CSS.escape(cardId)}"]`);
  const patch = {};
  container.querySelectorAll("[data-studio-field]").forEach((field) => {
    setNestedPatch(patch, field.dataset.studioField, field.value.trim());
  });
  const identityReference = Object.fromEntries(
    [...container.querySelectorAll("[data-studio-member-field]")].map((field) => [field.dataset.studioMemberField, field.value.trim()]),
  );
  const populated = Boolean(patch.quote?.displayText);
  patch.publicationState = populated ? "approved" : "blank";
  try {
    const result = await request("/api/studio/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId: member.id, cardId, patch, memberPatch: { identityReference } }),
    });
    const index = member.quoteSlots.findIndex((card) => card.id === cardId);
    member.quoteSlots[index] = result.card;
    member.identityReference = result.identityReference;
    if (result.runtimeCard) {
      const runtimeIndex = model.catalog.findIndex(({ id }) => id === result.runtimeCard.id);
      if (runtimeIndex >= 0) model.catalog[runtimeIndex] = result.runtimeCard;
      else model.catalog.push(result.runtimeCard);
      model.byId.set(result.runtimeCard.id, result.runtimeCard);
    } else if (result.removedCardId) {
      model.catalog = model.catalog.filter(({ id }) => id !== result.removedCardId);
      model.byId.delete(result.removedCardId);
    }
    renderBinder();
    renderStudio();
    showToast(`Saved and published ${cardId}.`);
  } catch (error) {
    showToast(error.status === 404 ? "Studio saving is disabled outside debug mode." : "Could not save this card.");
  }
}

async function copyStudioCardPrompt(cardId) {
  const { party, member } = selectedStudio();
  const card = member.quoteSlots.find(({ id }) => id === cardId);
  const copied = await copyText(buildWeavePrompt({ party, member, card }));
  showToast(copied ? `Copied ${cardId} Weave prompt.` : "Could not copy prompt.");
}

async function copyMemberPrompts() {
  const { party, member } = selectedStudio();
  const prompt = buildMemberWeavePrompt({ party, member });
  const copied = await copyText(prompt);
  showToast(copied ? `Copied one three-image prompt for ${member.nameHe}.` : "Could not copy prompt.");
}

async function copyPackPrompts() {
  const prompt = `${buildPackImagePrompt()}\n\n---\n\n${buildPackRipPrompt()}`;
  const copied = await copyText(prompt);
  showToast(copied ? "Copied KLAFI pack image + rip video prompts." : "Could not copy pack prompts.");
}

async function saveLevelIncrements() {
  try {
    model.gameConfig = await request("/api/studio/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revealTiming: readStudioRevealDelays(),
        visual: readStudioVisualConfig(),
        progression: readStudioProgression(),
        releaseSets: readStudioReleaseSets(),
        pack: readStudioPack(),
        avatars: readStudioAvatars(),
      }),
    });
    populateLevelIncrements();
    renderProgression();
    showToast("Level increments published to the game.");
  } catch (error) {
    showToast(error.status === 404 ? "Studio configuration is disabled outside debug mode." : "Could not publish level increments.");
  }
}

function exportPartyContent() {
  const { party, members } = selectedStudio();
  const blob = new Blob([`${JSON.stringify({ party, members }, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kalpi-studio-${party.id.toLowerCase()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function exportAllQuotes() {
  const csvCell = (value = "") => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const headers = [
    "מזהה מפלגה", "מפלגה", "אותיות", "מקום ברשימה", "שם", "שם באנגלית",
    "מזהה קלף", "נדירות", "מצב פרסום", "ציטוט לתצוגה", "ציטוט מקורי",
    "תאריך", "מקור", "קישור למקור", "סטטוס ציטוט", "הקשר",
    "נימוק עריכתי", "גילוי נאות", "מפתח תמונה", "סטטוס תוכן", "הערות בדיקה",
  ];
  const rows = [];
  for (const party of model.studioContent?.parties || []) {
    const members = (model.studioContent?.members || [])
      .filter(({ partyId }) => party.id === partyId)
      .sort((a, b) => a.slot - b.slot);
    for (const member of members) {
      for (const card of member.quoteSlots || []) {
        rows.push([
          party.id,
          party.displayNameHe,
          (party.finalLetters || party.requestedLetters || []).join(" / "),
          member.slot,
          member.nameHe,
          member.nameEn,
          card.id,
          card.rarity,
          card.publicationState,
          card.quote?.displayText,
          card.quote?.originalText,
          card.quote?.date,
          card.quote?.sourceTitle || card.quote?.publisher,
          card.quote?.sourceUrl,
          card.quote?.status,
          card.quote?.context,
          card.editorial?.selectionRationale,
          card.editorial?.flavorDisclosure,
          card.art?.artKey,
          card.review?.contentStatus,
          card.review?.notes,
        ]);
      }
    }
  }
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}\r\n`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kalpi-all-quotes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast(`Exported ${rows.length} quote rows for Excel.`);
}

async function saveReleaseSets() {
  try {
    model.gameConfig = await request("/api/studio/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revealTiming: readStudioRevealDelays(),
        visual: readStudioVisualConfig(),
        progression: readStudioProgression(),
        releaseSets: readStudioReleaseSets(),
        pack: readStudioPack(),
      }),
    });
    populateReleaseSets();
    renderHome();
    renderBinder();
    showToast("Release calendar and pack odds published.");
  } catch (error) {
    showToast(error.status === 404 ? "Studio configuration is disabled without the ops key." : "Could not publish the set calendar.");
  }
}

function renderStudio() {
  if (studioSecret()) hydrateStudioReports().catch(() => {});
  if (elements.studioShareBinderLink) {
    const shareUrl = new URL("/share/binder", location.origin);
    elements.studioShareBinderLink.href = shareUrl.href;
    elements.studioShareBinderLink.textContent = shareUrl.href.replace(/\/$/, "");
  }
  if (!model.editorial || !model.catalog.length || !elements.cardReviewList) return;
  const profile = model.editorial.advocacy;
  const draftCount = model.catalog.filter((card) => card.walkout.contentStatus === "draft").length;
  const approvedCount = model.catalog.length - draftCount;
  const configured = profile.status === "configured";
  elements.studioSponsor.textContent = profile.sponsor;
  elements.studioViewpoint.textContent = `Supported faction: ${profile.supportedFaction}. ${profile.viewpoint}`;
  elements.studioReleaseStatus.classList.toggle("ready", configured && draftCount === 0);
  elements.studioReleaseStatus.innerHTML = configured && draftCount === 0
    ? "<strong>Release gate clear.</strong> Sponsor configured and every card reviewed."
    : `<strong>Release blocked.</strong> Sponsor status: ${escapeHtml(profile.status)}. ${approvedCount} cards reviewed; ${draftCount} drafts still need direct-source review.`;
  elements.debugResetPack.hidden = !model.editorial.debugEnabled;
  elements.headerDebugReset.hidden = !model.editorial.debugEnabled;
  elements.runGuidedDemo.hidden = !model.editorial.debugEnabled;
  elements.openBibiPack.hidden = !model.editorial.debugEnabled;

  const sample = model.editorial.samples?.[0];
  elements.editorialSample.innerHTML = sample ? `
    <span class="status-chip">${escapeHtml(sample.contentStatus)}</span>
    <blockquote dir="rtl" lang="he">${escapeHtml(sample.quote)}</blockquote>
    <p><strong>${escapeHtml(sample.speaker)}</strong> · ${escapeHtml(sample.date)}</p>
    <p>${escapeHtml(sample.context)}</p>
    <p><a class="source-link" href="${escapeHtml(sample.sourceUrl)}" target="_blank" rel="noopener">Open secondary archive ↗</a></p>
    <p class="work-note">${escapeHtml(sample.reviewGate)}</p>` : "<p>No editorial samples loaded.</p>";

  const cards = model.catalog.filter((card) => {
    const draft = card.walkout.contentStatus === "draft";
    return model.reviewFilter === "all"
      || (model.reviewFilter === "draft" && draft)
      || (model.reviewFilter === "approved" && !draft);
  });
  elements.cardReviewList.innerHTML = cards.map((card) => `
    <article class="review-row">
      <div class="review-code">${card.id}<br /><span class="status-chip">${escapeHtml(card.walkout.contentStatus)}</span></div>
      <div class="review-title"><strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(card.setName)} · ${escapeHtml(card.walkout.editorialRole)}</small></div>
      <div class="review-source">${escapeHtml(card.walkout.sourceLabel)} · ${escapeHtml(card.walkout.date)}<br /><a href="${escapeHtml(card.walkout.sourceUrl)}" target="_blank" rel="noopener" data-source-card="${card.id}">Inspect source ↗</a></div>
      <div class="review-actions"><button type="button" data-review-walkout="${card.id}">Replay walkout</button></div>
    </article>`).join("");
  renderContentStudio();
  renderSpecialStudio();
  renderStudioReports();
}

function reportCategoryLabel(category) {
  return {
    source: "Source or date",
    quote: "Quote or wording",
    identity: "Name, role, or list",
    display: "Display",
    name: "Public name",
    other: "Other",
  }[category] || category;
}

function renderStudioReports() {
  if (!elements.studioReportList) return;
  const reports = model.reports || [];
  if (elements.studioReportEmpty) {
    elements.studioReportEmpty.hidden = reports.length > 0;
    elements.studioReportEmpty.textContent = reports.length
      ? ""
      : "No player reports yet.";
  }
  elements.studioReportList.innerHTML = reports.map((report) => `
    <article class="review-row" data-studio-report="${escapeHtml(report.reportId)}">
      <div class="review-code">${escapeHtml(report.cardId || "—")}<br /><span class="status-chip">${escapeHtml(report.status)}</span></div>
      <div class="review-title"><strong>${escapeHtml(reportCategoryLabel(report.category))}</strong><small>${escapeHtml(report.createdAt || "")}${report.pagePath ? ` · ${escapeHtml(report.pagePath)}` : ""}</small></div>
      <div class="review-source">${escapeHtml(report.details)}${report.reviewerNote ? `<br /><em>${escapeHtml(report.reviewerNote)}</em>` : ""}</div>
      <div class="review-actions">
        <button type="button" data-report-status="reviewing">Review</button>
        <button type="button" data-report-status="resolved">Resolve</button>
        <button type="button" data-report-status="rejected">Reject</button>
      </div>
    </article>`).join("");
}

async function hydrateStudioReports() {
  if (!studioSecret()) return;
  const payload = await request("/api/studio/reports");
  model.reports = payload.reports || [];
  renderStudioReports();
}

async function updateStudioReport(reportId, status) {
  await request(`/api/studio/reports/${encodeURIComponent(reportId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, reviewerNote: status === "resolved" ? "Verified against the source record." : null }),
  });
  await hydrateStudioReports();
  showToast(status === "resolved" ? "Report marked resolved." : `Report marked ${status}.`);
}

async function createTradePreview() {
  const cardId = elements.tradePreview.dataset.cardId;
  const liveDuplicate = elements.tradePreview.dataset.liveDuplicate === "true";
  const url = makeDeepLink("gift", cardId);
  if (liveDuplicate) {
    await recordEvent("gift_preview_created", { cardId, referralCode: referralCode() });
  }
  const copied = await copyText(url);
  showToast(copied
    ? "קישור ההחלפה הועתק."
    : "קישור ההחלפה מוכן.");
}

async function refreshSocialBoards() {
  applyExtrasPayload(await request("/api/community"));
  renderBinder();
  renderGrowth();
}

async function createTradeOffer() {
  const offeredCardId = elements.tradeOfferedCard.value;
  const wantedCardId = elements.tradeWantedCard.value;
  if (!offeredCardId || !wantedCardId || offeredCardId === wantedCardId) {
    showToast("בחרו שני קלפים שונים.");
    return;
  }
  elements.tradeCreate.disabled = true;
  showWait("מפרסמים את ההחלפה…");
  try {
    const result = await request("/api/trades", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offeredCardId, wantedCardId }),
    });
    applyTradeResult(result);
    watchOpenTrade();
    showToast("הצעת ההחלפה פורסמה.");
  } catch (error) {
    if (error.status === 409 && error.body?.error === "ACTIVE_TRADE_EXISTS") {
      applyTradeResult(error.body);
      showToast("כבר יש לכם הצעה פתוחה.");
    } else {
      showToast("לא הצלחנו לפרסם את ההצעה.");
    }
  } finally {
    hideWait();
    elements.tradeCreate.disabled = false;
  }
}

async function simulateTradeAcceptance(tradeId) {
  try {
    const result = await request(`/api/trades/${encodeURIComponent(tradeId)}/simulate-accept`, { method: "POST" });
    setServerState(result.state);
    await refreshSocialBoards();
    showToast("ההחלפה המדומה הושלמה.");
  } catch {
    showToast("ההצעה כבר לא זמינה.");
  }
}

async function acceptTradeOffer(tradeId) {
  try {
    const result = await request(`/api/trades/${encodeURIComponent(tradeId)}/accept`, { method: "POST" });
    applyTradeResult(result);
    settleReceivedCard(result.trade?.offeredCardId, "ההחלפה הושלמה. הקלף נכנס לאוסף.");
  } catch {
    showToast("ההצעה כבר לא זמינה או שחסר לכם הקלף המבוקש.");
  }
}

async function cancelTradeOffer(tradeId) {
  showWait("מבטלים את ההחלפה…");
  try {
    applyTradeResult(await request(`/api/trades/${encodeURIComponent(tradeId)}/cancel`, { method: "POST" }));
    model.watchedTrade = null;
    showToast("הצעת ההחלפה בוטלה.");
  } catch {
    showToast("לא ניתן לבטל את ההצעה.");
  } finally {
    hideWait();
  }
}

async function saveFaction() {
  showWait("שומרים את המפלגה…");
  try {
    setServerState(await request("/api/faction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ factionId: elements.factionSelect.value || null }),
    }));
    renderProfile();
    renderBinder();
    renderGrowth();
    showToast(model.serverState.factionId ? "המפלגה נשמרה. כוכבי האוסף נספרים למפלגה." : "בחירת המפלגה בוטלה.");
  } catch {
    showToast("לא הצלחנו לשמור את המפלגה.");
  } finally {
    hideWait();
  }
}

async function resetDailyPack() {
  const resetButtons = [elements.debugResetPack, elements.headerDebugReset];
  resetButtons.forEach((button) => { button.disabled = true; });
  try {
    setServerState(await request("/api/debug/reset-pack", { method: "POST" }));
    renderHome();
    renderGrowth();
    showToast("Daily pack reset. Today is ready again.");
  } catch (error) {
    showToast(error.status === 404 ? "Debug reset is disabled." : "Could not reset the pack.");
  } finally {
    resetButtons.forEach((button) => { button.disabled = false; });
  }
}

async function debugUnlockCard(cardId) {
  try {
    setServerState(await request("/api/debug/unlock-card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId }),
    }));
    renderBinder();
    openCardDialog(cardId);
    showToast("Card unlocked for local testing.");
  } catch (error) {
    showToast(error.status === 404 ? "Local unlock is disabled." : "Could not unlock this card.");
  }
}

function openCardDialog(cardId, numbered = false) {
  model.dialogCardId = cardId;
  model.dialogBack = false;
  model.dialogNumbered = Boolean(numbered);
  renderDialogCard();
  elements.dialog.showModal();
  queueCardTextFit(elements.dialog);
  maybeShowNumberedTip();
}

function renderDialogCard() {
  const card = model.byId.get(model.dialogCardId);
  const ownedCount = model.showcase ? 0 : (model.serverState?.inventory?.[card.id] ?? 0);
  const numbered = model.showcase ? model.dialogNumbered : Boolean(stampForCard(card)?.numberedIndex);
  const dialogTitle = document.querySelector("#card-dialog-title");
  if (dialogTitle) dialogTitle.textContent = cardTitle(card);
  elements.dialogCard.innerHTML = model.showcase
    ? catalogCardMarkup(card, "display", model.dialogNumbered)
    : displayCardMarkup(card);
  if (elements.dialogTrust) {
    const line = cardTrustLine(card);
    elements.dialogTrust.textContent = line;
    elements.dialogTrust.hidden = !line;
  }
  if (elements.dialogHolders) {
    elements.dialogHolders.textContent = holderLine(holderCountFor(card, numbered), numbered, card);
    elements.dialogHolders.hidden = !model.cardHoldersReady;
  }
  configureSourceLink(elements.dialogSource, card);
  elements.dialogSource.dataset.sourceCard = card.id;
  elements.dialogWhatsapp.hidden = ownedCount < 1;
  elements.dialogInstagram.hidden = ownedCount < 1;
  if (elements.dialogReport) elements.dialogReport.hidden = model.showcase;
}

function currentReportSubject() {
  if (model.reportSubject) return model.reportSubject;
  const card = model.byId.get(model.dialogCardId);
  return card ? { kind: "card", cardId: card.id, label: `${cardTitle(card)} · ${card.id}` } : null;
}

function openReportDialog(subject = null) {
  const card = subject?.cardId ? model.byId.get(subject.cardId) : model.byId.get(model.dialogCardId);
  model.reportSubject = subject || (card ? { kind: "card", cardId: card.id, label: `${cardTitle(card)} · ${card.id}` } : null);
  if (!model.reportSubject) return;
  if (elements.dialog?.open) elements.dialog.close();
  elements.reportForm.reset();
  elements.reportStatus.textContent = "";
  elements.reportCardLabel.textContent = model.reportSubject.label;
  if (model.reportSubject.category) elements.reportCategory.value = model.reportSubject.category;
  elements.reportDialog.showModal();
  (model.reportSubject.category ? elements.reportDetails : elements.reportCategory).focus();
}

function openNameReport(label) {
  const name = String(label || "").trim();
  if (!name) return;
  openReportDialog({
    kind: "name",
    category: "name",
    label: `שם ציבורי · ${name}`,
    detailsPrefix: `שם מדווח: ${name}`,
    pagePath: "/?view=growth",
  });
}

async function submitCorrectionReport(event) {
  event.preventDefault();
  const subject = currentReportSubject();
  if (!subject) return;
  const url = new URL(location.href);
  url.searchParams.delete("studioKey");
  const typed = elements.reportDetails.value.trim();
  const details = [subject.detailsPrefix, typed].filter(Boolean).join("\n");
  const report = {
    reportId: clientOperationId("report"),
    cardId: subject.cardId || "",
    category: elements.reportCategory.value,
    details,
    pagePath: subject.pagePath || `${url.pathname}${url.search}`,
  };
  if (report.details.length < 5) {
    elements.reportStatus.textContent = "כתבו לפחות כמה מילים כדי שנוכל לבדוק.";
    elements.reportDetails.focus();
    return;
  }

  elements.submitReport.disabled = true;
  elements.reportStatus.textContent = "שומרים את הדיווח…";
  rememberPendingReport(report);
  try {
    await flushPendingReports();
    elements.reportStatus.textContent = "";
    elements.reportDialog.close();
    showToast("הדיווח התקבל ונכנס לבדיקה.");
  } catch {
    elements.reportStatus.textContent = "";
    elements.reportDialog.close();
    showToast("הדיווח נשמר במכשיר ויישלח אוטומטית.");
  } finally {
    elements.submitReport.disabled = false;
  }
}

function updateBugCount() {
  if (elements.bugCount) elements.bugCount.textContent = `${(elements.bugDetails?.value || "").length}/500`;
}

// One report form, two modes. `kind` is sent to /api/bugs so the GitHub issue is titled and
// labeled as a bug or a feature request.
const REPORT_MODES = Object.freeze({
  bug: Object.freeze({
    title: "דיווח באג",
    lede: "כתבו מה לא עבד — זה נפתח כפנייה בגיטהאב.",
    label: "מה קרה?",
    placeholder: "מה ראיתם, ומה ציפיתם שיהיה?",
    empty: "כתבו מה לא עבד.",
    submit: "שליחת הדיווח",
    toast: "הדיווח נשלח.",
  }),
  feature: Object.freeze({
    title: "בקשת פיצ׳ר",
    lede: "מה הייתם רוצים שיהיה בקלפי? זה נפתח כבקשה בגיטהאב.",
    label: "מה להוסיף או לשנות?",
    placeholder: "מה חסר לכם, ואיך זה יעזור?",
    empty: "כתבו מה הייתם רוצים שיהיה.",
    submit: "שליחת הבקשה",
    toast: "הבקשה נשלחה.",
  }),
});
let reportKind = "bug";

function openBugDialog(kind = "bug") {
  if (!elements.bugDialog) return;
  reportKind = kind === "feature" ? "feature" : "bug";
  const mode = REPORT_MODES[reportKind];
  elements.bugForm?.reset();
  elements.bugDialog.dataset.kind = reportKind;
  if (elements.bugDialogTitle) elements.bugDialogTitle.textContent = mode.title;
  if (elements.bugDialogLede) elements.bugDialogLede.textContent = mode.lede;
  if (elements.bugDetailsLabel) elements.bugDetailsLabel.textContent = mode.label;
  if (elements.bugDetails) elements.bugDetails.placeholder = mode.placeholder;
  if (elements.submitBug) elements.submitBug.textContent = mode.submit;
  if (elements.bugStatus) elements.bugStatus.textContent = "";
  updateBugCount();
  elements.bugDialog.showModal();
  elements.bugDetails?.focus();
}

async function submitBugReport(event) {
  event.preventDefault();
  const text = (elements.bugDetails?.value || "").trim();
  if (!text) {
    if (elements.bugStatus) elements.bugStatus.textContent = REPORT_MODES[reportKind].empty;
    elements.bugDetails?.focus();
    return;
  }
  if (elements.submitBug) elements.submitBug.disabled = true;
  if (elements.bugStatus) elements.bugStatus.textContent = "שולחים…";
  try {
    const result = await request("/api/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        kind: reportKind,
        nickname: (elements.bugNickname?.value || "").trim() || null,
        pageUrl: location.href,
        website: elements.bugWebsite?.value || "",
      }),
    });
    if (elements.bugStatus) {
      elements.bugStatus.textContent = result.issueUrl
        ? "תודה. הדיווח נפתח בגיטהאב."
        : "תודה, הדיווח נשלח.";
    }
    showToast(REPORT_MODES[reportKind].toast);
    elements.bugDialog?.close();
  } catch (error) {
    if (elements.bugStatus) {
      elements.bugStatus.textContent = error.status === 429
        ? "נסו שוב מחר — יש מגבלה של שלושה דיווחים ביום."
        : error.status === 503
          ? "דיווח הבאגים עדיין לא מוכן."
          : "לא הצלחנו לשלוח. נסו שוב.";
    }
  } finally {
    if (elements.submitBug) elements.submitBug.disabled = false;
  }
}

function showToast(message, ms = 2200) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => elements.toast.classList.remove("show"), ms);
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = `${line}${word} `;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line.trim(), x, y + lines * lineHeight);
      lines += 1;
      line = `${word} `;
      if (lines >= maxLines) return y + lines * lineHeight;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) {
    context.fillText(line.trim(), x, y + lines * lineHeight);
    lines += 1;
  }
  return y + lines * lineHeight;
}

async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function makeShareImage(card) {
  const presentation = cardPresentation(card, stampForCard(card) || {});
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  context.direction = "rtl";

  context.fillStyle = "#f4efe4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#1a1f1c";
  context.lineWidth = 6;
  context.strokeRect(54, 54, 972, 1242);
  context.fillStyle = presentation.pip;
  context.fillRect(84, 86, 18, 100);

  context.fillStyle = "#1a1f1c";
  context.font = "600 34px 'IBM Plex Sans'";
  context.textAlign = "center";
  context.fillText(`${presentation.typeLabel} · ${presentation.code}`, 310, 130);
  context.fillText("קְלָפִי · KLAFI · 2026", 790, 130);
  context.textAlign = "right";

  context.fillStyle = "#1f4f4a";
  context.font = "600 21px 'IBM Plex Sans'";
  context.fillText(card.walkout.kind === "quote" ? "הציטוט לפני השם" : "העובדה לפני הזהות", 996, 205);
  context.fillStyle = "#1a1f1c";
  context.font = "600 42px Fraunces";
  const quoteEnd = wrapCanvasText(context, presentation.rawQuote, 996, 260, 912, 48, 3);

  const artX = 84;
  const artY = Math.max(390, quoteEnd + 36);
  const artWidth = 912;
  const artHeight = 470;
  context.fillStyle = "#e7dfd0";
  context.fillRect(artX, artY, artWidth, artHeight);
  if (presentation.artKey) {
    try {
      const image = await loadImage(`/design-assets/${encodeURIComponent(presentation.artKey)}`);
      const scale = Math.max(artWidth / image.width, artHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.save();
      context.beginPath();
      context.rect(artX, artY, artWidth, artHeight);
      context.clip();
      context.drawImage(image, artX + (artWidth - width) / 2, artY + (artHeight - height) / 2, width, height);
      context.restore();
    } catch {
      // The typographic fallback below still produces a valid share image.
    }
  }
  if (!presentation.artKey) {
    context.fillStyle = presentation.pip;
    context.textAlign = "center";
    context.font = "600 190px Fraunces";
    context.fillText(placeholderMark(card), 540, 610);
    context.textAlign = "right";
  }

  context.fillStyle = "#1a1f1c";
  context.font = "600 62px Fraunces";
  const titleEnd = wrapCanvasText(context, presentation.title, 996, artY + artHeight + 74, 912, 66, 2);
  context.font = "500 27px 'IBM Plex Sans'";
  context.fillStyle = "#2c3330";
  const subtitleEnd = wrapCanvasText(context, presentation.subtitle, 996, titleEnd + 18, 912, 36, 2);
  context.fillStyle = "#1f4f4a";
  context.font = "600 22px 'IBM Plex Sans'";
  context.fillText("מקור מצורף לקלף", 996, subtitleEnd + 52);
  context.fillStyle = "#1a1f1c";
  context.font = "500 20px 'IBM Plex Sans'";
  context.textAlign = "center";
  context.fillText("מהדורת עמדה גלויה", 270, 1240);
  context.fillText("פותחים את המקור · מכירים את הרשימה", 810, 1240);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

const SHARE_PULL_LINE = "תראו מה שלפתי בקְלָפִי!";

function shareCaption(card) {
  const url = makeDeepLink("card", card.id);
  const quote = String(card.walkout?.text || "").trim();
  const title = cardTitle(card);
  const trust = cardTrustLine(card);
  return {
    title: `קְלָפִי · ${title}`,
    text: [SHARE_PULL_LINE, quote, `— ${title}`, trust, url].filter(Boolean).join("\n"),
    url,
  };
}

function downloadBlob(blob, name) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function readyShareFonts() {
  try {
    await document.fonts?.ready;
  } catch {
    // Canvas still exports with fallback faces.
  }
}

async function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))), "image/png");
  });
}

function roundedRectPath(context, x, y, width, height, radius) {
  const corner = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

function measureWrappedLines(context, text, maxWidth, maxLines = 4) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawWrappedLines(context, lines, x, y, lineHeight) {
  for (const [index, line] of lines.entries()) {
    context.fillText(line, x, y + index * lineHeight);
  }
}

function drawLtrCentered(context, text, x, y) {
  context.save();
  context.direction = "ltr";
  context.textAlign = "start";
  const glyphs = [...String(text || "")];
  const widths = glyphs.map((glyph) => context.measureText(glyph).width);
  let cursor = x - widths.reduce((sum, next) => sum + next, 0) / 2;
  for (const [index, glyph] of glyphs.entries()) {
    context.fillText(glyph, cursor, y);
    cursor += widths[index];
  }
  context.restore();
}

function coverImageInRect(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function fitShareQuote(context, quote, maxWidth, maxHeight, high, low) {
  let size = high;
  let lines = [];
  let lineHeight = size * 1.15;
  const floor = Math.min(low, 10);
  while (size >= floor) {
    context.font = `600 ${size}px 'Noto Serif Hebrew', Fraunces, serif`;
    lines = measureWrappedLines(context, quote, maxWidth, 5);
    lineHeight = size * 1.12;
    if (lines.length * lineHeight <= maxHeight) break;
    size -= 1;
  }
  return { size: Math.max(floor, size), lines, lineHeight };
}

function paintFullartShareIdentity(context, card, presentation, { x, y, width, height }) {
  const fade = context.createLinearGradient(0, y, 0, y + height);
  fade.addColorStop(0, "rgba(0, 0, 0, 0)");
  fade.addColorStop(0.63, "rgba(0, 0, 0, 0)");
  fade.addColorStop(0.71, "rgba(0, 0, 0, 0.22)");
  fade.addColorStop(0.83, "rgba(0, 0, 0, 0.78)");
  fade.addColorStop(0.91, "#000");
  fade.addColorStop(1, "#000");
  context.fillStyle = fade;
  context.fillRect(x, y, width, height);

  const pillHeight = width * 0.068;
  const pillPad = width * 0.022;
  const pillX = x + width * 0.034;
  const pillY = y + width * 0.034;
  context.font = `600 ${Math.round(width * 0.034)}px 'IBM Plex Sans Hebrew', 'IBM Plex Sans', sans-serif`;
  const codeWidth = context.measureText(presentation.code).width + pillPad * 2;
  context.fillStyle = "rgba(5, 5, 5, 0.36)";
  context.strokeStyle = "rgba(247, 242, 232, 0.28)";
  context.lineWidth = Math.max(1, width * 0.003);
  roundedRectPath(context, pillX, pillY, codeWidth, pillHeight, pillHeight / 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#f7f2e8";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(presentation.code, pillX + codeWidth / 2, pillY + pillHeight / 2);

  const textWidth = width * 0.87;
  const centerX = x + width / 2;
  const nameSize = width * 0.08;
  const metaSize = width * 0.035;
  const partyLine = [
    presentation.setName,
    card.type === "Quote" ? presentation.subtitle : "",
  ].filter(Boolean).join(" · ");
  const nameBand = { top: y + height * 0.69, height: height * 0.06 };
  const partyY = y + height * 0.775;
  const rarityY = y + height * 0.825;
  const quoteBox = { top: y + height * 0.86, height: height * 0.13 };
  context.font = `600 ${nameSize}px 'Noto Serif Hebrew', Fraunces, serif`;
  const nameLines = measureWrappedLines(context, presentation.title, textWidth, 2);
  const quoteFit = fitShareQuote(
    context,
    presentation.quote,
    textWidth,
    quoteBox.height * 0.92,
    width * 0.064,
    width * 0.028,
  );

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#f7f2e8";
  context.font = `600 ${nameSize}px 'Noto Serif Hebrew', Fraunces, serif`;
  const nameBlock = nameLines.length * nameSize * 1.15;
  const nameStart = nameBand.top + (nameBand.height - nameBlock) / 2 + nameSize * 0.42;
  context.textBaseline = "alphabetic";
  drawWrappedLines(context, nameLines, centerX, nameStart, nameSize * 1.15);

  context.fillStyle = "rgba(247, 242, 232, 0.72)";
  context.font = `500 ${metaSize}px 'IBM Plex Sans Hebrew', 'IBM Plex Sans', sans-serif`;
  context.textBaseline = "middle";
  context.fillText(partyLine, centerX, partyY);
  const partyWidth = context.measureText(partyLine).width;
  const pip = Math.max(4, width * 0.011);
  context.fillStyle = presentation.pip || "#1f4f4a";
  context.beginPath();
  context.arc(centerX + partyWidth / 2 + pip * 1.6, partyY, pip, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#c4a35a";
  context.font = `500 ${metaSize}px 'IBM Plex Sans Hebrew', 'IBM Plex Sans', sans-serif`;
  context.fillText(`${presentation.rarityMark} ${presentation.rarityName}`, centerX, rarityY);

  context.fillStyle = "#f7f2e8";
  context.font = `600 ${quoteFit.size}px 'Noto Serif Hebrew', Fraunces, serif`;
  context.textBaseline = "alphabetic";
  const quoteBlock = quoteFit.lines.length * quoteFit.lineHeight;
  const quoteStart = quoteBox.top + (quoteBox.height - quoteBlock) / 2 + quoteFit.size * 0.86;
  drawWrappedLines(context, quoteFit.lines, centerX, quoteStart, quoteFit.lineHeight);
  context.textBaseline = "alphabetic";
}

function paintTallShareIdentity(context, card, presentation, { x, y, width, height }) {
  const inset = width * 0.036;
  const nameSize = width * 0.07;
  const partySize = width * 0.035;
  const quoteSize = width * 0.048;
  const centerX = x + width / 2;
  const textWidth = width - inset * 2;
  const nameTop = y + height * 0.722;
  const nameHeight = height * 0.074;
  context.fillStyle = "#1f4f4a";
  context.fillRect(x + inset, nameTop, width - inset * 2, nameHeight);
  context.fillStyle = "#f7f2e8";
  context.textAlign = "center";
  context.font = `600 ${nameSize}px 'Noto Serif Hebrew', Fraunces, serif`;
  context.fillText(presentation.title, centerX, nameTop + nameHeight * 0.7);

  const partyLine = [
    presentation.setName,
    card.type === "Quote" ? presentation.subtitle : "",
  ].filter(Boolean).join(" · ");
  const partyY = y + height * 0.83;
  context.fillStyle = "#1a1f1c";
  context.font = `500 ${partySize}px 'IBM Plex Sans Hebrew', 'IBM Plex Sans', sans-serif`;
  context.fillText(partyLine, centerX, partyY);
  const partyWidth = context.measureText(partyLine).width;
  const pip = Math.max(4, width * 0.011);
  context.fillStyle = presentation.pip || "#1f4f4a";
  context.beginPath();
  context.arc(centerX + partyWidth / 2 + pip * 1.6, partyY - partySize * 0.32, pip, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#1a1f1c";
  context.font = `600 ${quoteSize}px 'Noto Serif Hebrew', Fraunces, serif`;
  const quoteLines = measureWrappedLines(context, presentation.quote, textWidth, 3);
  drawWrappedLines(context, quoteLines, centerX, y + height * 0.89, quoteSize * 1.15);

  const pillHeight = width * 0.068;
  const pillPad = width * 0.022;
  context.font = `600 ${Math.round(width * 0.034)}px 'IBM Plex Sans Hebrew', 'IBM Plex Sans', sans-serif`;
  const codeWidth = context.measureText(presentation.code).width + pillPad * 2;
  context.fillStyle = "rgba(238, 229, 212, 0.72)";
  context.strokeStyle = "rgba(196, 163, 90, 0.38)";
  context.lineWidth = Math.max(1, width * 0.003);
  roundedRectPath(context, x + width * 0.034, y + width * 0.034, codeWidth, pillHeight, pillHeight / 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#3c3026";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(presentation.code, x + width * 0.034 + codeWidth / 2, y + width * 0.034 + pillHeight / 2);
  context.textBaseline = "alphabetic";
}

async function paintShareCardFace(context, card, box) {
  const presentation = cardPresentation(card, stampForCard(card) || {});
  const frame = cardDisplayFrame(card);
  const radius = Math.min(12, box.width * 0.032);
  context.save();
  roundedRectPath(context, box.x, box.y, box.width, box.height, radius);
  context.clip();
  context.fillStyle = frame === "fullart-v1" ? "#050505" : "#f4efe4";
  context.fillRect(box.x, box.y, box.width, box.height);

  if (presentation.artKey) {
    try {
      const image = await loadImage(`/design-assets/${encodeURIComponent(presentation.artKey)}`);
      if (frame === "fullart-v1") {
        coverImageInRect(context, image, box.x, box.y, box.width, box.height);
      } else {
        const well = {
          x: box.x + box.width * 0.028,
          y: box.y + box.width * 0.028,
          width: box.width * 0.944,
          height: box.height * 0.70,
        };
        context.save();
        roundedRectPath(context, well.x, well.y, well.width, well.height, Math.min(8, box.width * 0.02));
        context.clip();
        coverImageInRect(context, image, well.x, well.y, well.width, well.height);
        context.restore();
      }
    } catch {
      context.fillStyle = presentation.pip || "#1f4f4a";
      context.font = `600 ${Math.round(box.width * 0.28)}px Fraunces`;
      context.textAlign = "center";
      context.fillText(placeholderMark(card), box.x + box.width / 2, box.y + box.height * 0.38);
    }
  } else {
    context.fillStyle = presentation.pip || "#1f4f4a";
    context.font = `600 ${Math.round(box.width * 0.28)}px Fraunces`;
    context.textAlign = "center";
    context.fillText(placeholderMark(card), box.x + box.width / 2, box.y + box.height * 0.38);
  }

  if (frame === "fullart-v1") {
    paintFullartShareIdentity(context, card, presentation, box);
  } else {
    paintTallShareIdentity(context, card, presentation, box);
  }
  context.restore();

  if (["rare", "holo", "promotion"].includes(presentation.finishClass)) {
    context.save();
    context.strokeStyle = "#c4a35a";
    context.lineWidth = Math.max(2, box.width * 0.008);
    roundedRectPath(context, box.x, box.y, box.width, box.height, radius);
    context.stroke();
    context.restore();
  } else if (presentation.finishClass === "uncommon") {
    context.save();
    context.strokeStyle = "rgba(196, 163, 90, 0.7)";
    context.lineWidth = Math.max(1, box.width * 0.004);
    roundedRectPath(context, box.x + 2, box.y + 2, box.width - 4, box.height - 4, radius);
    context.stroke();
    context.restore();
  } else {
    context.save();
    context.strokeStyle = "#111";
    context.lineWidth = Math.max(1, box.width * 0.004);
    roundedRectPath(context, box.x, box.y, box.width, box.height, radius);
    context.stroke();
    context.restore();
  }
}

async function paintSharePortrait(card, { width, height }) {
  await readyShareFonts();
  const shareUrl = makeDeepLink("card", card.id);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.direction = "rtl";
  context.fillStyle = "#111111";
  context.fillRect(0, 0, width, height);

  const pad = Math.round(width * 0.046);
  const captionSize = Math.round(width * 0.042);
  const footerSize = Math.round(width * 0.026);
  const captionTop = pad + captionSize;
  const trustLine = cardTrustLine(card);
  const footerBlock = footerSize * (trustLine ? 5.1 : 3.2);
  const availTop = captionTop + Math.round(width * 0.038);
  const availBottom = height - pad - footerBlock;
  const availHeight = Math.max(120, availBottom - availTop);
  const availWidth = width - pad * 2;
  const cardWidth = Math.min(availWidth, availHeight * (63 / 96));
  const cardHeight = cardWidth * (96 / 63);
  const cardX = (width - cardWidth) / 2;
  const cardY = availTop + (availHeight - cardHeight) / 2;

  context.fillStyle = "#f7f2e8";
  context.textAlign = "center";
  context.font = `600 ${captionSize}px 'Noto Serif Hebrew', Fraunces, serif`;
  context.fillText(SHARE_PULL_LINE, width / 2, captionTop);

  await paintShareCardFace(context, card, { x: cardX, y: cardY, width: cardWidth, height: cardHeight });

  const footerY = cardY + cardHeight + footerSize * 1.6;
  context.fillStyle = "rgba(247, 242, 232, 0.74)";
  context.textAlign = "center";
  context.font = `600 ${footerSize}px 'IBM Plex Sans Hebrew', 'IBM Plex Sans', sans-serif`;
  context.fillText("קְלָפִי", width / 2, footerY);
  let urlY = footerY + footerSize * 1.35;
  if (trustLine) {
    context.font = `500 ${Math.round(width * 0.018)}px 'IBM Plex Sans Hebrew', 'IBM Plex Sans', sans-serif`;
    const trustHeight = paintCenteredLines(
      context,
      trustLine,
      width / 2,
      footerY + footerSize * 1.2,
      width - pad * 2,
      Math.round(width * 0.028),
    );
    urlY = footerY + footerSize * 1.2 + trustHeight * Math.round(width * 0.028) + footerSize * 0.35;
  }
  context.font = `500 ${Math.round(width * 0.02)}px 'IBM Plex Sans', sans-serif`;
  drawLtrCentered(context, shareUrl.replace(/^https?:\/\//, ""), width / 2, urlY);
  return canvasToPng(canvas);
}

function paintCenteredLines(context, text, x, y, maxWidth, lineHeight) {
  const parts = String(text).split(" · ");
  const lines = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current} · ${part}` : part;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  const painted = lines.slice(0, 2);
  painted.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return painted.length;
}

async function makeStoryImage(card) {
  return paintSharePortrait(card, { width: 1080, height: 1920 });
}

async function makeWhatsAppImage(card) {
  return paintSharePortrait(card, { width: 1080, height: 1350 });
}

function canShareFiles(file) {
  try {
    return Boolean(navigator.share && navigator.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
}

async function copyShareImage(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

const pendingShare = {
  channel: null,
  blob: null,
  file: null,
  title: "",
  text: "",
  url: "",
};

function revokeSharePreview() {
  const current = elements.shareSheetImage?.dataset.objectUrl;
  if (current) URL.revokeObjectURL(current);
  if (elements.shareSheetImage) {
    elements.shareSheetImage.removeAttribute("src");
    delete elements.shareSheetImage.dataset.objectUrl;
  }
}

function openShareSheet({ channel, blob, file, title, text, url }) {
  pendingShare.channel = channel;
  pendingShare.blob = blob;
  pendingShare.file = file;
  pendingShare.title = title;
  pendingShare.text = text;
  pendingShare.url = url;
  revokeSharePreview();
  const preview = URL.createObjectURL(blob);
  elements.shareSheetImage.src = preview;
  elements.shareSheetImage.dataset.objectUrl = preview;
  const lines = String(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const urlLine = lines.find((line) => /^https?:\/\//.test(line)) || url;
  elements.shareSheetCaption.replaceChildren();
  for (const line of lines.filter((line) => line !== urlLine)) {
    elements.shareSheetCaption.append(document.createTextNode(`${line}\n`));
  }
  const urlMark = document.createElement("span");
  urlMark.dir = "ltr";
  urlMark.textContent = urlLine;
  elements.shareSheetCaption.append(urlMark);
  elements.shareSheetTitle.textContent = channel === "instagram" ? "העלו לסטורי" : "שלחו בוואטסאפ";
  elements.shareSheetSend.textContent = channel === "instagram" ? "פתיחת אינסטגרם" : "פתיחת וואטסאפ";
  elements.shareSheet.showModal();
}

function closeShareSheet() {
  elements.shareSheet?.close();
  revokeSharePreview();
}

function openWhatsAppText(text) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

function openInstagramStory() {
  window.open("instagram://story-camera", "_blank", "noopener");
  window.setTimeout(() => {
    if (document.visibilityState === "visible") {
      window.open("https://www.instagram.com/", "_blank", "noopener");
    }
  }, 700);
}

async function sendPendingShare() {
  if (pendingShare.channel === "whatsapp") {
    if (canShareFiles(pendingShare.file)) {
      try {
        await navigator.share({ title: pendingShare.title, text: pendingShare.text, files: [pendingShare.file] });
        closeShareSheet();
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    await copyText(pendingShare.text);
    openWhatsAppText(pendingShare.text);
    showToast("וואטסאפ נפתח עם הטקסט והקישור. צרפו את התמונה ששמרתם.");
    return;
  }
  if (pendingShare.channel === "instagram") {
    if (canShareFiles(pendingShare.file)) {
      try {
        await navigator.share({ title: pendingShare.title, text: pendingShare.text, files: [pendingShare.file] });
        closeShareSheet();
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    await copyText(pendingShare.url);
    openInstagramStory();
    showToast("העלו את התמונה לסטורי. הקישור כתוב עליה וגם הועתק.");
  }
}

async function runShareAction(button, work) {
  const markup = button.innerHTML;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    await work();
  } catch (error) {
    if (error.name !== "AbortError") showToast("לא הצלחנו להכין את השיתוף.");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.innerHTML = markup;
  }
}

async function sharePreparedCard(button, { channel, makeImage, fileName, eventChannel }) {
  const card = model.byId.get(model.dialogCardId);
  await runShareAction(button, async () => {
    const blob = await makeImage(card);
    const file = new File([blob], fileName(card), { type: "image/png" });
    const { title, text, url } = shareCaption(card);
    if (canShareFiles(file)) {
      try {
        await navigator.share({ title, text, files: [file] });
        showToast(channel === "instagram"
          ? "בחרו Instagram Story. הקישור כתוב על התמונה."
          : "בחרו וואטסאפ — התמונה, הטקסט והקישור מוכנים.");
        await recordEvent("share_created", { cardId: card.id, referralCode: referralCode(), channel: eventChannel });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    downloadBlob(blob, file.name);
    await copyText(channel === "instagram" ? url : text);
    await copyShareImage(blob);
    openShareSheet({ channel, blob, file, title, text, url });
    showToast(channel === "instagram"
      ? "הסטורי מוכן. שמרו והעלו לאינסטגרם — הקישור על התמונה."
      : "התמונה נשמרה. שלחו בוואטסאפ עם הטקסט והקישור.");
    await recordEvent("share_created", { cardId: card.id, referralCode: referralCode(), channel: eventChannel });
  });
}

async function shareToWhatsApp() {
  await sharePreparedCard(elements.dialogWhatsapp, {
    channel: "whatsapp",
    makeImage: makeWhatsAppImage,
    fileName: (card) => `kalpi-${card.id}.png`,
    eventChannel: "whatsapp",
  });
}

async function shareToInstagram() {
  await sharePreparedCard(elements.dialogInstagram, {
    channel: "instagram",
    makeImage: makeStoryImage,
    fileName: (card) => `kalpi-${card.id}-story.png`,
    eventChannel: "instagram",
  });
}

function referralCode() {
  return `k-${model.token.slice(0, 8)}`;
}

function makeDeepLink(kind, cardId) {
  const url = new URL(`/share/${encodeURIComponent(cardId)}`, location.origin);
  url.searchParams.set("ref", referralCode());
  if (kind === "gift") url.searchParams.set("gift", "1");
  return url.toString();
}

function publicBinderShareUrl(slug) {
  if (!slug) return "";
  return new URL(`/share/u/${encodeURIComponent(slug)}`, location.origin).toString();
}

function inboundBinderSlug() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get("binder");
  if (fromQuery) return fromQuery;
  const fromPath = location.pathname.match(/^\/share\/u\/([^/]+)$/);
  return fromPath ? decodeURIComponent(fromPath[1]) : "";
}

async function copyText(text) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    field.style.fontSize = "16px"; // iOS zooms into focused fields under 16px
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

async function offerDuplicate() {
  const card = model.byId.get(model.dialogCardId);
  const url = makeDeepLink("gift", card.id);
  await recordEvent("gift_preview_created", { cardId: card.id, referralCode: referralCode() });
  if (navigator.share) {
    try {
      await navigator.share({
        title: `החלפה · ${cardTitle(card)}`,
        text: `יש לי עותק נוסף של ${cardTitle(card)}. אפשר לראות אותו בקְלָפִי.\n${url}`,
      });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  const copied = await copyText(url);
  showToast(copied ? "קישור ההחלפה הועתק." : "הצעת ההחלפה מוכנה.");
}

elements.openPack.addEventListener("click", openIdleReturn);
elements.openPackFancy.addEventListener("click", () => openIdleReturn("fancy"));
elements.sharedOpenGame.addEventListener("click", leaveSharedCard);
elements.showcaseOpenGame?.addEventListener("click", leaveShowcase);
elements.openBibiPack.addEventListener("click", openBibiDebugPack);
elements.packAction.addEventListener("click", handlePackAction);
elements.eventPull?.addEventListener("click", pullEventCard);
elements.retry.addEventListener("click", bootstrap);
elements.openQuiz?.addEventListener("click", openQuizDialog);
elements.closeQuiz?.addEventListener("click", () => {
  stopQuizTimer();
  elements.quizDialog.close();
});
elements.quizSubmit?.addEventListener("click", submitQuiz);
elements.quizQuestions?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-quiz-option]");
  const question = option?.closest("[data-quiz-question]");
  if (!option || !question) return;
  quizAnswers[question.dataset.quizQuestion] = option.dataset.quizOption;
  question.querySelectorAll("[data-quiz-option]").forEach((button) => {
    button.classList.toggle("selected", button === option);
  });
});
elements.playerName.addEventListener("click", openProfileDialog);
elements.levelAvatarButton?.addEventListener("click", openProfileDialog);
elements.addAchievement?.addEventListener("click", () => {
  if (!elements.studioAchievements) return;
  elements.studioAchievements.insertAdjacentHTML("beforeend", achievementEditorMarkup({
    id: `badge-${Date.now().toString(36)}`,
    nameHe: "הישג חדש",
    descriptionHe: "",
    rule: "unique",
    target: 1,
  }));
});
elements.profileForm.addEventListener("submit", saveProfile);
elements.copyRecovery?.addEventListener("click", copyRecoveryCode);
elements.enableIdleNotify?.addEventListener("click", () => {
  requestIdleNotifications().catch(() => {});
});
// Header speaker: aria-pressed = muted. Label names the action the next tap performs.
function renderSoundToggle() {
  if (!elements.soundToggle) return;
  const label = sfx.soundOn ? "השתקת צלילים" : "הפעלת צלילים";
  elements.soundToggle.setAttribute("aria-label", label);
  elements.soundToggle.title = label;
  elements.soundToggle.setAttribute("aria-pressed", String(!sfx.soundOn));
  elements.soundToggle.classList.toggle("muted", !sfx.soundOn);
}
renderSoundToggle();
elements.soundToggle?.addEventListener("click", () => {
  sfx.setSoundOn(!sfx.soundOn);
  if (sfx.soundOn) {
    sfx.unlock();
    sfx.play("click");
  }
  renderSoundToggle();
});
// Audio needs a gesture on iOS: unlock (and decode the kit) on touches anywhere. Not `once`: a
// touch pointerdown/touchstart isn't a user activation on iOS (touchend/pointerup/click are), and
// the context can fall to "interrupted" after a call or app switch. unlock() is a no-op once running.
for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
  document.addEventListener(type, () => sfx.unlock(), { capture: true, passive: true });
}
// Button click sound on primary buttons only, not on every tap.
document.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest(".primary-action") : null;
  if (!button || button.disabled) return;
  sfx.unlock();
  sfx.play("click");
}, { capture: true }); // capture: runs before handlers that disable the button
elements.homeEnableNotify?.addEventListener("click", () => {
  requestIdleNotifications().catch(() => {});
});
elements.createLeague?.addEventListener("click", () => {
  createLeagueRoom().catch(() => {});
});
elements.joinLeague?.addEventListener("click", () => {
  joinLeagueFromInput().catch(() => {});
});
elements.leagueJoinInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    joinLeagueFromInput().catch(() => {});
  }
});
elements.leagueRooms?.addEventListener("click", (event) => {
  const leave = event.target.closest("[data-leave-league]");
  if (leave) {
    model.leagueLeaveConfirm = leave.dataset.leaveLeague;
    renderLeagues();
    elements.leagueRooms.querySelector("[data-leave-league-cancel]")?.focus({ preventScroll: true });
    return;
  }
  const confirmLeave = event.target.closest("[data-leave-league-confirm]");
  if (confirmLeave) {
    leaveLeagueRoom(confirmLeave.dataset.leaveLeagueConfirm).catch(() => {});
    return;
  }
  if (event.target.closest("[data-leave-league-cancel]")) {
    model.leagueLeaveConfirm = null;
    renderLeagues();
    return;
  }
  const copy = event.target.closest("[data-copy-league]");
  if (copy) {
    copyText(copy.dataset.copyLeague).then((copied) => {
      showToast(copied ? "קישור הליגה הועתק." : "העתיקו את הקישור מהקוד.");
      if (!copied) return;
      // A short in-place confirmation on the stamp itself, next to the toast.
      const hint = copy.querySelector("small span");
      copy.classList.add("copied");
      if (hint) hint.textContent = "הקישור הועתק";
      setTimeout(() => {
        copy.classList.remove("copied");
        if (hint) hint.textContent = "לחצו להעתקת הקישור";
      }, 1600);
    });
    return;
  }
  handlePublicNameReport(event);
});
elements.restoreButton?.addEventListener("click", restoreSessionFromCode);
elements.restoreInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    restoreSessionFromCode();
  }
});
elements.avatarPicker?.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-avatar-id]");
  if (!choice || choice.disabled) return;
  model.selectedAvatarId = choice.dataset.avatarId;
  renderAvatarPicker();
});
elements.saveAchievements?.addEventListener("click", saveStudioAchievements);
elements.saveEvents?.addEventListener("click", saveStudioEvents);
elements.closeProfile.addEventListener("click", () => elements.profileDialog.close());
elements.closeDialog.addEventListener("click", () => elements.dialog.close());
elements.dialogReport.addEventListener("click", () => openReportDialog());
elements.closeReport.addEventListener("click", () => elements.reportDialog.close());
elements.reportForm.addEventListener("submit", submitCorrectionReport);
elements.openBugReport?.addEventListener("click", () => openBugDialog("bug"));
elements.openFeatureRequest?.addEventListener("click", () => openBugDialog("feature"));
elements.closeBug?.addEventListener("click", () => elements.bugDialog?.close());
elements.bugForm?.addEventListener("submit", submitBugReport);
elements.bugDetails?.addEventListener("input", updateBugCount);
elements.closeLevel.addEventListener("click", dismissLevelDialog);
elements.claimLevel.addEventListener("click", async () => {
  elements.claimLevel.disabled = true;
  try {
    await startLevelRewardGrant().catch(() => {});
    dismissLevelDialog();
  } finally {
    elements.claimLevel.disabled = false;
  }
});
elements.shareMyBinder?.addEventListener("click", copyMyBinderLink);
elements.copyBinderShare?.addEventListener("click", copyMyBinderLink);
elements.closeGuestBinder?.addEventListener("click", closePublicBinder);
elements.dialogWhatsapp.addEventListener("click", shareToWhatsApp);
elements.dialogInstagram.addEventListener("click", shareToInstagram);
elements.closeShareSheet?.addEventListener("click", closeShareSheet);
elements.shareSheetSend?.addEventListener("click", () => {
  sendPendingShare().catch(() => showToast("לא הצלחנו לפתוח את השיתוף."));
});
elements.shareSheetSave?.addEventListener("click", () => {
  if (!pendingShare.blob || !pendingShare.file) return;
  downloadBlob(pendingShare.blob, pendingShare.file.name);
  showToast("התמונה נשמרה.");
});
elements.shareSheet?.addEventListener("click", (event) => {
  if (event.target === elements.shareSheet) closeShareSheet();
});
elements.skipToMain?.addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#main")?.focus();
});
elements.openAdvocacy.addEventListener("click", () => elements.advocacyDialog.showModal());
elements.closeAdvocacy.addEventListener("click", () => elements.advocacyDialog.close());
elements.tradeDemo.addEventListener("click", createTradePreview);
elements.tradePreview.addEventListener("click", (event) => {
  const card = event.target.closest("[data-trade-card]");
  if (card) openCardDialog(card.dataset.tradeCard);
});
for (const preview of [elements.tradeOfferedPreview, elements.tradeWantedPreview]) {
  preview.addEventListener("click", (event) => {
    const card = event.target.closest("[data-trade-choice-card]");
    if (card) openCardDialog(card.dataset.tradeChoiceCard);
  });
}
// The event ticker sits in .home-grid, outside .today-docket, so it needs its own listener
// (the docket delegate below never saw its clicks).
elements.todaySpecialsRow?.addEventListener("click", () => {
  claimTodaySpecial().catch(() => showToast("לא הצלחנו לאסוף את הקלף המיוחד."));
});
document.querySelector(".today-docket").addEventListener("click", (event) => {
  const hook = event.target.closest("[data-today-nav]");
  if (!hook) return;
  if (hook.dataset.communityPage) {
    model.communityPage = hook.dataset.communityPage;
    model.communitySection = communitySectionFor(hook.dataset.communityPage);
  }
  elements.navButtons.find((button) => button.dataset.nav === hook.dataset.todayNav)?.click();
  if (hook.dataset.communityPage) renderGrowth();
  if (hook.dataset.communityPage === "challenge") refreshDailyChallenge();
});
elements.tradeOfferedSet.addEventListener("change", renderGrowth);
elements.tradeWantedSet.addEventListener("change", renderGrowth);
elements.tradeOfferedCard.addEventListener("change", renderGrowth);
elements.tradeWantedCard.addEventListener("change", renderGrowth);
elements.tradeCreate.addEventListener("click", createTradeOffer);
function handleTradeBoardClick(event) {
  const cancel = event.target.closest("[data-cancel-trade]");
  if (cancel) {
    cancelTradeOffer(cancel.dataset.cancelTrade);
    return;
  }
  const accept = event.target.closest("[data-accept-trade]");
  if (accept) {
    acceptTradeOffer(accept.dataset.acceptTrade);
    return;
  }
  const chip = event.target.closest("[data-trade-choice-card]");
  if (chip) {
    openCardDialog(chip.dataset.tradeChoiceCard);
    return;
  }
  const button = event.target.closest("[data-simulate-trade]");
  if (button) simulateTradeAcceptance(button.dataset.simulateTrade);
}
elements.tradeBoard.addEventListener("click", handleTradeBoardClick);
function handlePublicNameReport(event) {
  const binder = event.target.closest("[data-binder-slug]");
  if (binder) {
    event.preventDefault();
    openPublicBinder(binder.dataset.binderSlug).catch(() => showToast("לא מצאנו את האלבום הזה."));
    return;
  }
  const button = event.target.closest("[data-report-name]");
  if (!button) return;
  openNameReport(button.dataset.reportName);
}
elements.collectorBoard?.addEventListener("click", handlePublicNameReport);
elements.dailyChallengeBoard?.addEventListener("click", handlePublicNameReport);
elements.tradeActive?.addEventListener("click", handleTradeBoardClick);
elements.tradeBoardOffered?.addEventListener("change", () => {
  model.tradeBoardOffered = elements.tradeBoardOffered.value;
  model.tradeBoardPage = 0;
  renderTradeBoard();
});
elements.tradeBoardWanted?.addEventListener("change", () => {
  model.tradeBoardWanted = elements.tradeBoardWanted.value;
  model.tradeBoardPage = 0;
  renderTradeBoard();
});
elements.tradeBoardPager?.addEventListener("click", (event) => {
  const button = event.target.closest('[data-page-target="trades"]');
  if (!button) return;
  model.tradeBoardPage = Number(button.dataset.page);
  renderTradeBoard();
});
elements.factionSelect.addEventListener("change", renderFactionMembers);
elements.saveFaction.addEventListener("click", saveFaction);
elements.creatorCode.addEventListener("input", () => {
  elements.creatorLinkPreview.textContent = creatorLink();
});
elements.copyCreatorLink.addEventListener("click", async () => {
  const copied = await copyText(creatorLink());
  showToast(copied ? "קישור השיתוף הועתק." : "קישור השיתוף מוכן.");
});
elements.runGuidedDemo.addEventListener("click", runGuidedDemo);
elements.studioDebugPull?.addEventListener("click", runStudioDebugPull);
elements.debugResetPack.addEventListener("click", resetDailyPack);
elements.headerDebugReset.addEventListener("click", resetDailyPack);
elements.playStudioReveal.addEventListener("click", playStudioReveal);
elements.showStudioComplete.addEventListener("click", showStudioComplete);
elements.copyMemberPrompts.addEventListener("click", copyMemberPrompts);
elements.copyPackPrompts?.addEventListener("click", copyPackPrompts);
elements.exportPartyContent.addEventListener("click", exportPartyContent);
elements.exportAllQuotes.addEventListener("click", exportAllQuotes);
Object.values(revealDelayInputs()).forEach((input) => input.addEventListener("change", saveRevealDelays));
Object.values(visualConfigInputs()).forEach((input) => input.addEventListener("change", saveVisualConfig));
elements.levelIncrements?.addEventListener("change", saveLevelIncrements);
elements.levelExponent?.addEventListener("change", saveLevelIncrements);
elements.rankNames?.addEventListener("change", saveLevelIncrements);
elements.grantLevelReward?.addEventListener("change", saveLevelIncrements);
elements.avatarUnlocks?.addEventListener("change", saveLevelIncrements);
elements.numberedSets?.addEventListener("change", saveLevelIncrements);
elements.numberedEvery?.addEventListener("change", saveLevelIncrements);
elements.numberedTipDismiss?.addEventListener("click", () => {
  markPageSeen("numbered");
  hideNumberedTip();
});
elements.saveReleaseSets?.addEventListener("click", saveReleaseSets);
elements.studioPartyTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-studio-party]");
  if (!button) return;
  model.selectedStudioPartyId = button.dataset.studioParty;
  model.selectedStudioMemberId = null;
  renderContentStudio();
});
elements.studioMemberSelect.addEventListener("change", () => {
  model.selectedStudioMemberId = elements.studioMemberSelect.value;
  renderContentStudio();
});
elements.studioCardGrid.addEventListener("click", (event) => {
  const save = event.target.closest("[data-save-studio-card]");
  if (save) saveStudioCard(save.dataset.saveStudioCard);
  const copy = event.target.closest("[data-copy-studio-card]");
  if (copy) copyStudioCardPrompt(copy.dataset.copyStudioCard);
});
elements.studioCardGrid.addEventListener("input", (event) => {
  const card = event.target.closest("[data-studio-card]");
  if (!card) return;
  card.classList.add("dirty");
  if (["quote.displayText", "art.artKey"].includes(event.target.dataset.studioField)) {
    updateStudioCardPreview(card);
  }
});
elements.studioSpecialTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-studio-special-set]");
  if (!button) return;
  model.selectedStudioSpecialSetId = button.dataset.studioSpecialSet;
  renderSpecialStudio();
});
elements.studioSpecialGrid.addEventListener("click", (event) => {
  const save = event.target.closest("[data-save-studio-special]");
  if (save) saveStudioSpecial(save.dataset.saveStudioSpecial);
});
elements.studioSpecialGrid.addEventListener("input", (event) => {
  const card = event.target.closest("[data-studio-special-card]");
  if (!card) return;
  card.classList.add("dirty");
  if (["displayText", "artKey"].includes(event.target.dataset.specialField)) {
    updateSpecialStudioPreview(card);
  }
});
elements.reviewFilter.addEventListener("change", () => {
  model.reviewFilter = elements.reviewFilter.value;
  renderStudio();
});
elements.cardReviewList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-walkout]");
  if (button) startSharedWalkout(button.dataset.reviewWalkout);
});

elements.studioReportList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-report-status]");
  const row = event.target.closest("[data-studio-report]");
  if (!button || !row) return;
  updateStudioReport(row.dataset.studioReport, button.dataset.reportStatus).catch(() => {
    showToast("Could not update the report.");
  });
});

elements.navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (model.showcase) {
      leaveShowcase();
      return;
    }
    if (button.dataset.nav === "binder") {
      loadStaticCatalog().catch(() => {});
      hydrateExtras().catch(() => {});
    } else if (button.dataset.nav !== "home") hydrateExtras().catch(() => {});
    if (button.dataset.nav === "home") {
      renderHome();
      showView("home");
    } else if (button.dataset.nav === "binder") {
      renderBinder();
      showView("binder");
    } else if (button.dataset.nav === "achievements") {
      renderAchievements();
      showView("achievements");
    } else if (button.dataset.nav === "events") {
      renderEvents();
      showView("events");
    } else if (button.dataset.nav === "growth") {
      renderGrowth();
      showView("growth");
    } else if (button.dataset.nav === "studio") {
      if (!studioViewAllowed()) {
        renderHome();
        showView("home");
        return;
      }
      renderStudio();
      showView("studio");
    }
  });
});

elements.binderFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  model.binderFilter = button.dataset.filter;
  model.binderPage = 0;
  renderBinder();
});
elements.binderFilters.addEventListener("change", (event) => {
  const owned = event.target.closest("[data-binder-owned]");
  if (owned) {
    model.binderOwnedOnly = owned.checked;
    model.binderPage = 0;
    renderBinder();
    return;
  }
  const select = event.target.closest("[data-binder-party]");
  if (!select) return;
  model.binderParty = select.value;
  model.binderPage = 0;
  renderBinder();
});

elements.binderGrid?.addEventListener("scroll", syncBinderScrollCue, { passive: true });
window.addEventListener("resize", syncBinderScrollCue, { passive: true });
elements.binderPager.addEventListener("click", (event) => {
  const button = event.target.closest('[data-page-target="binder"]');
  if (!button) return;
  model.binderPage = Number(button.dataset.page);
  renderBinder();
});

elements.achievementTiers?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-achievement-tier]");
  if (!button) return;
  model.achievementTier = button.dataset.achievementTier;
  renderAchievements();
});

elements.communitySections?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-community-section]");
  if (!button) return;
  showCommunitySection(button.dataset.communitySection);
  pollWatchedTrade().catch(() => {});
});
elements.communityTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-community-page]");
  if (!button) return;
  model.communityPage = button.dataset.communityPage;
  model.communitySection = communitySectionFor(button.dataset.communityPage);
  renderGrowth();
  if (model.communityPage === "challenge") refreshDailyChallenge();
  pollWatchedTrade().catch(() => {});
});

elements.eventTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-event-page]");
  if (!button) return;
  model.eventPage = button.dataset.eventPage;
  renderEvents();
});

elements.binderGrid.addEventListener("click", (event) => {
  const unlock = event.target.closest("[data-debug-unlock]");
  if (unlock) {
    debugUnlockCard(unlock.dataset.debugUnlock);
    return;
  }
  const button = event.target.closest("[data-card-id]");
  if (button) openCardDialog(button.dataset.cardId);
});
elements.showcaseFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  model.binderFilter = button.dataset.filter;
  model.binderPage = 0;
  renderShowcaseBinder();
});
elements.showcaseFilters?.addEventListener("change", (event) => {
  const select = event.target.closest("[data-showcase-party]");
  if (!select) return;
  model.binderParty = select.value;
  model.binderPage = 0;
  renderShowcaseBinder();
});
elements.showcaseGrid?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-card-id]");
  if (button) openCardDialog(button.dataset.cardId, button.hasAttribute("data-numbered"));
});
elements.studioShareBinderCopy?.addEventListener("click", async () => {
  const href = elements.studioShareBinderLink?.href || new URL("/share/binder", location.origin).href;
  try {
    await navigator.clipboard.writeText(href);
    showToast("קישור האלבום הועתק.");
  } catch {
    showToast(href);
  }
});

function showCollectionTooltip(target) {
  const tooltip = target.closest("[data-tooltip]");
  if (!tooltip) return;
  showToast(tooltip.dataset.tooltip);
}

function onBinderBadgeActivate(event) {
  if (event.target.closest("[data-open-achievements]")) {
    renderAchievements();
    showView("achievements");
    return;
  }
  showCollectionTooltip(event.target);
}
elements.earnedBadgeRail.addEventListener("click", onBinderBadgeActivate);
elements.earnedBadgeList?.addEventListener("click", onBinderBadgeActivate);
elements.earnedBadgeRail.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showCollectionTooltip(event.target);
});
elements.earnedBadgeList?.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showCollectionTooltip(event.target);
});

elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.closeEventDialog.addEventListener("click", () => elements.eventDialog.close());
elements.eventDialogOk.addEventListener("click", () => {
  const retry = elements.eventDialog.dataset.outcome === "retry";
  elements.eventDialog.close();
  if (retry && model.specialWindow?.reward === "pull") claimEventPull(model.specialWindow);
});
elements.eventDialog.addEventListener("click", (event) => {
  if (event.target === elements.eventDialog) elements.eventDialog.close();
});
elements.advocacyDialog.addEventListener("click", (event) => {
  if (event.target === elements.advocacyDialog) elements.advocacyDialog.close();
});
elements.profileDialog.addEventListener("click", (event) => {
  if (event.target === elements.profileDialog) elements.profileDialog.close();
});

function moveTabFocus(event) {
  const current = event.target.closest('[role="tab"]');
  const tablist = current?.closest('[role="tablist"]');
  if (!current || !tablist || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return false;
  const tabs = [...tablist.querySelectorAll('[role="tab"]:not(:disabled)')].filter((tab) => !tab.hidden);
  const currentIndex = tabs.indexOf(current);
  if (currentIndex < 0) return false;
  const rtl = getComputedStyle(tablist).direction === "rtl";
  const step = event.key === "ArrowLeft" ? (rtl ? 1 : -1) : (rtl ? -1 : 1);
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? tabs.length - 1
      : (currentIndex + step + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
  return true;
}

document.addEventListener("keydown", (event) => {
  if (moveTabFocus(event)) return;
  const packIsOpen = document.querySelector("#pack-view").classList.contains("active");
  const advancePack = event.key === "ArrowRight" || event.key === "ArrowLeft";
  if (advancePack && packIsOpen && !elements.packAction.disabled && !playerDialogOpen()) {
    event.preventDefault();
    elements.packAction.click();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (elements.studioCardGrid.querySelector(".dirty")) event.preventDefault();
});
window.addEventListener("resize", () => {
  renderBinder();
  renderAchievements();
  queueCardTextFit(elements.main);
  layoutAdvocacyDock();
});
document.addEventListener("click", (event) => {
  const sourceLink = event.target.closest("[data-source-card]");
  if (sourceLink) recordEvent("source_opened", { cardId: sourceLink.dataset.sourceCard });
});
window.addEventListener("online", () => flushPendingReports().catch(() => {}));

if (!window.__klafiTradeWatch) {
  window.__klafiTradeWatch = setInterval(() => {
    pollWatchedTrade().catch(() => {});
  }, 8000);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pollWatchedTrade().catch(() => {});
});
// Warm the rip layers on the first idle moment so the first pack tap starts the rip at once.
schedulePackRipPrefetch();
bootstrap().then(() => {
  if (!model.showcase) klafiTips.maybeStart();
});
flushPendingReports().catch(() => {});
document.fonts?.ready.then(() => queueCardTextFit(elements.main));
window.__kalpiDebug = {
  openCardDialog,
  setOwned(cardId, count) {
    if (!model.serverState) return false;
    model.serverState.inventory ??= {};
    model.serverState.inventory[cardId] = count;
    renderBinder();
    if (elements.dialog.open || model.dialogCardId === cardId) openCardDialog(cardId);
    return true;
  },
  makeWhatsAppImage,
  makeStoryImage,
  shareToWhatsApp,
  shareToInstagram,
  shareCaption,
  paintSharePortrait,
};
