import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "scripts/build-shell.mjs")], { stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build-shell exited ${code}`))));
});
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "scripts/build-catalog.mjs")], { stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build-catalog exited ${code}`))));
});

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await cp(path.join(root, "app/public"), publicDir, { recursive: true });
await cp(path.join(root, "docs/design/assets"), path.join(publicDir, "design-assets"), { recursive: true });
console.log("Prepared Vercel static files in /public");
