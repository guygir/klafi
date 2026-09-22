import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { serveShareLanding } from "./share-landing.js";

const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
});

let catalog;
let catalogLoad;

function stamp(response) {
  const requestId = response.getHeader("x-request-id") || randomUUID();
  response.setHeader("x-request-id", requestId);
  return requestId;
}

function json(response, status, value) {
  const requestId = stamp(response);
  const payload = status >= 500 && value && typeof value === "object"
    ? { ...value, requestId: value.requestId || requestId }
    : value;
  if (status >= 500) {
    console.error(JSON.stringify({
      level: "error",
      requestId,
      message: payload?.detail || payload?.error || "SERVER_ERROR",
    }));
  }
  response.writeHead(status, SECURITY_HEADERS);
  response.end(JSON.stringify(payload));
}

function restoreUrl(request) {
  const current = new URL(request.url, "http://localhost");
  const restored = current.searchParams.get("__kalpi_path");
  if (!restored) return current;
  current.searchParams.delete("__kalpi_path");
  const query = current.searchParams.toString();
  return new URL(query ? `${restored}?${query}` : restored, current.origin);
}

function cardIdFrom(url) {
  const fromQuery = url.searchParams.get("id");
  if (fromQuery) return fromQuery;
  const path = decodeURIComponent(url.pathname.replace(/\.html$/, ""));
  if (path.startsWith("/share/")) return path.slice("/share/".length);
  return "";
}

async function loadCatalog() {
  if (catalog) return catalog;
  catalogLoad ??= readFile(new URL("../public/catalog.json", import.meta.url), "utf8")
    .then((text) => {
      catalog = JSON.parse(text);
      return catalog;
    })
    .finally(() => {
      catalogLoad = null;
    });
  return catalogLoad;
}

export async function handleSlimShare(request, response) {
  stamp(response);
  try {
    const url = restoreUrl(request);
    const cardId = cardIdFrom(url);
    if (!cardId || cardId === "binder") {
      json(response, 404, { error: "NOT_FOUND" });
      return;
    }
    const payload = await loadCatalog();
    const card = (payload.cards || []).find((item) => item.id === cardId);
    if (!card) {
      json(response, 404, { error: "NOT_FOUND" });
      return;
    }
    serveShareLanding(request, response, card, {
      ref: url.searchParams.get("ref"),
      gift: url.searchParams.has("gift"),
    });
  } catch (error) {
    json(response, 500, { error: "SERVER_ERROR", detail: error.message });
  }
}
