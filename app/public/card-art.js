/**
 * Card-art preloader: one load+decode promise per URL, shared by home prefetch and the reveal gate.
 * The gate waits for the art (capped) so a reveal never shows a blank face on a slow network.
 * Image errors and timeouts never block: the caller proceeds anyway.
 */
export const ART_GATE_TIMEOUT_MS = 2500;

export function createArtPreloader({
  makeImage = () => new Image(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  const entries = new Map();

  function preload(url, { priority } = {}) {
    if (!url) return Promise.resolve("none");
    const known = entries.get(url);
    if (known) return known.promise;
    const entry = { done: false, promise: null, image: null };
    entry.promise = new Promise((resolve) => {
      const image = makeImage();
      entry.image = image; // keep a reference so the request is not dropped
      const finish = (result) => {
        if (entry.done) return;
        entry.done = true;
        if (result === "error") entries.delete(url); // allow a later retry
        resolve(result);
      };
      image.decoding = "async";
      if (priority) image.fetchPriority = priority;
      image.onload = () => {
        const decoded = typeof image.decode === "function" ? image.decode() : null;
        if (decoded?.then) decoded.then(() => finish("loaded"), () => finish("loaded"));
        else finish("loaded");
      };
      image.onerror = () => finish("error");
      image.src = url;
    });
    entries.set(url, entry);
    return entry.promise;
  }

  function isReady(url) {
    return !url || Boolean(entries.get(url)?.done);
  }

  /** Resolves { status: "ready" | "loaded" | "timeout", waited } — never rejects. */
  function ready(urls = [], { timeoutMs = ART_GATE_TIMEOUT_MS } = {}) {
    const list = [...new Set((urls || []).filter(Boolean))];
    if (list.every(isReady)) return Promise.resolve({ status: "ready", waited: false });
    const loads = Promise.all(list.map((url) => preload(url, { priority: "high" }))).then(() => ({ status: "loaded", waited: true }));
    let timer = null;
    const cap = new Promise((resolve) => {
      timer = setTimer(() => resolve({ status: "timeout", waited: true }), timeoutMs);
    });
    return Promise.race([loads, cap]).finally(() => clearTimer(timer));
  }

  return { preload, ready, isReady };
}
