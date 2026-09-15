import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createKalpiApp } from "./app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production.");
}

const handler = await createKalpiApp({
  dataDir: path.join(appRoot, ".runtime"),
  publicDir: path.join(appRoot, "public"),
  cardsPath: path.join(appRoot, "data/cards.json"),
  advocacyPath: path.join(appRoot, "data/advocacy.json"),
  sourcesPath: path.join(appRoot, "data/sources.json"),
  sequencesPath: path.join(appRoot, "data/editorial-sequences.json"),
  samplesPath: path.join(appRoot, "data/editorial-samples.json"),
  demoPackPath: path.join(appRoot, "data/demo-pack.json"),
  studioContentPath: path.join(appRoot, "data/studio-content.json"),
  specialsPath: path.join(appRoot, "data/specials-content.json"),
  presentationContentPath: path.join(appRoot, "data/presentation-content.json"),
  eventsPath: path.join(appRoot, "data/events.json"),
  assetsDir: path.join(projectRoot, "docs/design/assets"),
  docsDir: path.join(projectRoot, "docs"),
  databaseUrl: process.env.DATABASE_URL || null,
  databaseSsl: process.env.DATABASE_SSL === "1",
  debugEnabled: process.env.KALPI_DEBUG === "1" && process.env.NODE_ENV !== "production",
});

const server = createServer(handler);
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

server.listen(port, host, () => {
  console.log(`Kalpi Alpha → http://127.0.0.1:${port}`);
  for (const address of lanAddresses()) {
    console.log(`Kalpi Alpha (phone) → http://${address}:${port}`);
  }
});
