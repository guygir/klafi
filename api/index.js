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
  handlerPromise ??= createRuntimeHandler({ loadDotEnv: false });
  const handler = await handlerPromise;
  return handler(restoreRequestUrl(request), response);
}
