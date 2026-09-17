import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import pg from "pg";

const backupFile = process.env.BACKUP_FILE;
const restoreUrl = process.env.RESTORE_DATABASE_URL;
if (process.env.ALLOW_RESTORE_DRILL !== "1") {
  throw new Error("Set ALLOW_RESTORE_DRILL=1 only for an isolated disposable restore database.");
}
if (!backupFile || !restoreUrl) {
  throw new Error("Set BACKUP_FILE and RESTORE_DATABASE_URL.");
}
if ([process.env.DATABASE_URL, process.env.DATABASE_ADMIN_URL].filter(Boolean).includes(restoreUrl)) {
  throw new Error("RESTORE_DATABASE_URL must not equal a source or production database URL.");
}

const manifest = JSON.parse(await readFile(`${backupFile}.json`, "utf8"));
const digest = createHash("sha256").update(await readFile(backupFile)).digest("hex");
if (digest !== manifest.sha256) throw new Error("Backup checksum does not match its manifest.");

await new Promise((resolve, reject) => {
  const child = spawn("pg_restore", [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    "--dbname", restoreUrl,
    backupFile,
  ], { stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`pg_restore exited ${code}`)));
});

const pool = new pg.Pool({ connectionString: restoreUrl });
try {
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM kalpi_sessions) AS sessions,
      (SELECT COUNT(*)::int FROM kalpi_inventory) AS inventory,
      (SELECT COUNT(*)::int FROM kalpi_instances) AS instances,
      (SELECT COUNT(*)::int FROM kalpi_reports) AS reports,
      (SELECT COUNT(*)::int FROM kalpi_trades) AS trades
  `);
  const integrity = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int
       FROM kalpi_inventory i LEFT JOIN kalpi_sessions s ON s.token = i.session_token
       WHERE s.token IS NULL) AS orphan_inventory,
      (SELECT COUNT(*)::int
       FROM kalpi_instances i LEFT JOIN kalpi_sessions s ON s.token = i.session_token
       WHERE s.token IS NULL) AS orphan_instances,
      (SELECT COUNT(*)::int FROM kalpi_inventory WHERE copies <= 0) AS invalid_inventory
  `);
  if (Object.values(integrity.rows[0]).some(Number)) {
    throw new Error(`Restore integrity failure: ${JSON.stringify(integrity.rows[0])}`);
  }
  console.log(JSON.stringify({
    restoredFrom: manifest.createdAt,
    checksumVerified: true,
    counts: counts.rows[0],
    integrity: integrity.rows[0],
  }, null, 2));
} finally {
  await pool.end();
}
