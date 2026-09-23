const MEMBER_LIMIT = 12;

function publicMember(member, rank) {
  return {
    label: member.label,
    stars: member.stars || 0,
    ownedUnique: member.ownedUnique || 0,
    current: Boolean(member.current),
    avatarId: member.avatarId || "kid-boy",
    loginStreak: member.loginStreak || 0,
    rankLevel: member.rankLevel || 1,
    rank,
  };
}

function trimMembers(members) {
  const top = members.slice(0, MEMBER_LIMIT);
  const current = members.find((member) => member.current);
  if (current && !top.some((member) => member.current)) {
    top.splice(MEMBER_LIMIT - 1, 1, current);
  }
  return top;
}

export function factionStandingsFromCollectors(collectors = []) {
  const byParty = new Map();
  for (const entry of collectors) {
    if (!entry?.factionId) continue;
    const list = byParty.get(entry.factionId) || [];
    list.push(entry);
    byParty.set(entry.factionId, list);
  }
  return [...byParty.entries()]
    .map(([partyId, members]) => {
      const ranked = members
        .slice()
        .sort((left, right) => (
          (right.stars || 0) - (left.stars || 0)
          || (right.ownedUnique || 0) - (left.ownedUnique || 0)
          || String(left.label || "").localeCompare(String(right.label || ""), "he")
        ))
        .map((member, index) => publicMember(member, index + 1));
      const stars = ranked.reduce((sum, member) => sum + (member.stars || 0), 0);
      return {
        partyId,
        stars,
        packs: stars,
        members: trimMembers(ranked),
        scores: ranked.map((member) => ({
          stars: member.stars || 0,
          current: Boolean(member.current),
        })),
      };
    })
    .sort((left, right) => right.stars - left.stars || left.partyId.localeCompare(right.partyId));
}
