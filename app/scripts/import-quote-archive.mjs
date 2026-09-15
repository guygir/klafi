#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DATASET_URL = "https://thebigbookofquotes.com/quotes.js";
const ARCHIVE_ROOT = "https://thebigbookofquotes.com";
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");
const outputPath = path.join(projectRoot, "docs/intake/research/quote-archive-41.json");

const response = await fetch(DATASET_URL);
if (!response.ok) throw new Error(`Quote archive request failed: ${response.status}`);
const source = await response.text();
const sandbox = {};
vm.runInNewContext(`${source}\nglobalThis.__result = quotes;`, sandbox, { timeout: 1_000 });
const quotes = sandbox.__result;
if (!Array.isArray(quotes) || quotes.length !== 41) {
  throw new Error(`Expected 41 archive records, received ${quotes?.length ?? "invalid"}`);
}

const retrievedAt = new Date().toISOString();
const records = quotes.map((quote) => ({
  slug: quote.slug,
  archiveUrl: `${ARCHIVE_ROOT}/quote/${quote.slug}/`,
  originalSourceUrl: quote.source,
  quoteText: quote.text,
  person: quote.person,
  role: quote.role,
  statedDate: quote.date,
  publicationDetails: quote.details || [],
  archiveSummary: quote.core || "",
  retrievedAt,
  evidenceStatus: "discovery-only",
}));

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  source: DATASET_URL,
  retrievedAt,
  recordCount: records.length,
  notice: "Discovery archive only. Follow originalSourceUrl and verify context before selecting a card.",
  records,
}, null, 2)}\n`);
console.log(`Imported ${records.length} discovery records → ${outputPath}`);
