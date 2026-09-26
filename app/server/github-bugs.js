const MAX_BUG_LENGTH = 500;
const MAX_PER_24H = 3;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BUG_RATE_COOKIE = "klafi_bug_rate";

export function sanitizeBugText(text) {
  return String(text || "")
    .trim()
    .replace(/[<>\\`]/g, "")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/vbscript:/gi, "")
    .slice(0, MAX_BUG_LENGTH);
}

export function parseGithubRepo(raw) {
  const value = String(raw || "").trim();
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  return { owner: value.slice(0, slash), repo: value.slice(slash + 1) };
}

function cookieValue(headers, name) {
  const raw = headers?.cookie;
  const cookieHeader = Array.isArray(raw) ? raw.join("; ") : raw;
  if (!cookieHeader) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function parseRateCookie(headers) {
  const raw = cookieValue(headers, BUG_RATE_COOKIE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => typeof value === "number" && Number.isFinite(value));
  } catch {
    return [];
  }
}

export function rateCookie(timestamps, { secure = process.env.NODE_ENV === "production" } = {}) {
  const encoded = encodeURIComponent(JSON.stringify(timestamps));
  return `${BUG_RATE_COOKIE}=${encoded}; Max-Age=${Math.floor(RATE_WINDOW_MS / 1000)}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function siteBaseUrl(env = process.env) {
  const explicit = String(env.PUBLIC_SITE_URL || env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = String(env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel}`;
  return "https://klafi.vercel.app";
}

async function ghFetch(token, pathname, init, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* GitHub sometimes returns a plain error string. */
  }
  if (!response.ok) return { ok: false, status: response.status, text: text.slice(0, 400) };
  return { ok: true, json };
}

// Report kinds the form may send. Anything else (missing, unknown, non-string) is a bug report,
// so old clients keep working and callers cannot inject arbitrary title prefixes.
export const REPORT_KINDS = Object.freeze({
  bug: Object.freeze({ tag: "bug", type: "Bug report" }),
  feature: Object.freeze({ tag: "feature", type: "Feature request" }),
});

export function reportKind(raw) {
  return typeof raw === "string" && Object.hasOwn(REPORT_KINDS, raw) ? raw : "bug";
}

export async function createGithubBugFromBody(env, body, headers, {
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const token = String(env.GITHUB_COMMENTS_TOKEN || "").trim();
  const repoRaw = String(env.GITHUB_COMMENTS_REPO || "").trim();
  if (!token || !repoRaw) {
    return { ok: false, status: 503, error: "BUG_REPORT_UNCONFIGURED" };
  }
  const repo = parseGithubRepo(repoRaw);
  if (!repo) {
    return { ok: false, status: 500, error: "INVALID_GITHUB_REPO" };
  }
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "INVALID_REQUEST" };
  }

  if (typeof body.website === "string" && body.website.trim()) {
    return { ok: true, issueUrl: "" };
  }

  const timestamps = parseRateCookie(headers);
  const current = now();
  const recent = timestamps.filter((stamp) => current - stamp < RATE_WINDOW_MS);
  if (recent.length >= MAX_PER_24H) {
    return { ok: false, status: 429, error: "RATE_LIMIT" };
  }

  const text = sanitizeBugText(body.text);
  if (!text) {
    return { ok: false, status: 400, error: "EMPTY_BUG" };
  }

  const nickname = sanitizeBugText(body.nickname).slice(0, 80);
  const rawPageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim().slice(0, 500) : "";
  const base = siteBaseUrl(env);
  const pageUrl = rawPageUrl.startsWith("http") ? rawPageUrl : base;
  const titleStart = text.replace(/\s+/g, " ").slice(0, 80);
  const kind = REPORT_KINDS[reportKind(body.kind)];
  const title = `[KLAFI ${kind.tag}] ${titleStart}`.slice(0, 256);
  const issueBody = `${text}

---
Type: ${kind.type}
Submitted by: ${nickname || "Anonymous"}
Page: ${pageUrl}
Date: ${new Date(current).toISOString()}`;

  const created = await ghFetch(token, `/repos/${repo.owner}/${repo.repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body: issueBody }),
  }, fetchImpl);
  if (created.ok === false) {
    return { ok: false, status: 502, error: "GITHUB_CREATE_FAILED" };
  }

  const issueUrl = created.json?.html_url || "";
  const nextRate = [...recent, current].slice(-MAX_PER_24H);
  return { ok: true, issueUrl, headers: { "Set-Cookie": rateCookie(nextRate) } };
}
