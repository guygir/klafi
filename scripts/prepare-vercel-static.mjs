import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await cp(path.join(root, "app/public"), publicDir, { recursive: true });
await cp(path.join(root, "docs/design/assets"), path.join(publicDir, "design-assets"), { recursive: true });
console.log("Prepared Vercel static files in /public");
