import { performance } from "node:perf_hooks";
import { IDLE_STARTER_READY } from "../server/idle-config.js";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const players = Math.max(1, Number(process.env.PLAYERS || 1000));
const concurrency = Math.max(1, Number(process.env.CONCURRENCY || 50));
const requestTimeoutMs = Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS || 15_000));

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
}

async function timedFetch(path, options = {}) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const body = await response.json();
  return { status: response.status, body, durationMs: performance.now() - started };
}

const sessionLatency = [];
const settleLatency = [];
const errors = [];
let nextPlayer = 0;

async function worker() {
  while (nextPlayer < players) {
    const player = nextPlayer;
    nextPlayer += 1;
    try {
      const home = await timedFetch("/api/home");
      sessionLatency.push(home.durationMs);
      if (home.status !== 200 || !home.body.token) {
        errors.push({ player, phase: "home", status: home.status, error: home.body.error || "INVALID_RESPONSE" });
        continue;
      }
      const settled = await timedFetch("/api/idle/settle", {
        method: "POST",
        headers: { authorization: `Bearer ${home.body.token}` },
      });
      settleLatency.push(settled.durationMs);
      if (settled.status !== 200 || settled.body.newlySettledCount !== IDLE_STARTER_READY) {
        errors.push({
          player,
          phase: "settle",
          status: settled.status,
          error: settled.body.error || "INVALID_RESPONSE",
        });
      }
    } catch (error) {
      errors.push({ player, phase: "network", error: error.name || error.message });
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: Math.min(players, concurrency) }, worker));
const durationMs = performance.now() - started;

const summary = {
  baseUrl,
  players,
  concurrency,
  durationMs: Math.round(durationMs),
  throughputPlayersPerSecond: Number((players / (durationMs / 1000)).toFixed(2)),
  errors: errors.length,
  homeMs: {
    p50: percentile(sessionLatency, 0.5),
    p95: percentile(sessionLatency, 0.95),
    p99: percentile(sessionLatency, 0.99),
  },
  settleMs: {
    p50: percentile(settleLatency, 0.5),
    p95: percentile(settleLatency, 0.95),
    p99: percentile(settleLatency, 0.99),
  },
  sampleErrors: errors.slice(0, 10),
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
