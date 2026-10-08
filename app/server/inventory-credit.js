/** Granted copies include warehouse (unseen) instances so pity/uniques do not re-roll the same card. */
export function grantedCopyCounts(session) {
  // Regular copies only: a numbered copy does not make a card "owned" (pity, חדש, unowned pools).
  const counts = {};
  const numbered = {};
  for (const instance of session.instances || []) {
    if (!instance?.cardId) continue;
    const bag = Number(instance.numberedIndex) > 0 ? numbered : counts;
    bag[instance.cardId] = (bag[instance.cardId] ?? 0) + 1;
  }
  for (const [cardId, copies] of Object.entries(session.inventory || {})) {
    const n = Math.max(0, (Number(copies) || 0) - (numbered[cardId] ?? 0));
    if (n > (counts[cardId] ?? 0)) counts[cardId] = n;
  }
  for (const cardId of Object.keys(counts)) if (!counts[cardId]) delete counts[cardId];
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
