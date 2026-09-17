import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const databaseUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_ADMIN_URL to the direct or session-pooled PostgreSQL URL.");

const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const outputDir = path.resolve(process.env.BACKUP_DIR || "../backups");
const outputFile = path.resolve(process.env.BACKUP_FILE || path.join(outputDir, `klafi-${stamp}.dump`));
await mkdir(path.dirname(outputFile), { recursive: true });

await new Promise((resolve, reject) => {
  const child = spawn("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file", outputFile,
    databaseUrl,
  ], { stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}`)));
});

const digest = createHash("sha256").update(await readFile(outputFile)).digest("hex");
const manifest = {
  createdAt: new Date().toISOString(),
  file: path.basename(outputFile),
  sha256: digest,
};
await writeFile(`${outputFile}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ...manifest, outputFile }, null, 2));
