/**
 * Automatic player-facing version label (v1.<PR number>), derived at build time. No manual bump.
 * Order: "(#NNN)" in VERCEL_GIT_COMMIT_MESSAGE (squash merges on main), the preview's
 * VERCEL_GIT_PULL_REQUEST_ID, the highest "(#NNN)" in the local git log, else null
 * (the client then keeps its baked HEARD_YOU_VERSION).
 */
import { execFileSync } from "node:child_process";

const PR_REF = /\(#(\d{1,6})\)/g;

export function highestPrRef(text) {
  let best = 0;
  for (const match of String(text || "").matchAll(PR_REF)) best = Math.max(best, Number(match[1]));
  return best || null;
}

export function deriveVersion({ env = process.env, gitLog = null } = {}) {
  const fromMessage = highestPrRef(env.VERCEL_GIT_COMMIT_MESSAGE);
  if (fromMessage) return { version: `v1.${fromMessage}`, source: "commit-message" };
  const prId = Number(env.VERCEL_GIT_PULL_REQUEST_ID);
  if (Number.isInteger(prId) && prId > 0) return { version: `v1.${prId}`, source: "pull-request-id" };
  const log = gitLog ?? readGitLog();
  const fromLog = highestPrRef(log);
  if (fromLog) return { version: `v1.${fromLog}`, source: "git-log" };
  return { version: null, source: "fallback" };
}

function readGitLog() {
  try {
    return execFileSync("git", ["log", "-n", "300", "--format=%s"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

/** Writes the label into index.html's <meta name="klafi-version"> (empty = client fallback). */
export function stampIndexHtml(html, version) {
  if (!version) return html;
  return html.replace(/<meta name="klafi-version" content="[^"]*" \/>/, `<meta name="klafi-version" content="${version}" />`);
}
