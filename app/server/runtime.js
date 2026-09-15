import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "./app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

export async function loadEnvFile(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 1) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function runtimePaths() {
  return {
    appRoot,
    projectRoot,
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
    achievementsPath: path.join(appRoot, "data/achievements.json"),
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
  };
}

export async function createRuntimeHandler({ loadDotEnv = false } = {}) {
  if (loadDotEnv) await loadEnvFile(path.join(projectRoot, ".env"));
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production.");
  }
  const paths = runtimePaths();
  const debugEnabled = process.env.KALPI_DEBUG === "1" && process.env.NODE_ENV !== "production";
  return createKalpiApp({
    ...paths,
    sourcesPath: debugEnabled ? paths.sourcesPath : null,
    sequencesPath: debugEnabled ? paths.sequencesPath : null,
    samplesPath: debugEnabled ? paths.samplesPath : null,
    presentationContentPath: debugEnabled ? paths.presentationContentPath : null,
    databaseUrl: process.env.DATABASE_URL || null,
    databaseSsl: process.env.DATABASE_SSL === "1",
    debugEnabled,
    quizEnabled: process.env.QUIZ_ENABLED === "1",
  });
}
