import { handleSlimCommunity } from "../app/server/slim-community.js";

export const config = {
  maxDuration: 10,
  includeFiles: ["app/public/shell.json", "app/server/**"],
};

export default async function community(request, response) {
  return handleSlimCommunity(request, response);
}
