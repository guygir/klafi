/** Granted copies include warehouse (unseen) instances so pity/uniques do not re-roll the same card. */
export function grantedCopyCounts(session) {
  const counts = {};
  for (const instance of session.instances || []) {
    if (!instance?.cardId) continue;
    counts[instance.cardId] = (counts[instance.cardId] ?? 0) + 1;
  }
  for (const [cardId, copies] of Object.entries(session.inventory || {})) {
    const n = Number(copies) || 0;
    if (n > (counts[cardId] ?? 0)) counts[cardId] = n;
  }
  return counts;
}

/**
 * Mark accepted warehouse instances seen and credit inventory only when the copy
 * was not already counted (legacy grants incremented inventory on settle).
 */
export function creditSeenInstances(session, instanceIds, seenAt) {
  const unseen = new Set(session.unseenPulls || []);
  const accepted = new Set([...instanceIds].map(String).filter((id) => unseen.has(id)));
  session.inventory ??= {};
  session.instances ??= [];
  let credited = 0;
  let idleCredited = 0;
  for (const instance of session.instances) {
    if (!accepted.has(instance.instanceId)) continue;
    instance.seenAt = seenAt;
    const total = session.instances.filter((item) => item.cardId === instance.cardId).length;
    const current = session.inventory[instance.cardId] ?? 0;
    if (current < total) {
      session.inventory[instance.cardId] = current + 1;
      credited += 1;
      if (instance.acquiredBy === "idle") idleCredited += 1;
    }
  }
  session.unseenPulls = [...unseen].filter((id) => !accepted.has(id));
  return { accepted, credited, idleCredited };
}
