import { handleSlimHome } from "../app/server/slim-home.js";

export const config = {
  maxDuration: 10,
  includeFiles: ["app/public/shell.json", "app/server/**"],
};

export default async function home(request, response) {
  return handleSlimHome(request, response);
}
