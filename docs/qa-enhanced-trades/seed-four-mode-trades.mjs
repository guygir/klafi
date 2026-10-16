/**
 * Clears all open trades, then seeds exactly four 2↔2 offers (AND∧AND … OR∧OR)
 * with different card pairs so each row is easy to spot on the board.
 *
 * Usage (debug server on 8799):
 *   node docs/qa-enhanced-trades/seed-four-mode-trades.mjs
 */
const base = process.env.KLAFI_BASE || "http://127.0.0.1:8799";

async function session() {
  return (await (await fetch(`${base}/api/session`, { method: "POST" })).json()).token;
}

async function api(token, route, { method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, body: payload };
}

async function unlock(token, cardIds) {
  for (const cardId of cardIds) {
    await api(token, "/api/debug/unlock-card", { method: "POST", body: { cardId } });
  }
}

async function cancelOpenMine(token) {
  const { body } = await api(token, "/api/trades");
  const mine = (body.trades || []).find((t) => t.ownedByCurrent && t.status === "open");
  if (mine) {
    await api(token, `/api/trades/${encodeURIComponent(mine.tradeId)}/cancel`, { method: "POST" });
  }
}

async function postTrade(token, offered, wanted) {
  await cancelOpenMine(token);
  const { status, body } = await api(token, "/api/trades", {
    method: "POST",
    body: { offered, wanted },
  });
  if (status !== 201) {
    throw new Error(`POST trade failed ${status}: ${JSON.stringify(body)}`);
  }
  return body.trade;
}

const catalog = (await (await fetch(`${base}/api/catalog`)).json()).cards.filter(
  (c) => !c.eventOnly && c.releaseSetId === "party-leaders",
);
const byIndex = (i) => catalog[i]?.id;
const ids = catalog.slice(0, 14).map((c) => c.id);
if (ids.length < 12) throw new Error("Need at least 12 party-leaders cards in catalog");

const name = (i) => catalog[i]?.nameHe || catalog[i]?.id || `#${i}`;

const bootstrap = await session();
const cleared = await api(bootstrap, "/api/debug/clear-open-trades", { method: "POST" });
if (cleared.status === 404) {
  console.error("clear-open-trades not found — restart the QA server so it loads the new debug route.");
  process.exit(1);
}
console.log("Cleared open trades:", cleared.body.cleared ?? 0);

const samples = [
  {
    label: "AND ∧ AND",
    offered: { mode: "and", cardIds: [ids[0], ids[1]] },
    wanted: { mode: "and", cardIds: [ids[6], ids[7]] },
    hint: `${name(0)}+${name(1)} ↔ ${name(6)}+${name(7)}`,
  },
  {
    label: "AND ∧ OR",
    offered: { mode: "and", cardIds: [ids[2], ids[3]] },
    wanted: { mode: "or", cardIds: [ids[6], ids[7]] },
    hint: `${name(2)}+${name(3)} ↔ ${name(6)} או ${name(7)}`,
  },
  {
    label: "OR ∧ AND",
    offered: { mode: "or", cardIds: [ids[4], ids[5]] },
    wanted: { mode: "and", cardIds: [ids[8], ids[9]] },
    hint: `${name(4)} או ${name(5)} ↔ ${name(8)}+${name(9)}`,
  },
  {
    label: "OR ∧ OR",
    offered: { mode: "or", cardIds: [ids[10], ids[11]] },
    wanted: { mode: "or", cardIds: [ids[8], ids[9]] },
    hint: `${name(10)} או ${name(11)} ↔ ${name(8)} או ${name(9)}`,
  },
];

const viewer = await session();
await unlock(viewer, [ids[6], ids[7], ids[8], ids[9]]);

const posted = [];
for (const sample of samples) {
  const token = await session();
  await unlock(token, [...new Set(sample.offered.cardIds)]);
  const trade = await postTrade(token, sample.offered, sample.wanted);
  posted.push({ ...sample, tradeId: trade.tradeId });
}

const board = (await api(viewer, "/api/trades")).body.trades?.filter((t) => !t.ownedByCurrent && t.status === "open") || [];
console.log("\nSeeded on", base);
for (const row of posted) {
  console.log(`  · ${row.label}  ${row.hint}`);
  console.log(`    ${row.tradeId}`);
}
console.log(`\nViewer sees ${board.length} open offer(s).`);
console.log("\nViewer token (localStorage kalpi-alpha-session):");
console.log(`  ${viewer}`);
console.log("\nOpen:");
console.log(`  ${base}/?view=growth&tab=open-trades`);
