import { createHash, timingSafeEqual } from "node:crypto";

// Studio is open to an allowlist of Klafi identities. A Klafi identity is the session
// token (the UUID shown as "קוד שחזור" in the profile), which is also the bearer credential,
// so the repo only ever stores its SHA-256 — never the raw token.
// STUDIO_USER_IDS (comma-separated) overrides the default; entries may be raw tokens or
// "sha256:<hex>" digests.
export const DEFAULT_STUDIO_USER_HASHES = Object.freeze([
  "0cf260802059cca1d769ae3b14552c046120382173adfef75b9fa035e731d325",
]);

const HEX_DIGEST = /^[0-9a-f]{64}$/;

export function studioIdentityHash(token) {
  return createHash("sha256").update(String(token).trim().toLowerCase()).digest("hex");
}

/** Normalize an allowlist (env string or array) to SHA-256 hex digests. Unset/blank → default. */
export function parseStudioUserIds(value = process.env.STUDIO_USER_IDS) {
  const entries = (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((entry) => String(entry).trim())
    .filter(Boolean);
  if (!entries.length) return [...DEFAULT_STUDIO_USER_HASHES];
  return entries.map((entry) => {
    const digest = entry.toLowerCase().startsWith("sha256:") ? entry.slice(7).trim().toLowerCase() : null;
    return digest && HEX_DIGEST.test(digest) ? digest : studioIdentityHash(entry);
  });
}

export function studioUserAllowed(token, allowedHashes = parseStudioUserIds()) {
  if (!token || typeof token !== "string") return false;
  const candidate = Buffer.from(studioIdentityHash(token), "hex");
  let allowed = false;
  for (const hash of allowedHashes) {
    const expected = Buffer.from(hash, "hex");
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) allowed = true;
  }
  return allowed;
}

/** The legacy STUDIO_SECRET header is a local/test convenience only; production needs an allowlisted identity. */
export function studioSecretPathEnabled(env = process.env) {
  return env.NODE_ENV !== "production" && env.VERCEL_ENV !== "production";
}
