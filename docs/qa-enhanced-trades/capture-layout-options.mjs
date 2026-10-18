import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const out = "/opt/cursor/artifacts/layout-options";
await mkdir(out, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const filePath = path.join(root, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise((resolve) => server.listen(8765, "127.0.0.1", resolve));

const browser = await chromium.launch({ channel: "chrome" });
const options = ["slots", "fan", "strip", "list"];
const viewports = [
  { w: 375, h: 635, tag: "375x635" },
  { w: 390, h: 664, tag: "390x664" },
];

for (const opt of options) {
  for (const vp of viewports) {
    const page = await browser.newPage({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
    });
    await page.goto(`http://127.0.0.1:8765/docs/qa-enhanced-trades/layout-options.html?opt=${opt}&shot=1`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const name = `opt-${opt}-${vp.tag}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: false });
    await page.close();
    console.log(name);
  }
}

await browser.close();
server.close();
