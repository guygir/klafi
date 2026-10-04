/** Public invite codes. Not the session token. */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;
export const DEFAULT_REFERRAL_STARS = 15;

export function referralStarGate(config) {
  const value = Number(config?.referral?.stars);
  if (Number.isInteger(value) && value > 0 && value <= 10000) return value;
  return DEFAULT_REFERRAL_STARS;
}

export function normalizeInviteCode(value) {
  const raw = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length < 6 || raw.length > 12) return null;
  if ([...raw].some((character) => !REFERRAL_CODE_ALPHABET.includes(character))) return null;
  return raw;
}

export function newReferralCode(random = Math.random) {
  let code = "";
  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    code += REFERRAL_CODE_ALPHABET[Math.floor(random() * REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/** Stable per invitee, and safe to show on the inviter's card. Not a session token. */
export function referralMarker(code) {
  const normalized = normalizeInviteCode(code);
  return normalized ? `referral-${normalized}` : null;
}
