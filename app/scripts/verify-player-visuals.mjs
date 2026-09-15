#!/usr/bin/env node

import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const outputDir = path.join(appRoot, ".runtime", "visual-checks");
const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
const chrome = process.env.CHROME_PATH || (
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome"
);

const cases = [
  ["home-mobile", 390, 844, "/"],
  ["home-short", 820, 700, "/"],
  ["home-desktop", 1440, 900, "/"],
  ["binder-mobile", 390, 844, "/?view=binder"],
  ["binder-tablet", 768, 1024, "/?view=binder"],
  ["card-mobile", 390, 844, "/?card=LIK-M01-Q02"],
  ["card-desktop", 1440, 900, "/?card=LIK-M01-Q03"],
  ["achievements-mobile", 390, 844, "/?view=achievements"],
  ["events-mobile", 390, 844, "/?view=events"],
  ["community-mobile", 390, 844, "/?view=growth"],
  ["classic-card-mobile", 390, 844, "/?card=LIK-M01-Q02&theme=classic-v1&cardFrame=classic-v1&density=compact-v1&quoteReveal=fade-v1"],
];

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

async function waitForFile(filePath, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      await access(filePath);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function connectCdp(webSocketUrl) {
  if (typeof WebSocket === "undefined") {
    throw new Error("Visual verification requires Node 22+ for built-in WebSocket support.");
  }
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
  };
}

async function capture([name, width, height, route], index) {
  const screenshot = path.join(outputDir, `${name}.png`);
  const profile = path.join(os.tmpdir(), `kalpi-visual-${process.pid}-${index}`);
  await rm(screenshot, { force: true });
  await rm(profile, { recursive: true, force: true });
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--no-first-run",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    await waitForFile(portFile);
    const [port] = (await readFile(portFile, "utf8")).split(/\r?\n/);
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((response) => response.json());
    const cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 520,
      screenWidth: width,
      screenHeight: height,
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}${route}` });
    await sleep(3500);
    const result = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(screenshot, Buffer.from(result.data, "base64"));
    cdp.close();
    console.log(`Captured ${name} at ${width}x${height}`);
  } finally {
    child.kill("SIGTERM");
    await sleep(200);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

await mkdir(outputDir, { recursive: true });
for (const [index, visualCase] of cases.entries()) {
  await capture(visualCase, index);
}
console.log(`Visual checks: ${outputDir}`);
