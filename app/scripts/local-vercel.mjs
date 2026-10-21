/**
 * Local stand-in for Vercel routing: slim /api/home + /api/health, fat
 * createRuntimeHandler (same boot as api/index.js) for every other path.
 * Test DBs only: PGlite or the JSON file store. Never production.
 */
import { createServer } from "node:http";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createRuntimeHandler } from "../server/runtime.js";
import { handleSlimHealth, handleSlimHome, useSlimHomePool } from "../server/slim-home.js";
import { PostgresStore } from "../server/postgres-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const port = Number(process.env.PORT || 4175);
const mode = process.env.KALPI_STORE === "file" ? "file" : "pglite";
const clock = { value: Date.parse(process.env.KALPI_NOW || "2026-10-21T08:00:00+03:00") };
const logPath = process.env.KALPI_REQLOG || path.join(appRoot, ".runtime", "local-vercel-requests.jsonl");

function pglitePool(db) {
  const run = (sql, params) => db.query(sql, params);
  return {
    query: run,
    connect: async () => ({ query: run, release() {} }),
  };
}

async function migratedPglite() {
  const db = new PGlite();
  const migrationsDir = path.join(appRoot, "server/migrations");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS kalpi_schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const file of (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
    await db.query(
      "INSERT INTO kalpi_schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [file.replace(/\.sql$/, "")],
    );
  }
  return db;
}

function restoreRequestUrl(request) {
  const current = new URL(request.url, "http://localhost");
  const restored = current.searchParams.get("__kalpi_path");
  if (!restored) return request;
  current.searchParams.delete("__kalpi_path");
  const query = current.searchParams.toString();
  request.url = query ? `${restored}?${query}` : restored;
  return request;
}

async function appendLog(entry) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(entry)}\n`);
}

const db = mode === "pglite" ? await migratedPglite() : null;
let fatHandler;
if (db) {
  const store = new PostgresStore("postgres://qa@127.0.0.1:1/none", {
    pool: pglitePool(db),
    now: () => clock.value,
    numberedRandom: () => 0.99,
  });
  useSlimHomePool(pglitePool(db));
  fatHandler = await createRuntimeHandler({
    store,
    now: () => clock.value,
    dataDir: process.env.KALPI_DATA_DIR || path.join(appRoot, ".runtime-pglite"),
  });
} else {
  fatHandler = await createRuntimeHandler({
    now: () => clock.value,
    dataDir: process.env.KALPI_DATA_DIR || path.join(appRoot, ".runtime-file"),
  });
}

const server = createServer(async (request, response) => {
  const started = Date.now();
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  let bodyText = "";
  const originalEnd = response.end.bind(response);
  response.end = (chunk, ...rest) => {
    if (chunk) bodyText = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    return originalEnd(chunk, ...rest);
  };

  try {
    if (url.pathname === "/__test/advance" && request.method === "POST") {
      const raw = await new Promise((resolve) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
      const input = raw ? JSON.parse(raw) : {};
      clock.value += Number(input.ms) || 0;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ now: clock.value }));
      return;
    }

    const useSlimHome = mode === "pglite" && url.pathname === "/api/home";
    const useSlimHealth = url.pathname === "/api/health";
    if (useSlimHome) {
      await handleSlimHome(request, response);
    } else if (useSlimHealth) {
      await handleSlimHealth(request, response);
    } else {
      request.url = `${url.pathname}${url.search}`;
      if (url.pathname.startsWith("/api/") && url.pathname !== "/api") {
        const inner = new URL(request.url, "http://localhost");
        inner.searchParams.set("__kalpi_path", url.pathname);
        request.url = `${inner.pathname}?${inner.searchParams}`;
      }
      await fatHandler(restoreRequestUrl(request), response);
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      path: url.pathname,
      message: error.message,
      stack: error.stack,
    }));
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "SERVER_ERROR", detail: error.message, stack: error.stack }));
    }
  } finally {
    await appendLog({
      at: new Date().toISOString(),
      method: request.method,
      path: url.pathname,
      status: response.statusCode,
      ms: Date.now() - started,
      requestId: response.getHeader("x-request-id") || null,
      body: bodyText.slice(0, 4000),
    }).catch(() => {});
  }
});

await mkdir(path.dirname(logPath), { recursive: true });
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
console.log(JSON.stringify({
  ok: true,
  mode,
  port,
  slimHome: mode === "pglite",
  now: new Date(clock.value).toISOString(),
  logPath,
}));
