import { createRuntimeHandler } from "../app/server/runtime.js";

let handlerPromise;

export const config = {
  maxDuration: 10,
  memory: 1024,
  includeFiles: ["app/data/**", "app/server/**"],
};

export default async function vercelHandler(request, response) {
  handlerPromise ??= createRuntimeHandler({ loadDotEnv: false });
  const handler = await handlerPromise;
  return handler(request, response);
}
