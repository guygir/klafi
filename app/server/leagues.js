export const LEAGUE_MAX = 32;
/** League names are capped (in code points) so the room header stays one or two lines. */
export const LEAGUE_NAME_MAX = 20;
export const LEAGUE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newLeagueCode(random = Math.random) {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += LEAGUE_CODE_ALPHABET[Math.floor(random() * LEAGUE_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeLeagueCode(value) {
  const raw = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length < 4 || raw.length > 8) return null;
  if ([...raw].some((character) => !LEAGUE_CODE_ALPHABET.includes(character) && !/[A-Z0-9]/.test(character))) {
    return null;
  }
  return raw;
}

export function hebrewSeasonLabel(now = Date.now()) {
  const date = new Date(now);
  const month = new Intl.DateTimeFormat("he-u-ca-hebrew", {
    month: "long",
    timeZone: "Asia/Jerusalem",
  }).format(date);
  const year = new Intl.DateTimeFormat("he-u-ca-hebrew", {
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(date);
  return `${month} · ${year}`;
}

export function leagueMemberScore(session, cardsById) {
  const inventory = session?.inventory || {};
  const ownedUnique = Object.keys(inventory).filter((cardId) => Number(inventory[cardId]) > 0).length;
  const stars = Object.keys(inventory).reduce((sum, cardId) => {
    const card = cardsById.get(cardId);
    if (card?.rarity === "Promotion") return sum + 5;
    if (card?.rarity?.startsWith("Rare")) return sum + 3;
    if (card?.rarity?.startsWith("Uncommon")) return sum + 2;
    return sum + 1;
  }, 0);
  return { ownedUnique, stars };
}

export function publicLeague(league, members, currentToken, origin) {
  const ranked = [...members]
    .sort((left, right) => right.stars - left.stars || right.ownedUnique - left.ownedUnique)
    .map((entry, index) => ({
      rank: index + 1,
      label: entry.label,
      stars: entry.stars,
      ownedUnique: entry.ownedUnique,
      current: entry.token === currentToken,
      avatarId: entry.avatarId || "kid-boy",
      loginStreak: entry.loginStreak || 0,
      rankLevel: entry.rankLevel || 1,
    }));
  return {
    code: league.code,
    name: league.name,
    seasonLabel: league.seasonLabel,
    createdAt: league.createdAt,
    memberCount: ranked.length,
    joinUrl: `${origin}/?league=${encodeURIComponent(league.code)}`,
    members: ranked,
  };
}
