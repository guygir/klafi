import pg from "pg";
import { readFile } from "node:fs/promises";
import { JsonStore, normalizeState } from "./store.js";

const { Pool } = pg;
const runtimeStateMigration = await readFile(
  new URL("./migrations/001_runtime_state.sql", import.meta.url),
  "utf8",
);

export class PostgresStore extends JsonStore {
  constructor(connectionString, { ssl = false } = {}) {
    super("postgres://kalpi-runtime-state");
    this.pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: true } : undefined,
      max: Number(process.env.DATABASE_POOL_SIZE || 10),
    });
    this.activeClient = null;
  }

  async init() {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('kalpi-schema-migrations'))");
      await client.query(`
        CREATE TABLE IF NOT EXISTS kalpi_schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      const applied = await client.query(
        "SELECT 1 FROM kalpi_schema_migrations WHERE version = $1",
        ["001_runtime_state"],
      );
      if (!applied.rowCount) {
        await client.query("BEGIN");
        await client.query(runtimeStateMigration);
        await client.query(
          "INSERT INTO kalpi_schema_migrations (version) VALUES ($1)",
          ["001_runtime_state"],
        );
        await client.query("COMMIT");
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('kalpi-schema-migrations'))").catch(() => {});
      client.release();
    }
    await this.pool.query(
      `INSERT INTO kalpi_runtime_state (id, state)
       VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(this.state)],
    );
    const result = await this.pool.query("SELECT state FROM kalpi_runtime_state WHERE id = 1");
    this.state = normalizeState(result.rows[0]?.state);
  }

  async persist() {
    const executor = this.activeClient || this.pool;
    await executor.query(
      `UPDATE kalpi_runtime_state
       SET state = $1::jsonb, updated_at = NOW()
       WHERE id = 1`,
      [JSON.stringify(this.state)],
    );
  }

  async refresh() {
    const run = async () => {
      const result = await this.pool.query("SELECT state FROM kalpi_runtime_state WHERE id = 1");
      this.state = normalizeState(result.rows[0]?.state);
      return this.state;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  async health() {
    await this.pool.query("SELECT 1");
    return { ok: true, backend: "postgres" };
  }

  exclusive(operation) {
    const run = async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query("SELECT state FROM kalpi_runtime_state WHERE id = 1 FOR UPDATE");
        this.state = normalizeState(locked.rows[0]?.state);
        this.activeClient = client;
        const result = await operation();
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        this.activeClient = null;
        client.release();
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  async close() {
    await this.pool.end();
  }
}
