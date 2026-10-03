/**
 * Binder grid identity. The album keeps card nodes across tab visits so
 * already-decoded art does not blank. Inventory edits are a patch: keep a
 * slot whose key is unchanged, create one that joined, drop one that left.
 * Counts and sort order are not a reason to mint a new node.
 */

export function binderSlotSignature(slot) {
  const count = Number(slot?.count);
  return [
    slot?.mode || "",
    slot?.cardId || "",
    Number.isFinite(count) && count > 0 ? count : 0,
    slot?.recycle ? 1 : 0,
    slot?.concealed ? 1 : 0,
    slot?.extra || "",
  ].join(":");
}

/** Stable inventory fingerprint. Key order does not matter. Missing state is empty. */
export function binderInventorySignature(state) {
  const inventory = state?.inventory && typeof state.inventory === "object" ? state.inventory : {};
  const counts = Object.keys(inventory)
    .sort()
    .map((id) => `${id}=${Number(inventory[id]) || 0}`)
    .join(",");
  const numbered = Array.isArray(state?.numberedCopies) ? state.numberedCopies : [];
  const stamps = numbered
    .map((item) => `${item?.cardId || ""}#${Number(item?.numberedIndex) || 0}`)
    .sort()
    .join(",");
  return `${counts}|${stamps}`;
}

/**
 * existing and next are ordered { key, sig } lists.
 * keep reuses the node already in the grid. create is a card that was not there
 * in this mode. dropped keys leave. unchanged means the DOM can be left alone.
 */
export function planBinderGrid(existing = [], next = []) {
  const prevByKey = new Map();
  existing.forEach((slot, index) => {
    if (slot?.key && !prevByKey.has(slot.key)) prevByKey.set(slot.key, { sig: slot.sig ?? "", index });
  });
  const used = new Set();
  const order = next.map((slot) => {
    const prev = slot?.key ? prevByKey.get(slot.key) : null;
    if (!prev || used.has(slot.key)) return { key: slot?.key || "", action: "create", sigChanged: true };
    used.add(slot.key);
    return {
      key: slot.key,
      action: "keep",
      previousIndex: prev.index,
      sigChanged: prev.sig !== slot.sig,
    };
  });
  const dropped = existing.filter((slot) => slot?.key && !used.has(slot.key)).map((slot) => slot.key);
  const unchanged = dropped.length === 0
    && order.length === existing.length
    && order.every((slot, index) => slot.action === "keep" && slot.previousIndex === index && !slot.sigChanged);
  return { unchanged, order, dropped };
}
