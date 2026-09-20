import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { liveDeployAssetNames } from "./live-deploy-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const srcAssets = path.join(root, "docs/design/assets");

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "scripts/build-shell.mjs")], { stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build-shell exited ${code}`))));
});
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "scripts/build-catalog.mjs")], { stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build-catalog exited ${code}`))));
});

const [catalog, avatars] = await Promise.all([
  readFile(path.join(root, "app/public/catalog.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "app/data/avatars.json"), "utf8").then(JSON.parse),
]);
const assetNames = liveDeployAssetNames({ catalog, avatars });

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await cp(path.join(root, "app/public"), publicDir, { recursive: true });
const destAssets = path.join(publicDir, "design-assets");
await mkdir(destAssets, { recursive: true });
for (const name of assetNames) {
  const from = path.join(srcAssets, name);
  const to = path.join(destAssets, name);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
}
console.log(`Prepared Vercel static files in /public (${assetNames.length} live design assets)`);
