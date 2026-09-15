import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const deckPath = path.resolve(here, "../../docs/presentation/poc-response/index.html");

test("presentation supports persisted plain-text Studio overrides", async () => {
  const deck = await readFile(deckPath, "utf8");
  assert.match(deck, /new URLSearchParams\(location\.search\)\.get\("studio"\)==="1"/);
  assert.match(deck, /dataset\.presentationField/);
  assert.match(deck, /contenteditable","plaintext-only"/);
  assert.match(deck, /\/api\/presentation\/content/);
  assert.match(deck, /localStorage\.getItem\("kalpi-alpha-session"\)/);
  assert.match(deck, /event\.target\.closest\("\[contenteditable\]"\)/);
});
