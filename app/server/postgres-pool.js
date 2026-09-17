export function runtimeConnectionString(connectionString, { serverless = Boolean(process.env.VERCEL) } = {}) {
  if (!serverless) return connectionString;
  try {
    const url = new URL(connectionString);
    if (url.port === "5432" && url.hostname.endsWith(".pooler.supabase.com")) {
      url.port = "6543";
      return url.toString();
    }
  } catch {
    /* Let node-postgres report malformed connection strings. */
  }
  return connectionString;
}

export function postgresPoolOptions(
  connectionString,
  { ssl = false, serverless = Boolean(process.env.VERCEL) } = {},
) {
  const configuredMax = Math.max(1, Number(process.env.DATABASE_POOL_SIZE || 10));
  return {
    connectionString: runtimeConnectionString(connectionString, { serverless }),
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: serverless ? 1 : configuredMax,
    connectionTimeoutMillis: Math.max(500, Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 2500)),
    idleTimeoutMillis: Math.max(500, Number(process.env.DATABASE_IDLE_TIMEOUT_MS || (serverless ? 1000 : 10_000))),
    maxLifetimeSeconds: Math.max(5, Number(process.env.DATABASE_CONNECTION_LIFETIME_SECONDS || (serverless ? 60 : 300))),
    allowExitOnIdle: true,
  };
}

export function guardPool(pool) {
  pool.on("error", (error) => {
    console.error("Postgres idle connection closed", { code: error.code || "UNKNOWN" });
  });
  return pool;
}
