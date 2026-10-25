/** Pure card-face labels. The page imports these so a promo stamp can stay gold and still read פרומו. */

export function isPromoCard(card) {
  return card?.walkout?.kind === "promo";
}

export function rarityMark(rarity) {
  const normalized = String(rarity).toLowerCase();
  if (normalized.includes("ממוספר") || normalized.includes("numbered")) return "★★★★";
  if (normalized.includes("promo")) return "★★★★★";
  if (normalized.includes("legendary") || normalized.includes("event")) return "P";
  if (normalized.includes("rare") || normalized.includes("holo")) return "★★★";
  if (normalized.includes("uncommon")) return "★★";
  return "★";
}

export function rarityNameHe(rarity) {
  const normalized = String(rarity).toLowerCase();
  if (normalized.includes("ממוספר") || normalized.includes("numbered")) return "ממוספר";
  if (normalized.includes("promo")) return "פרומו";
  if (normalized.includes("holo")) return "הולו";
  if (normalized.includes("rare")) return "נדיר";
  if (normalized.includes("uncommon")) return "לא נפוץ";
  return "נפוץ";
}

export function displayedCardQuote(card) {
  const text = String(card?.walkout?.text || "").trim();
  if (!text || isPromoCard(card) || card?.walkout?.quoteStatus === "none") return "";
  if (card.type !== "Quote") return text;
  const bare = text.replace(/^״|״$/g, "");
  const needsMarker = ["shortened", "attributed-paraphrase"].includes(card.walkout?.quoteStatus);
  const marked = needsMarker && !bare.endsWith("*") ? `${bare}*` : bare;
  return `״${marked}״`;
}

/** Party line is the set name. A promo does not append ballot letters or a "· אס" suffix. */
export function partyZoneLabel(card, setName, subtitle) {
  const name = setName || "";
  if (isPromoCard(card) || card?.set === "special-promo") return name;
  if (card?.type === "Quote" && subtitle) return `${name} · ${subtitle}`;
  return name;
}

export function cardRequestsFullartFrame(card) {
  return card?.fullartFrame === true || card?.frame === "fullart-v1";
}

export function cardFrameFor(card, liveSetIds = []) {
  if (cardRequestsFullartFrame(card)) return "fullart-v1";
  if ((liveSetIds || []).includes(card?.releaseSetId)) return "fullart-v1";
  return "tall-v2";
}

export function presentCard(card, instance = {}, { title = "", setName = "", code = "" } = {}) {
  const numbered = Number(instance?.numberedIndex) > 0;
  const promo = card?.rarity === "Promotion" || Boolean(instance?.forcedStamp);
  const finishLabel = numbered ? "Holo" : (instance?.finish ?? card?.rarity);
  const rarityLabel = promo ? (card?.rarity || "Promotion") : (numbered ? "ממוספר" : finishLabel);
  const listSlot = Number(card?.listSlot);
  const slotLabel = Number.isInteger(listSlot) && listSlot > 0 ? `מקום ${listSlot}` : "";
  const membershipNote = String(card?.membershipNote || "").trim();
  const subtitle = [slotLabel || card?.subtitleHe || card?.subtitle || "", membershipNote].filter(Boolean).join(" · ");
  return {
    title,
    subtitle,
    quote: displayedCardQuote(card),
    rawQuote: isPromoCard(card) || card?.walkout?.quoteStatus === "none" ? "" : String(card?.walkout?.text || "").trim(),
    code,
    setName,
    partyLabel: partyZoneLabel(card, setName, subtitle),
    typeLabel: card?.typeHe || "קלף",
    finishLabel,
    finishClass: [
      String(finishLabel ?? "Common").split(/\s|\//)[0].toLowerCase(),
      numbered ? "numbered" : "",
    ].filter(Boolean).join(" "),
    rarityMark: rarityMark(rarityLabel),
    rarityName: rarityNameHe(rarityLabel),
    numberedTag: numbered ? `${instance.numberedIndex}/${instance.numberedOf}` : "",
    listSlot: Number.isInteger(listSlot) && listSlot > 0 ? listSlot : null,
    pip: card?.pip,
    artKey: card?.artKey || null,
    frame: cardRequestsFullartFrame(card) ? "fullart-v1" : "",
  };
}
