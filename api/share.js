import { handleSlimShare } from "../app/server/slim-share.js";

export const config = {
  maxDuration: 5,
  includeFiles: ["app/public/catalog.json", "app/server/**"],
};

export default async function share(request, response) {
  return handleSlimShare(request, response);
}
