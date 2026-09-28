export function playerName(value) {
  return String(value || "").trim() || "שחקן";
}

export function cardTitle(value) {
  return String(value || "").trim() || "קלף";
}

export function tradeApprovedLines({ otherName, receivedTitle, givenTitle } = {}) {
  return {
    title: "ההחלפה אושרה!",
    who: `החלפתם עם ${playerName(otherName)}`,
    swap: `${cardTitle(receivedTitle)} תמורת ${cardTitle(givenTitle)}`,
  };
}
