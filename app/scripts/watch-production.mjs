const baseUrl = (process.argv[2] || process.env.BASE_URL || "https://klafi.vercel.app").replace(/\/$/, "");
const cardId = process.env.SHARE_CARD_ID || "YSR-M01-Q01";
const requestTimeoutMs = Math.max(3000, Number(process.env.REQUEST_TIMEOUT_MS || 12_000));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WHATSAPP = "WhatsApp/2.24.0";
const INSTAGRAM = "facebookexternalhit/1.1; Instagram 192.168.1.2";

async function hit(path, { method = "GET", headers = {}, raw = false } = {}) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const requestId = response.headers.get("x-request-id");
  const contentType = response.headers.get("content-type") || "";
  let body = null;
  if (method !== "HEAD") {
    const text = await response.text();
    if (raw || contentType.includes("text/html") || contentType.startsWith("image/")) {
      body = text;
    } else {
      try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 200) }; }
    }
  }
  return {
    path,
    method,
    status: response.status,
    durationMs: Date.now() - started,
    requestId,
    contentType,
    contentLength: Number(response.headers.get("content-length") || 0),
    body,
  };
}

function optionalUuid(requestId) {
  return UUID.test(requestId || "") ? requestId : null;
}

function requireMatch(html, pattern, label) {
  if (!pattern.test(html || "")) throw new Error(`${label} failed ${pattern}`);
}

const health = await hit("/api/health");
if (health.status !== 200 || health.body?.status !== "ok" || health.body?.backend !== "postgres") {
  throw new Error(`health failed: ${JSON.stringify(health.body)}`);
}
const healthRequestId = optionalUuid(health.requestId);

const catalog = await hit("/catalog.json", { raw: true });
if (catalog.status !== 200) throw new Error(`catalog.json failed ${catalog.status}`);
const catalogBody = JSON.parse(catalog.body);
if (!Array.isArray(catalogBody.cards) || !catalogBody.cards.length) throw new Error("catalog.json empty");
const catalogRequestId = optionalUuid(catalog.requestId);
const liveCard = catalogBody.cards.find(({ id }) => id === cardId) || catalogBody.cards.find(({ artKey }) => artKey);
if (!liveCard?.artKey) throw new Error(`no live card art for ${cardId}`);

const studio = await hit("/api/studio/content");
const studioClosed = studio.status === 404
  || studio.body?.debugEnabled !== true
  || studio.status >= 400;

const shareChecks = [];
for (const [name, userAgent] of [["whatsapp", WHATSAPP], ["instagram", INSTAGRAM]]) {
  const binder = await hit("/share/binder", { headers: { "user-agent": userAgent }, raw: true });
  if (binder.status !== 200) throw new Error(`share binder ${name} ${binder.status}`);
  requireMatch(binder.body, /og:title" content="קְלָפִי · האלבום המלא"/, `${name} binder title`);
  requireMatch(binder.body, /og:image" content="(?:https:\/\/klafi\.vercel\.app)?\/design-assets\/hero-art-kalpi\.png"/, `${name} binder image`);
  requireMatch(binder.body, /twitter:card" content="summary_large_image"/, `${name} binder twitter`);
  requireMatch(binder.body, /showcase=1/, `${name} binder play`);

  const card = await hit(`/share/${encodeURIComponent(liveCard.id)}`, { headers: { "user-agent": userAgent }, raw: true });
  if (card.status !== 200) throw new Error(`share card ${name} ${card.status}`);
  requireMatch(card.body, new RegExp(`og:title" content="קְלָפִי · `), `${name} card title`);
  requireMatch(card.body, new RegExp(`/design-assets/${liveCard.artKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${name} card image`);
  requireMatch(card.body, new RegExp(`card=${liveCard.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${name} card play`);

  const image = await hit(`/design-assets/${encodeURIComponent(liveCard.artKey)}`, { method: "HEAD" });
  if (image.status !== 200 || image.contentLength < 20_000) {
    throw new Error(`share art ${name} ${image.status} ${image.contentLength}`);
  }
  shareChecks.push({
    crawler: name,
    binderStatus: binder.status,
    cardStatus: card.status,
    cardId: liveCard.id,
    artKey: liveCard.artKey,
    artBytes: image.contentLength,
  });
}

const report = {
  checkedAt: new Date().toISOString(),
  publicUrl: "https://klafi.vercel.app",
  currentProduction: {
    url: "https://klafi.vercel.app",
    deploymentUrl: process.env.CURRENT_DEPLOYMENT_URL || "https://klafi-hovw1xwbo-guygirs-projects.vercel.app",
    commit: process.env.CURRENT_PRODUCTION_SHA || "0f8f3001dde74ee8349ebeb476540371637b8809",
    note: "PR #25 set 1 portraits on top of #24 step 14/15",
  },
  previousProduction: {
    deploymentUrl: process.env.PREVIOUS_DEPLOYMENT_URL || "https://klafi-7vwt5ypcw-guygirs-projects.vercel.app",
    commit: process.env.PREVIOUS_PRODUCTION_SHA || "b87e926782e7fed21d8086dba26174e9a78948d0",
    note: "PR #24 numbered holos, share binder, step 15",
  },
  health: { status: health.status, backend: health.body.backend, requestId: healthRequestId, durationMs: health.durationMs },
  requestIds: {
    health: healthRequestId,
    catalog: catalogRequestId,
    note: healthRequestId
      ? "x-request-id is on the slim health function"
      : "slim health is still an older deploy without x-request-id; fat /api and the next deploy carry it",
  },
  studioClosed,
  share: shareChecks,
};

console.log(JSON.stringify(report, null, 2));
