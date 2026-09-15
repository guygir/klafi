#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const studio = JSON.parse(await readFile(path.join(appRoot, "data/studio-content.json"), "utf8"));
const runtimeCards = JSON.parse(await readFile(path.join(appRoot, "data/cards.json"), "utf8"));
const events = JSON.parse(await readFile(path.join(appRoot, "data/events.json"), "utf8"));
const allCards = studio.members.flatMap((member) => member.quoteSlots.map((card) => ({ member, card })));
const populated = allCards.filter(({ card }) => card.quote.displayText.trim());
const empty = allCards.filter(({ card }) => !card.quote.displayText.trim());
const missingSources = populated.filter(({ card }) => !card.quote.sourceUrl.trim());
const weakSources = populated.filter(({ card }) => ["", "C"].includes(card.quote.sourceQuality));
const missingArt = populated.filter(({ card }) => !card.art?.artKey);
const identityReview = studio.members.filter((member) => {
  const reference = member.identityReference || {};
  return !reference.url?.includes("/wiki/File:") || !reference.license || /verify|varies|inspect/i.test(reference.license);
});
const pendingCec = studio.parties.filter((party) => party.finalLetters == null);
const approved = populated.filter(({ card }) => card.publicationState === "approved");
const launchLeaders = runtimeCards.filter(({ releaseSetId }) => releaseSetId === "party-leaders");
const leaderMissingSource = launchLeaders.filter((card) => !card.walkout?.sourceUrl);
const leaderUnapproved = launchLeaders.filter((card) => card.walkout?.contentStatus !== "approved");
const releaseCalendar = [...(studio.gameConfig?.releaseSets || [])].sort((a, b) => a.order - b.order);
const unscheduledSets = releaseCalendar.filter((set) => set.id !== "special-events" && !set.plannedPublishAt);
const invalidEvents = events.events.filter((event) =>
  !event.opensAt
  || !event.closesAt
  || Date.parse(event.opensAt) >= Date.parse(event.closesAt)
  || !["active", "blocked"].includes(event.status));
const missingLeaderArt = [];
for (const card of launchLeaders) {
  if (!card.artKey) {
    missingLeaderArt.push(card);
    continue;
  }
  try {
    await access(path.join(projectRoot, "docs/design/assets", card.artKey));
  } catch {
    missingLeaderArt.push(card);
  }
}

function rows(items, mapper) {
  if (!items.length) return "- None.\n";
  return items.map((item) => `- ${mapper(item)}`).join("\n");
}

const report = `# Expanded PoC content audit

Generated: ${new Date().toISOString()}

## Gate summary
- Parties: ${studio.parties.length} / 14
- Politicians: ${studio.members.length} / 51
- Populated quote cards: ${populated.length} / ${allCards.length}
- Approved playable quote cards: ${approved.length}
- Explicit blank C/UC/R slots: ${empty.length}
- Missing quote sources: ${missingSources.length}
- Weak / ungraded evidence: ${weakSources.length}
- Missing generated art: ${missingArt.length}
- Identity references needing exact file/license review: ${identityReview.length}
- Lists pending final CEC letters: ${pendingCec.length}
- Launch leader cards: ${launchLeaders.length} / 14
- Launch leaders missing approved art files: ${missingLeaderArt.length}
- Launch leaders missing sources: ${leaderMissingSource.length}
- Launch leaders outside approved content state: ${leaderUnapproved.length}
- Release sets missing a planned publication time: ${unscheduledSets.length}
- Invalid event windows/status values: ${invalidEvents.length}
- Unsaved edits: not persisted by design; the Studio save endpoint writes one card atomically.

## Versioned release calendar
${rows(releaseCalendar, (set) => `\`${set.order}\` · ${set.nameHe} · ${set.runtimeState} · ${set.plannedPublishAt || "event-controlled"} · launch ${set.launchGate}`)}

## Preplanned events
${rows(events.events, (event) => `\`${event.id}\` · ${event.status} · ${event.opensAt} → ${event.closesAt} · ${event.cardIds.length} cards`)}

## Launch-leader blockers
${rows(missingLeaderArt, (card) => `\`${card.id}\` · ${card.titleHe} · missing approved file for ${card.artKey || "art key"}`)}
${rows(leaderMissingSource, (card) => `\`${card.id}\` · ${card.titleHe} · source URL missing`)}
${rows(leaderUnapproved, (card) => `\`${card.id}\` · ${card.titleHe} · ${card.walkout?.contentStatus || "status missing"}`)}

## Missing sources
${rows(missingSources, ({ member, card }) => `\`${card.id}\` · ${member.nameHe}`)}

## Weak or ungraded evidence
${rows(weakSources, ({ member, card }) => `\`${card.id}\` · ${member.nameHe} · ${card.quote.sourceQuality || "ungraded"} · ${card.quote.sourceType || "type missing"}`)}

## Empty slots
${rows(empty, ({ member, card }) => `\`${card.id}\` · ${member.nameHe} · ${card.rarity}`)}

## Pending CEC metadata
${rows(pendingCec, (party) => `\`${party.id}\` · ${party.displayNameHe} · requested ${party.requestedLetters.join(" / ")} · ${party.letterStatus}`)}

## Missing art
${rows(missingArt, ({ member, card }) => `\`${card.id}\` · ${member.nameHe} · prompt ready once identity reference is confirmed`)}

## Identity file/license review
${rows(identityReview, (member) => `\`${member.id}\` · ${member.nameHe} · ${member.identityReference.url || "reference missing"} · ${member.identityReference.license || "license missing"}`)}

## Editorial disclosure
${studio.editorialPolicy.disclosure}

Generated visual props are editorial flavor, not documentary evidence. That notice is retained in canonical data, previews, card backs, and copied Weave prompts.
`;

await writeFile(path.join(projectRoot, "docs/review/expanded-content-audit.md"), report);
console.log(`Audited ${populated.length} populated quote cards; ${approved.length} are playable.`);
if (process.argv.includes("--strict")) {
  const blockerCount = pendingCec.length
    + identityReview.length
    + missingLeaderArt.length
    + leaderMissingSource.length
    + leaderUnapproved.length
    + unscheduledSets.length
    + invalidEvents.length;
  if (blockerCount) {
    console.error(`Launch gate blocked by ${blockerCount} unresolved checks.`);
    process.exitCode = 1;
  }
}
