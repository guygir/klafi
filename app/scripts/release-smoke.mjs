const baseUrl = (process.argv[2] || process.env.BASE_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("Pass the deployment URL: npm run verify:release -- https://deployment.example");

async function check(path, validate) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
  const body = await response.json();
  if (!response.ok || !validate(body)) {
    throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return { path, status: response.status, durationMs: Date.now() - started };
}

const health = await check("/api/health", (body) => body.status === "ok" && body.backend === "postgres");
const home = await check("/api/home", (body) => Boolean(body.token && body.state));
const catalog = await check("/api/catalog", (body) => Array.isArray(body.cards) && body.cards.length > 0);

console.log(JSON.stringify({ baseUrl, checks: [health, home, catalog] }, null, 2));
