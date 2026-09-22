import { randomUUID } from "node:crypto";
import { createRuntimeHandler } from "../app/server/runtime.js";

let handlerPromise;

export const config = {
  maxDuration: 10,
  includeFiles: [
    "app/data/cards.json",
    "app/data/advocacy.json",
    "app/data/studio-content.json",
    "app/data/specials-content.json",
    "app/data/demo-pack.json",
    "app/data/events.json",
    "app/data/achievements.json",
    "app/data/avatars.json",
    "app/data/sources.json",
    "app/data/editorial-sequences.json",
    "app/data/editorial-samples.json",
    "app/data/presentation-content.json",
    "docs/intake/research/set5-wip-pool.json",
    "app/server/**",
  ],
};

function restoreRequestUrl(request) {
  const current = new URL(request.url, "http://localhost");
  const restored = current.searchParams.get("__kalpi_path");
  if (!restored) return request;
  current.searchParams.delete("__kalpi_path");
  const query = current.searchParams.toString();
  request.url = query ? `${restored}?${query}` : restored;
  return request;
}

export default async function vercelHandler(request, response) {
  const requestId = request.headers["x-request-id"] || randomUUID();
  try {
    handlerPromise ??= createRuntimeHandler({ loadDotEnv: false });
    const handler = await handlerPromise;
    return handler(restoreRequestUrl(request), response);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      requestId,
      message: error.message,
      stack: error.stack,
    }));
    if (response.headersSent) return;
    response.setHeader("x-request-id", requestId);
    response.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
    });
    response.end(JSON.stringify({
      error: "SERVER_ERROR",
      requestId,
      detail: error.message,
    }));
  }
}
