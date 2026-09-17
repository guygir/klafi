import { buildMemberWeavePrompt, buildPackImagePrompt, buildPackRipPrompt, buildWeavePrompt } from "./prompt-builder.js";

const SESSION_KEY = "kalpi-alpha-session";
const STUDIO_KEY = "kalpi-studio-secret";
const HOME_CACHE_KEY = "kalpi-home-cache";
const STATIC_DATA_VERSION = "prepared-pulls-1";
const DAY_MS = 24 * 60 * 60 * 1000;
const WALKOUT_STAGES = ["blank", "quote", "party", "identity", "portrait"];
const model = {
  token: localStorage.getItem(SESSION_KEY),
  editorial: null,
  studioContent: null,
  gameConfig: {
    revealTiming: { quote: 200, party: 1100, name: 700, portrait: 1000 },
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
  binderPage: 0,
  achievementPage: 0,
  communityPage: "trade",
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
};
let showcaseTimers = [];
let packTimers = [];

const elements = {
  views: [...document.querySelectorAll(".view")],
  main: document.querySelector("#main"),
  headerStatus: document.querySelector("#header-status"),
  playerName: document.querySelector("#player-name"),
  playerNameLabel: document.querySelector("#player-name-label"),
  playerAvatar: document.querySelector("#player-avatar"),
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
  closeProfile: document.querySelector("#close-profile"),
  homeTitle: document.querySelector("#home-title"),
  homeCopy: document.querySelector("#home-copy"),
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
  todayEventHook: document.querySelector("#today-event-hook"),
  todayEventMeta: document.querySelector("#today-event-meta"),
  todayLeaderHook: document.querySelector("#today-leader-hook"),
  todayLeaderMeta: document.querySelector("#today-leader-meta"),
  homePack: document.querySelector("#home-pack"),
  homePackRip: document.querySelector("#home-pack-rip"),
  homePackRipBackdrop: document.querySelector("#home-pack-rip-backdrop"),
  openPack: document.querySelector("#open-pack"),
  openPackFancy: document.querySelector("#open-pack-fancy"),
  openBibiPack: document.querySelector("#open-bibi-pack"),
  openQuiz: document.querySelector("#open-quiz"),
  openPendingLevel: document.querySelector("#open-pending-level"),
  quizDialog: document.querySelector("#quiz-dialog"),
  closeQuiz: document.querySelector("#close-quiz"),
  quizTitle: document.querySelector("#quiz-title"),
  quizClock: document.querySelector("#quiz-clock"),
  quizCard: document.querySelector("#quiz-card"),
  quizQuestions: document.querySelector("#quiz-questions"),
  quizFail: document.querySelector("#quiz-fail"),
  quizSubmit: document.querySelector("#quiz-submit"),
  quizStatus: document.querySelector("#quiz-status"),
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
  sharedSource: document.querySelector("#shared-source"),
  sharedOpenGame: document.querySelector("#shared-open-game"),
  binderPercent: document.querySelector("#binder-percent"),
  binderCount: document.querySelector("#binder-count"),
  binderFilters: document.querySelector("#binder-filters"),
  binderGrid: document.querySelector("#binder-grid"),
  binderPager: document.querySelector("#binder-pager"),
  binderEmpty: document.querySelector("#binder-empty"),
  achievementsEmpty: document.querySelector("#achievements-empty"),
  achievementGrid: document.querySelector("#achievement-grid"),
  achievementPager: document.querySelector("#achievement-pager"),
  communityTabs: document.querySelector("#community-tabs"),
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
  activeEvent: document.querySelector("#active-event"),
  eventTabs: document.querySelector("#event-tabs"),
  eventPull: document.querySelector("#event-pull"),
  eventCards: document.querySelector("#event-cards"),
  eventUpcoming: document.querySelector("#event-upcoming"),
  tradePreview: document.querySelector("#trade-preview"),
  tradeOfferedPreview: document.querySelector("#trade-offered-preview"),
  tradeWantedPreview: document.querySelector("#trade-wanted-preview"),
  tradeDemo: document.querySelector("#trade-demo"),
  tradeOfferedSet: document.querySelector("#trade-offered-set"),
  tradeOfferedCard: document.querySelector("#trade-offered-card"),
  tradeWantedSet: document.querySelector("#trade-wanted-set"),
  tradeWantedCard: document.querySelector("#trade-wanted-card"),
  tradeCreate: document.querySelector("#trade-create"),
  tradeBoard: document.querySelector("#trade-board"),
  creatorCode: document.querySelector("#creator-code"),
  copyCreatorLink: document.querySelector("#copy-creator-link"),
  creatorLinkPreview: document.querySelector("#creator-link-preview"),
  growthEmpty: document.querySelector("#growth-empty"),
  growthMetrics: document.querySelector("#growth-metrics"),
  factionSelect: document.querySelector("#faction-select"),
  saveFaction: document.querySelector("#save-faction"),
  factionBoard: document.querySelector("#faction-board"),
  collectorBoard: document.querySelector("#collector-board"),
  dailyChallengeTitle: document.querySelector("#daily-challenge-title"),
  dailyChallengeLeaderArt: document.querySelector("#daily-challenge-leader-art"),
  dailyChallengeRecap: document.querySelector("#daily-challenge-recap"),
  dailyChallengeBoard: document.querySelector("#daily-challenge-board"),
  specialsGrid: document.querySelector("#specials-grid"),
  studioSponsor: document.querySelector("#studio-sponsor"),
  studioViewpoint: document.querySelector("#studio-viewpoint"),
  studioReleaseStatus: document.querySelector("#studio-release-status"),
  studioReleaseSets: document.querySelector("#studio-release-sets"),
  saveReleaseSets: document.querySelector("#save-release-sets"),
  debugClock: document.querySelector("#debug-clock"),
  headerDebugReset: document.querySelector("#header-debug-reset"),
  runGuidedDemo: document.querySelector("#run-guided-demo"),
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
  copyPackPrompts: document.querySelector("#copy-pack-prompts"),
  editorialSample: document.querySelector("#editorial-sample"),
  reviewFilter: document.querySelector("#review-filter"),
  cardReviewList: document.querySelector("#card-review-list"),
  errorTitle: document.querySelector("#error-title"),
  errorCopy: document.querySelector("#error-copy"),
  retry: document.querySelector("#retry"),
  navButtons: [...document.querySelectorAll("[data-nav]")],
  dialog: document.querySelector("#card-dialog"),
  dialogCard: document.querySelector("#dialog-card"),
  dialogOwnership: document.querySelector("#dialog-ownership"),
  dialogSource: document.querySelector("#dialog-source"),
  dialogShare: document.querySelector("#dialog-share"),
  dialogWhatsapp: document.querySelector("#dialog-whatsapp"),
  dialogInstagram: document.querySelector("#dialog-instagram"),
  dialogGift: document.querySelector("#dialog-gift"),
  closeDialog: document.querySelector("#close-dialog"),
  toast: document.querySelector("#toast"),
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

function studioSecret() {
  return localStorage.getItem(STUDIO_KEY);
}

function captureStudioSecret() {
  const url = new URL(location.href);
  const key = url.searchParams.get("studioKey");
  if (!key) return;
  localStorage.setItem(STUDIO_KEY, key);
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

async function ensureSession() {
  if (model.token) {
    try {
      model.serverState = await request("/api/state");
      return;
    } catch (error) {
      if (error.status !== 401) throw error;
    }
  }

  const { token } = await request("/api/session", { method: "POST" });
  model.token = token;
  localStorage.setItem(SESSION_KEY, token);
  model.serverState = await request("/api/state");
}

function applyHomePayload(home) {
  if (home.token) {
    model.token = home.token;
    localStorage.setItem(SESSION_KEY, home.token);
  }
  if (home.state) {
    model.serverState = { ...model.serverState, ...home.state };
    if (home.cards) model.idleQueue = home.cards;
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
      token: model.token,
      cards: model.idleQueue,
      state: {
        displayName: home.state.displayName,
        avatarId: home.state.avatarId,
        ownedUnique: home.state.ownedUnique,
        totalCards: home.state.totalCards,
        unseenCount: home.state.unseenCount,
        nextIdleAt: home.state.nextIdleAt,
        preparedPulls: home.state.preparedPulls || [],
        idleCapacity: home.state.idleCapacity,
        progression: home.state.progression,
        avatars: home.state.avatars,
        inventory: home.state.inventory || {},
        favorites: home.state.favorites || [],
      },
    }));
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
  model.editorial = shell.editorial || model.editorial;
  if (!model.serverState && shell.totals) {
    model.serverState = {
      ownedUnique: 0,
      totalCards: shell.totals.idleEligible,
      unseenCount: 0,
      idleCapacity: 8,
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
  model.catalog = cards;
  model.byId = new Map(cards.map((card) => [card.id, card]));
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
  document.querySelectorAll("[data-debug-only]").forEach((element) => {
    element.hidden = !boot.studioContent?.debugEnabled;
  });
  document.querySelectorAll("[data-studio-only]").forEach((element) => {
    element.hidden = !boot.studioContent?.studioEnabled;
  });
  applyVisualConfig();
  model.leaderboards = boot.leaderboards;
  model.specials = boot.specials;
  model.serverState = boot.idleReturn.state;
  model.idleQueue = boot.idleReturn.cards || [];
  model.trades = boot.trades || [];
  model.events = boot.events || [];
  applyCatalog(cards);
  populateRevealTimingInputs();
  populateLevelIncrements();
  populateStudioMeta();
  applyHomePayload({ token: boot.token, state: boot.idleReturn.state });
}

let catalogHydrate = null;
let homeHydrate = null;
let extrasHydrate = null;
let idleHydrate = null;
let idleRefillTimer = null;
let catalogFailed = false;
const PLAYER_VIEWS = ["home", "binder", "achievements", "events", "growth", "studio"];

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
  return PLAYER_VIEWS.includes(view) ? view : "";
}

function persistPlayerView(name) {
  const url = new URL(location.href);
  if (PLAYER_VIEWS.includes(name) && name !== "home") url.searchParams.set("view", name);
  else url.searchParams.delete("view");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next !== current) history.replaceState({}, "", next);
}

function paintPlayerView(name) {
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
      renderBinder();
      renderHome();
      handleInboundLink();
      return model;
    }).catch((error) => {
      catalogFailed = true;
      renderBinder();
      throw error;
    }).finally(() => {
      catalogHydrate = null;
    });
  }
  return catalogHydrate;
}

async function hydrateHome() {
  if (!homeHydrate) {
    const warmedHome = window.__kalpiWarmup?.home;
    if (window.__kalpiWarmup) window.__kalpiWarmup.home = null;
    homeHydrate = (warmedHome || request("/api/home")).then((home) => {
      applyHomePayload(home);
      renderProfile();
      renderHome();
      renderBinder();
      return home;
    }).finally(() => {
      homeHydrate = null;
    });
  }
  return homeHydrate;
}

function nextCachedIdleCard(current = Date.now()) {
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

function prefetchIdleAssets() {
  if (!model.catalog.length) return;
  const pulls = [...model.idleQueue, ...(model.serverState?.preparedPulls || [])];
  for (const { cardId } of pulls) {
    const artKey = model.byId.get(cardId)?.artKey;
    if (!artKey) continue;
    const image = new Image();
    image.src = `/design-assets/${encodeURIComponent(artKey)}`;
  }
}

async function hydrateIdleQueue() {
  if (!idleHydrate) {
    idleHydrate = (async () => {
      if (!model.token) await hydrateHome();
      const settled = await request("/api/idle/settle", { method: "POST" });
      model.idleQueue = settled.cards || [];
      applyHomePayload({ ...settled, state: settled.state });
      prefetchIdleAssets();
      renderHome();
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

function applyExtrasPayload({ events, trades, leaderboards, activity, specials, state }) {
  if (events) model.events = events.events || events;
  if (trades) model.trades = trades.trades || trades;
  if (leaderboards) model.leaderboards = leaderboards;
  if (activity) model.activity = activity;
  if (specials) model.specials = specials;
  if (state) model.serverState = { ...model.serverState, ...state };
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
  if (model.extrasReady) return model;
  if (!extrasHydrate) {
    extrasHydrate = Promise.allSettled([
      request("/api/events"),
      request("/api/trades"),
      request("/api/leaderboards"),
      request("/api/activity"),
      request("/api/specials"),
      request("/api/state"),
    ]).then(async (results) => {
      const [events, trades, leaderboards, activity, specials, state] = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      applyExtrasPayload({ events, trades, leaderboards, activity, specials, state });
      model.extrasReady = results.every(({ status }) => status === "fulfilled");
      if (studioSecret()) {
        try {
          model.studioContent = await request("/api/studio/content");
        } catch {
          /* Studio stays closed without the secret. */
        }
      }
      paintExtras();
      return model;
    }).finally(() => {
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

async function bootstrap() {
  captureStudioSecret();
  applyCachedHome();
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
    const homePromise = hydrateHome();
    homePromise.then(() => {
      prefetchIdleAssets();
      const hasPreparedBuffer = model.idleQueue.length || (model.serverState?.preparedPulls || []).length;
      const missingDueCard = !nextCachedIdleCard()
        && Boolean(model.serverState?.nextIdleAt)
        && Date.parse(model.serverState.nextIdleAt) <= Date.now();
      const priority = !hasPreparedBuffer || missingDueCard
        ? "urgent"
        : cachedDueCount() > 1 ? "backlog" : "buffered";
      scheduleIdleRefill({ priority });
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
  const profile = model.editorial?.advocacy;
  if (!profile) return;
  elements.advocacyShort.textContent = "מהדורת עמדה גלויה · קְלָפִי תומכת בשינוי";
  elements.advocacySponsor.textContent = `בחסות ${profile.sponsor}`;
  elements.advocacyFull.textContent = "קְלָפִי מתחילה בהיכרות עובדתית, ממשיכה לעמדות ולהחלטות, ובהמשך מפרסמת גם סדרות ביקורת לפי קו עריכתי גלוי. בחירת הציטוטים אינה ניטרלית; המקור והסיווג מופיעים בכל קלף.";
  elements.advocacyPhases.innerHTML = "<li><strong>היכרות.</strong> מנהיגים ומספרי שתיים.</li><li><strong>עומק.</strong> עמדות, החלטות ורקורדים.</li><li><strong>ביקורת.</strong> סדרות מסומנות במפורש.</li><li><strong>מקור.</strong> לכל קלף מצורף קישור; ניסוח מחדש מסומן בכוכבית.</li>";
}

async function recordEvent(type, details = {}) {
  try {
    await request("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, ...details }),
    });
    model.activity = await request("/api/activity");
    model.serverState = await request("/api/state");
    renderActivity();
    renderBinder();
    renderAchievements();
    renderProgression();
    renderGrowth();
  } catch (error) {
    console.warn(`Could not record ${type}`, error);
  }
}

function handleInboundLink() {
  const params = new URLSearchParams(location.search);
  const cardId = params.get("gift") ?? params.get("card");
  const referralCode = params.get("ref");
  if (referralCode && !sessionStorage.getItem(`kalpi-ref-${referralCode}`)) {
    sessionStorage.setItem(`kalpi-ref-${referralCode}`, "1");
    recordEvent("referral_opened", { referralCode, cardId });
  }
  if (cardId && model.byId.has(cardId)) {
    showSharedCard(cardId, params.has("gift"));
    return;
  }
  const requestedView = params.get("view");
  if (PLAYER_VIEWS.includes(requestedView)) {
    elements.navButtons.find((button) => button.dataset.nav === requestedView)?.click();
  }
}

function showSharedCard(cardId, isTradeIntent = false) {
  const card = model.byId.get(cardId);
  elements.sharedTitle.textContent = cardTitle(card);
  elements.sharedCard.innerHTML = displayCardMarkup(card);
  elements.sharedNotice.textContent = isTradeIntent
    ? "זו תצוגה של הצעת החלפה. הבעלות לא השתנתה והקלף לא נוסף לאוסף שלכם."
    : "זו תצוגת שיתוף בלבד. הקלף לא נוסף לאוסף שלכם.";
  elements.sharedSource.href = card.walkout.sourceUrl;
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
  const frameWidth = frame?.clientWidth ?? 0;
  if (!frameWidth || !element.clientWidth || !element.clientHeight) return;
  const role = element.dataset.fitCardText;
  const compact = ["binder", "trade", "peek"].includes(frame.dataset.cardSurface);
  const scale = {
    quote: { low: 0.04, high: 0.085, floor: compact ? 7.5 : 11, ceiling: 30 },
    party: { low: 0.035, high: 0.052, floor: compact ? 7 : 9, ceiling: 13 },
    name: { low: 0.052, high: 0.078, floor: compact ? 9 : 13, ceiling: 27 },
  }[role] || { low: 0.04, high: 0.085, floor: compact ? 7.5 : 11, ceiling: 30 };
  let low = Math.max(scale.floor, frameWidth * scale.low);
  let high = Math.min(scale.ceiling, frameWidth * scale.high);
  if (high < low) high = low;
  for (let index = 0; index < 9; index += 1) {
    const size = (low + high) / 2;
    element.style.fontSize = `${size}px`;
    const fits = element.scrollHeight <= element.clientHeight + 1
      && element.scrollWidth <= element.clientWidth + 1;
    if (fits) low = size;
    else high = size;
  }
  element.style.fontSize = `${low}px`;
}

function fitVisibleCardText(root = document) {
  root.querySelectorAll("[data-fit-card-text]").forEach(fitCardText);
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
    if (!cardResizeObserver) return;
    root.querySelectorAll(".kalpi-card").forEach((frame) => {
      if (observedCardFrames.has(frame)) return;
      observedCardFrames.add(frame);
      cardResizeObserver.observe(frame);
    });
  });
}

function showView(name) {
  model.holdGeneration += 1;
  persistPlayerView(name);
  document.querySelector("#app").classList.toggle("home-active", name === "home");
  for (const view of elements.views) {
    view.classList.toggle("active", view.id === `${name}-view`);
  }
  for (const button of elements.navButtons) {
    button.classList.toggle("active", button.dataset.nav === name);
  }
  elements.bottomNav.hidden = !["home", "binder", "achievements", "events", "growth"].includes(name);
  requestAnimationFrame(() => {
    elements.main.focus({ preventScroll: true });
    fitVisibleCardText(elements.main);
  });
}

function showError(title, copy) {
  elements.errorTitle.textContent = title;
  elements.errorCopy.textContent = copy;
  showView("error");
}

function completion() {
  const owned = model.serverState?.ownedUnique ?? 0;
  const total = model.serverState?.totalCards ?? model.catalog.length ?? 28;
  return { owned, total, percent: total ? Math.round((owned / total) * 100) : 0 };
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

function timeUntil(iso) {
  if (!iso) return 0;
  return Math.max(0, Date.parse(iso) - Date.now());
}

function formatCountdown(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatEventCountdown(milliseconds) {
  const days = Math.floor(milliseconds / DAY_MS);
  return days >= 2 ? `${days} ימים` : formatCountdown(milliseconds);
}

function avatarUrl(avatar) {
  return avatar?.art ? `/design-assets/${avatar.art}` : "";
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
  if (elements.playerAvatar && avatar) {
    elements.playerAvatar.hidden = false;
    elements.playerAvatar.src = avatarUrl(avatar);
    elements.playerAvatar.alt = avatar.nameHe || "";
  }
  if (elements.levelAvatar && avatar) {
    elements.levelAvatar.src = avatarUrl(avatar);
    elements.levelAvatar.alt = avatar.nameHe || "";
  }
}

function renderAvatarPicker() {
  if (!elements.avatarPicker) return;
  const avatars = model.serverState?.avatars || [];
  const selected = model.selectedAvatarId || model.serverState.avatarId || "kid-boy";
  elements.avatarPicker.innerHTML = avatars.map((avatar) => `
    <button type="button" class="avatar-choice${avatar.unlocked ? "" : " locked"}${avatar.id === selected ? " selected" : ""}" data-avatar-id="${avatar.id}" ${avatar.unlocked ? "" : "disabled"} aria-pressed="${avatar.id === selected}">
      <img src="${avatarUrl(avatar)}" alt="" />
      <span>${escapeHtml(avatar.nameHe)}</span>
      ${avatar.unlocked ? "" : `<small>רמה ${avatar.unlockLevel}</small>`}
    </button>`).join("");
}

function openProfileDialog() {
  elements.profileNameInput.value = model.serverState?.displayName || "";
  model.selectedAvatarId = model.serverState?.avatarId || "kid-boy";
  elements.profileError.textContent = "";
  renderAvatarPicker();
  elements.profileDialog.showModal();
  elements.profileNameInput.focus();
  elements.profileNameInput.select();
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
    model.serverState = await request("/api/state");
    const [leaderboards, tradeData] = await Promise.all([
      request("/api/leaderboards"),
      request("/api/trades"),
    ]);
    model.leaderboards = leaderboards;
    model.trades = tradeData.trades;
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
      showToast(quiz.wonToday ? "החידון היומי כבר הושלם." : "צריך קלף באוסף כדי להיבחן.");
      return;
    }
    model.currentQuiz = quiz;
    Object.keys(quizAnswers).forEach((key) => delete quizAnswers[key]);
    const card = model.byId.get(quiz.cardId);
    elements.quizTitle.textContent = card ? cardTitle(card) : "שתי שאלות. חמש דקות.";
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
        elements.quizStatus.textContent = "הזמן נגמר. אפשר לנסות שוב מאוחר יותר.";
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
      model.serverState = result.state;
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
        elements.quizFail.textContent = "לא הפעם. פתחו את גב הקלף ונסו שוב מאוחר יותר.";
      } else {
        elements.quizStatus.textContent = "לא הפעם. פתחו את גב הקלף ונסו שוב מאוחר יותר.";
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
  const due = !timeUntil(model.serverState?.nextIdleAt);
  const available = unseen > 0 || due;
  elements.collectionCount.textContent = `${owned} מתוך ${total} בסדרה הפעילה · ${percent}%`;
  elements.collectionProgress.style.width = `${percent}%`;
  elements.openPack.disabled = !available;
  elements.openPack.textContent = available ? "פתיחת קלף" : "ממשיכים לאסוף";
  if (elements.idleStorage) {
    elements.idleStorage.hidden = true;
    elements.idleStorage.textContent = `${unseen}/${model.serverState?.idleCapacity ?? 8}`;
  }
  const activeReleaseIds = [...new Set(model.catalog.filter(({ idleEligible }) => idleEligible).map(({ releaseSetId }) => releaseSetId))];
  const releaseNames = activeReleaseIds
    .map((id) => model.gameConfig?.releaseSets?.find((release) => release.id === id)?.nameHe)
    .filter(Boolean);
  if (elements.activeRelease) elements.activeRelease.textContent = releaseNames.join(" + ");
  elements.homeTitle.textContent = available
    ? unseen === 1 ? "נאסף עבורך קלף אחד." : `נאספו עבורך ${unseen} קלפים.`
    : "הקלף הבא בדרך.";
  elements.homeCopy.textContent = available
    ? "פותחים קלף אחד בכל פעם."
    : "קלף אחד נאסף אוטומטית בכל שלוש שעות.";
  renderSiteCardPeeks();
  renderProgression();
  renderActivity();
  renderTodayDocket();
  updateCountdown();
  if (elements.openQuiz) elements.openQuiz.hidden = true;
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
    });
  }
  return [...parties.values()];
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
  const meta = current
    ? `${current.cards} קלפים · מקום ${place}`
    : "עוד לא משכתם מהסיעה";
  return { current, place, bins, field, meta, players: leaders.length };
}

function renderChallengeRecap() {
  if (!elements.dailyChallengeRecap) return;
  const recap = challengeRecap();
  elements.dailyChallengeRecap.hidden = false;
  elements.dailyChallengeRecap.style.setProperty("--bins", String(recap.bins.length));
  const score = recap.current ? recap.current.cards : 0;
  const place = recap.place
    ? `מקום ${recap.place} מתוך ${Math.max(recap.players, recap.place)}`
    : "עוד לא בטבלה";
  elements.dailyChallengeRecap.innerHTML = `
    <div class="challenge-recap-score">
      <small>היום אספתם מהסיעה</small>
      <strong>${score}<span>קלפים</span></strong>
      <b class="challenge-recap-place">${escapeHtml(place)}</b>
    </div>
    <div class="challenge-hist">
      <small>איך כולם משכו היום</small>
      <div class="challenge-hist-plot" aria-hidden="true">
        ${recap.bins.map((bin, index) => `<div class="challenge-hist-col${bin.you ? " you" : ""}">
          <b style="height:${Math.max(8, Math.round((bin.count / recap.field) * 100))}%; animation-delay:${index * 45}ms"></b>
        </div>`).join("")}
      </div>
      <div class="challenge-hist-axis">${recap.bins.map((bin) => `<span>${escapeHtml(bin.label)}</span>`).join("")}</div>
    </div>
  `;
}

function renderTodayDocket() {
  if (!elements.todayChallengeHook) return;
  const challenge = model.leaderboards?.dailyChallenge;
  const challengeParty = partyDisplayName(challenge?.targetPartyId);
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

  const activeEvent = model.events.find((event) => event.active);
  elements.todayEventHook.textContent = activeEvent ? `${activeEvent.nameHe} פתוח` : "האירוע הבא בדרך";
  elements.todayEventMeta.textContent = "";
  document.querySelector(".today-docket-row.live")?.classList.toggle("hot", Boolean(activeEvent));

  const leader = model.leaderboards?.collectors?.[0];
  const currentCollector = model.leaderboards?.collectors?.find(({ current }) => current);
  elements.todayLeaderHook.textContent = currentCollector?.rank
    ? `אתם מקום ${currentCollector.rank}`
    : leader?.current
      ? "אתם מקום 1"
      : "המקום הראשון פנוי";
  elements.todayLeaderMeta.textContent = "";
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
    items.push("חבילת בונוס");
    avatars
      .filter((avatar) => Number(avatar.unlockLevel) === level)
      .forEach((avatar) => items.push(`אווטאר חדש · ${avatar.nameHe}`));
  }
  return [...new Set(items)];
}

function fillLevelDialog(progression, fromLevel) {
  const toLevel = Math.max(progression.level, ...(progression.pendingRewards || []), fromLevel + 1);
  elements.levelDialogTitle.textContent = `הגעתם לרמה ${progression.level}`;
  const items = levelUnlockItems(fromLevel, toLevel);
  if (elements.levelUnlocks) {
    elements.levelUnlocks.hidden = !items.length;
    elements.levelUnlocks.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }
  elements.levelDialogReward.textContent = items.length ? "אפשר לקבל את חבילת הבונוס עכשיו." : (progression.reward || "");
}

function renderPendingLevelCue() {
  const pending = model.serverState?.progression?.pendingRewards || [];
  if (elements.openPendingLevel) elements.openPendingLevel.hidden = pending.length === 0;
}

function openPendingLevelDialog() {
  const progression = model.serverState?.progression;
  const pending = progression?.pendingRewards || [];
  if (!progression || !pending.length) return;
  fillLevelDialog(progression, Math.min(...pending) - 1);
  elements.levelDialog.showModal();
}

function renderProgression({ announce = false } = {}) {
  const progression = model.serverState?.progression;
  if (!progression) return;
  elements.levelNumber.textContent = `רמה ${progression.level}/${progression.totalLevels}`;
  elements.levelNumber.setAttribute("aria-label", `רמה ${progression.level} מתוך ${progression.totalLevels} שפתוחות כרגע`);
  elements.levelRank.textContent = progression.rank;
  if (elements.levelAvatarButton) {
    elements.levelAvatarButton.setAttribute("aria-label", `${progression.rank} · הפרופיל והאווטאר`);
  }
  if (elements.levelTeaser) elements.levelTeaser.textContent = progression.teaser;
  elements.levelProgress.style.width = `${progression.percent}%`;
  elements.levelProgressCount.textContent = `${progression.unique - progression.start}/${progression.target - progression.start}`;
  if (progression.remaining) {
    elements.levelNext.textContent = `גלה עוד ${progression.remaining} קלפים חדשים כדי להתקדם לרמה הבאה`;
  } else {
    elements.levelNext.textContent = progression.nextReleaseRank
      ? `הרמה מוכנה · ${progression.nextReleaseRank} תיפתח בסדרה הבאה`
      : "הגעתם לדרגת ראש הממשלה";
  }
  const seen = seenLevel();
  if (!seen) {
    markLevelSeen(progression.level);
  } else if (announce && progression.level > seen) {
    fillLevelDialog(progression, seen);
    elements.levelDialog.showModal();
    markLevelSeen(progression.level);
  } else {
    model.renderedLevel = Math.max(seen, progression.level);
  }
  renderPendingLevelCue();
}

function updateCountdown() {
  renderTodayDocket();
  const remaining = timeUntil(model.serverState?.nextIdleAt);
  const unseen = model.serverState?.unseenCount ?? model.idleQueue.length;
  if (!remaining) {
    elements.cooldownCopy.textContent = unseen ? "פותחים אחד-אחד" : "קלף חדש מוכן לאיסוף";
    elements.headerStatus.textContent = "אוספים עכשיו";
    if (elements.debugClock) elements.debugClock.textContent = "Idle pull · ready";
    return;
  }
  const clock = formatCountdown(remaining);
  elements.cooldownCopy.textContent = `הבא בעוד ${clock}`;
  elements.headerStatus.textContent = `הקלף הבא · ${clock}`;
  if (elements.debugClock) elements.debugClock.textContent = `Next idle pull · ${clock}`;
}

setInterval(updateCountdown, 1000);

function sealedPackMarkup(extraClass = "") {
  return `
    <div class="pack-wrapper rip-pack ${extraClass}" aria-label="חבילת קְלָפִי סגורה">
      <img src="/design-assets/pack-wrapper-transparent.png" alt="" />
    </div>`;
}

function playHomePackRip({ holdAtEnd = false } = {}) {
  const video = elements.homePackRip;
  if (!video || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { finished: Promise.resolve(), release() {} };
  }
  elements.homePack.hidden = true;
  elements.homePackRipBackdrop.hidden = false;
  video.hidden = false;
  video.currentTime = 0;
  elements.openPackFancy.textContent = "פותחים…";

  let timer;
  let finished = false;
  let resolveFinished;
  const cleanup = () => {
    clearTimeout(timer);
    video.removeEventListener("ended", finish);
    video.removeEventListener("error", finish);
    video.pause();
    video.hidden = true;
    elements.homePackRipBackdrop.hidden = true;
    elements.homePack.hidden = false;
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    video.pause();
    if (!holdAtEnd) cleanup();
    resolveFinished();
  };
  const finishedPromise = new Promise((resolve) => {
    resolveFinished = resolve;
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    timer = setTimeout(finish, 10000);
    video.play().catch(finish);
  });
  return {
    finished: finishedPromise,
    release() {
      if (!finished) {
        finished = true;
        resolveFinished();
      }
      video.removeEventListener("ended", finish);
      video.removeEventListener("error", finish);
      cleanup();
    },
  };
}

async function openIdleReturn(opening = "regular") {
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
    rip.release();
    showView("pack");
    startWalkout();
  } catch (error) {
    rip.release();
    renderHome();
    showToast("לא הצלחנו לטעון את הקלפים שנאספו.");
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
    model.serverState = await request("/api/state");
    model.leaderboards = await request("/api/leaderboards");
    model.currentCardIndex = 0;
    model.previewMode = false;
    model.currentPack.cards = model.currentPack.cards.slice(0, 1);
    const rip = playHomePackRip();
    await rip.finished;
    rip.release();
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
    elements.packHeading.textContent = "פותחים.";
    elements.ripStage.innerHTML = sealedPackMarkup();
    setPackAction("קריעת החבילה", false, "הקלפים כבר נשמרו.");
  } else if (phase === "tearing") {
    elements.ripStage.innerHTML = sealedPackMarkup("tearing");
    setPackAction("פותחים…", true, "");
  } else if (phase === "fanned") {
    elements.packStep.textContent = `${count} קלפים`;
    elements.packHeading.textContent = "הנה הם.";
    elements.ripStage.innerHTML = `<div class="fan" aria-label="קלפים סגורים">${"<span class=\"fan-card\"></span>".repeat(count)}</div>`;
    setPackAction("חושפים…", true, "");
  }
}

function setPackAction(label, disabled, hint) {
  elements.packAction.textContent = label;
  elements.packAction.disabled = disabled;
  elements.packHint.textContent = hint;
}

async function handlePackAction() {
  if (model.packPhase === "sealed") {
    model.packPhase = "tearing";
    renderPack();
    setTimeout(() => {
      if (model.packPhase !== "tearing") return;
      model.packPhase = "fanned";
      renderPack();
      setTimeout(startWalkout, 550);
    }, 620);
  } else if (model.packPhase === "complete-card") {
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
    } else if (model.currentPack.mode === "demo") {
      renderStudio();
      showView("studio");
      showToast("Guided demo complete. Daily state was not changed.");
    } else if (model.currentPack.mode === "idle-return" || model.currentPack.mode === "level-reward" || model.currentPack.mode === "quiz") {
      const instanceIds = model.currentPack.cards.map(({ instanceId }) => instanceId).filter(Boolean);
      const opened = new Set(instanceIds);
      model.idleQueue = model.idleQueue.filter(({ instanceId }) => !opened.has(instanceId));
      model.serverState = {
        ...model.serverState,
        unseenCount: Math.max(0, (model.serverState?.unseenCount || 0) - opened.size),
      };
      applyHomePayload({ state: model.serverState });
      renderHome();
      renderBinder();
      renderAchievements();
      renderGrowth();
      renderProgression({ announce: true });
      if (model.idleQueue.length) {
        showView("home");
        showToast(`הקלף נוסף לאוסף · עוד ${model.idleQueue.length} מחכים.`);
      } else {
        showView("binder");
        showToast("הקלף נוסף לאוסף.");
      }
      const ownershipReady = model.currentPack.mode === "idle-return" && model.currentPack.preparedReveal
        ? model.currentPack.settlement.then((outcome) => {
          if (outcome.error || !outcome.value?.cards?.some(({ instanceId }) => opened.has(instanceId))) {
            throw outcome.error || new Error("PREPARED_PULL_NOT_MATERIALIZED");
          }
        })
        : Promise.resolve();
      ownershipReady.then(() => {
        model.idleQueue = model.idleQueue.filter(({ instanceId }) => !opened.has(instanceId));
        return request("/api/idle/seen", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ instanceIds }),
        });
      }).then((state) => {
        applyHomePayload({ state });
        renderHome();
        renderBinder();
        scheduleIdleRefill({ priority: "buffered" });
      }).catch(() => {
        scheduleIdleRefill({ priority: "urgent" });
      });
      request("/api/leaderboards").then((leaderboards) => {
        model.leaderboards = leaderboards;
        renderGrowth();
      }).catch(() => {});
    } else {
      model.leaderboards = await request("/api/leaderboards");
      renderHome();
      renderBinder();
      renderGrowth();
      showView("binder");
      recordEvent("binder_reached", { packId: model.currentPack.packId });
      renderProgression({ announce: true });
      showToast("הקלף נוסף לאוסף.");
    }
  }
}

function startWalkout() {
  packTimers.forEach(clearTimeout);
  packTimers = [];
  model.packPhase = "walkout";
  model.walkoutStage = 0;
  renderWalkoutStage();
  const configured = readRevealDelays();
  const delays = [configured.quote, configured.party, configured.name, configured.portrait];
  let elapsed = 0;
  delays.forEach((delay, index) => {
    elapsed += delay;
    packTimers.push(setTimeout(() => {
      if (model.packPhase !== "walkout") return;
      model.walkoutStage = index + 1;
      renderWalkoutStage();
      if (model.walkoutStage === WALKOUT_STAGES.length - 1) {
        model.packPhase = "complete-card";
        const isLast = model.currentCardIndex === model.currentPack.cards.length - 1;
        setPackAction(isLast ? "לאוסף" : "הקלף הבא", false, "");
      }
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
  if (isGift) showToast("תצוגת החלפה בלבד. הבעלות לא השתנתה.");
}

function renderWalkoutStage() {
  const instance = model.currentPack.cards[model.currentCardIndex];
  const card = model.byId.get(instance.cardId);
  const stage = WALKOUT_STAGES[model.walkoutStage];
  const walkout = card.walkout;
  const sourceLink = `<a href="${escapeHtml(walkout.sourceUrl)}" target="_blank" rel="noopener" data-source-card="${card.id}">למקור ↗</a>`;
  const contentClass = card.releaseTier === "critique"
    ? "פרשנות/ביקורת"
    : walkout.kind === "quote" ? "ציטוט" : "עובדתי";
  const releaseName = model.gameConfig?.releaseSets?.find(({ id }) => id === card.releaseSetId)?.nameHe;
  elements.packStep.textContent = `קלף ${model.currentCardIndex + 1}`;
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
          <div class="walkout-receipt">
            <span>${escapeHtml([contentClass, releaseName, walkout.date].filter(Boolean).join(" · "))}</span>
            ${sourceLink}
          </div>
        </div>
      </div>`;
    walkoutCard = elements.ripStage.querySelector(".walkout .kalpi-card");
    fitVisibleCardText(elements.ripStage);
  }
  applyCardStage(walkoutCard, stage);
  elements.ripStage.querySelector(".walkout-receipt").classList.toggle("visible", model.walkoutStage >= 1);
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
  if (normalized.includes("promo") || normalized.includes("legendary") || normalized.includes("event")) return "P";
  if (normalized.includes("rare") || normalized.includes("holo")) return "★★★";
  if (normalized.includes("uncommon")) return "★★";
  return "★";
}

function rarityNameHe(rarity) {
  const normalized = String(rarity).toLowerCase();
  if (normalized.includes("promo")) return "קידום";
  if (normalized.includes("rare")) return "נדיר";
  if (normalized.includes("uncommon")) return "לא נפוץ";
  return "נפוץ";
}

function artMarkup(card, mini = false) {
  const className = mini ? "mini-art" : "card-art";
  if (card.artKey) {
    return `<div class="${className}" role="img" aria-label="איור של ${escapeHtml(cardTitle(card))}" style="background-image:url('/design-assets/${encodeURIComponent(card.artKey)}')"></div>`;
  }
  return `<div class="${className} placeholder" role="img" aria-label="איור זמני של ${escapeHtml(cardTitle(card))}" data-mark="${escapeHtml(placeholderMark(card))}"></div>`;
}

function displayedCardQuote(card) {
  const text = String(card.walkout.text || "").trim();
  if (!text) return "";
  if (card.type !== "Quote") return text;
  return `״${text.replace(/^״|״$/g, "")}״`;
}

function displayCardMarkup(card, surface = "display") {
  return cardMarkup(card, { finish: card.rarity }, { progressiveStage: "portrait", surface });
}

function cardMarkup(card, instance = {}, { reveal = false, progressiveStage = null, surface = "full" } = {}) {
  const finish = (instance.finish ?? card.rarity.split(/\s|\//)[0]).toLowerCase();
  const finishLabel = instance.finish ?? card.rarity;
  const stage = progressiveStage || "portrait";
  const progressive = `progressive-card stage-${stage}`;
  return `
    <article class="kalpi-card ${finish} ${progressive} ${reveal ? "reveal" : ""}" data-card-surface="${escapeHtml(surface)}" style="--pip:${card.pip}" aria-label="קלף ${escapeHtml(cardTitle(card))}">
      <section class="card-face front">
        <span class="card-pip" aria-hidden="true"></span>
        <div class="card-image-zone">
          ${artMarkup(card)}
          <div class="card-image-meta"><span>${escapeHtml(cardCode(card))}</span><strong aria-label="${rarityNameHe(finishLabel)}">${rarityMark(finishLabel)}</strong></div>
          ${instance.isNew ? '<span class="new-stamp">חדש</span>' : ""}
        </div>
        <blockquote class="card-quote-zone" data-fit-card-text="quote" dir="rtl" lang="he">${escapeHtml(displayedCardQuote(card))}</blockquote>
        <p class="card-party-zone" data-fit-card-text="party" dir="rtl" lang="he" style="--pip:${card.pip}">${escapeHtml(cardSetName(card))}${card.type === "Quote" ? ` · ${escapeHtml(card.subtitleHe || card.subtitle)}` : ""}</p>
        <h2 class="card-name-zone" data-fit-card-text="name" dir="rtl" lang="he">${escapeHtml(cardTitle(card))}</h2>
      </section>
    </article>`;
}

function binderCardMarkup(card) {
  return `
    <div class="binder-shared-card">${displayCardMarkup(card)}</div>`;
}

function renderPendingWells(count = 6) {
  return Array.from({ length: count }, () =>
    `<div class="binder-slot is-loading" aria-hidden="true"><span class="missing-code">···</span></div>`
  ).join("");
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
  const waitingOwnership = !ownershipReady();
  binderView?.setAttribute("aria-busy", waitingOwnership ? "true" : "false");
  const inventory = model.serverState?.inventory || {};
  const { owned, total, percent } = completion();
  elements.binderPercent.textContent = `${percent}%`;
  elements.binderPercent.title = `${owned} קלפים שונים מתוך ${total} בסדרה הפעילה כרגע`;
  elements.binderCount.textContent = `${owned} מתוך ${total} בסדרה הפעילה`;
  setEmptyNote(
    elements.binderEmpty,
    waitingOwnership ? "טוענים את האוסף…" : "פתחו חבילה כדי להתחיל.",
    { pending: waitingOwnership, hidden: !waitingOwnership && owned > 0 },
  );

  const favorites = new Set(model.serverState?.favorites || []);
  const playerCards = model.catalog.filter((card) =>
    card.idleEligible || card.eventOnly || inventory[card.id]);
  const releaseIds = [...new Set(playerCards.map((card) => card.releaseSetId).filter(Boolean))];
  const releaseOrder = (model.gameConfig?.releaseSets || [])
    .map(({ id }) => id)
    .filter((id) => releaseIds.includes(id));
  const extraReleases = releaseIds.filter((id) => !releaseOrder.includes(id) && id !== "editorial-backlog");
  const setOrder = [
    "ALL",
    "FAVORITES",
    ...releaseOrder.map((id) => `RELEASE:${id}`),
    ...extraReleases.map((id) => `RELEASE:${id}`),
    "SPECIALS",
    ...new Set(playerCards.filter((card) => !card.eventOnly).map((card) => card.set)),
  ];
  const setLabels = Object.fromEntries(playerCards.map((card) => [card.set, cardSetName(card)]));
  for (const release of model.gameConfig?.releaseSets || []) setLabels[`RELEASE:${release.id}`] = release.nameHe;
  setLabels.ALL = `הכול ${playerCards.length}`;
  setLabels.FAVORITES = "פייבוריטים";
  setLabels.SPECIALS = "מיוחדים";
  elements.binderFilters.innerHTML = setOrder.map((set) => {
    const count = set === "ALL"
      ? owned
      : playerCards.filter((card) => {
        const inSet = set === "FAVORITES"
          ? favorites.has(card.id)
          : set === "SPECIALS"
            ? card.eventOnly
            : set.startsWith("RELEASE:") ? card.releaseSetId === set.slice(8) : card.set === set;
        return inSet && inventory[card.id];
      }).length;
    return `<button type="button" role="tab" aria-selected="${model.binderFilter === set}" class="${model.binderFilter === set ? "active" : ""}" data-filter="${set}">${escapeHtml(setLabels[set] || set)} · ${count}</button>`;
  }).join("");

  const visible = playerCards.filter((card) => model.binderFilter === "ALL"
    || (model.binderFilter === "FAVORITES" ? favorites.has(card.id) : false)
    || (model.binderFilter === "SPECIALS" ? card.eventOnly
      : model.binderFilter.startsWith("RELEASE:")
        ? card.releaseSetId === model.binderFilter.slice(8)
        : card.set === model.binderFilter));
  elements.binderGrid.innerHTML = visible.map((card) => {
    const count = inventory[card.id] ?? 0;
    if (!count) {
      return `<div class="binder-slot" aria-label="${escapeHtml(cardCode(card))} חסר">
        <span class="missing-code">${escapeHtml(cardCode(card))}</span>
        ${model.studioContent?.studioEnabled ? `<button class="debug-unlock-card" type="button" data-debug-unlock="${card.id}">unlock</button>` : ""}
      </div>`;
    }
    const favorite = favorites.has(card.id);
    return `
      <div class="binder-slot owned new-card-thumb" style="--pip:${card.pip}">
        <button class="binder-card-open" type="button" data-card-id="${card.id}" aria-label="פתיחת ${escapeHtml(cardTitle(card))}, ברשותכם ${count}">
          ${binderCardMarkup(card)}
        </button>
        <div class="binder-card-tools">
          ${count > 1 ? `<b class="dupe-count">×${count}</b>` : ""}
          <button class="favorite-heart${favorite ? " active" : ""}" type="button" data-favorite-card="${card.id}" aria-pressed="${favorite}" aria-label="${favorite ? "הסרה מהפייבוריטים" : "הוספה לפייבוריטים"}">♥</button>
        </div>
      </div>`;
  }).join("");
  const visibleColumns = window.innerWidth <= 520 ? 3 : window.innerWidth <= 760 ? 5 : 6;
  elements.binderPager.innerHTML = visible.length > visibleColumns
    ? '<span class="binder-scroll-hint">עוד קלפים מחכים למטה ↓</span>'
    : "";

  const earned = (model.serverState?.achievements || []).filter(({ earned }) => earned);
  const starExplanation = "כוכבי אוסף · נפוץ = 1 · לא נפוץ = 2 · נדיר = 3 · מיוחד = 5";
  const starCount = model.serverState?.starCount ?? 0;
  const starCounter = `<span class="collection-star-count" role="button" tabindex="0" title="${starExplanation}" data-tooltip="${starExplanation}" aria-label="${starCount} כוכבי אוסף. ${starExplanation}"><b>★</b><strong>${starCount}</strong></span>`;
  const visibleBadges = earned.slice(0, 3);
  const rail = elements.earnedBadgeList || elements.earnedBadgeRail;
  rail.innerHTML = starCounter + visibleBadges.map((badge) => {
    const copy = hebrewBadge(badge);
    return `
    <span class="badge-medallion" role="button" tabindex="0" aria-label="${escapeHtml(`${copy.name}: ${copy.description}`)}" data-tooltip="${escapeHtml(`${copy.name} · ${copy.description}`)}">${badgeArtwork(badge.id)}</span>`;
  }).join("") + (earned.length > visibleBadges.length
    ? `<button class="badge-overflow" type="button" data-open-achievements aria-label="עוד ${earned.length - visibleBadges.length} הישגים">+${earned.length - visibleBadges.length}</button>`
    : "");
  queueCardTextFit(elements.binderGrid);
}

function badgeArtwork(id) {
  const icon = {
    "first-rip": '<path d="M16 20h16v14H16zM16 24l8-5 8 5M24 19v15"/><path d="M20 16l2-4 2 4 2-4 2 4"/>',
    "register-five": '<rect x="15" y="18" width="13" height="17" rx="1"/><path d="M19 15h13v17M23 12h12v17"/>',
    "source-check": '<circle cx="22" cy="23" r="7"/><path d="M27 28l6 6M19 23l2 2 4-5"/>',
    "share-pull": '<circle cx="17" cy="25" r="2.5"/><circle cx="31" cy="18" r="2.5"/><circle cx="31" cy="32" r="2.5"/><path d="M19.5 24l9-4.5M19.5 26l9 4.5"/>',
    "commons-complete": '<path d="M15 22h18l-2 13H17zM13 22h22M19 16h10l3 6H16z"/><path d="M21 19h6"/>',
    "set-chase": '<path d="M24 13l3.2 6.3 7 .9-5.1 4.8 1.3 6.9-6.4-3.3-6.4 3.3 1.3-6.9-5.1-4.8 7-.9z"/>',
    "trade-match": '<rect x="13" y="17" width="11" height="15" rx="1"/><rect x="24" y="20" width="11" height="15" rx="1"/><path d="M17 14h11l-2-2M31 38H20l2 2"/>',
    "collector-ten": '<path d="M17 17h14v18H17zM20 14h14v18M14 20h14v18"/>',
    "favorite-first": '<path d="M24 35S13 29 13 21c0-6 8-8 11-2 3-6 11-4 11 2 0 8-11 14-11 14z"/>',
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
  }[id] || '<circle cx="24" cy="24" r="5"/>';
  return `<svg class="badge-artwork" viewBox="0 0 48 56" aria-hidden="true">
    <path class="badge-ribbon" d="M15 39v14l9-5 9 5V39"/>
    <path class="badge-shell" d="M24 3 41 10v15c0 11-7 18-17 23C14 43 7 36 7 25V10z"/>
    <circle class="badge-field" cx="24" cy="24" r="14"/>
    <g class="badge-icon">${icon}</g>
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
  ["favorites", "פייבוריטים"],
  ["events", "אירועים"],
  ["leaderParties", "סיעות מנהיגים"],
  ["stars", "כוכבים"],
  ["duplicate", "עותק כפול"],
  ["rank", "רמה"],
  ["binderHalf", "חצי אלבום"],
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
  }));
  try {
    const saved = await request("/api/studio/achievements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ achievements }),
    });
    model.gameConfig.achievements = saved.achievements;
    model.serverState = await request("/api/state");
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

function hebrewBadge(badge) {
  const copy = {
    "first-rip": ["חשיפה ראשונה", "חשפו קלף שנאסף."],
    "register-five": ["חמישה באוסף", "אספו חמישה קלפים שונים."],
    "source-check": ["בדקתי מקור", "פתחו מקור של קלף."],
    "share-pull": ["העברתי הלאה", "שתפו קלף."],
    "commons-complete": ["כל המנהיגים", "אספו את מנהיגי כל המפלגות."],
    "set-chase": ["סדרה מלאה", "השלימו סדרת מפלגה."],
    "trade-match": ["החלפה ראשונה", "השלימו החלפה עם שחקן אחר."],
    "collector-ten": ["עשרה שונים", "אספו עשרה קלפים שונים."],
    "favorite-first": ["שומר בלב", "סמנו קלף אחד כפייבוריט."],
    "event-first": ["מהדורה מוגבלת", "אספו קלף מאירוע."],
    "source-three": ["קורא מקורות", "פתחו שלושה מקורות של קלפים."],
    "trade-three": ["שולחן החלפות", "השלימו שלוש החלפות."],
    "three-parties": ["רוחב המפה", "אספו מנהיגים משלוש מפלגות."],
    "twenty-stars": ["עשרים כוכבים", "צברו עשרים כוכבי אוסף."],
    "idle-eight": ["מחסן מלא", "אספו שמונה קלפים מהאיסוף האוטומטי."],
    "first-double": ["עותק כפול", "השיגו עותק שני של אותו קלף."],
    "five-leaders": ["חמש סיעות", "אספו מנהיגים מחמש מפלגות."],
    "event-three": ["שלושה אירועים", "אספו שלושה קלפי אירוע."],
    "share-three": ["שלושה שיתופים", "שתפו שלושה קלפים."],
    "rank-three": ["מצביע מעורב", "הגיעו לרמה 3."],
    "fifty-stars": ["חמישים כוכבים", "צברו חמישים כוכבי אוסף."],
    "binder-half": ["חצי האלבום", "השלימו מחצית מהסדרה הפעילה."],
  }[badge.id];
  return { name: copy?.[0] || badge.name, description: copy?.[1] || badge.description };
}

function renderAchievements() {
  if (!model.serverState?.achievements) {
    if (elements.achievementGrid) elements.achievementGrid.innerHTML = "";
    if (elements.achievementPager) elements.achievementPager.innerHTML = "";
    setEmptyNote(elements.achievementsEmpty, pendingCopy("טוענים את התגים…", "לא הצלחנו לטעון את התגים."), {
      pending: !catalogFailed,
      failed: catalogFailed,
    });
    return;
  }
  setEmptyNote(elements.achievementsEmpty, "", { hidden: true });
  if (!model.serverState || !elements.achievementGrid) return;
  const badges = model.serverState.achievements || [];
  const pageSize = 4;
  const pages = Math.max(1, Math.ceil(badges.length / pageSize));
  model.achievementPage = Math.min(model.achievementPage, pages - 1);
  elements.achievementGrid.innerHTML = badges
    .slice(model.achievementPage * pageSize, (model.achievementPage + 1) * pageSize)
    .map((badge) => {
    const copy = hebrewBadge(badge);
    return `
    <article class="achievement-badge ${badge.earned ? "earned" : ""}">
      <span class="achievement-seal" tabindex="0" title="${escapeHtml(copy.description)}">${badgeArtwork(badge.id)}${badge.earned ? "" : `<i>${badge.progress}/${badge.target}</i>`}</span>
      <div><strong>${escapeHtml(copy.name)}</strong><p>${escapeHtml(copy.description)}</p></div>
    </article>`;
  }).join("");
  elements.achievementPager.innerHTML = pagerMarkup(model.achievementPage, pages, "achievements");
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

function renderGrowth() {
  const communityTabs = elements.communityTabs;
  const growthGrid = document.querySelector(".growth-grid");
  if (!model.extrasReady) {
    setEmptyNote(elements.growthEmpty, pendingCopy("טוענים את הקהילה…", "לא הצלחנו לטעון את הקהילה."), {
      pending: !catalogFailed,
      failed: catalogFailed,
    });
    communityTabs?.setAttribute("hidden", "");
    growthGrid?.setAttribute("hidden", "");
    return;
  }
  communityTabs?.removeAttribute("hidden");
  growthGrid?.removeAttribute("hidden");
  setEmptyNote(elements.growthEmpty, "", { hidden: true });
  if (!model.catalog.length || !model.serverState || !elements.tradePreview) return;
  const duplicate = model.catalog.find((card) => (model.serverState.inventory[card.id] ?? 0) > 1);
  const owned = model.catalog.find((card) => (model.serverState.inventory[card.id] ?? 0) > 0);
  const card = duplicate ?? owned ?? model.catalog[0];
  const count = model.serverState.inventory[card.id] ?? 0;
  const isLive = count > 1;
  elements.tradePreview.dataset.cardId = card.id;
  elements.tradePreview.dataset.liveDuplicate = String(isLive);
  elements.tradePreview.innerHTML = `
    <button class="binder-slot owned new-card-thumb trade-card-button" type="button" data-trade-card="${card.id}" style="--pip:${card.pip}" aria-label="פתיחת ${escapeHtml(cardTitle(card))}">
      ${binderCardMarkup(card, count)}
    </button>
    <div>
      <h3>${escapeHtml(cardTitle(card))}</h3>
      <p class="${isLive ? "dupe-ready" : ""}">${isLive ? `${count} עותקים · אפשר להחליף` : "צריך עותק נוסף כדי להחליף"}</p>
    </div>`;
  elements.tradeDemo.textContent = isLive ? "יצירת הצעה" : "העתקת קישור לדוגמה";
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

  const ownedCards = model.catalog.filter((candidate) => (model.serverState.inventory[candidate.id] ?? 0) > 0);
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
    const parties = [...new Map(cards.map((candidate) => [`party:${candidate.set}`, cardSetName(candidate)]))];
    const options = (choices) => choices
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
      .join("");
    return `<optgroup label="סדרות">${options(releases)}</optgroup><optgroup label="מפלגות">${options(parties)}</optgroup>`;
  };
  const matchesTradeGroup = (candidate, value) => value.startsWith("release:")
    ? (candidate.releaseSetId || "other") === value.slice(8)
    : candidate.set === value.slice(6);
  const previousOfferedSet = elements.tradeOfferedSet.value;
  const previousWantedSet = elements.tradeWantedSet.value;
  const offeredValue = elements.tradeOfferedCard.value;
  const wantedValue = elements.tradeWantedCard.value;
  elements.tradeOfferedSet.innerHTML = ownedCards.length ? groupedOptions(ownedCards) : '<option value="">אין קלפים</option>';
  elements.tradeWantedSet.innerHTML = groupedOptions(model.catalog);
  if ([...elements.tradeOfferedSet.options].some(({ value }) => value === previousOfferedSet)) elements.tradeOfferedSet.value = previousOfferedSet;
  if ([...elements.tradeWantedSet.options].some(({ value }) => value === previousWantedSet)) elements.tradeWantedSet.value = previousWantedSet;
  const offeredCards = ownedCards.filter((candidate) => matchesTradeGroup(candidate, elements.tradeOfferedSet.value));
  const wantedCards = model.catalog.filter((candidate) => matchesTradeGroup(candidate, elements.tradeWantedSet.value));
  elements.tradeOfferedCard.innerHTML = offeredCards.length
    ? offeredCards.map((candidate) => `<option value="${candidate.id}">${escapeHtml(cardTitle(candidate))} · ${escapeHtml(cardCode(candidate))}</option>`).join("")
    : '<option value="">פתחו חבילה קודם</option>';
  if (offeredCards.some(({ id }) => id === offeredValue)) elements.tradeOfferedCard.value = offeredValue;
  elements.tradeWantedCard.innerHTML = wantedCards
    .map((candidate) => `<option value="${candidate.id}">${escapeHtml(cardTitle(candidate))} · ${escapeHtml(cardCode(candidate))}</option>`).join("");
  if (wantedCards.some(({ id }) => id === wantedValue)) elements.tradeWantedCard.value = wantedValue;
  for (const select of [elements.tradeOfferedSet, elements.tradeWantedSet, elements.tradeOfferedCard, elements.tradeWantedCard]) {
    const chosen = select.selectedOptions[0];
    select.title = chosen?.text || "";
  }
  elements.tradeCreate.disabled = !ownedCards.length;
  const renderTradeChoice = (container, cardId) => {
    const selected = model.byId.get(cardId);
    container.innerHTML = selected
      ? `<button type="button" data-trade-choice-card="${selected.id}" aria-label="פתיחת ${escapeHtml(cardTitle(selected))}">
          ${displayCardMarkup(selected, "trade")}
        </button>`
      : '<span class="work-note">אין קלף זמין</span>';
  };
  renderTradeChoice(elements.tradeOfferedPreview, elements.tradeOfferedCard.value);
  renderTradeChoice(elements.tradeWantedPreview, elements.tradeWantedCard.value);

  const openOffers = model.trades.filter((trade) => trade.status === "open");
  elements.tradeBoard.innerHTML = openOffers.length ? openOffers.map((trade) => {
    const offeredCard = model.byId.get(trade.offeredCardId);
    const wantedCard = model.byId.get(trade.wantedCardId);
    return `<article class="trade-offer ${trade.status}">
      <div><span>נותנים</span><strong>${escapeHtml(offeredCard ? cardTitle(offeredCard) : trade.offeredCardId)}</strong><small>${escapeHtml(offeredCard ? cardCode(offeredCard) : trade.offeredCardId)}</small></div>
      <b aria-hidden="true">⇄</b>
      <div><span>רוצים</span><strong>${escapeHtml(wantedCard ? cardTitle(wantedCard) : trade.wantedCardId)}</strong><small>${escapeHtml(wantedCard ? cardCode(wantedCard) : trade.wantedCardId)}</small></div>
      <p>${escapeHtml(trade.ownerLabel)} מציע/ה · עד ${escapeHtml(new Date(trade.expiresAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }))}</p>
      ${trade.ownedByCurrent
        ? `<button type="button" data-cancel-trade="${trade.tradeId}">ביטול ההצעה</button>`
        : trade.canAccept
          ? `<button type="button" data-accept-trade="${trade.tradeId}">קבלת ההצעה</button>`
          : `<span class="trade-unavailable">צריך את ${escapeHtml(wantedCard ? cardTitle(wantedCard) : "הקלף המבוקש")} כדי לקבל</span>`}
    </article>`;
  }).join("") : '<p class="work-note">אין כרגע הצעות פתוחות.</p>';

  const selectedFaction = model.serverState.factionId;
  const parties = partyRegister();
  elements.factionSelect.innerHTML = [
    '<option value="">ללא סיעה</option>',
    ...parties.map((party) => `<option value="${party.id}"${selectedFaction === party.id ? " selected" : ""}>${escapeHtml(party.displayNameHe)} · ${escapeHtml((party.requestedLetters || []).join(" / "))}</option>`),
  ].join("");
  const factionEntries = model.leaderboards?.factions?.slice(0, 6) || [];
  const factionMaximum = Math.max(1, ...factionEntries.map(({ packs }) => packs));
  elements.factionBoard.innerHTML = factionEntries.length
    ? factionEntries.map((entry, index) => `<div class="faction-chart-row">
        <span>${index + 1}. ${escapeHtml(partyDisplayName(entry.partyId, entry.partyId))}</span>
        <i aria-hidden="true"><b style="width:${Math.max(4, Math.round((entry.packs / factionMaximum) * 100))}%"></b></i>
        <strong>${entry.packs}</strong>
      </div>`).join("")
    : '<p class="work-note">עדיין אין קלפים שנספרו.</p>';
  const collectorEntries = model.leaderboards?.collectors || [];
  const collectorPreview = collectorEntries.slice(0, 3);
  const currentCollector = collectorEntries.find(({ current }) => current);
  if (currentCollector && !collectorPreview.includes(currentCollector)) collectorPreview.push(currentCollector);
  elements.collectorBoard.innerHTML = collectorPreview.length
    ? collectorPreview.map((entry) => `<div class="${entry.current ? "current-player" : ""}"><span>${entry.rank}. ${escapeHtml(entry.label)}</span><strong>★${entry.stars} · ${entry.ownedUnique} שונים</strong></div>`).join("")
    : '<p class="work-note">הטבלה מחכה לשחקן הראשון.</p>';

  const challenge = model.leaderboards?.dailyChallenge;
  const challengeDate = challenge?.day ? new Date(`${challenge.day}T12:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }) : "";
  const challengeLeaderCard = model.catalog.find((card) =>
    card.set === challenge?.targetPartyId && card.releaseSetId === "party-leaders");
  elements.dailyChallengeLeaderArt.innerHTML = challengeLeaderCard ? artMarkup(challengeLeaderCard, true) : "";
  elements.dailyChallengeLeaderArt.style.setProperty("--pip", challengeLeaderCard?.pip || "#1f4f4a");
  elements.dailyChallengeTitle.textContent = `היום ${challengeDate} · מי אסף הכי הרבה קלפים של ${partyDisplayName(challenge?.targetPartyId)}?`;
  renderChallengeRecap();
  elements.dailyChallengeBoard.innerHTML = challenge?.leaders?.length
    ? challenge.leaders.slice(0, 3).map((entry, index) => `<div class="${entry.current ? "current-player" : ""}"><span>${index + 1}. ${escapeHtml(entry.label)}</span><strong>${entry.cards} קלפים</strong></div>`).join("")
    : '<p class="work-note">עוד אין משיכות מהסיעה היומית.</p>';

  const specialDescriptions = {
    "prestige-legacy": "דמויות פוליטיות מתקופות שונות.",
    mouthpieces: "סיווג עריכתי גלוי של אנשי תקשורת ומסרים.",
    "satire-imitations": "דמויות סאטיריות, לא ציטוטים של הפוליטיקאים.",
    "legendary-aces": "קלפי קידום הזמינים רק באירועים.",
    records: "עובדות מספריות ורקורדים עם יחידת המדידה וההסתייגות על הקלף.",
    "current-ministers": "תפקיד נוכחי לצד תוצאה שנמדדה בתקופת הכהונה, ללא טענת סיבתיות אוטומטית.",
  };
  elements.specialsGrid.innerHTML = (model.specials.sets || []).map((set) => `
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
  const communityClasses = {
    trade: ".trade-desk",
    "open-trades": ".open-trades-desk",
    faction: ".faction-desk",
    collectors: ".leaderboard-desk",
    challenge: ".daily-challenge-desk",
  };
  for (const [page, selector] of Object.entries(communityClasses)) {
    document.querySelector(selector)?.toggleAttribute("hidden", page !== model.communityPage);
  }
  elements.communityTabs?.querySelectorAll("[data-community-page]").forEach((button) => {
    const active = button.dataset.communityPage === model.communityPage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  queueCardTextFit(elements.tradePreview);
  queueCardTextFit(elements.tradeOfferedPreview);
  queueCardTextFit(elements.tradeWantedPreview);
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
    elements.eventPull.textContent = active.claimedToday ? "הקלף היומי כבר נאסף" : "פתיחת קלף האירוע";
    elements.eventCards.innerHTML = active.cards.map((card) => `
      <article class="event-card">
        <strong>${escapeHtml(cardTitle(card))}</strong>
        <blockquote>${escapeHtml(card.walkout.text)}</blockquote>
      </article>`).join("");
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

async function pullEventCard() {
  const eventId = elements.eventPull.dataset.eventId;
  if (!eventId) return;
  elements.eventPull.disabled = true;
  try {
    model.currentPack = await request(`/api/events/${encodeURIComponent(eventId)}/pull`, { method: "POST" });
    model.serverState = await request("/api/state");
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
  return { ...model.gameConfig.revealTiming };
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
    <p class="work-note">Max level = sum of increments for sets that are currently idle-eligible. First set ${increments["party-leaders"] ?? 5}; each later set adds its own increment.</p>`;
  populateReleaseSets();
}

function populateReleaseSets() {
  if (!elements.studioReleaseSets) return;
  const sets = model.gameConfig.releaseSets || [];
  elements.studioReleaseSets.innerHTML = sets.map((set) => `
    <label class="studio-release-row">
      <b>${escapeHtml(set.nameHe)}</b>
      <select data-release-state="${escapeHtml(set.id)}">
        <option value="held"${set.runtimeState === "held" ? " selected" : ""}>held</option>
        <option value="active"${set.runtimeState === "active" ? " selected" : ""}>active</option>
      </select>
      <input data-release-from="${escapeHtml(set.id)}" type="datetime-local" value="${escapeHtml(toDatetimeLocal(set.runtimeAvailableFrom || set.plannedPublishAt))}" />
    </label>`).join("");
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

function readStudioProgression() {
  const increments = { ...(model.gameConfig.progression?.releaseLevelIncrements || {}) };
  elements.levelIncrements?.querySelectorAll("[data-level-increment]").forEach((input) => {
    increments[input.dataset.levelIncrement] = Math.min(20, Math.max(0, Math.round(Number(input.value) || 0)));
  });
  const exponent = Number(elements.levelExponent?.value);
  return {
    releaseLevelIncrements: increments,
    thresholdExponent: Number.isFinite(exponent) ? exponent : model.gameConfig.progression?.thresholdExponent,
  };
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

function studioCardForRuntime(party, member, card) {
  const letters = (party.finalLetters || party.requestedLetters || ["?"])[0];
  return {
    id: card.id,
    set: party.id,
    setName: party.displayNameEn,
    setNameHe: party.displayNameHe,
    letters,
    displayCode: `${letters}-${card.id.slice(-2)}`,
    pip: party.pip,
    title: member.nameEn,
    titleHe: member.nameHe,
    type: "Quote",
    typeHe: "ציטוט",
    rarity: card.rarity,
    subtitle: `מקום ${member.slot} · ${party.displayNameHe}`,
    subtitleHe: `מקום ${member.slot}`,
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
      }),
    });
    populateReleaseSets();
    renderHome();
    renderBinder();
    showToast("Release calendar published.");
  } catch (error) {
    showToast(error.status === 404 ? "Studio configuration is disabled without the ops key." : "Could not publish the set calendar.");
  }
}

function renderStudio() {
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
  const [tradeData, leaderboards] = await Promise.all([
    request("/api/trades"),
    request("/api/leaderboards"),
  ]);
  model.trades = tradeData.trades;
  model.leaderboards = leaderboards;
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
  try {
    await request("/api/trades", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offeredCardId, wantedCardId }),
    });
    await refreshSocialBoards();
    showToast("הצעת ההחלפה פורסמה.");
  } catch {
    showToast("לא הצלחנו לפרסם את ההצעה.");
  } finally {
    elements.tradeCreate.disabled = false;
  }
}

async function simulateTradeAcceptance(tradeId) {
  try {
    const result = await request(`/api/trades/${encodeURIComponent(tradeId)}/simulate-accept`, { method: "POST" });
    model.serverState = result.state;
    await refreshSocialBoards();
    showToast("ההחלפה המדומה הושלמה.");
  } catch {
    showToast("ההצעה כבר לא זמינה.");
  }
}

async function acceptTradeOffer(tradeId) {
  try {
    const result = await request(`/api/trades/${encodeURIComponent(tradeId)}/accept`, { method: "POST" });
    model.serverState = result.state;
    await refreshSocialBoards();
    showToast("ההחלפה הושלמה והקלפים עברו לאוספים.");
  } catch {
    await refreshSocialBoards();
    showToast("ההצעה כבר לא זמינה או שחסר לכם הקלף המבוקש.");
  }
}

async function cancelTradeOffer(tradeId) {
  try {
    await request(`/api/trades/${encodeURIComponent(tradeId)}/cancel`, { method: "POST" });
    await refreshSocialBoards();
    showToast("הצעת ההחלפה בוטלה.");
  } catch {
    await refreshSocialBoards();
    showToast("לא ניתן לבטל את ההצעה.");
  }
}

async function saveFaction() {
  try {
    model.serverState = await request("/api/faction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ factionId: elements.factionSelect.value || null }),
    });
    renderBinder();
    renderGrowth();
    showToast(model.serverState.factionId ? "הסיעה נשמרה. החבילה הבאה תיספר." : "בחירת הסיעה בוטלה.");
  } catch {
    showToast("לא הצלחנו לשמור את הסיעה.");
  }
}

async function resetDailyPack() {
  const resetButtons = [elements.debugResetPack, elements.headerDebugReset];
  resetButtons.forEach((button) => { button.disabled = true; });
  try {
    model.serverState = await request("/api/debug/reset-pack", { method: "POST" });
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
    model.serverState = await request("/api/debug/unlock-card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId }),
    });
    renderBinder();
    openCardDialog(cardId);
    showToast("Card unlocked for local testing.");
  } catch (error) {
    showToast(error.status === 404 ? "Local unlock is disabled." : "Could not unlock this card.");
  }
}

async function toggleFavorite(cardId) {
  const favorite = !(model.serverState.favorites || []).includes(cardId);
  try {
    model.serverState = await request("/api/favorites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId, favorite }),
    });
    renderBinder();
    showToast(favorite ? "נוסף לפייבוריטים." : "הוסר מהפייבוריטים.");
  } catch {
    showToast("לא הצלחנו לעדכן את הפייבוריטים.");
  }
}

function openCardDialog(cardId) {
  model.dialogCardId = cardId;
  model.dialogBack = false;
  renderDialogCard();
  elements.dialog.showModal();
  queueCardTextFit(elements.dialog);
}

function renderDialogCard() {
  const card = model.byId.get(model.dialogCardId);
  const ownedCount = model.serverState.inventory[card.id] ?? 0;
  elements.dialogCard.innerHTML = displayCardMarkup(card);
  elements.dialogOwnership.textContent = ownedCount < 1
    ? "הקלף הזה עדיין לא באוסף."
    : ownedCount === 1
      ? "ברשותכם עותק אחד."
      : `ברשותכם ${ownedCount} עותקים.`;
  elements.dialogSource.href = card.walkout.sourceUrl;
  elements.dialogSource.dataset.sourceCard = card.id;
  elements.dialogShare.hidden = ownedCount < 1;
  elements.dialogWhatsapp.hidden = ownedCount < 1;
  elements.dialogInstagram.hidden = ownedCount < 1;
  elements.dialogGift.hidden = ownedCount < 2;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => elements.toast.classList.remove("show"), 2200);
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
  context.fillStyle = card.pip;
  context.fillRect(84, 86, 18, 100);

  context.fillStyle = "#1a1f1c";
  context.font = "600 34px 'IBM Plex Sans'";
  context.textAlign = "center";
  context.fillText(`${card.typeHe || "קלף"} · ${cardCode(card)}`, 310, 130);
  context.fillText("קְלָפִי · KLAFI · 2026", 790, 130);
  context.textAlign = "right";

  context.fillStyle = "#1f4f4a";
  context.font = "600 21px 'IBM Plex Sans'";
  context.fillText(card.walkout.kind === "quote" ? "הציטוט לפני השם" : "העובדה לפני הזהות", 996, 205);
  context.fillStyle = "#1a1f1c";
  context.font = "600 42px Fraunces";
  const quoteEnd = wrapCanvasText(context, card.walkout.text, 996, 260, 912, 48, 3);

  const artX = 84;
  const artY = Math.max(390, quoteEnd + 36);
  const artWidth = 912;
  const artHeight = 470;
  context.fillStyle = "#e7dfd0";
  context.fillRect(artX, artY, artWidth, artHeight);
  if (card.artKey) {
    try {
      const image = await loadImage(`/design-assets/${encodeURIComponent(card.artKey)}`);
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
  if (!card.artKey) {
    context.fillStyle = card.pip;
    context.textAlign = "center";
    context.font = "600 190px Fraunces";
    context.fillText(placeholderMark(card), 540, 610);
    context.textAlign = "right";
  }

  context.fillStyle = "#1a1f1c";
  context.font = "600 62px Fraunces";
  const titleEnd = wrapCanvasText(context, cardTitle(card), 996, artY + artHeight + 74, 912, 66, 2);
  context.font = "500 27px 'IBM Plex Sans'";
  context.fillStyle = "#2c3330";
  const subtitleEnd = wrapCanvasText(context, card.subtitleHe || card.subtitle, 996, titleEnd + 18, 912, 36, 2);
  context.fillStyle = "#1f4f4a";
  context.font = "600 22px 'IBM Plex Sans'";
  context.fillText("מקור מצורף לקלף", 996, subtitleEnd + 52);
  context.fillStyle = "#1a1f1c";
  context.font = "500 20px 'IBM Plex Sans'";
  context.textAlign = "center";
  context.fillText("מהדורת עמדה גלויה", 270, 1240);
  context.fillText("פותחים מקור · מכירים את הרשימה", 810, 1240);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function shareDialogCard() {
  const card = model.byId.get(model.dialogCardId);
  elements.dialogShare.disabled = true;
  elements.dialogShare.textContent = "מכינים שיתוף…";
  try {
    const blob = await makeShareImage(card);
    if (!blob) throw new Error("Canvas export failed");
    const file = new File([blob], `kalpi-${card.id}.png`, { type: "image/png" });
    const shareUrl = makeDeepLink("card", card.id);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `קיבלתי את ${cardTitle(card)} בקְלָפִי`,
        text: `${card.walkout.text}\n${shareUrl}`,
        files: [file],
      });
      await recordEvent("share_created", { cardId: card.id, referralCode: referralCode() });
      showToast("חלון השיתוף נפתח.");
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const copied = await copyText(shareUrl);
      await recordEvent("share_created", { cardId: card.id, referralCode: referralCode() });
      showToast(copied ? "התמונה נשמרה והקישור הועתק." : "התמונה נשמרה.");
    }
  } catch (error) {
    if (error.name !== "AbortError") showToast("לא הצלחנו להכין תמונת שיתוף.");
  } finally {
    elements.dialogShare.disabled = false;
    elements.dialogShare.textContent = "שיתוף הקלף";
  }
}

async function shareToWhatsApp() {
  const card = model.byId.get(model.dialogCardId);
  const shareUrl = makeDeepLink("card", card.id);
  const text = `${card.walkout.text}\n— ${cardTitle(card)}\nלצפייה בלבד: ${shareUrl}`;
  elements.dialogWhatsapp.disabled = true;
  try {
    const blob = await makeShareImage(card);
    if (!blob) throw new Error("Canvas export failed");
    const file = new File([blob], `kalpi-${card.id}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ title: `קְלָפִי · ${cardTitle(card)}`, text, files: [file] });
    } else {
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      showToast("התמונה נשמרה ו־WhatsApp נפתח.");
    }
    await recordEvent("share_created", { cardId: card.id, referralCode: referralCode() });
    model.serverState = await request("/api/state");
    renderBinder();
  } catch (error) {
    if (error.name !== "AbortError") showToast("לא הצלחנו להכין את השיתוף.");
  } finally {
    elements.dialogWhatsapp.disabled = false;
  }
}

async function shareToInstagram() {
  const card = model.byId.get(model.dialogCardId);
  elements.dialogInstagram.disabled = true;
  try {
    const blob = await makeShareImage(card);
    if (!blob) throw new Error("Canvas export failed");
    const file = new File([blob], `kalpi-${card.id}-story.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({
        title: `קְלָפִי · ${cardTitle(card)}`,
        text: `${card.walkout.text}\n${makeDeepLink("card", card.id)}`,
        files: [file],
      });
      showToast("בחרו Instagram Story בחלון השיתוף.");
    } else {
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      window.open("https://www.instagram.com/", "_blank", "noopener");
      showToast("התמונה נשמרה. העלו אותה ל־Instagram Story.");
    }
    await recordEvent("share_created", { cardId: card.id, referralCode: referralCode(), channel: "instagram" });
  } catch (error) {
    if (error.name !== "AbortError") showToast("לא הצלחנו להכין תמונת Instagram.");
  } finally {
    elements.dialogInstagram.disabled = false;
  }
}

function referralCode() {
  return `k-${model.token.slice(0, 8)}`;
}

function makeDeepLink(kind, cardId) {
  const url = new URL(location.origin);
  url.searchParams.set(kind, cardId);
  url.searchParams.set("ref", referralCode());
  return url.toString();
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
elements.openBibiPack.addEventListener("click", openBibiDebugPack);
elements.packAction.addEventListener("click", handlePackAction);
elements.eventPull.addEventListener("click", pullEventCard);
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
elements.closeLevel.addEventListener("click", () => elements.levelDialog.close());
elements.openPendingLevel?.addEventListener("click", openPendingLevelDialog);
elements.claimLevel.addEventListener("click", async () => {
  elements.claimLevel.disabled = true;
  try {
    const reward = await request("/api/rewards/level", { method: "POST" });
    model.serverState = reward.state;
    model.currentPack = {
      packId: `rank-${reward.rank}`,
      mode: "level-reward",
      pulledAt: new Date().toISOString(),
      cards: reward.cards,
    };
    model.currentCardIndex = 0;
    elements.levelDialog.close();
    showView("pack");
    startWalkout();
  } catch (error) {
    showToast(error.status === 409 ? "אין כרגע פרס שמחכה." : "לא הצלחנו לקבל את הפרס.");
  } finally {
    elements.claimLevel.disabled = false;
  }
});
elements.dialogShare.addEventListener("click", shareDialogCard);
elements.dialogWhatsapp.addEventListener("click", shareToWhatsApp);
elements.dialogInstagram.addEventListener("click", shareToInstagram);
elements.dialogGift.addEventListener("click", offerDuplicate);
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
document.querySelector(".today-docket").addEventListener("click", (event) => {
  const hook = event.target.closest("[data-today-nav]");
  if (!hook) return;
  if (hook.dataset.communityPage) model.communityPage = hook.dataset.communityPage;
  elements.navButtons.find((button) => button.dataset.nav === hook.dataset.todayNav)?.click();
  if (hook.dataset.communityPage) renderGrowth();
});
elements.tradeOfferedSet.addEventListener("change", renderGrowth);
elements.tradeWantedSet.addEventListener("change", renderGrowth);
elements.tradeOfferedCard.addEventListener("change", renderGrowth);
elements.tradeWantedCard.addEventListener("change", renderGrowth);
elements.tradeCreate.addEventListener("click", createTradeOffer);
elements.tradeBoard.addEventListener("click", (event) => {
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
  const button = event.target.closest("[data-simulate-trade]");
  if (button) simulateTradeAcceptance(button.dataset.simulateTrade);
});
elements.saveFaction.addEventListener("click", saveFaction);
elements.creatorCode.addEventListener("input", () => {
  elements.creatorLinkPreview.textContent = creatorLink();
});
elements.copyCreatorLink.addEventListener("click", async () => {
  const copied = await copyText(creatorLink());
  showToast(copied ? "קישור השיתוף הועתק." : "קישור השיתוף מוכן.");
});
elements.runGuidedDemo.addEventListener("click", runGuidedDemo);
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

elements.navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.nav === "binder") loadStaticCatalog().catch(() => {});
    else if (button.dataset.nav !== "home") hydrateExtras().catch(() => {});
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

elements.binderPager.addEventListener("click", (event) => {
  const button = event.target.closest('[data-page-target="binder"]');
  if (!button) return;
  model.binderPage = Number(button.dataset.page);
  renderBinder();
});

elements.achievementPager.addEventListener("click", (event) => {
  const button = event.target.closest('[data-page-target="achievements"]');
  if (!button) return;
  model.achievementPage = Number(button.dataset.page);
  renderAchievements();
});

elements.communityTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-community-page]");
  if (!button) return;
  model.communityPage = button.dataset.communityPage;
  renderGrowth();
});

elements.eventTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-event-page]");
  if (!button) return;
  model.eventPage = button.dataset.eventPage;
  renderEvents();
});

elements.binderGrid.addEventListener("click", (event) => {
  const favorite = event.target.closest("[data-favorite-card]");
  if (favorite) {
    toggleFavorite(favorite.dataset.favoriteCard);
    return;
  }
  const unlock = event.target.closest("[data-debug-unlock]");
  if (unlock) {
    debugUnlockCard(unlock.dataset.debugUnlock);
    return;
  }
  const button = event.target.closest("[data-card-id]");
  if (button) openCardDialog(button.dataset.cardId);
});

function showCollectionTooltip(target) {
  const tooltip = target.closest("[data-tooltip]");
  if (!tooltip) return;
  showToast(tooltip.dataset.tooltip);
}

elements.earnedBadgeRail.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-achievements]")) {
    renderAchievements();
    showView("achievements");
    return;
  }
  showCollectionTooltip(event.target);
});
elements.earnedBadgeRail.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showCollectionTooltip(event.target);
});

elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.advocacyDialog.addEventListener("click", (event) => {
  if (event.target === elements.advocacyDialog) elements.advocacyDialog.close();
});
elements.profileDialog.addEventListener("click", (event) => {
  if (event.target === elements.profileDialog) elements.profileDialog.close();
});
document.addEventListener("keydown", (event) => {
  const packIsOpen = document.querySelector("#pack-view").classList.contains("active");
  if (event.key === "ArrowRight" && packIsOpen && !elements.packAction.disabled && !elements.dialog.open && !elements.advocacyDialog.open && !elements.profileDialog.open) {
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
});
document.addEventListener("click", (event) => {
  const sourceLink = event.target.closest("[data-source-card]");
  if (sourceLink) recordEvent("source_opened", { cardId: sourceLink.dataset.sourceCard });
});

bootstrap();
document.fonts?.ready.then(() => queueCardTextFit(elements.main));
