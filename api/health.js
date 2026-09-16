import { handleSlimHealth } from "../app/server/slim-home.js";

export const config = { maxDuration: 5 };

export default async function health(request, response) {
  return handleSlimHealth(request, response);
}
